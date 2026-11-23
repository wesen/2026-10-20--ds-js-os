package traceapi

import (
	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracesimd"
)

const (
	missingSIMD = "missingSIMDStudy: this trace service was started without --simd-study, so SIMD decisions, image byte ranges and per-PC execution histograms are unavailable in this session. " +
		"Do not reconstruct per-PC or per-range counts from profile totals; report the attribution as unavailable. " +
		"An operator can restart `trace-repl serve` with --simd-study <p4-simd-evidence-v1 JSON file>."
	emptySIMD = "emptySIMDStudy: the --simd-study file is well formed but records no images, decisions, traces or packets, so SIMD attribution is unavailable in this session. " +
		"Do not read the empty study as zero executions; report the attribution as unavailable."
)

// InstallSIMD adds the optional SIMD evidence provider. A nil or empty study
// keeps simd.help() answering and makes every data call fail loudly.
func InstallSIMD(vm *goja.Runtime, study *tracesimd.Study) error {
	copyJSON, err := importer(vm)
	if err != nil {
		return err
	}
	var absent any // JSON null when the study is usable
	switch {
	case study == nil:
		absent = missingSIMD
	case study.Empty():
		absent = emptySIMD
	}
	requireStudy := func() {
		if absent != nil {
			panic(vm.NewTypeError("%s", absent))
		}
	}
	help := map[string]any{
		"available": absent == nil,
		"absent":    absent,
		"methods": []string{"simd.decisions()", "simd.traces()", "simd.counts(traceID)", "simd.packets(workload)",
			"simd.executions(decisionID, traceID, role)"},
		"decisionFields":  jsonFields(tracesimd.Decision{}),
		"traceFields":     jsonFields(tracesimd.TraceInfo{}),
		"packetFields":    jsonFields(tracesimd.Packet{}),
		"executionFields": jsonFields(tracesimd.Execution{}),
		"unit":            tracesimd.Unit,
		"omission":        tracesimd.Omission,
		"joinRule": "executions() joins a decision and a trace only when both name the same imageSHA, and only for a role that decision defines; " +
			"ranges are half-open byte offsets [start,end) into that image, 4-byte aligned; ranges of one role never overlap, ranges of different roles may",
		"example": "simd.executions(simd.decisions()[0].id, simd.traces()[0].id, simd.decisions()[0].ranges[0].role)",
		"provenance": "decisions, ranges and histograms come from one verified --simd-study file; images are verified by SHA-256 and counts sum exactly to each trace's steps. " +
			"Executed guest instructions are not P4 time; use hardware.* for device timing.",
	}
	if absent == nil {
		help["studySHA"], help["images"] = study.SHA256(), study.Images()
	}
	methods := map[string]any{
		"help": func() goja.Value { return copyJSON(help, nil) },
		"decisions": func() goja.Value {
			requireStudy()
			return copyJSON(study.Decisions(), nil)
		},
		"traces": func() goja.Value {
			requireStudy()
			return copyJSON(study.Traces(), nil)
		},
		"counts": func(traceID string) goja.Value {
			requireStudy()
			return copyJSON(study.Counts(traceID))
		},
		"packets": func(workload string) goja.Value {
			requireStudy()
			return copyJSON(study.Packets(workload))
		},
		"executions": func(decisionID, traceID, role string) goja.Value {
			requireStudy()
			if decisionID == "" || traceID == "" || role == "" {
				panic(vm.NewTypeError("simd.executions(decisionID, traceID, role) needs three strings; got (%q, %q, %q)", decisionID, traceID, role))
			}
			return copyJSON(study.Executions(decisionID, traceID, role))
		},
	}
	api := vm.NewObject()
	for name, method := range methods {
		if err := api.Set(name, method); err != nil {
			return err
		}
	}
	return vm.Set("simd", api)
}
