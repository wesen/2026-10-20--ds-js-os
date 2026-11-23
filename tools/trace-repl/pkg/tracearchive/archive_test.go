package tracearchive

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/sync/errgroup"
)

func actualArchive(t testing.TB) *Archive {
	t.Helper()
	dirs, err := filepath.Glob("../../../../ttmp/2026/11/21/PICOCALC-ROW-IR--*")
	if err != nil || len(dirs) != 1 {
		t.Fatalf("find archive: %v %v", dirs, err)
	}
	a, err := Open(dirs[0])
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestArchivedPassesAndEvidenceRanges(t *testing.T) {
	a := actualArchive(t)
	events, err := a.Events("", "")
	if err != nil || len(events) != 4133 {
		t.Fatalf("events: %d %v", len(events), err)
	}
	if a.Stats()["streamInflations"] != uint64(0) {
		t.Fatal("listing inflated streams")
	}
	for _, variant := range []string{"checked", "unchecked", "firmware"} {
		for _, phase := range []string{"middle", "backend"} {
			stream, err := a.Events(variant, phase)
			if err != nil {
				t.Fatal(err)
			}
			last := stream[len(stream)-1]
			body, err := a.Text(variant, phase, last.Ordinal)
			if err != nil {
				t.Fatal(err)
			}
			if len(body) != last.Ref.End-last.Ref.Start || !strings.Contains(strings.SplitN(body, "\n", 2)[0], last.Header) {
				t.Fatalf("bad terminal event: %+v", last)
			}
		}
	}
	if a.Stats()["streamInflations"] != uint64(6) {
		t.Fatal(a.Stats())
	}
	middle, err := a.Events("checked", "middle")
	if err != nil {
		t.Fatal(err)
	}
	if len(middle) != 195 || middle[74].Pass != "EarlyCSEPass" || middle[74].Ref.StreamSHA != "bbd3b983cff150aeb56d99e517331a1ea0b4af5afc86869c730b9dca2ac795b4" {
		t.Fatal(middle[74])
	}
	for ordinal, want := range map[int]int{73: 11, 74: 6} {
		body, err := a.Text("checked", "middle", ordinal)
		if err != nil {
			t.Fatal(err)
		}
		if got := strings.Count(body, "load i32, ptr %work,"); got != want {
			t.Fatalf("ordinal %d: got %d loads; want %d", ordinal, got, want)
		}
	}
	machine, err := a.Events("checked", "backend")
	if err != nil {
		t.Fatal(err)
	}
	for ordinal, want := range map[int]bool{74: false, 78: true} {
		if machine[ordinal].Pass != "virtregrewriter" {
			t.Fatal(machine[ordinal])
		}
		body, err := a.Text("checked", "backend", ordinal)
		if err != nil {
			t.Fatal(err)
		}
		if got := strings.Contains(strings.SplitN(body, "\n", 3)[1], "NoVRegs"); got != want {
			t.Fatalf("ordinal %d: NoVRegs %v", ordinal, got)
		}
	}
	if _, err := a.Text("checked", "middle", 195); err == nil {
		t.Fatal("accepted missing ordinal")
	}
	if _, err := a.Events("checkd", "middle"); err == nil || !strings.Contains(err.Error(), "checked") {
		t.Fatalf("misspelled variant: %v", err)
	}
}

func TestConcurrentReadsShareSuccessfulInflation(t *testing.T) {
	a := actualArchive(t)
	var group errgroup.Group
	for i := 0; i < 12; i++ {
		group.Go(func() error {
			text, err := a.Text("checked", "middle", 74)
			if err != nil {
				return err
			}
			if !strings.Contains(text, "EarlyCSEPass") {
				t.Error("missing pass header")
			}
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		t.Fatal(err)
	}
	stats := a.Stats()
	if stats["textReads"] != uint64(12) || stats["streamInflations"] != uint64(1) || stats["inflatedBytes"] != uint64(1027953) {
		t.Fatal(stats)
	}
}

func TestProfileOwnershipAndModuleIdentity(t *testing.T) {
	a := actualArchive(t)
	raw, err := a.Profile("execution")
	if err != nil {
		t.Fatal(err)
	}
	builds := raw.(map[string]interface{})
	checked := builds["checked-llvm"].(map[string]interface{})
	totals := checked["totals"].(map[string]interface{})
	if totals["instructions"] != float64(1233611) {
		t.Fatal(totals)
	}
	totals["instructions"] = float64(-1)
	second, err := a.Profile("execution")
	if err != nil {
		t.Fatal(err)
	}
	if second.(map[string]interface{})["checked-llvm"].(map[string]interface{})["totals"].(map[string]interface{})["instructions"] != float64(1233611) {
		t.Fatal("profile mutated across reads")
	}
	digest, err := a.ProfileSHA("execution")
	if err != nil || len(digest) != 64 {
		t.Fatalf("SHA: %s %v", digest, err)
	}
	if a.Stats()["profileLoads"] != uint64(1) {
		t.Fatal(a.Stats())
	}
	for _, variant := range []string{"checked", "unchecked", "firmware"} {
		text, digest, err := a.InitialModule(variant)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256([]byte(text))
		if digest != hex.EncodeToString(sum[:]) || !strings.Contains(text, "define ") || strings.Contains(text, "!DILocation(") {
			t.Fatalf("invalid initial module %s", variant)
		}
	}
	_, _, err = a.InitialModule("checked")
	if err != nil {
		t.Fatal(err)
	}
	if a.Stats()["moduleLoads"] != uint64(3) {
		t.Fatal(a.Stats())
	}
}

// The synthetic first snapshot contains a multibyte character. The second
// header follows at a byte position different from its Unicode rune index.
func TestIndexIntegrityAndInflatedByteAddressing(t *testing.T) {
	first := "; *** IR Dump After FirstPass on row ***\n; π\n"
	last := "; *** IR Dump After LastPass on row ***\nret i32 0\n"
	raw := first + last
	newFixture := func(t *testing.T, edit func(*streamSpec, []indexEntry)) (string, string) {
		t.Helper()
		dir := t.TempDir()
		pipe := filepath.Join(dir, "various", "llvm-pipeline")
		if err := os.MkdirAll(pipe, 0755); err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256([]byte(raw))
		spec := streamSpec{SHA256: hex.EncodeToString(sum[:]), RawBytes: len(raw), Dumps: 2}
		items := []indexEntry{{0, "IR Dump After FirstPass on row"}, {len(first), "IR Dump After LastPass on row"}}
		if edit != nil {
			edit(&spec, items)
		}
		manifest, err := json.Marshal(map[string]map[string]streamSpec{"checked": {"middle": spec}})
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(pipe, "manifest.json"), manifest, 0644); err != nil {
			t.Fatal(err)
		}
		idx, err := json.Marshal(items)
		if err != nil {
			t.Fatal(err)
		}
		writeGzip(t, filepath.Join(pipe, "checked-middle.index.json.gz"), idx)
		path := filepath.Join(pipe, "checked-middle.log.gz")
		writeGzip(t, path, []byte(raw))
		return dir, path
	}
	t.Run("raw byte positions", func(t *testing.T) {
		dir, _ := newFixture(t, nil)
		a, err := Open(dir)
		if err != nil {
			t.Fatal(err)
		}
		lastText, err := a.Text("checked", "middle", 1)
		if err != nil || lastText != last {
			t.Fatalf("%q %v", lastText, err)
		}
	})
	t.Run("reordered index", func(t *testing.T) {
		dir, _ := newFixture(t, func(s *streamSpec, i []indexEntry) { i[1].Offset = 0 })
		if _, err := Open(dir); err == nil || !strings.Contains(err.Error(), "byte range") {
			t.Fatalf("bad index accepted: %v", err)
		}
	})
	t.Run("header forgery", func(t *testing.T) {
		dir, _ := newFixture(t, func(s *streamSpec, i []indexEntry) { i[0].Header = "IR Dump After DifferentPass on row" })
		a, err := Open(dir)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = a.Text("checked", "middle", 1); err == nil || !strings.Contains(err.Error(), "index header") {
			t.Fatalf("bad header accepted: %v", err)
		}
	})
	t.Run("recover after damaged log", func(t *testing.T) {
		dir, path := newFixture(t, nil)
		writeGzip(t, path, []byte(strings.Replace(raw, "i32", "i64", 1)))
		a, err := Open(dir)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = a.Text("checked", "middle", 1); err == nil || !strings.Contains(err.Error(), "SHA-256") {
			t.Fatalf("bad digest accepted: %v", err)
		}
		if a.Stats()["streamInflations"] != uint64(0) {
			t.Fatal("cached an unverified stream")
		}
		writeGzip(t, path, []byte(raw))
		got, err := a.Text("checked", "middle", 1)
		if err != nil || got != last {
			t.Fatalf("retry: %q %v", got, err)
		}
	})
	// A service verifies before it serves, so a damaged log fails at startup
	// instead of after a researcher has already cited one of its Refs.
	t.Run("verify before serving", func(t *testing.T) {
		dir, path := newFixture(t, nil)
		writeGzip(t, path, []byte(strings.Replace(raw, "ret", "RET", 1)))
		a, err := Open(dir)
		if err != nil {
			t.Fatal(err)
		}
		if err = a.Verify(); err == nil || !strings.Contains(err.Error(), "checked/middle") || !strings.Contains(err.Error(), "SHA-256") {
			t.Fatalf("damaged stream passed verification: %v", err)
		}
		if a.Stats()["streamInflations"] != uint64(0) {
			t.Fatal("cached an unverified stream")
		}
	})
}

// An indexed range runs to the next header. In the middle end it ends with the
// pass manager announcing the next pass, so the SROA snapshot's bytes mention
// EarlyCSEPass. Text consumers must not attribute that name to this snapshot.
func TestMiddleEndRangesEndWithTheNextPassAnnouncement(t *testing.T) {
	a := actualArchive(t)
	body, err := a.Text("checked", "middle", 73)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(body, "\n"), "\n")
	ir, tail, _ := strings.Cut(body, "\nRunning pass: ")
	if !strings.HasPrefix(lines[0], "; *** IR Dump After SROAPass on row") ||
		!strings.HasPrefix(tail, "EarlyCSEPass on row") || strings.Contains(ir, "EarlyCSEPass") ||
		!strings.HasPrefix(lines[len(lines)-1], "Running analysis: ") {
		t.Fatalf("unexpected range layout: first %q, last %q", lines[0], lines[len(lines)-1])
	}
	events, err := a.Events("checked", "middle")
	if err != nil {
		t.Fatal(err)
	}
	// The 50-byte preamble before the first dump announces its pass and
	// belongs to no event; the manifest digest still covers it.
	if events[0].Ref.Start != len("Running pass: Annotation2MetadataPass on [module]\n") {
		t.Fatal(events[0].Ref)
	}
}

func TestVerifyCertifiesAndWarmsEveryStream(t *testing.T) {
	a := actualArchive(t)
	if err := a.Verify(); err != nil {
		t.Fatal(err)
	}
	// The manifest's rawBytes for the six streams sum to 30,912,391.
	if s := a.Stats(); s["streamInflations"] != uint64(6) || s["inflatedBytes"] != uint64(30912391) {
		t.Fatal(s)
	}
	if err := a.Verify(); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Text("firmware", "backend", 0); err != nil {
		t.Fatal(err)
	}
	if s := a.Stats(); s["streamInflations"] != uint64(6) || s["textReads"] != uint64(1) {
		t.Fatalf("verification was repeated or not reused: %v", s)
	}
}

func writeGzip(t *testing.T, path string, data []byte) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	w := gzip.NewWriter(f)
	if _, err = w.Write(data); err != nil {
		t.Fatal(err)
	}
	if err = w.Close(); err != nil {
		t.Fatal(err)
	}
	if err = f.Close(); err != nil {
		t.Fatal(err)
	}
}

