// Package tracearchive reads the indexed LLVM pass dumps and execution summaries
// in a PicoCalc ROW-IR ticket. All query sessions can share one Archive.
package tracearchive

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/pkg/errors"
)

// Ref identifies a half-open byte range of a decompressed stream. The ordinal
// is local to that stream. A JS consumer must use byte offsets on the source.
type Ref struct {
	Variant   string `json:"variant"`
	Phase     string `json:"phase"`
	StreamSHA string `json:"streamSHA"`
	Ordinal   int    `json:"ordinal"`
	Start     int    `json:"start"`
	End       int    `json:"end"`
}

type Event struct {
	Variant string `json:"variant"`
	Phase   string `json:"phase"`
	Ordinal int    `json:"ordinal"`
	Pass    string `json:"pass"`
	Header  string `json:"header"`
	Ref     Ref    `json:"ref"`
}

type streamSpec struct {
	SHA256   string `json:"sha256"`
	RawBytes int    `json:"rawBytes"`
	Dumps    int    `json:"dumps"`
}

type indexEntry struct {
	Offset int    `json:"offset"`
	Header string `json:"header"`
}

type streamID struct{ variant, phase string }

type stream struct {
	path   string
	spec   streamSpec
	events []Event

	mu   sync.Mutex
	text string // immutable after successful inflation and verification
}

type profile struct {
	path   string
	mu     sync.Mutex
	value  interface{} // immutable JSON tree, never lent to a caller
	digest string
}

type initialModule struct {
	path         string
	mu           sync.Mutex
	text, digest string
}

type Archive struct {
	dir              string
	label            Label
	manifestSHA      string
	initialModules   map[string]*initialModule
	moduleLoads      atomic.Uint64
	streams          map[streamID]*stream
	order            []streamID
	variants         []string
	profiles         map[string]*profile
	streamInflations atomic.Uint64
	inflatedBytes    atomic.Uint64
	textReads        atomic.Uint64
	profileReads     atomic.Uint64
	profileLoads     atomic.Uint64
}

// Open reads the manifest and validates the indexes. Event bodies are inflated,
// checked against the manifest digest and cross-checked with the index upon the
// first Text call for each stream, or all at once by Verify. Until then, Events
// and their Refs repeat what the index and manifest claim. No filesystem paths
// come from query code.
func Open(dir string) (*Archive, error) {
	pipeline := filepath.Join(dir, "various", "llvm-pipeline")
	manifest, err := os.ReadFile(filepath.Join(pipeline, "manifest.json"))
	if err != nil {
		return nil, errors.Wrap(err, "open ROW-IR ticket: expected various/llvm-pipeline/manifest.json below the ticket root")
	}
	var specs map[string]map[string]streamSpec
	if err := json.Unmarshal(manifest, &specs); err != nil {
		return nil, errors.Wrap(err, "decode stream manifest")
	}
	if len(specs) == 0 {
		return nil, errors.New("stream manifest contains no variants")
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, errors.Wrap(err, "resolve archive directory")
	}
	sum := sha256.Sum256(manifest)
	a := &Archive{dir: abs, label: readLabel(abs), manifestSHA: hex.EncodeToString(sum[:]),
		streams: make(map[streamID]*stream), profiles: make(map[string]*profile), initialModules: make(map[string]*initialModule)}
	for variant, phases := range specs {
		if !validVariant(variant) || len(phases) == 0 {
			return nil, errors.Errorf("invalid manifest variant %q or empty phase list", variant)
		}
		a.variants = append(a.variants, variant)
		a.initialModules[variant] = &initialModule{path: filepath.Join(pipeline, variant+"-raw.ll.gz")}
		for phase, spec := range phases {
			if phase != "middle" && phase != "backend" {
				return nil, errors.Errorf("unknown manifest phase %q for %s: expected middle or backend", phase, variant)
			}
			id := streamID{variant, phase}
			s, err := openStream(pipeline, id, spec)
			if err != nil {
				return nil, errors.Wrapf(err, "open %s/%s", variant, phase)
			}
			a.streams[id] = s
			a.order = append(a.order, id)
		}
	}
	sort.Strings(a.variants)
	sort.Slice(a.order, func(i, j int) bool {
		left, right := a.order[i], a.order[j]
		if left.variant != right.variant {
			return left.variant < right.variant
		}
		return left.phase == "middle" && right.phase == "backend"
	})
	for name, file := range map[string]string{"execution": "execution.json", "typed": "typed-counts.json", "metrics": "pass-metrics.json"} {
		a.profiles[name] = &profile{path: filepath.Join(dir, "various", "passes", file)}
	}
	return a, nil
}

