package traceapi

import (
	_ "embed"
	"fmt"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracerepo"
)

//go:embed repo.js
var repoLibrary string

// FileValue builds a fresh JS object for one read. Strings are immutable, so
// sharing the Go text with the VM cannot leak a change into another session.
func FileValue(vm *goja.Runtime, f *tracerepo.File) *goja.Object {
	o := vm.NewObject()
	_ = o.Set("path", f.Path)
	_ = o.Set("revision", f.Revision)
	_ = o.Set("sha256", f.SHA256)
	_ = o.Set("bytes", f.Bytes)
	_ = o.Set("gzip", f.Gzip)
	_ = o.Set("text", f.Text)
	return o
}

// throw raises a JS Error carrying err's message.
func throw(vm *goja.Runtime, err error) {
	panic(vm.NewGoError(fmt.Errorf("[repo] %w", err)))
}

// InstallRepo defines `repo` (read-only files of the repository, in the
// working tree or at a revision) and `mounts` (files named with --mount at
// startup). Every returned file carries the SHA-256 of its stored bytes.
func InstallRepo(vm *goja.Runtime, repo *tracerepo.Repo) error {
	if vm == nil || repo == nil {
		return fmt.Errorf("repository runtime and repository are required")
	}
	copyJSON, err := importer(vm)
	if err != nil {
		return err
	}
	bridge := vm.NewObject()
	methods := map[string]any{
		"info": func() goja.Value {
			return copyJSON(map[string]string{"root": repo.Root(), "head": repo.Head()}, nil)
		},
		"read": func(path string) goja.Value {
			f, err := repo.Read(path)
			if err != nil {
				throw(vm, err)
			}
			return FileValue(vm, f)
		},
		"show": func(rev, path string) goja.Value {
			f, err := repo.Show(rev, path)
			if err != nil {
				throw(vm, err)
			}
			return FileValue(vm, f)
		},
		"list": func(path, rev string) goja.Value {
			entries, err := repo.List(path, rev)
			if err != nil {
				throw(vm, err)
			}
			return copyJSON(entries, nil)
		},
		"resolve": func(rev string) goja.Value {
			commit, err := repo.Resolve(rev)
			if err != nil {
				throw(vm, err)
			}
			return vm.ToValue(commit)
		},
		"mounts": func() goja.Value {
			out := make([]tracerepo.MountInfo, 0)
			for _, m := range repo.Mounts() {
				out = append(out, m.Info())
			}
			return copyJSON(out, nil)
		},
		"mount": func(name string) goja.Value {
			m, err := repo.Mount(name)
			if err != nil {
				throw(vm, err)
			}
			o := FileValue(vm, &m.File)
			_ = o.Set("name", m.Name)
			return o
		},
	}
	for name, method := range methods {
		if err := bridge.Set(name, method); err != nil {
			return fmt.Errorf("installing repo.%s: %w", name, err)
		}
	}
	if err := vm.Set("__repo", bridge); err != nil {
		return err
	}
	if _, err := vm.RunScript("trace/repo.js", repoLibrary); err != nil {
		return fmt.Errorf("installing repository access: %w", err)
	}
	return vm.GlobalObject().Delete("__repo")
}
