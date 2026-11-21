package traceapi_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/pkg/traceapi"
	"github.com/go-go-golems/picocalc-trace/pkg/tracehardware"
)

func hardwareVM(t *testing.T, study *tracehardware.Study) *goja.Runtime {
	t.Helper()
	vm := goja.New()
	if err := traceapi.InstallHardware(vm, study); err != nil {
		t.Fatal(err)
	}
	return vm
}

func loadStudy(t *testing.T) *tracehardware.Study {
	t.Helper()
	roots, err := filepath.Glob("../../ttmp/2026/11/21/PICOCALC-PIE-LOOPS--*")
	if err != nil || len(roots) != 1 {
		t.Fatalf("expected one device study: %v (%v)", roots, err)
	}
	study, err := tracehardware.Open(roots[0])
	if err != nil {
		t.Fatal(err)
	}
	return study
}

func jsError(t *testing.T, vm *goja.Runtime, expr string) string {
	t.Helper()
	v, err := vm.RunString(expr)
	if err == nil {
		t.Fatalf("%s returned %v; expected an error", expr, v)
	}
	return err.Error()
}

// The default service has no device study. Help still answers, and every data
// call fails with an instruction that forbids answering with emulator counts.
func TestHardwareAbsentByDefault(t *testing.T) {
	vm := hardwareVM(t, nil)
	if v := value(t, vm, "hardware.help().available"); v.ToBoolean() {
		t.Fatal("absent study reported available")
	}
	if v := value(t, vm, "hardware.help().absent"); !strings.Contains(v.String(), "missingDeviceStudy") {
		t.Fatal(v)
	}
	for _, expr := range []string{"hardware.metadata()", "hardware.pairs('stock','pie','clean')", "hardware.loads()"} {
		if msg := jsError(t, vm, expr); !strings.Contains(msg, "missingDeviceStudy") || !strings.Contains(msg, "Do not substitute guest instruction counts") {
			t.Fatalf("%s: %s", expr, msg)
		}
	}
}

func TestHardwareExposesPairedTimesAndCompileCost(t *testing.T) {
	vm := hardwareVM(t, loadStudy(t))
	for expr, want := range map[string]string{
		"hardware.help().available":                          "true",
		"hardware.help().absent":                             "null",
		"hardware.pairs('stock','pie','clean').length":       "72",
		"hardware.pairs('scalar','pie','shade').length":      "72",
		"hardware.loads().length":                            "18",
		"hardware.loads('scalar').length":                    "6",
		"hardware.metadata().images.pie.elfCRC":              "ab91b817",
		"hardware.metadata().timerArm":                       "2",
		"hardware.help().pairFields.includes('baselineRow')": "true",
		"hardware.help().loadFields.includes('compilerUs')":  "true",
		// Published median for the default pose, clean phase, stock -> pie.
		"(d => (d[2] + d[3]) / 2)(hardware.pairs('stock','pie','clean').filter(r => r.pose === 'default').map(r => r.savedUs).sort((a, b) => a - b))": "1616",
		// A returned table is a private copy.
		"(() => { const p = hardware.pairs('stock','pie','clean'); p[0].savedUs = -1; return hardware.pairs('stock','pie','clean')[0].savedUs !== -1 })()": "true",
	} {
		if got := value(t, vm, expr).String(); got != want {
			t.Errorf("%s = %s, want %s", expr, got, want)
		}
	}
	for expr, want := range map[string]string{
		"hardware.pairs()":                      "needs three strings",
		"hardware.pairs('pie','stock','clean')": "unknown contrast",
		"hardware.pairs('stock','pie','warm')":  "unknown hardware phase",
		"hardware.loads('fast')":                "unknown treatment",
	} {
		if msg := jsError(t, vm, expr); !strings.Contains(msg, want) {
			t.Errorf("%s: %s; want %q", expr, msg, want)
		}
	}
}
