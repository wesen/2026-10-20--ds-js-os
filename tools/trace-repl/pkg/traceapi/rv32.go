package traceapi

import (
	_ "embed"
	"errors"
	"fmt"
	"math"
	"reflect"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracerv32"
)

//go:embed rv32.js
var rv32Library string

// InstallRV32 defines `rv32`, the native RV32 interpreter. It reads no shared
// evidence: every run works on typed arrays the session's own wrapper created.
func InstallRV32(vm *goja.Runtime) error {
	if vm == nil {
		return fmt.Errorf("rv32 runtime is required")
	}
	v, err := vm.RunString("(function () {})")
	if err != nil {
		return err
	}
	// Calling any JavaScript function makes goja check its interrupt flag, so a
	// long native run stops at the cell or job deadline.
	noop, _ := goja.AssertFunction(v)
	poll := func() error { _, err := noop(goja.Undefined()); return err }
	bridge := vm.NewObject()
	methods := map[string]any{
		"run":      func(call goja.FunctionCall) goja.Value { return runRV32(vm, poll, call) },
		"profile":  func(call goja.FunctionCall) goja.Value { return profileRV32(vm, call) },
		"classify": func(call goja.FunctionCall) goja.Value { return classifyRV32(vm, call) },
	}
	for name, method := range methods {
		if err := bridge.Set(name, method); err != nil {
			return fmt.Errorf("installing rv32.%s: %w", name, err)
		}
	}
	if err := vm.Set("__rv32", bridge); err != nil {
		return err
	}
	if _, err := vm.RunScript("trace/rv32.js", rv32Library); err != nil {
		return fmt.Errorf("installing rv32: %w", err)
	}
	return vm.GlobalObject().Delete("__rv32")
}

func typeError(vm *goja.Runtime, format string, args ...any) {
	panic(vm.NewTypeError("[rv32] " + fmt.Sprintf(format, args...)))
}

func exportBytes(vm *goja.Runtime, v goja.Value, what string) []byte {
	b, ok := v.Export().([]byte)
	if !ok {
		typeError(vm, "%s must be a Uint8Array", what)
	}
	return b
}

func intList(vm *goja.Runtime, v goja.Value, what string) []int64 {
	o, ok := v.(*goja.Object)
	if !ok {
		typeError(vm, "%s must be an array", what)
	}
	n := o.Get("length").ToInteger()
	out := make([]int64, n)
	for i := range out {
		out[i] = o.Get(fmt.Sprint(i)).ToInteger()
	}
	return out
}

// jsImports resolves import calls through the wrapper's lookup and invoke.
type jsImports struct {
	vm             *goja.Runtime
	lookup, invoke goja.Callable
	regs           goja.Value // the run's Int32Array
	view           *[32]int32 // its memory
}

func (j *jsImports) Resolve(k int) (tracerv32.Call, string, error) {
	v, err := j.lookup(goja.Undefined(), j.vm.ToValue(k))
	if err != nil {
		return nil, "", err
	}
	pair, ok := v.(*goja.Object)
	if !ok {
		return nil, v.String(), nil
	}
	fn, handler := pair.Get("0"), pair.Get("1")
	return func(x *[32]int32) (int32, error) {
		*j.view = *x
		r, err := j.invoke(goja.Undefined(), fn, handler, j.regs)
		if err != nil {
			return 0, err
		}
		return int32(r.ToInteger()), nil
	}, "", nil
}

