package tracerepl

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/rs/zerolog"
	"golang.org/x/sync/errgroup"
)

// A cell that fails after declaring a top-level const leaves the name in its
// temporal dead zone for the life of the session. The researcher must be told
// which name is lost and what to do, not only "already declared".
func TestFailedDeclarationNamesUnusableBinding(t *testing.T) {
	s := testService(t)
	id := newSession(t, s)
	evaluate(t, s, id, "const kept = 7")
	for _, tc := range []struct{ source, want string }{
		{"const header = missing.count()", "`header` cannot be read or declared again"},
		{"const header = 1", "`header` cannot be read or declared again"},
		{"header", "declare a new one"},
		{"let fine = 1; const { later, other: [deep] } = nope()", "`later`, `deep`"},
		{"const kept = 8", "Reuse the existing binding"},
	} {
		r := evaluate(t, s, id, tc.source)
		if r.OK || !strings.Contains(r.Error, tc.want) {
			t.Fatalf("%s: %+v; want %q", tc.source, r, tc.want)
		}
	}
	for source, want := range map[string]string{"kept": "7", "fine": "1", "const header2 = 2; header2": "2"} {
		if r := evaluate(t, s, id, source); !r.OK || string(r.Value) != want {
			t.Fatalf("%s: %+v", source, r)
		}
	}
	// A failure that does not leave a declaration behind adds no hint.
	if r := evaluate(t, s, id, "const ok3 = 1; boom()"); r.OK || strings.Contains(r.Error, "hint:") {
		t.Fatalf("spurious hint: %+v", r)
	}
}

// The workbook writes `await q.run(plan)`. An agent will also write
// `const r = await q.run(plan)`, which script parsing rejects. The error must
// point into the researcher's own cell and say what to write instead.
func TestAwaitMisuseIsReportedAgainstTheCell(t *testing.T) {
	s := testService(t)
	id := newSession(t, s)
	if r := evaluate(t, s, id, "await Promise.resolve(answer)"); !r.OK || string(r.Value) != "42" {
		t.Fatalf("standalone await: %+v", r)
	}
	for source, position := range map[string]string{
		"const r = await Promise.resolve(4); r": "Line 1:17",
		"await Promise.resolve(5); 6":           "Line 1:7",
	} {
		r := evaluate(t, s, id, source)
		if r.OK || !strings.Contains(r.Error, position) || !strings.Contains(r.Error, "drop `await`") || strings.Contains(r.Error, "SyntaxError: SyntaxError") {
			t.Fatalf("%s: %+v", source, r)
		}
	}
	if r := evaluate(t, s, id, "const r = 4; r"); !r.OK || string(r.Value) != "4" {
		t.Fatalf("a rejected cell must not declare anything: %+v", r)
	}
}

func TestDeadlineNamesItselfAndKeepsEarlierBindings(t *testing.T) {
	s := testService(t)
	s.timeout = 100 * time.Millisecond
	id := newSession(t, s)
	evaluate(t, s, id, "const kept = { n: answer }")
	r := evaluate(t, s, id, "while (true) {}")
	if r.OK || !strings.Contains(r.Error, "evaluation deadline") || !strings.Contains(r.Error, "bindings from earlier cells remain") {
		t.Fatalf("%+v", r)
	}
	if r = evaluate(t, s, id, "kept.n"); !r.OK || string(r.Value) != "42" {
		t.Fatalf("binding lost after interrupt: %+v", r)
	}
}

func startedService(t *testing.T) (*Service, <-chan struct{}) {
	t.Helper()
	started := make(chan struct{}, 8)
	s, err := New(context.Background(), func(vm *goja.Runtime) error {
		return vm.Set("markStarted", func() { started <- struct{}{} })
	}, zerolog.Nop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close(context.Background()) })
	return s, started
}

func waitStarted(t *testing.T, started <-chan struct{}) {
	t.Helper()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("cell did not start")
	}
}

// A cell queued behind a busy one, whose deadline passes while it waits, must
// fail without ever running: a late side effect would corrupt the session.
func TestQueuedCellNeverRunsAfterItsDeadline(t *testing.T) {
	s, started := startedService(t)
	s.timeout = 400 * time.Millisecond
	id := newSession(t, s)
	var group errgroup.Group
	group.Go(func() error {
		_, err := s.Evaluate(context.Background(), id, "markStarted(); while (true) {}")
		return err
	})
	waitStarted(t, started)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := s.Evaluate(ctx, id, "globalThis.ranLate = true"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("queued cell: %v", err)
	}
	if err := group.Wait(); err != nil {
		t.Fatal(err)
	}
	if r := evaluate(t, s, id, "typeof ranLate"); string(r.Value) != `"undefined"` {
		t.Fatalf("expired cell ran: %+v", r)
	}
}

// Closing a session or the whole service stops running cells, says why, and
// leaves the service refusing new work with an unambiguous status.
func TestCloseInterruptsRunningCellsAndSaysWhy(t *testing.T) {
	s, started := startedService(t)
	ids := []string{newSession(t, s), newSession(t, s), newSession(t, s)}
	var mu sync.Mutex
	results := map[string]Result{}
	var group errgroup.Group
	for _, id := range ids {
		group.Go(func() error {
			r, err := s.Evaluate(context.Background(), id, "markStarted(); while (true) {}")
			mu.Lock()
			results[id] = r
			mu.Unlock()
			return err
		})
	}
	for range ids {
		waitStarted(t, started)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := s.Release(ctx, ids[0]); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if err := group.Wait(); err != nil {
		t.Fatal(err)
	}
	if r := results[ids[0]]; r.OK || !strings.Contains(r.Error, "session was closed") {
		t.Fatalf("released session: %+v", r)
	}
	for _, id := range ids[1:] {
		if r := results[id]; r.OK || !strings.Contains(r.Error, "service is shutting down") {
			t.Fatalf("service close: %+v", r)
		}
	}
	w := httptest.NewRecorder()
	Handler(s, zerolog.Nop()).ServeHTTP(w, httptest.NewRequest(http.MethodPost, "http://127.0.0.1:3791/sessions", nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("open after close: %d %s", w.Code, w.Body)
	}
}

// A session that disappeared outside this handler must not hold one of the
// handler's slots; otherwise the service eventually refuses every new session.
func TestHTTPReleasesCapacityOfVanishedSession(t *testing.T) {
	s := testService(t)
	h := Handler(s, zerolog.Nop())
	open := func() (int, string) {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "http://127.0.0.1:3791/sessions", nil))
		var body struct{ ID, Error string }
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		return w.Code, body.ID + body.Error
	}
	var first string
	for i := 0; i < MaxSessions; i++ {
		code, id := open()
		if code != http.StatusCreated {
			t.Fatalf("session %d: %d %s", i, code, id)
		}
		if i == 0 {
			first = id
		}
	}
	if code, msg := open(); code != http.StatusTooManyRequests || !strings.Contains(msg, "trace-repl close") {
		t.Fatalf("over limit: %d %s", code, msg)
	}
	if err := s.Release(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "http://127.0.0.1:3791/sessions/"+first, nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("delete vanished: %d", w.Code)
	}
	if code, msg := open(); code != http.StatusCreated {
		t.Fatalf("capacity not returned: %d %s", code, msg)
	}
}
