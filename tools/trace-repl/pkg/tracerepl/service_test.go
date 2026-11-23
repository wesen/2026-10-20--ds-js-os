package tracerepl

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/rs/zerolog"
	"golang.org/x/sync/errgroup"
)

func testService(t *testing.T) *Service {
	t.Helper()
	s, err := New(context.Background(), func(vm *goja.Runtime) error { return vm.Set("answer", 42) }, zerolog.Nop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(context.Background()); err != nil {
			t.Error(err)
		}
	})
	return s
}

func newSession(t *testing.T, s *Service) string {
	t.Helper()
	id, err := s.Open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func evaluate(t *testing.T, s *Service, id, code string) Result {
	t.Helper()
	r, err := s.Evaluate(context.Background(), id, code)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestPersistentSessionBoundary(t *testing.T) {
	s := testService(t)
	first := newSession(t, s)
	second := newSession(t, s)
	for _, tc := range []struct{ id, source, value string }{
		{first, "const x = { value: answer }; x.value", "42"},
		{first, "x.value += 1", "43"},
		{second, "typeof x", `"undefined"`},
		{first, "[typeof require, typeof process, typeof fetch]", `["undefined","undefined","undefined"]`},
		{first, "await Promise.resolve(x.value);", "43"},
		{first, "console.log('hello', x.value); x.value", "43"},
	} {
		r := evaluate(t, s, tc.id, tc.source)
		if !r.OK || string(r.Value) != tc.value {
			t.Fatalf("%s: %+v", tc.source, r)
		}
		if strings.HasPrefix(tc.source, "console") && (len(r.Console) != 1 || r.Console[0].Message != "hello 43") {
			t.Fatalf("logs: %+v", r.Console)
		}
	}
	if err := s.Release(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Evaluate(context.Background(), first, "1"); err == nil {
		t.Fatal("closed session accepted new code")
	}
}

func TestTimeoutDuringComputationAndResultSerialization(t *testing.T) {
	s := testService(t)
	s.timeout = 100 * time.Millisecond
	id := newSession(t, s)
	for _, code := range []string{"while(true) {}", "({toJSON() { while (true) {} }})"} {
		r := evaluate(t, s, id, code)
		if r.OK || !strings.Contains(r.Error, "deadline") {
			t.Fatalf("%s: got %+v", code, r)
		}
		if x := evaluate(t, s, id, "3 + 4"); string(x.Value) != "7" {
			t.Fatalf("stale interrupt after %s: %+v", code, x)
		}
	}
}

func TestSameSessionSerializesEvaluations(t *testing.T) {
	s := testService(t)
	id := newSession(t, s)
	evaluate(t, s, id, "let n=0")
	var group errgroup.Group
	for range 16 {
		group.Go(func() error {
			r, err := s.Evaluate(context.Background(), id, "n += 1")
			if !r.OK {
				t.Errorf("%+v", r)
			}
			return err
		})
	}
	if err := group.Wait(); err != nil {
		t.Fatal(err)
	}
	if r := evaluate(t, s, id, "n"); string(r.Value) != "16" {
		t.Fatal(r)
	}
}

func TestHTTPProtocol(t *testing.T) {
	s := testService(t)
	h := Handler(s, zerolog.Nop())
	call := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1:3791"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	open := call("POST", "/sessions", "")
	var id struct {
		ID string `json:"id"`
	}
	if open.Code != 201 || json.Unmarshal(open.Body.Bytes(), &id) != nil || id.ID == "" {
		t.Fatal(open)
	}
	path := "/sessions/" + id.ID
	for _, tt := range []struct {
		body   string
		status int
	}{
		{`{"source":"2+2"}`, 200}, {`{"source":"x","extra":4}`, 400}, {`{"source":null}`, 400},
		{`{"source":"1"} []`, 400}, {`{"source":"` + strings.Repeat("x", MaxSourceBytes+1) + `"}`, 413},
	} {
		w := call("POST", path+"/eval", tt.body)
		if w.Code != tt.status {
			t.Fatalf("status %d: %s", w.Code, w.Body.String())
		}
	}
	if w := call("DELETE", path, ""); w.Code != 204 {
		t.Fatal(w)
	}
	if w := call("POST", path+"/eval", `{"source":"1"}`); w.Code != 404 {
		t.Fatal(w)
	}
	r := httptest.NewRequest(http.MethodPost, "http://example.org:3791/sessions", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
}

// A running service describes itself: the inventory its owner supplied, the
// open session count and the per-cell limits. GET / lists the routes.
func TestInfoReportsInventorySessionsAndLimits(t *testing.T) {
	s, err := New(context.Background(), func(vm *goja.Runtime) error { return nil }, zerolog.Nop(),
		WithInventory(func() map[string]any { return map[string]any{"archive": map[string]string{"path": "/x"}} }))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(context.Background())
	h := Handler(s, zerolog.Nop())
	get := func(path string) map[string]any {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:3791"+path, nil))
		var body map[string]any
		if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &body) != nil {
			t.Fatalf("GET %s: %d %s", path, w.Code, w.Body)
		}
		return body
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "http://127.0.0.1:3791/sessions", nil))
	if w.Code != http.StatusCreated {
		t.Fatal(w.Code)
	}
	info := get("/info")
	sessions := info["sessions"].(map[string]any)
	limits := info["limits"].(map[string]any)
	if info["service"] != "trace-repl" || info["archive"].(map[string]any)["path"] != "/x" ||
		sessions["open"] != 1.0 || sessions["max"] != float64(MaxSessions) ||
		limits["sourceBytes"] != float64(MaxSourceBytes) || limits["resultBytes"] != float64(MaxResultBytes) || limits["cellSeconds"] != 15.0 {
		t.Fatalf("info: %v", info)
	}
	if routes := get("/")["routes"].([]any); len(routes) == 0 || !strings.Contains(routes[0].(string), "/info") {
		t.Fatalf("routes: %v", routes)
	}
	// The inventory is loopback-only like every other route.
	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:3791/info", nil)
	r.Header.Set("Origin", "http://example.org")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatal(w.Code)
	}
}

func TestClosingSessionInterruptsActiveCell(t *testing.T) {
	started := make(chan struct{})
	s, err := New(context.Background(), func(vm *goja.Runtime) error {
		return vm.Set("markStarted", func() { close(started) })
	}, zerolog.Nop())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(context.Background())
	id := newSession(t, s)
	var group errgroup.Group
	group.Go(func() error {
		result, err := s.Evaluate(context.Background(), id, "markStarted(); while (true) {}")
		if result.OK {
			t.Errorf("interrupted cell reported success")
		}
		return err
	})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	select {
	case <-started:
	case <-ctx.Done():
		t.Fatal("cell did not start")
	}
	if err := s.Release(ctx, id); err != nil {
		t.Fatal(err)
	}
	if err := group.Wait(); err != nil {
		t.Fatal(err)
	}
}
