package traceapi_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/traceapi"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracearchive"
)

func loadArchive(t *testing.T) *tracearchive.Archive {
	t.Helper()
	roots, err := filepath.Glob("../../../../ttmp/2026/11/21/PICOCALC-ROW-IR--*")
	if err != nil || len(roots) != 1 {
		t.Fatalf("expected one archived fixture: %v (%v)", roots, err)
	}
	archive, err := tracearchive.Open(roots[0])
	if err != nil {
		t.Fatal(err)
	}
	return archive
}

func session(t *testing.T, a *tracearchive.Archive) *goja.Runtime {
	t.Helper()
	vm := goja.New()
	if err := traceapi.Install(vm, a); err != nil {
		t.Fatal(err)
	}
	return vm
}

func value(t *testing.T, vm *goja.Runtime, expr string) goja.Value {
	t.Helper()
	result, err := vm.RunString(expr)
	if err != nil {
		t.Fatalf("evaluating %s: %v", expr, err)
	}
	return result
}

// These numbers come from an independent direct scan of the archived bytes
// and the original JSON summaries, not from snapshots of the new evaluator.
func TestCompilerEvidence(t *testing.T) {
	a := loadArchive(t)
	vm := session(t, a)
	value(t, vm, `
	const variant = a.variant("checked");
	const kernel = variant.function("row");
	const timeline = kernel.timeline("middle");
	const capLoads = q.ir.instructions().opcode("load").resultType("i32").pointer(kernel.argument(0)).count();
	const stat = (m,i) => q.run(m.at(timeline.at(i).after));
	const work = arm => profiles.arm(arm).region("row").workload("opening-160-rows");
	`)
	for _, c := range []struct {
		expr string
		want string
	}{
		{"stat(capLoads, 73).value", "11"},
		{"stat(capLoads, 74).value", "6"},
		{"stat(q.ir.instructions().opcode('alloca').count(), 5).value", "16"},
		{"stat(q.ir.instructions().opcode('alloca').count(), 6).value", "0"},
		{"stat(q.ir.instructions().opcode('phi').count(), 6).value", "3"},
		{"q.run(q.machine.property('NoVRegs').at(kernel.timeline('backend').at(74).after)).value", "false"},
		{"q.run(q.machine.property('NoVRegs').at(kernel.timeline('backend').at(78).after)).value", "true"},
		{"q.run(work('checked-llc-nolsr').total('instructions')).value", "1275560"},
		{"q.run(work('checked-llc').total('instructions')).value", "1233611"},
		{"q.run(q.add(work('typed-stock').total('stackLoads'),work('typed-stock').total('stackStores'))).value", "1290106"},
		{"q.run(work('typed-pie').total('packets')).value", "3135"},
		{"typeof __trace", "undefined"},
	} {
		t.Run(c.expr, func(t *testing.T) {
			got := value(t, vm, c.expr)
			if got.String() != c.want {
				t.Errorf("got %s, want %s", got, c.want)
			}
		})
	}
	// A repeated request from another runtime must produce the same answer.
	// User-written bindings and mutating a plain result must remain private.
	value(t, vm, "const privateResult = stat(capLoads, 74); privateResult.value = -99")
	other := session(t, a)
	if v := value(t, other, "typeof privateResult"); v.String() != "undefined" {
		t.Fatalf("private binding exists in second VM: %v", v)
	}
	if v := value(t, vm, "stat(capLoads,74).value"); v.String() != "6" {
		t.Fatalf("editing a returned observation changed later evidence: %v", v)
	}
}

// A pass-selection mistake needs to be visible to the user; a bad spelling
// of a variant must not silently run a default or count zero records.
func TestUnknownVariant(t *testing.T) {
	vm := session(t, loadArchive(t))
	v, err := vm.RunString("q.run(a.variant('chekced').events('middle').count())")
	text := ""
	if err != nil {
		text = err.Error()
	} else {
		vm.Set("answer", v)
		text = value(t, vm, "JSON.stringify(answer)").String()
	}
	if !strings.Contains(strings.ToLower(text), "variant") && !strings.Contains(text, "chekced") {
		t.Errorf("missing actionable variant diagnostic: %s", text)
	}
}