func validVariant(s string) bool {
	return s != "" && strings.IndexFunc(s, func(c rune) bool {
		return !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_' || c == '-')
	}) < 0
}

func openStream(pipeline string, id streamID, spec streamSpec) (*stream, error) {
	digest, err := hex.DecodeString(spec.SHA256)
	if err != nil || len(digest) != sha256.Size || spec.RawBytes <= 0 || spec.Dumps <= 0 {
		return nil, errors.New("invalid sha256, rawBytes, or dumps in manifest")
	}
	spec.SHA256 = strings.ToLower(spec.SHA256)
	stem := filepath.Join(pipeline, id.variant+"-"+id.phase)
	compressed, err := os.Open(stem + ".index.json.gz")
	if err != nil {
		return nil, errors.Wrap(err, "open index")
	}
	defer compressed.Close()
	r, err := gzip.NewReader(compressed)
	if err != nil {
		return nil, errors.Wrap(err, "open gzipped index")
	}
	defer r.Close()
	var items []indexEntry
	dec := json.NewDecoder(r)
	if err := dec.Decode(&items); err != nil {
		return nil, errors.Wrap(err, "decode index")
	}
	if err := dec.Decode(new(interface{})); err != io.EOF {
		return nil, errors.Errorf("unexpected trailing index data or gzip error: %v", err)
	}
	if len(items) != spec.Dumps {
		return nil, errors.Errorf("index has %d dumps, manifest says %d", len(items), spec.Dumps)
	}
	s := &stream{path: stem + ".log.gz", spec: spec, events: make([]Event, len(items))}
	for i, item := range items {
		end := spec.RawBytes
		if i+1 < len(items) {
			end = items[i+1].Offset
		}
		if item.Offset < 0 || end <= item.Offset || end > spec.RawBytes {
			return nil, errors.Errorf("index entry %d invalid byte range [%d,%d) for %d bytes", i, item.Offset, end, spec.RawBytes)
		}
		pass, err := parsePass(id.phase, item.Header)
		if err != nil {
			return nil, errors.Wrapf(err, "index entry %d", i)
		}
		s.events[i] = Event{Variant: id.variant, Phase: id.phase, Ordinal: i, Pass: pass, Header: item.Header,
			Ref: Ref{Variant: id.variant, Phase: id.phase, StreamSHA: spec.SHA256, Ordinal: i, Start: item.Offset, End: end}}
	}
	return s, nil
}

func parsePass(phase, header string) (string, error) {
	name, ok := strings.CutPrefix(header, "IR Dump After ")
	if !ok {
		return "", errors.Errorf("unrecognized pass header %q", header)
	}
	if phase == "middle" {
		if pass, _, ok := strings.Cut(name, " on "); ok && pass != "" {
			return pass, nil
		}
	} else {
		name = strings.TrimSuffix(name, " ***:")
		left := strings.LastIndex(name, "(")
		if left >= 0 && strings.HasSuffix(name, ")") && left+1 < len(name)-1 {
			return name[left+1 : len(name)-1], nil
		}
	}
	return "", errors.Errorf("unrecognized %s pass header %q", phase, header)
}

// Events lists occurrences in stable variant, phase (middle before backend),
// and original ordinal order. Either selector may be empty to match all.
func (a *Archive) Events(variant, phase string) ([]Event, error) {
	if variant != "" && !slices.Contains(a.variants, variant) {
		return nil, errors.Errorf("unknown variant %q; available: %s", variant, strings.Join(a.variants, ", "))
	}
	if phase != "" && phase != "middle" && phase != "backend" {
		return nil, errors.Errorf("unknown phase %q; available: middle, backend", phase)
	}
	if variant != "" && phase != "" && a.streams[streamID{variant, phase}] == nil {
		return nil, errors.Errorf("missing stream %s/%s", variant, phase)
	}
	out := make([]Event, 0)
	for _, id := range a.order {
		if (variant == "" || variant == id.variant) && (phase == "" || phase == id.phase) {
			out = append(out, a.streams[id].events...)
		}
	}
	return out, nil
}

