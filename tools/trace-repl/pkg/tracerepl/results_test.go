package tracerepl

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/traceresults"
	"github.com/rs/zerolog"
)

func resultsService(t *testing.T) (*Service, *traceresults.Store) {
	t.Helper()
	store, err := traceresults.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	// A stand-in for traceapi's compiler global, so the record's compilers field is exercised.
	install := func(vm *goja.Runtime) error {
		_, err := vm.RunString(`globalThis.compiler = {loaded: () => [{requested: "worktree", revision: "worktree", key: "k"}]}`)
		return err
	}
	s, err := New(context.Background(), install, zerolog.Nop(),
		WithResults(store, func() map[string]any { return map[string]any{"root": "/repo", "head": "abc"} }))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close(context.Background()) })
	return s, store
}

func digest(s string) string { d := sha256.Sum256([]byte(s)); return hex.EncodeToString(d[:]) }

// A saved record names its session, unit, script, args, repository and compilers.
func TestResultsSaveFromCellAndJob(t *testing.T) {
	s, store := resultsService(t)
	id := newSession(t, s)
	cell := `results.save("frame", {steps: args.n, arms: ["a"]}).name`
	r := evaluateWith(t, s, id, cell, `{"n": 4888369}`)
	if !r.OK || string(r.Value) != `"frame"` {
		t.Fatalf("%+v", r)
	}
	var rec Record
	data, _, err := store.Load("frame")
	if err != nil || json.Unmarshal(data, &rec) != nil {
		t.Fatal(err, string(data))
	}
	if rec.Session != id || rec.Unit != "cell" || rec.Job != "" || rec.Script.SHA256 != digest(cell) || rec.Script.Bytes != len(cell) ||
		compact(rec.Args) != `{"n":4888369}` || rec.Repo["head"] != "abc" || compact(rec.Compilers) != `[{"requested":"worktree","revision":"worktree","key":"k"}]` ||
		compact(rec.Value) != `{"steps":4888369,"arms":["a"]}` {
		t.Fatalf("%+v", rec)
	}
	job, err := s.SubmitCell(id, Cell{Source: `results.save("from-job", 7); results.load("from-job").unit`}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if v := waitJob(t, s, id, job.ID); v.State != JobDone || string(v.Result.Value) != `"job"` {
		t.Fatalf("%+v", v)
	}
	data, _, _ = store.Load("from-job")
	if !strings.Contains(string(data), `"job": "`+job.ID+`"`) {
		t.Fatalf("job record %s", data)
	}
	r = evaluate(t, s, id, `[results.list().map(i => i.name), results.load("frame").value.steps, results.dir() === `+jsString(store.Dir())+`]`)
	if string(r.Value) != `[["frame","from-job"],4888369,true]` {
		t.Fatalf("%+v", r)
	}
	for _, bad := range []string{`results.save("../x", 1)`, `results.save("f", () => 1)`, `results.save("f", 1n)`, `results.load("absent")`} {
		if r := evaluate(t, s, id, bad); r.OK {
			t.Errorf("%s succeeded", bad)
		}
	}
}

func compact(raw json.RawMessage) string {
	var b bytes.Buffer
	_ = json.Compact(&b, raw)
	return b.String()
}

func jsString(s string) string { b, _ := json.Marshal(s); return string(b) }

func TestResultsWithoutStore(t *testing.T) {
	s := testService(t)
	id := newSession(t, s)
	if r := evaluate(t, s, id, `results.save("x", 1)`); r.OK || !strings.Contains(r.Error, "serve --results") {
		t.Fatalf("%+v", r)
	}
	if r := evaluate(t, s, id, `results.dir()`); string(r.Value) != "null" {
		t.Fatalf("%+v", r)
	}
	rec := httptest.NewRecorder()
	Handler(s, zerolog.Nop()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:3811/results", nil))
	if rec.Code != 404 {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
}

func TestResultsOverHTTP(t *testing.T) {
	s, _ := resultsService(t)
	id := newSession(t, s)
	evaluate(t, s, id, `results.save("r1", {a: 1})`)
	h := Handler(s, zerolog.Nop())
	get := func(path string) (int, string) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:3811"+path, nil))
		return rec.Code, rec.Body.String()
	}
	if code, body := get("/results"); code != 200 || !strings.Contains(body, `"name":"r1"`) {
		t.Fatalf("%d %s", code, body)
	}
	if code, body := get("/results/r1"); code != 200 || !strings.Contains(body, `"value": {`) || !strings.Contains(body, `"session": "`+id+`"`) {
		t.Fatalf("%d %s", code, body)
	}
	if code, _ := get("/results/absent"); code != 404 {
		t.Fatalf("absent: %d", code)
	}
	if code, body := get("/info"); code != 200 || !strings.Contains(body, `"results":{"dir":`) {
		t.Fatalf("%d %s", code, body)
	}
}
