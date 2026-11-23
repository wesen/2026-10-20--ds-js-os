package traceapi

import (
	"reflect"
	"strings"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracehardware"
)

// The study is optional. Without it, hardware.help() still answers and every
// data call fails loudly, so a session never answers a device-time question
// with emulator counts or an empty table.
const missingStudy = "missingDeviceStudy: this trace service was started without the physical ESP32-P4 study, so device timings are unavailable in this session. " +
	"Do not substitute guest instruction counts from profiles for device time; report the timing as unavailable. " +
	"An operator can restart `trace-repl serve` with --device-study <PICOCALC-PIE-LOOPS ticket root>."

// jsonFields lists a record's JSON field names, so help never drifts from the
// records a lambda receives.
func jsonFields(v any) []string {
	t := reflect.TypeOf(v)
	fields := make([]string, 0, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		if name, _, _ := strings.Cut(t.Field(i).Tag.Get("json"), ","); name != "" && name != "-" {
			fields = append(fields, name)
		}
	}
	return fields
}

// InstallHardware adds the optional physical-trial provider to a session.
// Keep physical measurements separate from guest instruction summaries.
func InstallHardware(vm *goja.Runtime, study *tracehardware.Study) error {
	api := vm.NewObject()
	copyJSON, err := importer(vm)
	if err != nil {
		return err
	}
	requireStudy := func() {
		if study == nil {
			panic(vm.NewTypeError("%s", missingStudy))
		}
	}
	var absent any // JSON null when the study is present
	if study == nil {
		absent = missingStudy
	}
	if err := api.Set("help", func() goja.Value {
		return copyJSON(map[string]any{
			"available":   study != nil,
			"methods":     []string{"hardware.metadata()", "hardware.pairs(baseline, candidate, phase)", "hardware.loads(treatment?)"},
			"comparisons": []string{"stock -> scalar", "scalar -> pie", "stock -> pie"},
			"phases":      []string{"clean", "audit", "primary", "shade"},
			"pairFields":  jsonFields(tracehardware.Pair{}),
			"loadFields":  jsonFields(tracehardware.Load{}),
			"example":     "hardware.pairs('scalar','pie','clean').filter(r => r.pose === 'default')",
			"unit":        "P4 microseconds; savedUs = baselineUs - candidateUs; savedPct is relative to baselineUs",
			"design":      "each pair compares two treatments on one fixture within one of six counterbalanced load blocks; outputs (outputCRC) agree across treatments",
			"provenance": "device timings of the PIE-LOOPS Typed programs (images in metadata().images) on 160x160 fixtures. " +
				"They are not identity-linked to profiles: typed-counts.json records no image identity and uses the opening-160-rows workload.",
			"absent": absent,
		}, nil)
	}); err != nil {
		return err
	}
	if err := api.Set("metadata", func() goja.Value {
		requireStudy()
		return copyJSON(study.Metadata(), nil)
	}); err != nil {
		return err
	}
	if err := api.Set("pairs", func(baseline, candidate, phase string) goja.Value {
		requireStudy()
		if baseline == "" || candidate == "" || phase == "" {
			panic(vm.NewTypeError("hardware.pairs(baseline, candidate, phase) needs three strings, for example hardware.pairs('stock', 'pie', 'clean'); got (%q, %q, %q)", baseline, candidate, phase))
		}
		switch phase {
		case "clean", "audit", "primary", "shade":
		default:
			panic(vm.NewTypeError("unknown hardware phase %q; choose clean, audit, primary or shade", phase))
		}
		if !(baseline == "stock" && (candidate == "scalar" || candidate == "pie") || baseline == "scalar" && candidate == "pie") {
			panic(vm.NewTypeError("unknown contrast %s -> %s; choose stock -> scalar, stock -> pie or scalar -> pie", baseline, candidate))
		}
		matches := []tracehardware.Pair{}
		for _, pair := range study.Rows() {
			if pair.Baseline == baseline && pair.Candidate == candidate && pair.Phase == phase {
				matches = append(matches, pair)
			}
		}
		return copyJSON(matches, nil)
	}); err != nil {
		return err
	}
	if err := api.Set("loads", func(call goja.FunctionCall) goja.Value {
		requireStudy()
		treatment := ""
		if arg := call.Argument(0); !goja.IsUndefined(arg) {
			treatment = arg.String()
			switch treatment {
			case "stock", "scalar", "pie":
			default:
				panic(vm.NewTypeError("unknown treatment %q; choose stock, scalar or pie, or omit it for all 18 cold compiles", treatment))
			}
		}
		matches := []tracehardware.Load{}
		for _, l := range study.Loads() {
			if treatment == "" || l.Treatment == treatment {
				matches = append(matches, l)
			}
		}
		return copyJSON(matches, nil)
	}); err != nil {
		return err
	}
	return vm.Set("hardware", api)
}