// Text returns the full indexed dump: its printed header, the IR, and whatever
// the tools wrote before the next header. In middle-end streams that tail is
// -debug-pass-manager output for the following pass ("Running pass: <next>
// on row", "Running analysis: ..."), so a text search for a pass name must
// stop at the first such line. Go string slicing here uses bytes.
func (a *Archive) Text(variant, phase string, ordinal int) (string, error) {
	s := a.streams[streamID{variant, phase}]
	if s == nil {
		return "", errors.Errorf("unknown stream %q/%q; choose a variant from %s and a phase from middle, backend", variant, phase, strings.Join(a.variants, ", "))
	}
	if ordinal < 0 || ordinal >= len(s.events) {
		return "", errors.Errorf("ordinal %d outside %s/%s: choose 0..%d", ordinal, variant, phase, len(s.events)-1)
	}
	text, err := a.verified(streamID{variant, phase}, s)
	if err != nil {
		return "", err
	}
	a.textReads.Add(1)
	ref := s.events[ordinal].Ref
	return text[ref.Start:ref.End], nil
}

// verified returns the stream's bytes after they have matched the manifest
// digest and every index header once. Failures are not cached.
func (a *Archive) verified(id streamID, s *stream) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.text == "" {
		data, err := s.inflate()
		if err != nil {
			return "", errors.Wrapf(err, "verify %s/%s", id.variant, id.phase)
		}
		s.text = string(data)
		a.streamInflations.Add(1)
		a.inflatedBytes.Add(uint64(len(data)))
	}
	return s.text, nil
}

// Verify inflates every stream and checks it against the manifest digest and
// its index, as the first Text call would. A service calls it before serving
// so that each Ref it hands out cites bytes that were actually checked, and so
// the first query does not pay for decompression. It is idempotent.
func (a *Archive) Verify() error {
	for _, id := range a.order {
		if _, err := a.verified(id, a.streams[id]); err != nil {
			return err
		}
	}
	return nil
}

func (s *stream) inflate() ([]byte, error) {
	f, err := os.Open(s.path)
	if err != nil {
		return nil, errors.Wrap(err, "open compressed log")
	}
	defer f.Close()
	r, err := gzip.NewReader(f)
	if err != nil {
		return nil, errors.Wrap(err, "open gzip stream")
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, int64(s.spec.RawBytes)+1))
	if err != nil {
		return nil, errors.Wrap(err, "inflate stream")
	}
	if len(data) != s.spec.RawBytes {
		return nil, errors.Errorf("inflated length %d differs from manifest %d", len(data), s.spec.RawBytes)
	}
	d := sha256.Sum256(data)
	if hex.EncodeToString(d[:]) != s.spec.SHA256 {
		return nil, errors.New("inflated stream SHA-256 differs from manifest")
	}
	for _, event := range s.events {
		ref := event.Ref
		if ref.Start != 0 && data[ref.Start-1] != '\n' {
			return nil, errors.Errorf("index entry %d does not begin at a line boundary", ref.Ordinal)
		}
		line, _, _ := bytes.Cut(data[ref.Start:ref.End], []byte("\n"))
		// Match the original archiver's normalization. The machine printer
		// sometimes terminates with " ***:"; that colon is part of the index.
		header, ok := strings.CutPrefix(strings.TrimLeft(string(line), ";# "), "*** ")
		header = strings.TrimSuffix(strings.TrimSuffix(header, "\r"), " ***")
		if !ok || header != event.Header {
			return nil, errors.Errorf("index header at ordinal %d differs from log at byte %d", ref.Ordinal, ref.Start)
		}
	}
	return data, nil
}

