package traceapi

import (
	_ "embed"
	"fmt"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/pkg/tracecompiler"
	"github.com/go-go-golems/picocalc-trace/pkg/tracerepo"
)

//go:embed compiler.js
var compilerLibrary string

// InstallCompiler defines `compiler`. compiler.at(rev) runs the shared,
// compiled wrapper of that revision in this VM, so every session gets its own
// module objects while the source and the compiled program are shared.
func InstallCompiler(vm *goja.Runtime, provider *tracecompiler.Provider) error {
	if vm == nil || provider == nil {
		return fmt.Errorf("compiler runtime and provider are required")
	}
	copyJSON, err := importer(vm)
	if err != nil {
		return err
	}
	repo := provider.Repo()
	fail := func(err error) { panic(vm.NewGoError(fmt.Errorf("[compiler] %w", err))) }
	bridge := vm.NewObject()
	methods := map[string]any{
		"resolve": func(rev string) goja.Value {
			commit, err := repo.Resolve(rev)
			if err != nil {
				fail(err)
			}
			return vm.ToValue(commit)
		},
		// load returns {revision, files, missing, key, globals}: globals is the
		// shadow object the revision's files published their names on.
		"load": func(rev string) goja.Value {
			b, err := provider.At(rev)
			if err != nil {
				fail(err)
			}
			globals, err := vm.RunProgram(b.Program)
			if err != nil {
				fail(fmt.Errorf("evaluate compiler files at %s: %w", rev, err))
			}
			o := vm.NewObject()
			_ = o.Set("revision", b.Revision)
			_ = o.Set("files", copyJSON(b.Files, nil))
			_ = o.Set("missing", copyJSON(b.Missing, nil))
			_ = o.Set("key", b.Key)
			_ = o.Set("worlds", b.Worlds)
			_ = o.Set("globals", globals)
			return o
		},
		"read": func(rev, path string) goja.Value {
			var f *tracerepo.File
			var err error
			if rev == tracerepo.Worktree {
				f, err = repo.Read(path)
			} else {
				f, err = repo.Show(rev, path)
			}
			if err != nil {
				fail(err)
			}
			return FileValue(vm, f)
		},
		"typedSources": func(rev string) goja.Value {
			paths, err := provider.TypedSources(rev)
			if err != nil {
				fail(err)
			}
			return copyJSON(paths, nil)
		},
		"modules": func() goja.Value { return copyJSON(tracecompiler.Modules, nil) },
	}
	for name, method := range methods {
		if err := bridge.Set(name, method); err != nil {
			return fmt.Errorf("installing compiler.%s: %w", name, err)
		}
	}
	if err := vm.Set("__compiler", bridge); err != nil {
		return err
	}
	if _, err := vm.RunScript("trace/compiler.js", compilerLibrary); err != nil {
		return fmt.Errorf("installing compiler provider: %w", err)
	}
	return vm.GlobalObject().Delete("__compiler")
}
