package tracerepl

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/go-go-golems/go-go-goja/pkg/replsession"
	"github.com/rs/zerolog"
)

// The reaper unloads an unused session and later requests learn why.
func TestIdleSessionIsUnloadedAndExplained(t *testing.T) {
	s, err := New(context.Background(), func(vm *goja.Runtime) error { return nil }, zerolog.Nop(), WithIdle(50*time.Millisecond))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(context.Background())
	h := Handler(s, zerolog.Nop())
	id := newSession(t, s)
	evaluate(t, s, id, "const kept = 1")
	deadline := time.Now().Add(5 * time.Second)
	for s.SessionCount() != 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if s.SessionCount() != 0 {
		t.Fatal("idle session was not reaped")
	}
	_, err = s.Evaluate(context.Background(), id, "kept")
	var expired *ExpiredError
	if !errors.As(err, &expired) || !errors.Is(err, replsession.ErrSessionNotFound) || !strings.Contains(err.Error(), "expired after 50ms idle") {
		t.Fatalf("evaluate after reaping: %v", err)
	}
	for _, req := range []struct{ method, path, body string }{
		{"POST", "/sessions/" + id + "/eval", `{"source":"1"}`},
		{"POST", "/sessions/" + id + "/jobs", `{"source":"1"}`},
		{"DELETE", "/sessions/" + id, ""},
	} {
		r := httptest.NewRequest(req.method, "http://127.0.0.1:3791"+req.path, strings.NewReader(req.body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusNotFound || !strings.Contains(w.Body.String(), "expired after 50ms idle") {
			t.Fatalf("%s %s: %d %s", req.method, req.path, w.Code, w.Body)
		}
	}
}

// A session that runs a cell or job is never idle, however long that takes,
// and its idle time starts when the work ends.
func TestBusySessionsAreNotReaped(t *testing.T) {
	s, started := startedService(t)
	quiet, cell, job := newSession(t, s), newSession(t, s), newSession(t, s)
	go func() {
		_, _ = s.Evaluate(context.Background(), cell, "markStarted(); const t0 = Date.now(); while (Date.now() - t0 < 300) {}")
	}()
	waitStarted(t, started)
	j, err := s.Submit(job, "markStarted(); while (true) {}", 0)
	if err != nil {
		t.Fatal(err)
	}
	waitStarted(t, started)
	reaped := s.reapIdle(time.Now().Add(3 * time.Hour))
	if len(reaped) != 1 || reaped[0] != quiet {
		t.Fatalf("reaped %v; want only the quiet session %s", reaped, quiet)
	}
	views := map[string]SessionView{}
	for _, v := range s.Sessions() {
		views[v.ID] = v
	}
	if !views[cell].Busy || views[job].ActiveJob != j.ID || views[job].Jobs != 1 || views[job].IdleSeconds != 0 || len(views) != 2 {
		t.Fatalf("views: %+v", views)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := s.StopJob(ctx, job, j.ID); err != nil {
		t.Fatal(err)
	}
	// Just finished: not idle yet. Past the idle lifetime (2h by default): idle.
	if got := s.reapIdle(time.Now()); len(got) != 0 {
		t.Fatalf("reaped a session that just finished a job: %v", got)
	}
	if got := s.reapIdle(time.Now().Add(3 * time.Hour)); len(got) != 1 || got[0] != job {
		t.Fatalf("reaped %v; want %s once its job ended", got, job)
	}
}

func TestSessionListAndLimitCountTheRegistry(t *testing.T) {
	s := testService(t)
	h := Handler(s, zerolog.Nop())
	call := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1:3791"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	var opened struct{ ID string }
	_ = json.Unmarshal(call("POST", "/sessions", "").Body.Bytes(), &opened)
	call("POST", "/sessions/"+opened.ID+"/eval", `{"source":"1"}`)
	call("POST", "/sessions/"+opened.ID+"/eval", `{"source":"2"}`)
	var list []SessionView
	if err := json.Unmarshal(call("GET", "/sessions", "").Body.Bytes(), &list); err != nil || len(list) != 1 ||
		list[0].ID != opened.ID || list[0].Cells != 2 || list[0].Busy || list[0].LastUsed.Before(list[0].Created) {
		t.Fatalf("list: %+v %v", list, err)
	}
	for i := 1; i < MaxSessions; i++ {
		if w := call("POST", "/sessions", ""); w.Code != http.StatusCreated {
			t.Fatalf("session %d: %d", i, w.Code)
		}
	}
	if w := call("POST", "/sessions", ""); w.Code != http.StatusTooManyRequests {
		t.Fatalf("over limit: %d", w.Code)
	}
	// Reaping frees capacity like closing does.
	if got := s.reapIdle(time.Now().Add(3 * time.Hour)); len(got) != MaxSessions {
		t.Fatalf("reaped %d", len(got))
	}
	if w := call("POST", "/sessions", ""); w.Code != http.StatusCreated {
		t.Fatalf("after reaping: %d %s", w.Code, w.Body)
	}
	var info map[string]any
	_ = json.Unmarshal(call("GET", "/info", "").Body.Bytes(), &info)
	if sessions := info["sessions"].(map[string]any); sessions["open"] != 1.0 || sessions["idleSeconds"] != DefaultIdle.Seconds() {
		t.Fatalf("info sessions: %v", sessions)
	}
}

func TestIdleZeroKeepsSessionsAndTombstonesAreBounded(t *testing.T) {
	s, err := New(context.Background(), func(vm *goja.Runtime) error { return nil }, zerolog.Nop(), WithIdle(0))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(context.Background())
	newSession(t, s)
	time.Sleep(30 * time.Millisecond)
	if s.SessionCount() != 1 || s.Idle() != 0 {
		t.Fatal("WithIdle(0) reaped a session")
	}
	s.mu.Lock()
	for i := 0; i < expiredKept+10; i++ {
		s.expire(fmt.Sprintf("session-%d", i), "expired")
	}
	_, oldest := s.expired["session-0"]
	_, newest := s.expired[fmt.Sprintf("session-%d", expiredKept+9)]
	n := len(s.expired)
	s.mu.Unlock()
	if n != expiredKept || oldest || !newest {
		t.Fatalf("tombstones: %d oldest=%v newest=%v", n, oldest, newest)
	}
}
