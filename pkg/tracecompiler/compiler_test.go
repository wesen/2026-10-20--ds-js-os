package tracecompiler

import (
	"strings"
	"testing"

	"github.com/dop251/goja"
)

// The wrapper separates files that end without a newline or in a comment and
// that begin with "(", and it records where each file starts.
func TestWrapSeparatesFilesAndRecordsLines(t *testing.T) {
	texts := make([]string, len(Modules))
	present := make([]bool, len(Modules))
	// typed-wasm ends in a comment without a newline; typed-world starts with "(".
	texts[1], present[1] = "(() => { globalThis.typedWasm = {n: 1}; })() // trailing", true
	texts[3], present[3] = "(() => {\n  globalThis.typedWorld = {late: () => typedRv32.n};\n})();\n", true
	texts[4], present[4] = "(() => { globalThis.typedRv32 = {n: typedWasm.n + 1}; })();", true
	src, lines := wrap(texts, present)
	if len(lines) != 3 || lines[0] != 4 || lines[1] != 6 || lines[2] != 11 {
		t.Fatalf("lines %v\n%s", lines, src)
	}
	if got := strings.Split(src, "\n")[lines[2]-1]; !strings.HasPrefix(got, "(() => { globalThis.typedRv32") {
		t.Fatalf("line %d is %q", lines[2], got)
	}
	vm := goja.New()
	v, err := vm.RunString(src)
	if err != nil {
		t.Fatal(err)
	}
	shadow := v.ToObject(vm)
	late, err := vm.RunString("(s => s.typedWorld.late())")
	if err != nil {
		t.Fatal(err)
	}
	fn, _ := goja.AssertFunction(late)
	n, err := fn(goja.Undefined(), shadow)
	if err != nil || n.ToInteger() != 2 {
		t.Fatalf("late bare reference: %v %v", n, err)
	}
	if vm.GlobalObject().Get("typedWasm") != nil || vm.GlobalObject().Get("typedRv32") != nil {
		t.Fatal("wrapper leaked a module onto the real global object")
	}
	b := &Bundle{Files: []File{{Path: "a", Line: 4}, {Path: "b", Line: 6}}}
	if path, line, ok := b.Where(7); !ok || path != "b" || line != 2 {
		t.Fatalf("where 7: %s %d", path, line)
	}
	if _, _, ok := b.Where(2); ok {
		t.Fatal("wrapper header mapped to a file")
	}
}
