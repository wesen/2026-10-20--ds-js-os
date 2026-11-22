package tracerepl

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rs/zerolog"
)

func evaluateWith(t *testing.T, s *Service, id, code, args string) Result {
	t.Helper()
	var raw json.RawMessage
	if args != "" {
		raw = json.RawMessage(args)
	}
	r, err := s.EvaluateCell(context.Background(), id, Cell{Source: code, Args: raw})
	if err != nil {
		t.Fatal(err)
	}
	return r
}

// Every path by which an earlier cell's parameters could reach a later cell
// (PICOCALC-RAY-PARITY field notes, entry 5) must end in a fresh args.
func TestArgsAreFreshInEveryCell(t *testing.T) {
	s := testService(t)
	id := newSession(t, s)
	for i, tc := range []struct{ source, args, value string }{
		{"args", `{"arms": {"base": {}}, "rev": "worktree"}`, `{"arms":{"base":{}},"rev":"worktree"}`},
		{"args", "", "{}"}, // no parameters: a fresh empty object
		{"args.rev = 'stale'; args.rev", `{"rev": "eaf0872"}`, `"stale"`}, // a cell may change its own args ...
		{"args.rev", `{"rev": "eaf0872"}`, `"eaf0872"`},                   // ... and the next cell gets a new parse
		{"globalThis.args = {legacy: true}; args.legacy", "", "true"},     // the old convention works within one cell
		{"args.legacy", "", "null"},
		{"var args = {fromVar: 1}; args.fromVar", "", "1"},
		{"args.fromVar", "", "null"},
		{"delete globalThis.args", "", "false"},
		{"[typeof args, Object.keys(args).length]", "", `["object",0]`},
		{"const keep = () => args.n; keep()", `{"n": 1}`, "1"},
		{"keep()", `{"n": 2}`, "2"}, // a closure reads the args of the cell that calls it
		{"args", "null", "{}"},
	} {
		r := evaluateWith(t, s, id, tc.source, tc.args)
		got := string(r.Value)
		if tc.value == "null" && (r.Kind == "undefined" || got == "null") {
			continue
		}
		if !r.OK || got != tc.value {
			t.Fatalf("case %d %q with %s: %+v, want %s", i, tc.source, tc.args, r, tc.value)
		}
	}
	// A lexical or function declaration named args would shadow later cells' args; the engine refuses each.
	for _, source := range []string{"let args = 1", "const args = 1", "class args {}", "function args() {}",
		"Object.defineProperty(globalThis, 'args', {value: {stale: true}})"} {
		if r := evaluate(t, s, id, source); r.OK {
			t.Fatalf("%q was accepted", source)
		}
		if r := evaluateWith(t, s, id, "args", `{"after": 1}`); string(r.Value) != `{"after":1}` {
			t.Fatalf("after %q: args = %s %s", source, r.Value, r.Error)
		}
	}
}

func TestArgsValidation(t *testing.T) {
	s := testService(t)
	id := newSession(t, s)
	for _, bad := range []string{`[1]`, `5`, `"x"`, `{"a": `, `{} {}`} {
		if _, err := s.EvaluateCell(context.Background(), id, Cell{Source: "1", Args: json.RawMessage(bad)}); err == nil {
			t.Errorf("args %s accepted", bad)
		}
		if _, err := s.SubmitCell(id, Cell{Source: "1", Args: json.RawMessage(bad)}, 0); err == nil {
			t.Errorf("job args %s accepted", bad)
		}
	}
	big := `{"x": "` + strings.Repeat("a", MaxArgsBytes) + `"}`
	if _, err := s.EvaluateCell(context.Background(), id, Cell{Source: "1", Args: json.RawMessage(big)}); err == nil {
		t.Error("oversized args accepted")
	}
}

// A job sees its args and records them, with its source digest, in its view.
func TestJobRecordsArgsAndSource(t *testing.T) {
	s := testService(t)
	id := newSession(t, s)
	source := "args.arms.length"
	job, err := s.SubmitCell(id, Cell{Source: source, Args: json.RawMessage(`{ "arms" : [1, 2, 3] }`)}, 0)
	if err != nil {
		t.Fatal(err)
	}
	v := waitJob(t, s, id, job.ID)
	digest := sha256.Sum256([]byte(source))
	if v.State != JobDone || string(v.Result.Value) != "3" || string(v.Args) != `{"arms":[1,2,3]}` ||
		v.SourceSHA256 != hex.EncodeToString(digest[:]) || v.SourceBytes != len(source) {
		t.Fatalf("%+v", v)
	}
	// The next cell does not see the job's args.
	if r := evaluate(t, s, id, "Object.keys(args).length"); string(r.Value) != "0" {
		t.Fatalf("job args leaked: %s", r.Value)
	}
}

func TestHTTPArgs(t *testing.T) {
	s := testService(t)
	h := Handler(s, zerolog.Nop())
	open := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:3811/sessions", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, open)
	var session struct{ ID string }
	_ = json.NewDecoder(rec.Body).Decode(&session)
	post := func(path, body string) (int, string) {
		req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:3811"+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code, strings.TrimSpace(rec.Body.String())
	}
	if code, body := post("/sessions/"+session.ID+"/eval", `{"source": "args.n + 1", "args": {"n": 41}}`); code != 200 || !strings.Contains(body, `"value":42`) {
		t.Fatalf("%d %s", code, body)
	}
	if code, body := post("/sessions/"+session.ID+"/eval", `{"source": "1", "args": [1]}`); code != 400 || !strings.Contains(body, "one JSON object") {
		t.Fatalf("%d %s", code, body)
	}
	if code, body := post("/sessions/"+session.ID+"/jobs", `{"source": "args.n", "args": {"n": 7}}`); code != 202 || !strings.Contains(body, `"args":{"n":7}`) {
		t.Fatalf("%d %s", code, body)
	}
}