// runRV32(image, at, x, bytes, counts, offsets, limit, limitText, lookup, invoke)
// runs the reference's loop on the wrapper's arrays and reports how it ended.
func runRV32(vm *goja.Runtime, poll func() error, call goja.FunctionCall) goja.Value {
	image := exportBytes(vm, call.Argument(0), "program.image")
	at := call.Argument(1).ToInteger()
	regs, ok := call.Argument(2).Export().([]int32)
	if !ok || len(regs) != 32 {
		typeError(vm, "registers must be an Int32Array(32)")
	}
	memory := exportBytes(vm, call.Argument(3), "guest memory")
	var counts []uint32
	if c := call.Argument(4); !goja.IsNull(c) {
		if counts, ok = c.Export().([]uint32); !ok || len(counts) != len(image)/4 {
			typeError(vm, "counts must be a Uint32Array of one cell per image word")
		}
	}
	relocations := map[int64]int{}
	for k, offset := range intList(vm, call.Argument(5), "relocation offsets") {
		relocations[offset] = k
	}
	lookup, ok1 := goja.AssertFunction(call.Argument(8))
	invoke, ok2 := goja.AssertFunction(call.Argument(9))
	if !ok1 || !ok2 {
		typeError(vm, "import lookup and invoke must be functions")
	}
	view := (*[32]int32)(regs)
	m := tracerv32.Machine{
		Image: image, Memory: memory, Counts: counts, X: view, Relocations: relocations,
		Imports: &jsImports{vm: vm, lookup: lookup, invoke: invoke, regs: call.Argument(2), view: view},
		Limit:   tracerv32.LimitFromFloat(call.Argument(6).ToFloat()), LimitText: call.Argument(7).String(),
		Poll: poll,
	}
	out, err := m.Run(at)
	o := vm.NewObject()
	var fault *tracerv32.Fault
	var outside *tracerv32.RangeError
	switch {
	case errors.As(err, &outside):
		panic(rangeError(vm, outside))
	case errors.As(err, &fault):
		_ = o.Set("fault", fault.Message)
		_ = o.Set("at", fault.At)
		_ = o.Set("steps", fault.Steps)
	case err != nil:
		// A handler's exception is rethrown as it is; an interrupt stays uncatchable.
		panic(err)
	default:
		_ = o.Set("trap", out.Trap)
		_ = o.Set("at", out.At)
		_ = o.Set("steps", out.Steps)
	}
	return o
}

// profileRV32(image, names, offsets, counts) builds the reference's rows.
func profileRV32(vm *goja.Runtime, call goja.FunctionCall) goja.Value {
	image := exportBytes(vm, call.Argument(0), "program.image")
	names := call.Argument(1).Export()
	offsets := intList(vm, call.Argument(2), "entry offsets")
	counts, ok := call.Argument(3).Export().([]uint32)
	if !ok {
		typeError(vm, "counts must be a Uint32Array")
	}
	list, _ := names.([]any)
	starts := make([]tracerv32.Start, len(offsets))
	for i := range starts {
		starts[i] = tracerv32.Start{Name: fmt.Sprint(list[i]), Offset: offsets[i]}
	}
	rows, err := tracerv32.Profile(image, starts, counts)
	var outside *tracerv32.RangeError
	if errors.As(err, &outside) {
		panic(rangeError(vm, outside))
	} else if err != nil {
		panic(vm.NewGoError(err))
	}
	out := make([]any, len(rows))
	for i, r := range rows {
		o := vm.NewObject()
		_ = o.Set("name", r.Name)
		_ = o.Set("start", r.Start)
		_ = o.Set("bytes", r.Bytes)
		_ = o.Set("steps", r.Steps)
		for _, k := range tracerv32.Kinds {
			_ = o.Set(k, r.Kinds[k])
		}
		if r.Entries != nil {
			_ = o.Set("entries", *r.Entries)
		} else {
			_ = o.Set("entries", goja.Undefined())
		}
		out[i] = o
	}
	return vm.NewArray(out...)
}

// rangeError is the JavaScript RangeError the reference's DataView throws.
func rangeError(vm *goja.Runtime, e *tracerv32.RangeError) *goja.Object {
	ctor, _ := goja.AssertConstructor(vm.Get("RangeError"))
	obj, err := ctor(nil, vm.ToValue(e.Error()))
	if err != nil {
		panic(err)
	}
	return obj
}

// toUint32 is ECMAScript ToUint32 after ToNumber.
func toUint32(v goja.Value) uint32 {
	f := v.ToFloat()
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	m := math.Mod(math.Trunc(f), 4294967296)
	if m < 0 {
		m += 4294967296
	}
	return uint32(m)
}

func word(v goja.Value) tracerv32.Word {
	isNumber := false
	if t := v.ExportType(); t != nil {
		isNumber = t.Kind() == reflect.Int64 || t.Kind() == reflect.Float64
	}
	return tracerv32.Word{Bits: toUint32(v), IsEbreak: isNumber && v.ToFloat() == tracerv32.Ebreak}
}

func classifyRV32(vm *goja.Runtime, call goja.FunctionCall) goja.Value {
	kinds := tracerv32.Classify(toUint32(call.Argument(0)), word(call.Argument(1)), word(call.Argument(2)))
	out := make([]any, len(kinds))
	for i, k := range kinds {
		out[i] = k
	}
	return vm.NewArray(out...)
}
