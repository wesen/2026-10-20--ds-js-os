// Package tracerepl hosts a persistent Goja VM for each local research session.
package tracerepl

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja/ast"
	"github.com/dop251/goja/parser"
	"github.com/go-go-golems/go-go-goja/pkg/engine"
	"github.com/go-go-golems/go-go-goja/pkg/replsession"
	"github.com/go-go-golems/picocalc-trace/pkg/traceresults"
	"github.com/pkg/errors"
	"github.com/rs/zerolog"
)

const (
	MaxSourceBytes     = 64 << 10
	MaxResultBytes     = 512 << 10
	MaxArgsBytes       = 64 << 10
	defaultEvalTimeout = 15 * time.Second
)

// Cell is one unit of work for a session: its source and its parameters.
// Args is one JSON object; nil or JSON null means no parameters. Every cell
// and job sees its own args as a fresh object in the global `args`, so no
// parameter survives into a later cell.
type Cell struct {
	Source string
	Args   json.RawMessage
}

// ValidateArgs checks that raw is absent, null, or one JSON object of at most
// MaxArgsBytes bytes.
func ValidateArgs(raw json.RawMessage) error {
	if isAbsent(raw) {
		return nil
	}
	if len(raw) > MaxArgsBytes {
		return errors.Errorf("args exceed %d bytes", MaxArgsBytes)
	}
	var fields map[string]json.RawMessage
	if trimmed := bytes.TrimSpace(raw); len(trimmed) == 0 || trimmed[0] != '{' || json.Unmarshal(trimmed, &fields) != nil {
		return errors.New("args must be one JSON object, for example {\"rev\": \"worktree\"}")
	}
	return nil
}

func isAbsent(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null"))
}

// Unit describes the cell or job a session is running, for the result store
// and for job records.
type Unit struct {
	Session      string          `json:"session"`
	Kind         string          `json:"unit"` // "cell" or "job"
	Job          string          `json:"job,omitempty"`
	SourceSHA256 string          `json:"sourceSHA256"`
	SourceBytes  int             `json:"sourceBytes"`
	Args         json.RawMessage `json:"args,omitempty"`
}

func newUnit(session, kind, job string, cell Cell) Unit {
	digest := sha256.Sum256([]byte(cell.Source))
	u := Unit{Session: session, Kind: kind, Job: job, SourceSHA256: hex.EncodeToString(digest[:]), SourceBytes: len(cell.Source)}
	if !isAbsent(cell.Args) {
		var compact bytes.Buffer
		if json.Compact(&compact, cell.Args) == nil {
			u.Args = compact.Bytes()
		}
	}
	return u
}

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
	parse, ok := goja.AssertFunction(vm.Get("JSON").ToObject(vm).Get("parse"))
	if !ok {
		return errors.New("initialize args parser")
	}
	state.stringify, state.parse = stringify, parse
	// args is a non-configurable accessor on the global object. The engine then
	// refuses a top-level let, const, class or function named args, which would
	// otherwise shadow every later cell's parameters, and no cell can delete or
	// redefine it. The setter keeps `globalThis.args = {...}` working within a cell.
	state.args = vm.NewObject()
	getter := vm.ToValue(func(goja.FunctionCall) goja.Value { return state.args })
	setter := vm.ToValue(func(call goja.FunctionCall) goja.Value { state.args = call.Argument(0); return goja.Undefined() })
	if err := vm.GlobalObject().DefineAccessorProperty("args", getter, setter, goja.FLAG_FALSE, goja.FLAG_FALSE); err != nil {
		return errors.Wrap(err, "define args")
	}
	ctx.SetValue("cellIO", state)
	return nil
}

type cellIO struct {
	lines     []ConsoleLine
	stringify goja.Callable
	parse     goja.Callable
	args      goja.Value // the running cell's args
	unit      Unit       // the running cell or job
}

type Service struct {
	sessions *replsession.Service
	timeout  time.Duration
	maxJob   time.Duration
	started  time.Time
	describe func() map[string]any
	lifetime context.Context

	mu           sync.Mutex
	live         map[string]*sessionEntry // sessions opened through Open
	expired      map[string]string        // reaped session ID -> reason
	expiredOrder []string
	idle         time.Duration
	results      *traceresults.Store
	provenance   func() map[string]any
	closing      chan struct{}
	closeOnce    sync.Once
	wg           sync.WaitGroup // job goroutines and the reaper
}

