package tracehardware

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func actualRoot(t *testing.T) string {
	t.Helper()
	dirs, err := filepath.Glob("../../ttmp/2026/11/21/PICOCALC-PIE-LOOPS--*")
	if err != nil || len(dirs) != 1 {
		t.Fatalf("locate study: %v %v", dirs, err)
	}
	return dirs[0]
}

func median(xs []float64) float64 {
	slices.Sort(xs)
	n := len(xs)
	return (xs[(n-1)/2] + xs[n/2]) / 2
}

func TestStudyAgainstPublishedMedians(t *testing.T) {
	root := actualRoot(t)
	s, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	meta := s.Metadata()
	if len(s.Rows()) != 864 || meta.Width != 160 || meta.Height != 160 || meta.SourceSHA != "b0a7c02bbb8646a2b17c669c7c42fcb5d76ae4d666fe90f988ea2bb97f143e0f" {
		t.Fatal(meta, len(s.Rows()))
	}
	raw, err := os.ReadFile(filepath.Join(root, "various", "device", "rows.json"))
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(raw)
	if meta.ArtifactSHA["rows.json"] != hex.EncodeToString(digest[:]) {
		t.Fatal(meta.ArtifactSHA)
	}
	var input []row
	if err = json.Unmarshal(raw, &input); err != nil {
		t.Fatal(err)
	}
	var summary struct {
		Poses map[string]map[string]struct {
			Paired map[string]struct {
				SavedUs  struct{ Median float64 }
				SavedPct struct{ Median float64 }
			}
		}
	}
	data, err := os.ReadFile(filepath.Join(root, "various", "device", "summary.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &summary); err != nil {
		t.Fatal(err)
	}
	type key struct{ pose, phase, contrast string }
	type sample struct{ us, pct []float64 }
	obs := map[key]*sample{}
	for _, r := range s.Rows() {
		c := r.baselineContrast()
		k := key{r.Pose, r.Phase, c}
		if obs[k] == nil {
			obs[k] = &sample{}
		}
		obs[k].us = append(obs[k].us, float64(r.SavedUs))
		obs[k].pct = append(obs[k].pct, r.SavedPct)
		l, rr := input[r.BaselineRow], input[r.CandidateRow]
		phase := slices.Index(phases[:], r.Phase)
		if l.Fixture != r.Pose || rr.Fixture != r.Pose || *l.Block != r.Block || *rr.Block != r.Block || l.Times[2][phase] != r.BaselineUs || rr.Times[2][phase] != r.CandidateUs {
			t.Fatal("bad row citations", r)
		}
	}
	if len(obs) != 144 {
		t.Fatalf("found %d comparison groups", len(obs))
	}
	for k, samples := range obs {
		want, ok := summary.Poses[k.pose][k.phase].Paired[k.contrast]
		if !ok {
			t.Fatal("missing published comparison", k)
		}
		if len(samples.us) != 6 || median(samples.us) != want.SavedUs.Median || math.Abs(median(samples.pct)-want.SavedPct.Median) > 1e-12 {
			t.Fatalf("summary mismatch for %+v: %v vs %+v", k, samples, want)
		}
	}
	opening := obs[key{"default", "clean", "stockToPie"}]
	if median(opening.us) != 1616 || math.Abs(median(opening.pct)-2.8014239567202264) > 1e-12 {
		t.Fatal(opening)
	}
	s.Rows()[0].SavedUs = -999
	meta.ArtifactSHA["rows.json"] = ""
	if s.Rows()[0].SavedUs == -999 || s.Metadata().ArtifactSHA["rows.json"] == "" {
		t.Fatal("shared state mutated")
	}
}

// Every pair compares two programs compiled from one source, measured in the
// same block on the same fixture, whose outputs agree, at different positions
// of a counterbalanced load order. Each ELF is the one the device confirmed.
func TestPairsArePhysicallyMatched(t *testing.T) {
	root := actualRoot(t)
	s, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		Program  int      `json:"program"`
		Block    int      `json:"block"`
		Fixture  string   `json:"fixture"`
		Pose     []int    `json:"pose"`
		Stride   int      `json:"stride"`
		Rotation int      `json:"rotation"`
		CRC      []string `json:"crc"`
	}
	raw, err := os.ReadFile(filepath.Join(root, "various", "device", "rows.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	meta := s.Metadata()
	loadAt := map[[2]int]Load{}
	for _, l := range s.Loads() {
		loadAt[[2]int{l.Block, l.Position}] = l
	}
	type cell struct{ baseline, candidate, phase string }
	perCell := map[cell]int{}
	perPose := map[cell]map[string]map[int]bool{}
	for _, p := range s.Rows() {
		b, c := rows[p.BaselineRow], rows[p.CandidateRow]
		if b.Block != p.Block || c.Block != p.Block || b.Fixture != p.Pose || c.Fixture != p.Pose || b.Stride != c.Stride ||
			!slices.Equal(b.Pose, c.Pose) || !slices.Equal(b.CRC, c.CRC) || b.Rotation != p.BaselineRotation || c.Rotation != p.CandidateRotation {
			t.Fatalf("unmatched pair %+v", p)
		}
		if p.BaselinePosition == p.CandidatePosition || p.SourceSHA != meta.SourceSHA {
			t.Fatalf("pair shares a load position or source: %+v", p)
		}
		for _, side := range []struct {
			treatment string
			program   int
			position  int
		}{{p.Baseline, b.Program, p.BaselinePosition}, {p.Candidate, c.Program, p.CandidatePosition}} {
			l := loadAt[[2]int{p.Block, side.position}]
			if l.Treatment != side.treatment || l.Program != side.program || l.ELFCRC != meta.Images[side.treatment].CRC {
				t.Fatalf("pair %+v cites load %+v", p, l)
			}
		}
		k := cell{p.Baseline, p.Candidate, p.Phase}
		perCell[k]++
		if perPose[k] == nil {
			perPose[k] = map[string]map[int]bool{}
		}
		if perPose[k][p.Pose] == nil {
			perPose[k][p.Pose] = map[int]bool{}
		}
		perPose[k][p.Pose][p.Block] = true
	}
	if len(perCell) != 12 {
		t.Fatalf("%d contrast/phase cells", len(perCell))
	}
	for k, n := range perCell {
		if n != 72 || len(perPose[k]) != 12 {
			t.Fatalf("%+v: %d pairs over %d poses", k, n, len(perPose[k]))
		}
		for pose, blocks := range perPose[k] {
			if len(blocks) != 6 {
				t.Fatalf("%+v/%s: %d blocks", k, pose, len(blocks))
			}
		}
	}
}

// The cost side of the same trial: the published cold medians, and the scale
// of the trade a researcher must weigh. Scalar lowering makes the on-device
// compile about 45% slower in exchange for about 2.4-2.8% of clean render time.
func TestLoadsReportColdCompileCost(t *testing.T) {
	root := actualRoot(t)
	s, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	var summary struct {
		Cold map[string]map[string]float64 `json:"cold"`
	}
	data, err := os.ReadFile(filepath.Join(root, "various", "device", "summary.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &summary); err != nil {
		t.Fatal(err)
	}
	loads := s.Loads()
	if len(loads) != 18 {
		t.Fatal(len(loads))
	}
	compile := map[string]float64{}
	for _, treatment := range []string{"stock", "scalar", "pie"} {
		var us, peak, seg []float64
		for _, l := range loads {
			if l.Treatment == treatment {
				us, peak, seg = append(us, float64(l.CompilerUs)), append(peak, float64(l.PeakJSBytes)), append(seg, float64(l.SegmentBytes))
			}
		}
		want := summary.Cold[treatment]
		if len(us) != 6 || median(us) != want["compilerUs"] || median(peak) != want["peakJSBytes"] || median(seg) != want["segmentBytes"] {
			t.Fatalf("%s: compile %v peak %v segment %v; published %v", treatment, median(us), median(peak), median(seg), want)
		}
		compile[treatment] = median(us)
	}
	if slower := 100 * (compile["scalar"] - compile["stock"]) / compile["stock"]; math.Abs(slower-45.0) > 0.5 {
		t.Fatalf("scalar compile cost %.2f%%", slower)
	}
	meta := s.Metadata()
	if meta.TimerArm != 2 || len(meta.Images) != 3 || meta.Images["pie"].CRC != "ab91b817" || meta.Images["stock"].Program != 0 {
		t.Fatalf("%+v", meta)
	}
	loads[0].CompilerUs = -1
	meta.Images["pie"] = Image{}
	if s.Loads()[0].CompilerUs == -1 || s.Metadata().Images["pie"].CRC == "" {
		t.Fatal("shared state mutated")
	}
}

func (p Pair) baselineContrast() string {
	return p.Baseline + "To" + strings.ToUpper(p.Candidate[:1]) + p.Candidate[1:]
}

func TestRejectDamagedPairings(t *testing.T) {
	base := filepath.Join(actualRoot(t), "various", "device")
	probes := []struct {
		name, file string
		edit       func([]map[string]interface{}) []map[string]interface{}
		want       string
	}{
		{"duplicate", "rows", func(v []map[string]interface{}) []map[string]interface{} { return append(v, v[0]) }, "duplicate"},
		{"missing", "rows", func(v []map[string]interface{}) []map[string]interface{} { return v[1:] }, "missing observation"},
		{"CRC mismatch", "rows", func(v []map[string]interface{}) []map[string]interface{} {
			v[0]["crc"].([]interface{})[0] = "11111111"
			return v
		}, "output CRC disagree"},
		{"stride mismatch", "rows", func(v []map[string]interface{}) []map[string]interface{} { v[0]["stride"] = 174; return v }, "stride or output CRC disagree"},
		{"missing zero block", "rows", func(v []map[string]interface{}) []map[string]interface{} { delete(v[0], "block"); return v }, "no matching load"},
		{"bad position", "loads", func(v []map[string]interface{}) []map[string]interface{} {
			v[1]["position"] = v[0]["position"]
			return v
		}, "duplicate program or position"},
		{"wrong rotation", "rows", func(v []map[string]interface{}) []map[string]interface{} { v[0]["rotation"] = 1; return v }, "rotation disagrees"},
		{"load mismatch", "loads", func(v []map[string]interface{}) []map[string]interface{} { v[0]["elfCRC"] = "deadbeef"; return v }, "ELF CRC differs"},
		{"source mismatch", "images", func(v []map[string]interface{}) []map[string]interface{} {
			v[0]["source"] = strings.Repeat("0", 64)
			return v
		}, "source SHA differs"},
		{"missing compile time", "loads", func(v []map[string]interface{}) []map[string]interface{} { delete(v[3], "compilerUs"); return v }, "positive compilerUs"},
		{"non-positive device time", "rows", func(v []map[string]interface{}) []map[string]interface{} {
			v[5]["timesUs"].([]interface{})[2].([]interface{})[1] = 0
			return v
		}, "positive phase times"},
	}
	for _, p := range probes {
		t.Run(p.name, func(t *testing.T) {
			root := t.TempDir()
			dir := filepath.Join(root, "various", "device")
			if err := os.MkdirAll(dir, 0755); err != nil {
				t.Fatal(err)
			}
			for _, f := range []string{"build", "images", "loads", "rows"} {
				filename := f + ".json"
				data, err := os.ReadFile(filepath.Join(base, filename))
				if err != nil {
					t.Fatal(err)
				}
				if f == p.file {
					var entries []map[string]interface{}
					if err := json.Unmarshal(data, &entries); err != nil {
						t.Fatal(err)
					}
					data, err = json.Marshal(p.edit(entries))
					if err != nil {
						t.Fatal(err)
					}
				}
				if err := os.WriteFile(filepath.Join(dir, filename), data, 0644); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := Open(root); err == nil || !strings.Contains(err.Error(), p.want) {
				t.Fatalf("%s: %v; want %q", p.name, err, p.want)
			}
		})
	}
}