func (a *Archive) loadProfile(name string) (*profile, error) {
	p := a.profiles[name]
	if p == nil {
		return nil, errors.Errorf("unknown profile %q; available: execution, metrics, typed", name)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.digest == "" {
		raw, err := os.ReadFile(p.path)
		if err != nil {
			return nil, errors.Wrapf(err, "read profile %q", name)
		}
		var value interface{}
		if err = json.Unmarshal(raw, &value); err != nil {
			return nil, errors.Wrapf(err, "decode profile %q", name)
		}
		sum := sha256.Sum256(raw)
		p.value = value
		p.digest = hex.EncodeToString(sum[:])
		a.profileLoads.Add(1)
	}
	return p, nil
}

// Profile returns private JSON data that a caller may mutate, independent of
// other sessions. A successful load parses and hashes each profile file once.
func (a *Archive) Profile(name string) (interface{}, error) {
	p, err := a.loadProfile(name)
	if err != nil {
		return nil, err
	}
	a.profileReads.Add(1)
	return cloneJSON(p.value), nil
}

// ProfileSHA returns the SHA-256 of the original file bytes for JSON citations.
func (a *Archive) ProfileSHA(name string) (string, error) {
	p, err := a.loadProfile(name)
	if err != nil {
		return "", err
	}
	return p.digest, nil
}

func cloneJSON(value interface{}) interface{} {
	switch x := value.(type) {
	case map[string]interface{}:
		m := make(map[string]interface{}, len(x))
		for k, v := range x {
			m[k] = cloneJSON(v)
		}
		return m
	case []interface{}:
		items := make([]interface{}, len(x))
		for i, v := range x {
			items[i] = cloneJSON(v)
		}
		return items
	default:
		return value
	}
}

// InitialModule returns the archived pre-optimization IR module and the digest
// of its uncompressed bytes. Its digest is calculated on first use because
// the stream manifest enumerates pass dumps, not the standalone modules.
func (a *Archive) InitialModule(variant string) (text, digest string, err error) {
	m := a.initialModules[variant]
	if m == nil {
		return "", "", errors.Errorf("unknown initial-module variant %q; available: %s", variant, strings.Join(a.variants, ", "))
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.digest != "" {
		return m.text, m.digest, nil
	}
	f, err := os.Open(m.path)
	if err != nil {
		return "", "", errors.Wrap(err, "open initial LLVM module")
	}
	defer f.Close()
	r, err := gzip.NewReader(f)
	if err != nil {
		return "", "", errors.Wrap(err, "open gzipped initial LLVM module")
	}
	defer r.Close()
	data, err := io.ReadAll(r)
	if err != nil {
		return "", "", errors.Wrap(err, "inflate initial LLVM module")
	}
	sum := sha256.Sum256(data)
	m.text = string(data)
	m.digest = hex.EncodeToString(sum[:])
	a.moduleLoads.Add(1)
	return m.text, m.digest, nil
}

// Stats describes successful operations since Open, across all sessions.
// Byte counts refer to retained decompressed streams, excluding metadata.
// streamInflations equals the number of streams whose bytes have been verified.
func (a *Archive) Stats() map[string]interface{} {
	return map[string]interface{}{
		"streamInflations": a.streamInflations.Load(), "inflatedBytes": a.inflatedBytes.Load(),
		"moduleLoads": a.moduleLoads.Load(), "textReads": a.textReads.Load(), "profileReads": a.profileReads.Load(), "profileLoads": a.profileLoads.Load(),
	}
}

// Label names the capture a service mounted. The manifest has no title, so the
// name comes from the archive directory, which is a docmgr ticket
// (TICKET--slug), and from the Title line of that ticket's index.md.
type Label struct {
	Ticket string `json:"ticket"`
	Title  string `json:"title,omitempty"`
	Dir    string `json:"dir"`
}

// String is the name help text uses, for example
// "PICOCALC-ROW-IR (Trace the ray row through GCC and LLVM optimization passes)".
func (l Label) String() string {
	if l.Title == "" {
		return l.Ticket
	}
	return l.Ticket + " (" + l.Title + ")"
}

func readLabel(dir string) Label {
	base := filepath.Base(dir)
	ticket, _, _ := strings.Cut(base, "--")
	label := Label{Ticket: ticket, Dir: dir}
	index, err := os.ReadFile(filepath.Join(dir, "index.md"))
	if err != nil {
		return label
	}
	front, ok := strings.CutPrefix(string(index), "---\n")
	if !ok {
		return label
	}
	front, _, _ = strings.Cut(front, "\n---")
	for _, line := range strings.Split(front, "\n") {
		if title, ok := strings.CutPrefix(line, "Title:"); ok {
			label.Title = strings.Trim(strings.TrimSpace(title), `"'`)
			break
		}
	}
	return label
}

// StreamInfo is one pass-dump stream as the manifest declares it.
type StreamInfo struct {
	Variant  string `json:"variant"`
	Phase    string `json:"phase"`
	SHA256   string `json:"sha256"`
	RawBytes int    `json:"rawBytes"`
	Dumps    int    `json:"dumps"`
}

// Dir is the absolute archive (ticket) directory given to Open.
func (a *Archive) Dir() string { return a.dir }

// Label names the mounted capture for help text and inventories.
func (a *Archive) Label() Label { return a.label }

// ManifestSHA256 is the digest of the manifest file bytes read by Open.
func (a *Archive) ManifestSHA256() string { return a.manifestSHA }

// Streams lists the streams in Events order (variant, then middle before backend).
func (a *Archive) Streams() []StreamInfo {
	out := make([]StreamInfo, 0, len(a.order))
	for _, id := range a.order {
		spec := a.streams[id].spec
		out = append(out, StreamInfo{Variant: id.variant, Phase: id.phase, SHA256: spec.SHA256, RawBytes: spec.RawBytes, Dumps: spec.Dumps})
	}
	return out
}