// Option configures a Service.
type Option func(*Service)

// WithInventory supplies what GET /info reports about the inputs this service
// mounted (archive, studies, repository). The function is called per request
// and must return a fresh map that the handler may extend.
func WithInventory(describe func() map[string]any) Option {
	return func(s *Service) { s.describe = describe }
}

// WithMaxJob caps the deadline of background jobs (default DefaultMaxJob).
func WithMaxJob(d time.Duration) Option {
	return func(s *Service) {
		if d > 0 {
			s.maxJob = d
		}
	}
}

func New(ctx context.Context, install Installer, logger zerolog.Logger, opts ...Option) (*Service, error) {
	s := &Service{timeout: defaultEvalTimeout, maxJob: DefaultMaxJob, started: time.Now().UTC(), lifetime: ctx,
		live: map[string]*sessionEntry{}, expired: map[string]string{}, idle: DefaultIdle, closing: make(chan struct{})}
	for _, opt := range opts {
		opt(s)
	}
	// The result store's initializer runs after the session's installer, whose
	// globals (compiler) and cell state it reads.
	factory, err := engine.NewRuntimeFactoryBuilder(
		engine.WithImplicitDefaultRegistryModules(false),
		engine.WithDataOnlyDefaultRegistryModules(false),
	).WithRuntimeInitializers(install, resultsInit{s}).Build()
	if err != nil {
		return nil, errors.Wrap(err, "build trace runtime")
	}
	s.sessions = replsession.NewService(factory, logger,
		replsession.WithLifetimeContext(ctx),
		replsession.WithDefaultSessionOptions(replsession.RawSessionOptions()),
	)
	if s.idle > 0 {
		s.wg.Add(1)
		go s.reap()
	}
	return s, nil
}

// Limits are the per-cell bounds a client must respect.
type Limits struct {
	SourceBytes int     `json:"sourceBytes"`
	ResultBytes int     `json:"resultBytes"`
	ArgsBytes   int     `json:"argsBytes"`
	CellSeconds float64 `json:"cellSeconds"`
	JobSeconds  float64 `json:"jobSeconds"`
}

func (s *Service) Limits() Limits {
	return Limits{SourceBytes: MaxSourceBytes, ResultBytes: MaxResultBytes, ArgsBytes: MaxArgsBytes, CellSeconds: s.timeout.Seconds(), JobSeconds: s.maxJob.Seconds()}
}

// inventory is the GET /info body without the handler's session counts.
func (s *Service) inventory() map[string]any {
	info := map[string]any{}
	if s.describe != nil {
		info = s.describe()
	}
	info["service"] = "trace-repl"
	info["started"] = s.started
	info["limits"] = s.Limits()
	info["results"] = nil
	if s.results != nil {
		info["results"] = map[string]any{"dir": s.results.Dir()}
	}
	info["sessions"] = map[string]any{"open": s.SessionCount(), "max": MaxSessions, "idleSeconds": s.idle.Seconds()}
	return info
}

func (s *Service) Open(ctx context.Context) (string, error) {
	session, err := s.sessions.CreateSession(ctx)
	if err != nil {
		return "", err
	}
	s.register(session.ID)
	return session.ID, nil
}

// Release closes a session. A running cell or job is interrupted with the
// reason "its session was closed".
func (s *Service) Release(ctx context.Context, id string) error {
	s.mu.Lock()
	_, known := s.live[id]
	reason, expired := s.expired[id]
	delete(s.live, id)
	s.mu.Unlock()
	err := s.sessions.UnloadSession(ctx, id)
	if !known && expired && errors.Is(err, replsession.ErrSessionNotFound) {
		return &ExpiredError{ID: id, Reason: reason}
	}
	return err
}

// Close stops every session, the idle reaper and every job, and waits for them.
func (s *Service) Close(ctx context.Context) error {
	s.closeOnce.Do(func() { close(s.closing) })
	err := s.sessions.Close(ctx)
	s.wg.Wait()
	return err
}

// Evaluate runs one interactive cell under the cell deadline. A session that
// is running or queueing a job refuses the cell at once with ErrSessionBusy:
// waiting would only spend the cell's deadline behind the job.
func (s *Service) Evaluate(ctx context.Context, id, source string) (Result, error) {
	return s.EvaluateCell(ctx, id, Cell{Source: source})
}

