package tracerepl

// One cell: its arguments, its parse (one await at most), its evaluation and how a failure is explained.

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja/ast"
	"github.com/dop251/goja/parser"
	"github.com/go-go-golems/go-go-goja/pkg/replsession"
	"github.com/pkg/errors"
)

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
