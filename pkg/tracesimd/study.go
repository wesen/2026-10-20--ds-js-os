// Package tracesimd opens one p4-simd-evidence-v1 file: compiler SIMD
// decisions tied to byte ranges of a fixed-width RV32 image, and complete
// per-PC execution histograms captured from the same image. Every identity,
// range and count is verified once in Open; afterwards the study is read-only
// and every accessor returns a private copy.
package tracesimd

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path"
	"regexp"
	"sort"
	"strings"

	"github.com/pkg/errors"
)

const (
	Format = "p4-simd-evidence-v1"
	// MaxSafe is Number.MAX_SAFE_INTEGER; larger integers cannot cross into JS exactly.
	MaxSafe = 1<<53 - 1
	Unit    = "guest instruction executions: retired RV32 instructions whose PC lies in the role's byte ranges, summed over the trace's complete per-PC histogram"
	// Omission states the only reading of an absent PC.
	Omission = "the histogram is complete for this trace: a PC inside its image that is not listed executed zero times in this trace; it says nothing about other traces, workloads or images"
)

type Source struct {
	Path      string `json:"path"`
	SHA256    string `json:"sha256"`
	LineStart int64  `json:"lineStart"`
	LineEnd   int64  `json:"lineEnd"`
}

type Alternative struct {
	Plan   string `json:"plan"`
	Status string `json:"status"`
	Reason string `json:"reason"`
}

// Range is a half-open byte interval [Start, End) of the decision's image.
type Range struct {
	Start int64  `json:"start"`
	End   int64  `json:"end"`
	Role  string `json:"role"`
}

type Decision struct {
	ID           string        `json:"id"`
	Function     string        `json:"function"`
	Source       Source        `json:"source"`
	ImageSHA     string        `json:"imageSHA"`
	Plan         string        `json:"plan"`
	Alternatives []Alternative `json:"alternatives"`
	Ranges       []Range       `json:"ranges"`
}

type Count struct {
	PC         int64 `json:"pc"`
	Executions int64 `json:"executions"`
}

type Packet struct {
	Pose    string `json:"pose"`
	Row     int64  `json:"row"`
	Group   int64  `json:"group"`
	Lanes   int64  `json:"lanes"`
	HitMask int64  `json:"hitMask"`
}

type PacketSet struct {
	Workload  string   `json:"workload"`
	SourceSHA string   `json:"sourceSHA"`
	Packets   []Packet `json:"packets"`
}

// TraceInfo is a trace without its histogram.
type TraceInfo struct {
	ID          string `json:"id"`
	ImageSHA    string `json:"imageSHA"`
	ImageBytes  int64  `json:"imageBytes"`
	Workload    string `json:"workload"`
	Steps       int64  `json:"steps"`
	ListedPCs   int64  `json:"listedPCs"`
	Unit        string `json:"unit"`
	Complete    bool   `json:"complete"`
	OmittedMean string `json:"omittedPCsMean"`
}

type CountTable struct {
	TraceInfo
	Counts []Count `json:"counts"`
}

