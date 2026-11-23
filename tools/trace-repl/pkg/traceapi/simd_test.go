package traceapi_test

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/traceapi"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracesimd"
)

func rv32(word byte, n int) ([]byte, string) {
	b := make([]byte, 4*n)
	for i := 0; i < n; i++ {
		b[4*i] = word // low byte; 0x13 and 0x93 both end in binary 11
	}
	s := sha256.Sum256(b)
	return b, hex.EncodeToString(s[:])
}

func simdStudy(t *testing.T) *tracesimd.Study {
	t.Helper()
	a, sa := rv32(0x13, 4)
	b, sb := rv32(0x93, 4)
	data, err := json.Marshal(map[string]any{
		"format": tracesimd.Format,
		"images": []any{
			map[string]any{"sha256": sa, "code": base64.StdEncoding.EncodeToString(a)},
			map[string]any{"sha256": sb, "code": base64.StdEncoding.EncodeToString(b)},
		},
		"decisions": []any{map[string]any{
			"id": "pie-row", "function": "typedRayComputeRow", "imageSHA": sa, "plan": "packed s16 subtraction",
			"source":       map[string]any{"path": "worlds/raytrace/raytrace.typed", "sha256": strings.Repeat("b0", 32), "lineStart": 112, "lineEnd": 122},
			"alternatives": []any{map[string]any{"plan": "scalar producer", "status": "rejected", "reason": "matched control"}},
			"ranges": []any{
				map[string]any{"start": 0, "end": 8, "role": "packet-producer"},
				map[string]any{"start": 4, "end": 12, "role": "scratch-store"},
			},
		}},
		"traces": []any{
			map[string]any{"id": "pie-opening", "imageSHA": sa, "workload": "opening-160-rows", "steps": 10, "counts": []any{
				map[string]any{"pc": 8, "executions": 2}, map[string]any{"pc": 0, "executions": 5}, map[string]any{"pc": 4, "executions": 3},
			}},
			map[string]any{"id": "scalar-opening", "imageSHA": sb, "workload": "opening-160-rows", "steps": 1, "counts": []any{
				map[string]any{"pc": 0, "executions": 1},
			}},
		},
		"packetSets": []any{map[string]any{"workload": "opening-160-rows", "sourceSHA": strings.Repeat("b0", 32), "packets": []any{
			map[string]any{"pose": "default", "row": 20, "group": 4, "lanes": 8, "hitMask": 255},
		}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	s, err := tracesimd.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func simdVM(t *testing.T, study *tracesimd.Study) *goja.Runtime {
	t.Helper()
	vm := goja.New()
	if err := traceapi.InstallSIMD(vm, study); err != nil {
		t.Fatal(err)
	}
	return vm
}

func simdChecks(t *testing.T, vm *goja.Runtime, checks map[string]string) {
	t.Helper()
	for expr, want := range checks {
		v, err := vm.RunString(expr)
		if err != nil {
			t.Errorf("%s: %v", expr, err)
		} else if got := v.String(); got != want {
			t.Errorf("%s = %s, want %s", expr, got, want)
		}
	}
}

func TestSIMDAbsentOrEmptyIsExplicitlyUnavailable(t *testing.T) {
	empty, err := tracesimd.Parse([]byte(`{"format":"p4-simd-evidence-v1","images":[],"decisions":[],"traces":[],"packetSets":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	for code, study := range map[string]*tracesimd.Study{"missingSIMDStudy": nil, "emptySIMDStudy": empty} {
		vm := simdVM(t, study)
		simdChecks(t, vm, map[string]string{
			"simd.help().available":                         "false",
			"simd.help().absent.startsWith('" + code + "')": "true",
			"'studySHA' in simd.help()":                     "false",
		})
		for _, expr := range []string{"simd.decisions()", "simd.traces()", "simd.counts('pie-opening')", "simd.packets('opening-160-rows')",
			"simd.executions('pie-row','pie-opening','packet-producer')"} {
			if msg := jsError(t, vm, expr); !strings.Contains(msg, code) || !strings.Contains(msg, "unavailable") {
				t.Errorf("%s: %s", expr, msg)
			}
		}
	}
}

func TestSIMDJoinsDecisionsToSameImageTraces(t *testing.T) {
	study := simdStudy(t)
	_, sa := rv32(0x13, 4)
	vm := simdVM(t, study)
	simdChecks(t, vm, map[string]string{
		"simd.help().available":                                   "true",
		"simd.help().absent":                                      "null",
		"simd.help().studySHA":                                    study.SHA256(),
		"simd.help().images.length":                               "2",
		"simd.decisions()[0].imageSHA":                            sa,
		"simd.decisions()[0].source.lineStart":                    "112",
		"simd.decisions()[0].source.lineEnd":                      "122",
		"simd.decisions()[0].alternatives[0].status":              "rejected",
		"simd.traces().length":                                    "2",
		"'counts' in simd.traces()[0]":                            "false",
		"simd.traces()[0].complete":                               "true",
		"simd.counts('pie-opening').counts.map(c => c.pc).join()": "0,4,8",
		"simd.packets('opening-160-rows').packets[0].hitMask":     "255",
		// Identity-bearing join result.
		"(e => [e.decision, e.trace, e.imageSHA, e.role, e.executions, e.staticInstructions, e.traceSteps].join())(simd.executions('pie-row','pie-opening','packet-producer'))": "pie-row,pie-opening," + sa + ",packet-producer,8,2,10",
		"simd.executions('pie-row','pie-opening','packet-producer').unit === simd.help().unit":                                                                                  "true",
		"simd.executions('pie-row','pie-opening','scratch-store').witnesses.map(w => w.pc + ':' + w.executions).join()":                                                         "4:3,8:2",
		"simd.executions('pie-row','pie-opening','scratch-store').source.path":                                                                                                  "worlds/raytrace/raytrace.typed",
	})
	for expr, want := range map[string]string{
		"simd.executions('pie-row','scalar-opening','packet-producer')": "crossImageJoin",
		"simd.executions('pie-row','pie-opening','shade')":              "unknownRole",
		"simd.executions('row','pie-opening','packet-producer')":        "unknownDecision",
		"simd.executions('pie-row','frame','packet-producer')":          "unknownTrace",
		"simd.executions('pie-row','pie-opening')":                      "needs three strings",
		"simd.counts('frame')":                                          "unknownTrace",
		"simd.packets('frames')":                                        "unknownWorkload",
	} {
		if msg := jsError(t, vm, expr); !strings.Contains(msg, want) {
			t.Errorf("%s: %s; want %q", expr, msg, want)
		}
	}
}

// Every call materializes a fresh JS value; edits in one cell or one session
// cannot reach the shared study.
func TestSIMDResultsAreIndependentCopies(t *testing.T) {
	study := simdStudy(t)
	vm, other := simdVM(t, study), simdVM(t, study)
	if _, err := vm.RunString(`
		const d = simd.decisions(); d[0].ranges[0].end = 4; d[0].alternatives.length = 0; d[0].imageSHA = 'x'
		const c = simd.counts('pie-opening'); c.counts[0].executions = 0; c.steps = 0
		const e = simd.executions('pie-row','pie-opening','packet-producer'); e.executions = -1; e.witnesses.pop()
		const p = simd.packets('opening-160-rows'); p.packets[0].hitMask = 0
		const h = simd.help(); h.available = false; h.images.length = 0
		simd.traces()[0].steps = 1
	`); err != nil {
		t.Fatal(err)
	}
	for _, r := range []*goja.Runtime{vm, other} {
		simdChecks(t, r, map[string]string{
			"simd.decisions()[0].ranges[0].end":                                           "8",
			"simd.decisions()[0].alternatives.length":                                     "1",
			"simd.counts('pie-opening').counts[0].executions":                             "5",
			"simd.counts('pie-opening').steps":                                            "10",
			"simd.executions('pie-row','pie-opening','packet-producer').executions":       "8",
			"simd.executions('pie-row','pie-opening','packet-producer').witnesses.length": "2",
			"simd.packets('opening-160-rows').packets[0].hitMask":                         "255",
			"simd.help().available && simd.help().images.length === 2":                    "true",
			"simd.traces()[0].steps":                                                      "10",
		})
	}
}
