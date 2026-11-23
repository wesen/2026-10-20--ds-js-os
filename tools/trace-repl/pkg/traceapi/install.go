// Package traceapi installs the compiler-evidence query language in a Goja VM.
package traceapi

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracearchive"
)

//go:embed query/*.js
var queryFiles embed.FS

// library is the query language: the files in query/, in file-name order, inside one function that receives the
// global object and the bridge. They share that function's scope (each uses names the others declare), as
// compiler/typed/rv32/*.js share typed-rv32.js's.
var library = func() string {
	entries, err := queryFiles.ReadDir("query")
	if err != nil {
		panic(err)
	}
	var b strings.Builder
	b.WriteString("(function (root, bridge) {\n  'use strict';\n")
	for _, e := range entries {
		text, err := queryFiles.ReadFile("query/" + e.Name())
		if err != nil {
			panic(err)
		}
		b.Write(text)
	}
	b.WriteString("})(typeof globalThis !== 'undefined' ? globalThis : this, typeof __trace !== 'undefined' ? __trace : undefined);\n")
	return b.String()
}()

// Install binds one session's query functions to the shared read-only archive.
// It must finish before the VM evaluates user input and must not race with any
// other use of the VM; tracerepl runs it in the runtime initializer, before the
// session is published. Every later call into the VM goes through its owner.
func Install(vm *goja.Runtime, archive *tracearchive.Archive) error {
	if vm == nil || archive == nil {
		return fmt.Errorf("query runtime and evidence archive are required")
	}
	copyJSON, err := importer(vm)
	if err != nil {
		return err
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
		"stats":   func() goja.Value { return copyJSON(archive.Stats(), nil) },
		"renames": func(variant string) goja.Value { return copyJSON(archive.Renames(variant)) },
		"describe": func() goja.Value {
			label := archive.Label()
			return copyJSON(map[string]any{"ticket": label.Ticket, "title": label.Title, "name": label.String()}, nil)
		},
	}
	for name, method := range methods {
		if err := bridge.Set(name, method); err != nil {
			return fmt.Errorf("installing archive.%s: %w", name, err)
		}
	}
	if err := vm.Set("__trace", bridge); err != nil {
		return err
	}
	_, err = vm.RunScript("trace/query.js", library)
	if err != nil {
		return fmt.Errorf("installing query language: %w", err)
	}
	return vm.GlobalObject().Delete("__trace")
}

func importer(vm *goja.Runtime) (func(any, error) goja.Value, error) {
	// Materialize plain JS values. A caller may edit a result without changing
	// any Go slice, map, or record shared with another session.
	parse, ok := goja.AssertFunction(vm.Get("JSON").ToObject(vm).Get("parse"))
	if !ok {
		return nil, fmt.Errorf("query runtime requires JSON.parse")
	}
	return func(value any, err error) goja.Value {
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
	}, nil
}
