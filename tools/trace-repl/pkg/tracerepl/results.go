package tracerepl

import (
	_ "embed"
	"encoding/json"
	"time"

	"github.com/dop251/goja"
	"github.com/go-go-golems/go-go-goja/pkg/engine"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/traceresults"
	"github.com/pkg/errors"
)

//go:embed results.js
var resultsLibrary string

// WithResults gives every session the global `results`, backed by store.
// provenance is called at each save and becomes the record's "repo" field
// (the service passes the repository root and its HEAD at that moment).
func WithResults(store *traceresults.Store, provenance func() map[string]any) Option {
	return func(s *Service) { s.results, s.provenance = store, provenance }
}

// Results is the service's result store, or nil.
func (s *Service) Results() *traceresults.Store { return s.results }

// Record is one saved result: the value and what produced it.
type Record struct {
	Name      string          `json:"name"`
	Saved     time.Time       `json:"saved"`
	Session   string          `json:"session"`
	Unit      string          `json:"unit"` // "cell" or "job"
	Job       string          `json:"job,omitempty"`
	Script    Script          `json:"script"`
	Args      json.RawMessage `json:"args,omitempty"`
	Repo      map[string]any  `json:"repo,omitempty"`
	Compilers json.RawMessage `json:"compilers,omitempty"` // compiler.loaded() at save time
	Value     json.RawMessage `json:"value"`
}

// Script identifies the source of the cell or job that saved a record.
type Script struct {
	SHA256 string `json:"sha256"`
	Bytes  int    `json:"bytes"`
}

// resultsInit installs `results` after the session's own installer, so it can
// read the cell state that Installer.InitRuntime created.
type resultsInit struct{ s *Service }

func (resultsInit) ID() string { return "result-store" }

func (r resultsInit) InitRuntime(ctx *engine.RuntimeInitializationContext) error {
	vm := ctx.VM
	state, ok := ctx.Values["cellIO"].(*cellIO)
	if !ok {
		return errors.New("result store: the session has no cell state")
	}
	store := r.s.results
	fail := func(err error) { panic(vm.NewGoError(errors.Wrap(err, "[results]"))) }
	need := func() {
		if store == nil {
			fail(errors.New("this service has no result store; start it with serve --results DIR"))
		}
	}
	methods := map[string]any{
		"save": func(name string, value goja.Value, compilers string) goja.Value {
			need()
			if err := traceresults.ValidName(name); err != nil {
				fail(err)
			}
			encoded, err := state.stringify(goja.Undefined(), value)
			if err != nil {
				panic(err) // the serializer's own exception, such as a BigInt TypeError
			}
			if goja.IsUndefined(encoded) {
				fail(errors.New("the value has no JSON representation"))
			}
			u := state.unit
			record := Record{Name: name, Saved: time.Now().UTC(), Session: u.Session, Unit: u.Kind, Job: u.Job,
				Script: Script{SHA256: u.SourceSHA256, Bytes: u.SourceBytes}, Args: u.Args, Value: json.RawMessage(encoded.String())}
			if json.Valid([]byte(compilers)) {
				record.Compilers = json.RawMessage(compilers)
			}
			if r.s.provenance != nil {
				record.Repo = r.s.provenance()
			}
			data, err := json.Marshal(record)
			if err != nil {
				fail(err)
			}
			info, err := store.Save(name, data)
			if err != nil {
				fail(err)
			}
			return jsonValue(vm, state, info)
		},
		"load": func(name string) string {
			need()
			data, _, err := store.Load(name)
			if err != nil {
				fail(err)
			}
			return string(data)
		},
		"list": func() goja.Value {
			need()
			infos, err := store.List()
			if err != nil {
				fail(err)
			}
			return jsonValue(vm, state, infos)
		},
		"dir": func() goja.Value {
			if store == nil {
				return goja.Null()
			}
			return vm.ToValue(store.Dir())
		},
	}
	bridge := vm.NewObject()
	for name, method := range methods {
		if err := bridge.Set(name, method); err != nil {
			return err
		}
	}
	if err := vm.Set("__results", bridge); err != nil {
		return err
	}
	if _, err := vm.RunScript("trace/results.js", resultsLibrary); err != nil {
		return errors.Wrap(err, "installing results")
	}
	return vm.GlobalObject().Delete("__results")
}

// jsonValue copies a Go value into a fresh JS value through JSON.
func jsonValue(vm *goja.Runtime, state *cellIO, v any) goja.Value {
	data, err := json.Marshal(v)
	if err != nil {
		panic(vm.NewGoError(err))
	}
	out, err := state.parse(goja.Undefined(), vm.ToValue(string(data)))
	if err != nil {
		panic(err)
	}
	return out
}