// EvaluateCell is Evaluate with parameters: cell.Args becomes the cell's args.
func (s *Service) EvaluateCell(ctx context.Context, id string, cell Cell) (Result, error) {
	if len(cell.Source) > MaxSourceBytes {
		return Result{}, errors.Errorf("source exceeds %d bytes", MaxSourceBytes)
	}
	if err := ValidateArgs(cell.Args); err != nil {
		return Result{}, err
	}
	if err := s.claim(id); err != nil {
		return Result{}, err
	}
	defer s.touch(id, true)
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	return s.run(ctx, newUnit(id, "cell", "", cell), cell, s.timeout, nil)
}

// run evaluates a cell in the session's VM while holding its gate. It is the
// body shared by cells and jobs; unit names the session and the kind of work
// (in interrupt messages too), and limit is the deadline that ctx carries.
// started, when set, is called on the VM's owner just before the source runs.
func (s *Service) run(ctx context.Context, unit Unit, cell Cell, limit time.Duration, started func()) (Result, error) {
	var result Result
	id, what := unit.Session, unit.Kind
	err := s.sessions.WithRuntime(ctx, id, func(opCtx context.Context, rt *engine.Runtime) error {
		// Wait for the owner callback to finish even after cancellation. This keeps
		// the session gate held until its interrupt has been consumed and cleared.
		_, err := rt.Owner.Call(context.WithoutCancel(opCtx), "trace.eval", func(_ context.Context, vm *goja.Runtime) (any, error) {
			if err := opCtx.Err(); err != nil {
				return nil, err
			}
			interrupted := make(chan struct{})
			stop := context.AfterFunc(opCtx, func() {
				vm.Interrupt(stopReason(opCtx, what, limit))
				close(interrupted)
			})
			defer func() {
				if !stop() {
					<-interrupted
				}
				vm.ClearInterrupt()
			}()
			if started != nil {
				started()
			}
			state := rt.Values["cellIO"].(*cellIO)
			state.lines = nil
			// Every cell gets a fresh args object, parsed in this VM, even when it sent none.
			args, err := cellArgs(vm, state, cell.Args)
			if err != nil {
				result = Result{Error: err.Error()}
				return nil, nil
			}
			state.args, state.unit = args, unit
			result = evalCell(vm, state, cell.Source)
			result.Console = state.lines
			state.lines = nil
			return nil, nil
		})
		return err
	})
	return result, err
}

// cellArgs parses raw in the VM, so the cell owns the resulting object.
func cellArgs(vm *goja.Runtime, state *cellIO, raw json.RawMessage) (goja.Value, error) {
	if isAbsent(raw) {
		return vm.NewObject(), nil
	}
	v, err := state.parse(goja.Undefined(), vm.ToValue(string(raw)))
	if err != nil {
		return nil, errors.Wrap(err, "parse args")
	}
	return v, nil
}

// errJobStopped is the cancellation cause of DELETE /sessions/{id}/jobs/{job}.
var errJobStopped = errors.New("stopped by request")

// stopReason tells the researcher why a running cell or job was interrupted.
func stopReason(ctx context.Context, what string, timeout time.Duration) string {
	cause := context.Cause(ctx)
	switch {
	case errors.Is(cause, context.DeadlineExceeded) && what == "job":
		return fmt.Sprintf("job stopped at its deadline (%s, including the wait for this session); bindings from earlier cells remain", timeout)
	case errors.Is(cause, context.DeadlineExceeded):
		return fmt.Sprintf("cell stopped at its evaluation deadline (at most %s, including the wait for this session); bindings from earlier cells remain; "+
			"for longer work submit a job (trace-repl eval --job)", timeout)
	case errors.Is(cause, errJobStopped):
		return "job stopped by request; bindings from earlier cells remain"
	case errors.Is(cause, replsession.ErrSessionClosing), errors.Is(cause, replsession.ErrSessionClosed):
		return what + " stopped because its session was closed"
	case errors.Is(cause, replsession.ErrServiceClosing), errors.Is(cause, replsession.ErrServiceClosed):
		return what + " stopped because the trace service is shutting down"
	case cause != nil:
		return what + " stopped: " + cause.Error()
	}
	return what + " stopped"
}

var (
	promiseType  = reflect.TypeOf((*goja.Promise)(nil))
	awaitPattern = regexp.MustCompile(`\bawait\b`)
)

