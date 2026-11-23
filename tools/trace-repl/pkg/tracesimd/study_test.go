package tracesimd_test

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracesimd"
)

type obj = map[string]any

// words builds a little-endian RV32 image of n copies of fill, with overrides.
func words(n int, fill uint32, at map[int]uint32) []byte {
	b := make([]byte, 4*n)
	for i := 0; i < n; i++ {
		w := fill
		if v, ok := at[i]; ok {
			w = v
		}
		binary.LittleEndian.PutUint32(b[4*i:], w)
	}
	return b
}

func digest(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

const nop, addi = 0x00000013, 0x00100093

// fixture: image A (PIE) and image B (scalar), 64 bytes each. Roles
// packet-producer [0,16) and lane-consumer [8,24) overlap on purpose.
func fixture(a, b []byte) obj {
	sa, sb := digest(a), digest(b)
	src := obj{"path": "worlds/raytrace/raytrace.typed", "sha256": strings.Repeat("ab", 32), "lineStart": 112, "lineEnd": 122}
	return obj{
		"format": tracesimd.Format,
		"images": []any{
			obj{"sha256": sa, "code": base64.StdEncoding.EncodeToString(a)},
			obj{"sha256": sb, "code": base64.StdEncoding.EncodeToString(b)},
		},
		"decisions": []any{
			obj{"id": "pie-row", "function": "typedRayComputeRow", "source": src, "imageSHA": sa, "plan": "esp.vsub.s16 over 8 lanes",
				"alternatives": []any{obj{"plan": "scalar producer", "status": "rejected", "reason": "matched control"}},
				"ranges": []any{
					obj{"start": 0, "end": 16, "role": "packet-producer"},
					obj{"start": 28, "end": 32, "role": "scratch-store"},
					obj{"start": 16, "end": 20, "role": "scratch-store"},
					obj{"start": 8, "end": 24, "role": "lane-consumer"},
				}},
			obj{"id": "scalar-row", "function": "typedRayComputeRow", "source": src, "imageSHA": sb, "plan": "scalar producer",
				"alternatives": []any{}, "ranges": []any{obj{"start": 0, "end": 8, "role": "packet-producer"}}},
		},
		"traces": []any{
			obj{"id": "pie-opening", "imageSHA": sa, "workload": "opening-160-rows", "steps": 300, "counts": []any{
				obj{"pc": 40, "executions": 40}, obj{"pc": 0, "executions": 100}, obj{"pc": 4, "executions": 100},
				obj{"pc": 8, "executions": 50}, obj{"pc": 16, "executions": 7}, obj{"pc": 28, "executions": 3},
			}},
			obj{"id": "scalar-opening", "imageSHA": sb, "workload": "opening-160-rows", "steps": 15, "counts": []any{
				obj{"pc": 0, "executions": 10}, obj{"pc": 4, "executions": 5},
			}},
		},
		"packetSets": []any{obj{"workload": "opening-160-rows", "sourceSHA": strings.Repeat("ab", 32), "packets": []any{
			obj{"pose": "default", "row": 20, "group": 4, "lanes": 8, "hitMask": 255},
			obj{"pose": "default", "row": 20, "group": 5, "lanes": 8, "hitMask": 1},
		}}},
	}
}

func defaults() obj { return fixture(words(16, nop, nil), words(16, addi, nil)) }

func parse(t *testing.T, f obj) (*tracesimd.Study, error) {
	t.Helper()
	data, err := json.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	return tracesimd.Parse(data)
}

func at(f obj, path ...any) obj {
	var cur any = f
	for _, p := range path {
		switch k := p.(type) {
		case string:
			cur = cur.(obj)[k]
		case int:
			cur = cur.([]any)[k]
		}
	}
	return cur.(obj)
}

func TestOpenReadsOneFileAndJoinsByIdentity(t *testing.T) {
	data, _ := json.Marshal(defaults())
	file := filepath.Join(t.TempDir(), "study.json")
	if err := os.WriteFile(file, data, 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := tracesimd.Open(file)
	if err != nil {
		t.Fatal(err)
	}
	if s.SHA256() != digest(data) || s.Empty() {
		t.Fatalf("study identity %s empty=%v", s.SHA256(), s.Empty())
	}
	for role, want := range map[string][3]int64{"packet-producer": {250, 3, 4}, "scratch-store": {10, 2, 2}, "lane-consumer": {57, 2, 4}} {
		e, err := s.Executions("pie-row", "pie-opening", role)
		if err != nil {
			t.Fatal(err)
		}
		if got := [3]int64{e.Executions, e.ExecutedPCs, e.StaticInstructions}; got != want {
			t.Errorf("%s: executions/executedPCs/static = %v, want %v", role, got, want)
		}
		if e.ImageSHA != digest(words(16, nop, nil)) || e.TraceSteps != 300 || e.Unit != tracesimd.Unit || e.Source.LineStart != 112 {
			t.Errorf("%s: identity %+v", role, e)
		}
	}
	e, _ := s.Executions("pie-row", "pie-opening", "scratch-store")
	if len(e.Witnesses) != 2 || e.Witnesses[0].PC != 16 || e.Witnesses[1].PC != 28 {
		t.Errorf("witnesses not sorted by pc: %+v", e.Witnesses)
	}
	if c, _ := s.Counts("pie-opening"); c.Counts[0].PC != 0 || !c.Complete || c.ListedPCs != 6 {
		t.Errorf("counts %+v", c)
	}
	for _, tc := range [][4]string{
		{"pie-row", "scalar-opening", "packet-producer", "crossImageJoin"},
		{"pie-row", "pie-opening", "shade", "unknownRole"},
		{"nope", "pie-opening", "packet-producer", "unknownDecision"},
		{"pie-row", "nope", "packet-producer", "unknownTrace"},
	} {
		if _, err := s.Executions(tc[0], tc[1], tc[2]); err == nil || !strings.Contains(err.Error(), tc[3]) {
			t.Errorf("%v: %v", tc, err)
		}
	}
	if _, err := s.Packets("frames"); err == nil || !strings.Contains(err.Error(), "unknownWorkload") {
		t.Error(err)
	}
}

func TestAccessorsReturnPrivateCopies(t *testing.T) {
	s, err := parse(t, defaults())
	if err != nil {
		t.Fatal(err)
	}
	d := s.Decisions()
	d[0].Ranges[0].Start, d[0].Alternatives[0].Status = 999, "accepted"
	c, _ := s.Counts("pie-opening")
	c.Counts[0].Executions = -1
	p, _ := s.Packets("opening-160-rows")
	p.Packets[0].HitMask = 0
	e, _ := s.Executions("pie-row", "pie-opening", "scratch-store")
	e.Witnesses[0].Executions, e.Ranges[0].End = 0, 4
	if d := s.Decisions(); d[0].Ranges[0].Start != 0 || d[0].Alternatives[0].Status != "rejected" {
		t.Error("decision copy leaked")
	}
	if c, _ := s.Counts("pie-opening"); c.Counts[0].Executions != 100 {
		t.Error("count copy leaked")
	}
	if p, _ := s.Packets("opening-160-rows"); p.Packets[0].HitMask != 255 {
		t.Error("packet copy leaked")
	}
	if e, _ := s.Executions("pie-row", "pie-opening", "scratch-store"); e.Executions != 10 || e.Witnesses[0].Executions != 7 {
		t.Error("execution copy leaked")
	}
}

func TestDataOutsideRangesNeedNotBeInstructions(t *testing.T) {
	// A compressed halfword at byte 60 is neither in a range nor executed.
	if _, err := parse(t, fixture(words(16, nop, map[int]uint32{15: 0x0001}), words(16, addi, nil))); err != nil {
		t.Fatal(err)
	}
}

func TestEmptyStudyIsWellFormedButEmpty(t *testing.T) {
	s, err := parse(t, obj{"format": tracesimd.Format, "images": []any{}, "decisions": []any{}, "traces": []any{}, "packetSets": []any{}})
	if err != nil || !s.Empty() {
		t.Fatalf("%v %v", s, err)
	}
}

func TestRejectsMalformedCorpora(t *testing.T) {
	counts := func(f obj) []any { return at(f, "traces", 0)["counts"].([]any) }
	for name, tc := range map[string]struct {
		f    obj
		edit func(f obj)
		want string
	}{
		"format":              {nil, func(f obj) { f["format"] = "p4-simd-evidence-v0" }, "format"},
		"image digest":        {nil, func(f obj) { at(f, "images", 0)["sha256"] = strings.Repeat("0", 64) }, "imageDigestMismatch"},
		"uppercase digest":    {nil, func(f obj) { at(f, "images", 0)["sha256"] = strings.Repeat("A", 64) }, "badDigest"},
		"compressed in range": {fixture(words(16, nop, map[int]uint32{1: 0x0001}), words(16, addi, nil)), nil, "notFixedWidth"},
		"odd image length":    {fixture([]byte{0x13, 0, 0, 0, 0x13, 0}, words(16, addi, nil)), nil, "notFixedWidth"},
		"range past image":    {nil, func(f obj) { at(f, "decisions", 0, "ranges", 0)["end"] = 68 }, "rangeOutsideImage"},
		"empty range":         {nil, func(f obj) { at(f, "decisions", 0, "ranges", 0)["end"] = 0 }, "rangeOutsideImage"},
		"misaligned range":    {nil, func(f obj) { at(f, "decisions", 0, "ranges", 0)["start"] = 2 }, "misalignedRange"},
		"same-role overlap": {nil, func(f obj) {
			r := at(f, "decisions", 0)
			r["ranges"] = append(r["ranges"].([]any), obj{"start": 16, "end": 32, "role": "scratch-store"})
		}, "overlappingRanges"},
		"unknown image":      {nil, func(f obj) { at(f, "decisions", 0)["imageSHA"] = strings.Repeat("0", 64) }, "unknownImage"},
		"path escape":        {nil, func(f obj) { at(f, "decisions", 0, "source")["path"] = "../secret.typed" }, "pathOutsideDataset"},
		"absolute path":      {nil, func(f obj) { at(f, "decisions", 0, "source")["path"] = "/etc/passwd" }, "pathOutsideDataset"},
		"source interval":    {nil, func(f obj) { at(f, "decisions", 0, "source")["lineEnd"] = 100 }, "badSourceInterval"},
		"duplicate decision": {nil, func(f obj) { at(f, "decisions", 1)["id"] = "pie-row" }, "duplicateDecision"},
		"duplicate trace":    {nil, func(f obj) { at(f, "traces", 1)["id"] = "pie-opening" }, "duplicateTrace"},
		"pc past image":      {nil, func(f obj) { at(f, "traces", 0, "counts", 0)["pc"] = 64 }, "pcOutsideImage"},
		"negative pc":        {nil, func(f obj) { at(f, "traces", 0, "counts", 0)["pc"] = -4 }, "pcOutsideImage"},
		"misaligned pc":      {nil, func(f obj) { at(f, "traces", 0, "counts", 0)["pc"] = 42 }, "misalignedPC"},
		"duplicate pc": {nil, func(f obj) {
			at(f, "traces", 0)["counts"] = append(counts(f), obj{"pc": 0, "executions": 0})
		}, "duplicatePC"},
		"negative count": {nil, func(f obj) { at(f, "traces", 0, "counts", 0)["executions"] = -1 }, "unsafeInteger"},
		"unsafe count":   {nil, func(f obj) { at(f, "traces", 0, "counts", 0)["executions"] = int64(1) << 53 }, "unsafeInteger"},
		"sum overflow": {nil, func(f obj) {
			tr := at(f, "traces", 0)
			tr["counts"], tr["steps"] = []any{obj{"pc": 0, "executions": int64(tracesimd.MaxSafe)}, obj{"pc": 4, "executions": 1}}, int64(tracesimd.MaxSafe)
		}, "countOverflow"},
		"steps mismatch":   {nil, func(f obj) { at(f, "traces", 0)["steps"] = 301 }, "stepsMismatch"},
		"fractional":       {nil, func(f obj) { at(f, "traces", 0, "counts", 0)["executions"] = 1.5 }, "malformedStudy"},
		"missing count":    {nil, func(f obj) { delete(at(f, "traces", 0, "counts", 0), "executions") }, `missing field "executions"`},
		"null start":       {nil, func(f obj) { at(f, "decisions", 0, "ranges", 0)["start"] = nil }, `missing field "start"`},
		"unknown field":    {nil, func(f obj) { at(f, "decisions", 0)["guess"] = true }, "unknown field"},
		"hit mask":         {nil, func(f obj) { at(f, "packetSets", 0, "packets", 0)["hitMask"] = 256 }, "malformedPacket"},
		"duplicate packet": {nil, func(f obj) { at(f, "packetSets", 0, "packets", 1)["group"] = 4 }, "duplicatePacket"},
	} {
		f := tc.f
		if f == nil {
			f = defaults()
		}
		if tc.edit != nil {
			tc.edit(f)
		}
		if _, err := parse(t, f); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: got %v, want %q", name, err, tc.want)
		}
	}
	data, _ := json.Marshal(defaults())
	if _, err := tracesimd.Parse(append(data, []byte(` {}`)...)); err == nil || !strings.Contains(err.Error(), "trailing data") {
		t.Errorf("trailing data: %v", err)
	}
}