// These microbenchmarks measure the evidence reader. The cold case includes
// opening all indexes; each warm read slices one verified in-memory stream.
func BenchmarkCheckedMiddleDump(b *testing.B) {
	b.Run("open-and-first-read", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			a := actualArchive(b)
			if _, err := a.Text("checked", "middle", 74); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("resident-read", func(b *testing.B) {
		a := actualArchive(b)
		if _, err := a.Text("checked", "middle", 74); err != nil {
			b.Fatal(err)
		}
		b.ReportAllocs()
		for b.Loop() {
			if _, err := a.Text("checked", "middle", 74); err != nil {
				b.Fatal(err)
			}
		}
	})
}

// A service names the capture it mounted from the ticket directory and its
// index.md title, and lists every stream with the manifest's digest.
func TestLabelAndStreamsDescribeTheMountedCapture(t *testing.T) {
	a := actualArchive(t)
	label := a.Label()
	if label.Ticket != "PICOCALC-ROW-IR" || label.Title != "Trace the ray row through GCC and LLVM optimization passes" || !filepath.IsAbs(label.Dir) {
		t.Fatalf("label: %+v", label)
	}
	if label.String() != "PICOCALC-ROW-IR (Trace the ray row through GCC and LLVM optimization passes)" {
		t.Fatal(label.String())
	}
	streams := a.Streams()
	if len(streams) != 6 || streams[0].Variant != "checked" || streams[0].Phase != "middle" || streams[1].Phase != "backend" {
		t.Fatalf("streams: %+v", streams)
	}
	events, _ := a.Events("checked", "middle")
	if streams[0].SHA256 != events[0].Ref.StreamSHA || streams[0].Dumps != len(events) {
		t.Fatalf("stream 0 disagrees with its events: %+v", streams[0])
	}
	raw, err := os.ReadFile(filepath.Join(a.Dir(), "various", "llvm-pipeline", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if sum := sha256.Sum256(raw); a.ManifestSHA256() != hex.EncodeToString(sum[:]) {
		t.Fatal("manifest digest")
	}
	// A directory that is not a docmgr ticket still gets a name.
	if l := readLabel(t.TempDir()); l.Ticket == "" || l.Title != "" {
		t.Fatalf("plain directory label: %+v", l)
	}
}
