// Package traceapi installs the compiler-evidence query language in a Goja VM.
package traceapi

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/pkg/tracearchive"
)

//go:embed query.js
var library string

// Install binds one session's query functions to the shared read-only archive.
// Install must run on the VM's owner goroutine before evaluating user input.
func Install(vm *goja.Runtime, archive *tracearchive.Archive) error {
	if vm == nil || archive == nil {
		return fmt.Errorf("query runtime and evidence archive are required")
	}
	// Materialize plain JS values. A caller may edit a result without changing
	// any Go slice, map, or record shared with another session.
	parse, ok := goja.AssertFunction(vm.Get("JSON").ToObject(vm).Get("parse"))
	if !ok {
		return fmt.Errorf("query runtime requires JSON.parse")
	}
	copyJSON := func(value any, err error) goja.Value {
		if err != nil {
			panic(vm.NewTypeError("%s", err.Error()))
		}
		data, err := json.Marshal(value)
		if err != nil {
			panic(vm.NewTypeError("encoding archive result: %s", err))
		}
		out, err := parse(goja.Undefined(), vm.ToValue(string(data)))
		if err != nil {
			panic(vm.NewTypeError("importing archive result: %s", err))
		}
		return out
	}
	bridge := vm.NewObject()
	methods := map[string]any{
		"events": func(variant, phase string) goja.Value {
			return copyJSON(archive.Events(variant, phase))
		},
		"text": func(variant, phase string, ordinal int) goja.Value {
			s, err := archive.Text(variant, phase, ordinal)
			if err != nil {
				panic(vm.NewTypeError("%s", err.Error()))
			}
			return vm.ToValue(s)
		},
		"profile": func(name string) goja.Value { return copyJSON(archive.Profile(name)) },
		"initialModule": func(variant string) goja.Value {
			source, digest, err := archive.InitialModule(variant)
			return copyJSON(map[string]string{"text": source, "digest": digest}, err)
		},
		"profileSHA": func(name string) goja.Value {
			s, err := archive.ProfileSHA(name)
			if err != nil {
				panic(vm.NewTypeError("%s", err.Error()))
			}
			return vm.ToValue(s)
		},
		"stats": func() goja.Value { return copyJSON(archive.Stats(), nil) },
	}
	for name, method := range methods {
		if err := bridge.Set(name, method); err != nil {
			return fmt.Errorf("installing archive.%s: %w", name, err)
		}
	}
	if err := vm.Set("__trace", bridge); err != nil {
		return err
	}
	_, err := vm.RunScript("trace/query.js", library)
	if err != nil {
		return fmt.Errorf("installing query language: %w", err)
	}
	return vm.GlobalObject().Delete("__trace")
}