const awaitHint = "hint: `await` is accepted only when the whole cell is one `await <expression>`. " +
	"The trace API answers synchronously, so drop `await` here, for example `const r = q.run(plan)`."

// parseCell uses the same parser options as the session VM. Notebook cells
// keep ordinary script semantics, so top-level declarations persist. A cell
// that is one `await <expression>` runs in an async arrow so script parsing
// accepts it; every other syntax error is reported against the cell as typed.
func parseCell(source string) (*ast.Program, error) {
	trimmed := strings.TrimSpace(source)
	if strings.HasPrefix(trimmed, "await ") || strings.HasPrefix(trimmed, "await(") {
		wrapped := "(async () => (" + strings.TrimSuffix(trimmed, ";") + "\n))()"
		if prg, err := goja.Parse("<trace-cell>", wrapped, parser.WithDisableSourceMaps); err == nil {
			return prg, nil
		}
	}
	prg, err := goja.Parse("<trace-cell>", source, parser.WithDisableSourceMaps)
	if err != nil {
		msg := strings.Replace(err.Error(), "SyntaxError: SyntaxError: ", "SyntaxError: ", 1)
		if awaitPattern.MatchString(source) {
			msg += "\n" + awaitHint
		}
		return nil, errors.New(msg)
	}
	return prg, nil
}

// lexicalNames lists the top-level let, const and class bindings of a cell.
func lexicalNames(prg *ast.Program) []string {
	var names []string
	for _, statement := range prg.Body {
		switch d := statement.(type) {
		case *ast.LexicalDeclaration:
			for _, b := range d.List {
				names = bindingNames(b.Target, names)
			}
		case *ast.ClassDeclaration:
			if d.Class != nil && d.Class.Name != nil {
				names = append(names, d.Class.Name.Name.String())
			}
		}
	}
	return names
}

func bindingNames(target ast.Expression, out []string) []string {
	switch t := target.(type) {
	case *ast.Identifier:
		return append(out, t.Name.String())
	case *ast.ObjectPattern:
		for _, p := range t.Properties {
			switch p := p.(type) {
			case *ast.PropertyShort:
				out = append(out, p.Name.Name.String())
			case *ast.PropertyKeyed:
				out = bindingNames(p.Value, out)
			}
		}
		return bindingNames(t.Rest, out)
	case *ast.ArrayPattern:
		for _, e := range t.Elements {
			out = bindingNames(e, out)
		}
		return bindingNames(t.Rest, out)
	case *ast.AssignExpression:
		return bindingNames(t.Left, out)
	}
	return out
}

// explainFailure adds what a persistent session makes non-obvious: a cell that
// fails after declaring a top-level let/const/class leaves that name
// uninitialized for the rest of the session, and it cannot be declared again.
func explainFailure(vm *goja.Runtime, prg *ast.Program, err error) string {
	msg := err.Error()
	var stuck []string
	for _, name := range lexicalNames(prg) {
		if _, probe := vm.RunString("typeof " + name); probe != nil {
			var exception *goja.Exception
			if errors.As(probe, &exception) {
				stuck = append(stuck, "`"+name+"`")
			}
		}
	}
	if len(stuck) > 0 {
		return msg + fmt.Sprintf("\nhint: %s cannot be read or declared again in this session: a cell failed after declaring it and before its initializer finished. "+
			"Use a new name, for example %s2, or open a new session; bindings from earlier cells are unaffected.", strings.Join(stuck, ", "), strings.Trim(stuck[0], "`"))
	}
	if strings.Contains(msg, "has already been declared") {
		return msg + "\nhint: top-level let, const and class names last for the whole session. Reuse the existing binding, assign to it if it was declared with let, or choose a new name."
	}
	if strings.Contains(msg, "before initialization") {
		return msg + "\nhint: a let/const/class name used here was never initialized, either later in this cell or by an earlier cell that failed; that name stays unusable in this session, so declare a new one."
	}
	return msg
}

func evalCell(vm *goja.Runtime, state *cellIO, source string) Result {
	prg, err := parseCell(source)
	if err != nil {
		return Result{Error: err.Error()}
	}
	program, err := goja.CompileAST(prg, false)
	if err != nil {
		return Result{Error: err.Error()}
	}
	v, err := vm.RunProgram(program)
	if err != nil {
		return Result{Error: explainFailure(vm, prg, err)}
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
