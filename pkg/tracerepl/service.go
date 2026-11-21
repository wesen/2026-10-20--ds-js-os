// Package tracerepl hosts a persistent Goja VM for each local research session.
package tracerepl

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja/parser"
	"github.com/go-go-golems/go-go-goja/pkg/engine"
	"github.com/go-go-golems/go-go-goja/pkg/replsession"
	"github.com/pkg/errors"
	"github.com/rs/zerolog"
)

const (
	MaxSourceBytes     = 64 << 10
	MaxResultBytes     = 512 << 10
	defaultEvalTimeout = 15 * time.Second
)

type ConsoleLine struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
}

type Result struct {
	OK      bool            `json:"ok"`
	Value   json.RawMessage `json:"value,omitempty"`
	Kind    string          `json:"kind,omitempty"`
	Console []ConsoleLine   `json:"console,omitempty"`
	Error   string          `json:"error,omitempty"`
}

// Installer receives a new, restricted VM once per session. All JS objects
// it creates belong to that VM. Immutable Go evidence can be shared.
type Installer func(*goja.Runtime) error

var _ engine.RuntimeInitializer = Installer(nil)

func (Installer) ID() string { return "compiler-evidence" }

func (install Installer) InitRuntime(ctx *engine.RuntimeInitializationContext) error {
	vm := ctx.VM
	vm.SetParserOptions(parser.WithDisableSourceMaps)
	if err := vm.GlobalObject().Delete("require"); err != nil {
		return err
	}
	if err := install(vm); err != nil {
		return err
	}
	console := vm.NewObject()
	state := &cellIO{}
	for _, kind := range []string{"log", "info", "warn", "error", "debug"} {
		err := console.Set(kind, func(call goja.FunctionCall) goja.Value {
			if len(state.lines) >= 64 {
				if len(state.lines) == 64 {
					state.lines = append(state.lines, ConsoleLine{"warn", "further console output omitted"})
				}
				return goja.Undefined()
			}
			var line strings.Builder
			for i, arg := range call.Arguments {
				if i > 0 {
					line.WriteByte(' ')
				}
				line.WriteString(arg.String())
				if line.Len() >= 2048 {
					break
				}
			}
			message := line.String()
			if len(message) > 2048 {
				message = message[:2048] + "…"
			}
			state.lines = append(state.lines, ConsoleLine{kind, message})
			return goja.Undefined()
		})
		if err != nil {
			return err
		}
	}
	if err := vm.Set("console", console); err != nil {
		return err
	}
	stringify, ok := goja.AssertFunction(vm.Get("JSON").ToObject(vm).Get("stringify"))
	if !ok {
		return errors.New("initialize result serializer")
	}
	state.stringify = stringify
	ctx.SetValue("cellIO", state)
	return nil
}

type cellIO struct {
	lines     []ConsoleLine
	stringify goja.Callable
}

type Service struct {
	sessions *replsession.Service
	timeout  time.Duration
}

func New(ctx context.Context, install Installer, logger zerolog.Logger) (*Service, error) {
	factory, err := engine.NewRuntimeFactoryBuilder(
		engine.WithImplicitDefaultRegistryModules(false),
		engine.WithDataOnlyDefaultRegistryModules(false),
	).WithRuntimeInitializers(install).Build()
	if err != nil {
		return nil, errors.Wrap(err, "build trace runtime")
	}
	return &Service{sessions: replsession.NewService(factory, logger,
		replsession.WithLifetimeContext(ctx),
		replsession.WithDefaultSessionOptions(replsession.RawSessionOptions()),
	), timeout: defaultEvalTimeout}, nil
}

func (s *Service) Open(ctx context.Context) (string, error) {
	session, err := s.sessions.CreateSession(ctx)
	if err != nil {
		return "", err
	}
	return session.ID, nil
}

func (s *Service) Release(ctx context.Context, id string) error {
	return s.sessions.UnloadSession(ctx, id)
}

func (s *Service) Close(ctx context.Context) error {
	return s.sessions.Close(ctx)
}

func (s *Service) Evaluate(ctx context.Context, id, source string) (Result, error) {
	if len(source) > MaxSourceBytes {
		return Result{}, errors.Errorf("source exceeds %d bytes", MaxSourceBytes)
	}
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var result Result
	err := s.sessions.WithRuntime(ctx, id, func(opCtx context.Context, rt *engine.Runtime) error {
		// Wait for the owner callback to finish even after cancellation. This keeps
		// the session gate held until its interrupt has been consumed and cleared.
		_, err := rt.Owner.Call(context.WithoutCancel(opCtx), "trace.eval", func(_ context.Context, vm *goja.Runtime) (any, error) {
			if err := opCtx.Err(); err != nil {
				return nil, err
			}
			interrupted := make(chan struct{})
			stop := context.AfterFunc(opCtx, func() {
				vm.Interrupt(opCtx.Err())
				close(interrupted)
			})
			defer func() {
				if !stop() {
					<-interrupted
				}
				vm.ClearInterrupt()
			}()
			state := rt.Values["cellIO"].(*cellIO)
			state.lines = nil
			result = evalCell(vm, state, source)
			result.Console = state.lines
			state.lines = nil
			return nil, nil
		})
		return err
	})
	return result, err
}

var promiseType = reflect.TypeOf((*goja.Promise)(nil))

func evalCell(vm *goja.Runtime, state *cellIO, source string) Result {
	// Notebook cells preserve ordinary script declarations. A standalone await
	// expression uses an async function so script parsing accepts that form too.
	program := source
	trimmed := strings.TrimSpace(source)
	if strings.HasPrefix(trimmed, "await ") || strings.HasPrefix(trimmed, "await(") {
		program = "(async () => (" + strings.TrimSuffix(trimmed, ";") + "\n))()"
	}
	v, err := vm.RunScript("<trace-cell>", program)
	if err != nil {
		return Result{Error: err.Error()}
	}
	if v != nil && v.ExportType() == promiseType {
		p := v.Export().(*goja.Promise)
		switch p.State() {
		case goja.PromiseStatePending:
			return Result{Error: "promise is pending; trace queries are synchronous and this session has no external event sources"}
		case goja.PromiseStateRejected:
			return Result{Error: p.Result().String()}
		default:
			v = p.Result()
		}
	}
	if v == nil || goja.IsUndefined(v) {
		return Result{OK: true, Value: json.RawMessage("null"), Kind: "undefined"}
	}
	if _, ok := goja.AssertFunction(v); ok {
		return Result{OK: true, Value: json.RawMessage("null"), Kind: "function"}
	}
	encoded, err := state.stringify(goja.Undefined(), v)
	if err != nil {
		return Result{Error: errors.Wrap(err, "serialize result (try selecting a field)").Error()}
	}
	if goja.IsUndefined(encoded) {
		return Result{Error: "value has no JSON representation; select a field or return a string"}
	}
	raw := encoded.String()
	if len(raw) > MaxResultBytes {
		return Result{Error: errors.Errorf("result exceeds %d bytes; save it in a binding and select a smaller result", MaxResultBytes).Error()}
	}
	return Result{OK: true, Value: json.RawMessage(raw)}
}