type ImageInfo struct {
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

// Execution joins one decision role to one trace of the same image.
type Execution struct {
	Decision           string  `json:"decision"`
	Function           string  `json:"function"`
	Source             Source  `json:"source"`
	Trace              string  `json:"trace"`
	Workload           string  `json:"workload"`
	ImageSHA           string  `json:"imageSHA"`
	Role               string  `json:"role"`
	Ranges             []Range `json:"ranges"`
	StaticInstructions int64   `json:"staticInstructions"`
	ExecutedPCs        int64   `json:"executedPCs"`
	Executions         int64   `json:"executions"`
	Unit               string  `json:"unit"`
	TraceSteps         int64   `json:"traceSteps"`
	Witnesses          []Count `json:"witnesses"`
	OmittedMean        string  `json:"omittedPCsMean"`
}

type image struct {
	SHA256 string `json:"sha256"`
	Code   []byte `json:"code"` // base64 in JSON
}

type trace struct {
	ID       string  `json:"id"`
	ImageSHA string  `json:"imageSHA"`
	Workload string  `json:"workload"`
	Steps    int64   `json:"steps"`
	Counts   []Count `json:"counts"`
}

type file struct {
	Format     string      `json:"format"`
	Images     []image     `json:"images"`
	Decisions  []Decision  `json:"decisions"`
	Traces     []trace     `json:"traces"`
	PacketSets []PacketSet `json:"packetSets"`
}

// Study is immutable after Open/Parse.
type Study struct {
	sha       string
	images    []ImageInfo
	sizes     map[string]int64
	decisions []Decision
	traces    []trace
	packets   []PacketSet
}

// required lists keys that must be present and non-null at each path.
// encoding/json alone cannot tell a missing integer from a zero.
var required = map[string][]string{
	"":                       {"format", "images", "decisions", "traces", "packetSets"},
	"images":                 {"sha256", "code"},
	"decisions":              {"id", "function", "source", "imageSHA", "plan", "alternatives", "ranges"},
	"decisions.source":       {"path", "sha256", "lineStart", "lineEnd"},
	"decisions.alternatives": {"plan", "status", "reason"},
	"decisions.ranges":       {"start", "end", "role"},
	"traces":                 {"id", "imageSHA", "workload", "steps", "counts"},
	"traces.counts":          {"pc", "executions"},
	"packetSets":             {"workload", "sourceSHA", "packets"},
	"packetSets.packets":     {"pose", "row", "group", "lanes", "hitMask"},
}

func checkKeys(at string, v any) error {
	switch x := v.(type) {
	case []any:
		for i, e := range x {
			if err := checkKeys(at, e); err != nil {
				return errors.Wrapf(err, "[%d]", i)
			}
		}
	case map[string]any:
		for _, k := range required[at] {
			if e, ok := x[k]; !ok || e == nil {
				return fmt.Errorf("missing field %q", k)
			}
		}
		for k, e := range x {
			child := strings.TrimPrefix(at+"."+k, ".")
			if _, ok := required[child]; ok {
				if err := checkKeys(child, e); err != nil {
					return errors.Wrap(err, k)
				}
			}
		}
	}
	return nil
}

var hex64 = regexp.MustCompile(`^[0-9a-f]{64}$`)

func safe(v int64) bool { return v >= 0 && v <= MaxSafe }

// datasetPath accepts only clean relative slash paths inside the dataset.
func datasetPath(p string) bool {
	return p != "" && p != "." && !strings.ContainsAny(p, "\\:\x00") && !path.IsAbs(p) &&
		path.Clean(p) == p && p != ".." && !strings.HasPrefix(p, "../")
}

// isInstruction checks the low two bits used by this compiler’s fixed-width
// RV32 and PIE words. The emitting compiler supplies the instruction ranges.
// Data with the same low bits would pass this prefix check.
func isInstruction(code []byte, off int64) bool { return code[off]&3 == 3 }

// Open reads and verifies one study file. It reads no other path.
func Open(file string) (*Study, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	s, err := Parse(data)
	if err != nil {
		return nil, errors.Wrap(err, file)
	}
	return s, nil
}

func Parse(data []byte) (*Study, error) {
	var generic any
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	if err := d.Decode(&generic); err != nil {
		return nil, errors.Wrap(err, "malformedStudy")
	}
	if _, err := d.Token(); err != io.EOF {
		return nil, fmt.Errorf("malformedStudy: trailing data after the study object")
	}
	if err := checkKeys("", generic); err != nil {
		return nil, errors.Wrap(err, "malformedStudy")
	}
	var f file
	d = json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(&f); err != nil {
		return nil, errors.Wrap(err, "malformedStudy")
	}
	if f.Format != Format {
		return nil, fmt.Errorf("malformedStudy: format %q, want %q", f.Format, Format)
	}
	sum := sha256.Sum256(data)
	s := &Study{sha: hex.EncodeToString(sum[:]), sizes: map[string]int64{}}
	code := map[string][]byte{}
	for i, im := range f.Images {
		digest := sha256.Sum256(im.Code)
		switch {
		case !hex64.MatchString(im.SHA256):
			return nil, fmt.Errorf("badDigest: images[%d].sha256 %q is not 64 lowercase hex digits", i, im.SHA256)
		case hex.EncodeToString(digest[:]) != im.SHA256:
			return nil, fmt.Errorf("imageDigestMismatch: images[%d] bytes hash to %x, record says %s", i, digest, im.SHA256)
		case code[im.SHA256] != nil:
			return nil, fmt.Errorf("duplicateImage: %s", im.SHA256)
		case len(im.Code) == 0 || len(im.Code)%4 != 0:
			return nil, fmt.Errorf("notFixedWidth: image %s has %d bytes; a fixed-width RV32 image is a nonzero multiple of 4", im.SHA256, len(im.Code))
		}
		code[im.SHA256] = im.Code
		s.sizes[im.SHA256] = int64(len(im.Code))
		s.images = append(s.images, ImageInfo{im.SHA256, int64(len(im.Code))})
	}
	ids := map[string]bool{}
	for i, dc := range f.Decisions {
		if err := checkDecision(dc, code); err != nil {
			return nil, errors.Wrapf(err, "decisions[%d] %q", i, dc.ID)
		}
		if ids[dc.ID] {
			return nil, fmt.Errorf("duplicateDecision: %q", dc.ID)
		}
		ids[dc.ID] = true
	}
	ids = map[string]bool{}
	for i := range f.Traces {
		t := &f.Traces[i]
		if err := checkTrace(t, code); err != nil {
			return nil, errors.Wrapf(err, "traces[%d] %q", i, t.ID)
		}
		if ids[t.ID] {
			return nil, fmt.Errorf("duplicateTrace: %q", t.ID)
		}
		ids[t.ID] = true
	}
	ids = map[string]bool{}
	for i, ps := range f.PacketSets {
		if err := checkPackets(ps); err != nil {
			return nil, errors.Wrapf(err, "packetSets[%d] %q", i, ps.Workload)
		}
		if ids[ps.Workload] {
			return nil, fmt.Errorf("duplicatePacketSet: %q", ps.Workload)
		}
		ids[ps.Workload] = true
	}
	s.decisions, s.traces, s.packets = f.Decisions, f.Traces, f.PacketSets
	return s, nil
}

func checkDecision(d Decision, code map[string][]byte) error {
	src := d.Source
	switch {
	case d.ID == "" || d.Function == "" || d.Plan == "":
		return fmt.Errorf("malformedDecision: id, function and plan must be nonempty")
	case !datasetPath(src.Path):
		return fmt.Errorf("pathOutsideDataset: source.path %q must be a clean relative path inside the dataset", src.Path)
	case !hex64.MatchString(src.SHA256):
		return fmt.Errorf("badDigest: source.sha256 %q", src.SHA256)
	case src.LineStart < 1 || src.LineEnd < src.LineStart || !safe(src.LineEnd):
		return fmt.Errorf("badSourceInterval: lines %d..%d", src.LineStart, src.LineEnd)
	case code[d.ImageSHA] == nil:
		return fmt.Errorf("unknownImage: imageSHA %q is not among images", d.ImageSHA)
	case len(d.Ranges) == 0:
		return fmt.Errorf("malformedDecision: no ranges")
	}
	for i, a := range d.Alternatives {
		if a.Plan == "" || a.Status == "" || a.Reason == "" {
			return fmt.Errorf("malformedDecision: alternatives[%d] needs plan, status and reason", i)
		}
	}
	img := code[d.ImageSHA]
	byRole := map[string][]Range{}
	for i, r := range d.Ranges {
		if r.Role == "" {
			return fmt.Errorf("malformedRange: ranges[%d] has no role", i)
		}
		if r.Start < 0 || r.Start >= r.End || r.End > int64(len(img)) {
			return fmt.Errorf("rangeOutsideImage: ranges[%d] [%d,%d) is empty or outside the %d-byte image", i, r.Start, r.End, len(img))
		}
		if r.Start%4 != 0 || r.End%4 != 0 {
			return fmt.Errorf("misalignedRange: ranges[%d] [%d,%d) is not 4-byte aligned", i, r.Start, r.End)
		}
		for off := r.Start; off < r.End; off += 4 {
			if !isInstruction(img, off) {
				return fmt.Errorf("notFixedWidth: byte %d in ranges[%d] is not a 32-bit RV32 encoding", off, i)
			}
		}
		byRole[r.Role] = append(byRole[r.Role], r)
	}
	for role, rs := range byRole {
		sort.Slice(rs, func(a, b int) bool { return rs[a].Start < rs[b].Start })
		for i := 1; i < len(rs); i++ {
			if rs[i].Start < rs[i-1].End {
				return fmt.Errorf("overlappingRanges: role %q has [%d,%d) and [%d,%d)", role, rs[i-1].Start, rs[i-1].End, rs[i].Start, rs[i].End)
			}
		}
	}
	return nil
}

func checkTrace(t *trace, code map[string][]byte) error {
	img := code[t.ImageSHA]
	switch {
	case t.ID == "" || t.Workload == "":
		return fmt.Errorf("malformedTrace: id and workload must be nonempty")
	case img == nil:
		return fmt.Errorf("unknownImage: imageSHA %q is not among images", t.ImageSHA)
	case !safe(t.Steps):
		return fmt.Errorf("unsafeInteger: steps %d is negative or above 2^53-1", t.Steps)
	}
	seen := make(map[int64]bool, len(t.Counts))
	var total int64
	for i, c := range t.Counts {
		switch {
		case c.PC < 0 || c.PC >= int64(len(img)):
			return fmt.Errorf("pcOutsideImage: counts[%d].pc %d outside the %d-byte image", i, c.PC, len(img))
		case c.PC%4 != 0:
			return fmt.Errorf("misalignedPC: counts[%d].pc %d", i, c.PC)
		case !safe(c.Executions):
			return fmt.Errorf("unsafeInteger: counts[%d].executions %d is negative or above 2^53-1", i, c.Executions)
		case c.Executions > 0 && !isInstruction(img, c.PC):
			return fmt.Errorf("notFixedWidth: executed pc %d is not a 32-bit RV32 encoding", c.PC)
		case seen[c.PC]:
			return fmt.Errorf("duplicatePC: pc %d listed twice", c.PC)
		case c.Executions > MaxSafe-total:
			return fmt.Errorf("countOverflow: executions exceed 2^53-1 at counts[%d]", i)
		}
		seen[c.PC] = true
		total += c.Executions
	}
	if total != t.Steps {
		return fmt.Errorf("stepsMismatch: counts sum to %d, steps says %d", total, t.Steps)
	}
	sort.Slice(t.Counts, func(a, b int) bool { return t.Counts[a].PC < t.Counts[b].PC })
	return nil
}

func checkPackets(ps PacketSet) error {
	if ps.Workload == "" || !hex64.MatchString(ps.SourceSHA) {
		return fmt.Errorf("malformedPacketSet: needs a workload and a 64-hex sourceSHA")
	}
	type key struct {
		pose       string
		row, group int64
	}
	seen := map[key]bool{}
	for i, p := range ps.Packets {
		k := key{p.Pose, p.Row, p.Group}
		switch {
		case p.Pose == "" || !safe(p.Row) || !safe(p.Group):
			return fmt.Errorf("malformedPacket: packets[%d] needs a pose and nonnegative safe row and group", i)
		case p.Lanes < 1 || p.Lanes > 32 || p.HitMask < 0 || p.HitMask >= 1<<p.Lanes:
			return fmt.Errorf("malformedPacket: packets[%d] lanes %d, hitMask %d", i, p.Lanes, p.HitMask)
		case seen[k]:
			return fmt.Errorf("duplicatePacket: pose %q row %d group %d", p.Pose, p.Row, p.Group)
		}
		seen[k] = true
	}
	return nil
}

func clone[T any](s []T) []T { return append(make([]T, 0, len(s)), s...) }

// SHA256 identifies the exact study file bytes.
func (s *Study) SHA256() string { return s.sha }

// Empty reports a well-formed study that records nothing to query.
func (s *Study) Empty() bool {
	return len(s.images) == 0 && len(s.decisions) == 0 && len(s.traces) == 0 && len(s.packets) == 0
}

func (s *Study) Images() []ImageInfo { return clone(s.images) }

func (s *Study) Decisions() []Decision {
	out := clone(s.decisions)
	for i := range out {
		out[i].Alternatives, out[i].Ranges = clone(out[i].Alternatives), clone(out[i].Ranges)
	}
	return out
}

func (s *Study) info(t trace) TraceInfo {
	return TraceInfo{t.ID, t.ImageSHA, s.sizes[t.ImageSHA], t.Workload, t.Steps, int64(len(t.Counts)), "retired guest instructions", true, Omission}
}

func (s *Study) Traces() []TraceInfo {
	out := make([]TraceInfo, 0, len(s.traces))
	for _, t := range s.traces {
		out = append(out, s.info(t))
	}
	return out
}

func (s *Study) lookupTrace(id string) (trace, error) {
	known := []string{}
	for _, t := range s.traces {
		if t.ID == id {
			return t, nil
		}
		known = append(known, t.ID)
	}
	return trace{}, fmt.Errorf("unknownTrace: no trace %q; choose one of %q", id, known)
}

func (s *Study) Counts(traceID string) (CountTable, error) {
	t, err := s.lookupTrace(traceID)
	if err != nil {
		return CountTable{}, err
	}
	return CountTable{s.info(t), clone(t.Counts)}, nil
}

func (s *Study) Packets(workload string) (PacketSet, error) {
	known := []string{}
	for _, ps := range s.packets {
		if ps.Workload == workload {
			ps.Packets = clone(ps.Packets)
			return ps, nil
		}
		known = append(known, ps.Workload)
	}
	return PacketSet{}, fmt.Errorf("unknownWorkload: no packet set for %q; choose one of %q", workload, known)
}

// Executions sums one role's executions in one trace. The decision and trace
// must name the same image; a cross-image join is refused, never estimated.
func (s *Study) Executions(decisionID, traceID, role string) (Execution, error) {
	var d *Decision
	known := []string{}
	for i := range s.decisions {
		if s.decisions[i].ID == decisionID {
			d = &s.decisions[i]
		}
		known = append(known, s.decisions[i].ID)
	}
	if d == nil {
		return Execution{}, fmt.Errorf("unknownDecision: no decision %q; choose one of %q", decisionID, known)
	}
	t, err := s.lookupTrace(traceID)
	if err != nil {
		return Execution{}, err
	}
	if d.ImageSHA != t.ImageSHA {
		return Execution{}, fmt.Errorf("crossImageJoin: decision %q describes image %s but trace %q executed image %s; byte offsets are not comparable across images", d.ID, d.ImageSHA, t.ID, t.ImageSHA)
	}
	e := Execution{Decision: d.ID, Function: d.Function, Source: d.Source, Trace: t.ID, Workload: t.Workload,
		ImageSHA: t.ImageSHA, Role: role, Ranges: []Range{}, Unit: Unit, TraceSteps: t.Steps, Witnesses: []Count{}, OmittedMean: Omission}
	roles := []string{}
	for _, r := range d.Ranges {
		if !contains(roles, r.Role) {
			roles = append(roles, r.Role)
		}
		if r.Role != role {
			continue
		}
		e.Ranges = append(e.Ranges, r)
		e.StaticInstructions += (r.End - r.Start) / 4
		for i := sort.Search(len(t.Counts), func(i int) bool { return t.Counts[i].PC >= r.Start }); i < len(t.Counts) && t.Counts[i].PC < r.End; i++ {
			if c := t.Counts[i]; c.Executions > 0 {
				e.Witnesses = append(e.Witnesses, c)
				e.ExecutedPCs++
				e.Executions += c.Executions
			}
		}
	}
	if len(e.Ranges) == 0 {
		return Execution{}, fmt.Errorf("unknownRole: decision %q has no role %q; choose one of %q", d.ID, role, roles)
	}
	sort.Slice(e.Witnesses, func(a, b int) bool { return e.Witnesses[a].PC < e.Witnesses[b].PC })
	return e, nil
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
