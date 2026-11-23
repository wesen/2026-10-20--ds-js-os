package tracerepl

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/rs/zerolog"
)

func waitJob(t *testing.T, s *Service, id, job string) JobView {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		v, err := s.Job(id, job)
		if err != nil {
			t.Fatal(err)
		}
		if v.State != JobQueued && v.State != JobRunning {
			return v
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("job did not finish")
	return JobView{}
}

func activeJob(t *testing.T, s *Service, id string) *Job {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	if e := s.live[id]; e != nil && e.active != nil {
		return e.active
	}
	t.Fatal("no active job")
	return nil
}

// A job outlives the interactive deadline, keeps the session's bindings, and
// makes the session refuse cells and other jobs at once while it holds it.
func TestJobRunsPastTheCellDeadlineAndHoldsTheSession(t *testing.T) {
	s, started := startedService(t)
	s.timeout = 100 * time.Millisecond
	id := newSession(t, s)
	evaluate(t, s, id, "const kept = 40")
	job, err := s.Submit(id, "markStarted(); const t0 = Date.now(); while (Date.now() - t0 < 400) {}; kept + 2", 0)
	if err != nil || job.State != JobQueued || job.TimeoutSeconds != DefaultMaxJob.Seconds() || !strings.HasPrefix(job.ID, "job-") {
		t.Fatalf("submit: %+v %v", job, err)
	}
	waitStarted(t, started)
	_, err = s.Evaluate(context.Background(), id, "1")
	var busy *BusyError
	if !errors.Is(err, ErrSessionBusy) || !errors.As(err, &busy) || busy.Job != job.ID {
		t.Fatalf("cell during job: %v", err)
	}
	if _, err := s.Submit(id, "1", 0); !errors.Is(err, ErrSessionBusy) {
		t.Fatalf("second job: %v", err)
	}
	if v, _ := s.Job(id, job.ID); v.State != JobRunning || v.Started == nil {
		t.Fatalf("running view: %+v", v)
	}
	done := waitJob(t, s, id, job.ID)
	if done.State != JobDone || done.Result == nil || string(done.Result.Value) != "42" || done.ElapsedSeconds < 0.3 || done.Finished == nil {
		t.Fatalf("done: %+v", done)
	}
	// The session is free again, and the job's top-level declaration persists.
	if r := evaluate(t, s, id, "t0 > 0"); !r.OK || string(r.Value) != "true" {
		t.Fatalf("after job: %+v", r)
	}
	if list, _ := s.Jobs(id); len(list) != 1 || list[0].Result != nil {
		t.Fatalf("list: %+v", list)
	}
	// A job's result obeys the same size limit as a cell's.
	big, _ := s.Submit(id, "'x'.repeat(600000)", 0)
	if v := waitJob(t, s, id, big.ID); v.State != JobFailed || v.Result == nil || !strings.Contains(v.Result.Error, "result exceeds") {
		t.Fatalf("size: %+v", v)
	}
}

func TestStoppingAJobInterruptsIt(t *testing.T) {
	s, started := startedService(t)
	id := newSession(t, s)
	job, err := s.Submit(id, "markStarted(); while (true) {}", 0)
	if err != nil {
		t.Fatal(err)
	}
	waitStarted(t, started)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	v, err := s.StopJob(ctx, id, job.ID)
	if err != nil || v.State != JobStopped || v.Result == nil || !strings.Contains(v.Result.Error, "job stopped by request") {
		t.Fatalf("stop: %+v %v", v, err)
	}
	if r := evaluate(t, s, id, "6 * 7"); string(r.Value) != "42" {
		t.Fatalf("stale interrupt after stop: %+v", r)
	}
	// Stopping a finished job reports it unchanged.
	if again, err := s.StopJob(ctx, id, job.ID); err != nil || again.State != JobStopped {
		t.Fatalf("stop twice: %+v %v", again, err)
	}
	if _, err := s.Job(id, "job-missing"); !errors.Is(err, ErrJobNotFound) {
		t.Fatalf("unknown job: %v", err)
	}
}

func TestJobDeadlineIsCappedByTheService(t *testing.T) {
	s, err := New(context.Background(), func(vm *goja.Runtime) error { return nil }, zerolog.Nop(), WithMaxJob(200*time.Millisecond))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(context.Background())
	id := newSession(t, s)
	job, err := s.Submit(id, "while (true) {}", time.Hour)
	if err != nil || job.TimeoutSeconds != 0.2 {
		t.Fatalf("cap: %+v %v", job, err)
	}
	v := waitJob(t, s, id, job.ID)
	if v.State != JobFailed || v.Result == nil || !strings.Contains(v.Result.Error, "job stopped at its deadline (200ms") {
		t.Fatalf("deadline: %+v", v)
	}
	if s.Limits().JobSeconds != 0.2 {
		t.Fatal(s.Limits())
	}
}

func TestClosingTheSessionStopsItsJob(t *testing.T) {
	s, started := startedService(t)
	id := newSession(t, s)
	if _, err := s.Submit(id, "markStarted(); while (true) {}", 0); err != nil {
		t.Fatal(err)
	}
	waitStarted(t, started)
	job := activeJob(t, s, id)
	if err := s.Release(context.Background(), id); err != nil {
		t.Fatal(err)
	}
	select {
	case <-job.done:
	case <-time.After(5 * time.Second):
		t.Fatal("job outlived its session")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if job.result == nil || !strings.Contains(job.result.Error, "job stopped because its session was closed") {
		t.Fatalf("closed session: %+v %+v", job, job.result)
	}
}

func TestJobHTTPProtocol(t *testing.T) {
	s, started := startedService(t)
	h := Handler(s, zerolog.Nop())
	call := func(method, path, body string) (int, map[string]any) {
		r := httptest.NewRequest(method, "http://127.0.0.1:3791"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}
	_, opened := call("POST", "/sessions", "")
	path := "/sessions/" + opened["id"].(string)
	for body, status := range map[string]int{
		`{"source":"1","timeoutSeconds":0}`: 400, `{"source":"1","extra":1}`: 400, `{"timeoutSeconds":5}`: 400,
	} {
		if code, out := call("POST", path+"/jobs", body); code != status {
			t.Fatalf("%s: %d %v", body, code, out)
		}
	}
	code, job := call("POST", path+"/jobs", `{"source":"markStarted(); while (true) {}","timeoutSeconds":30}`)
	if code != http.StatusAccepted || job["state"] != JobQueued || job["timeoutSeconds"] != 30.0 {
		t.Fatalf("submit: %d %v", code, job)
	}
	waitStarted(t, started)
	jobPath := path + "/jobs/" + job["job"].(string)
	if code, out := call("POST", path+"/eval", `{"source":"1"}`); code != http.StatusConflict || out["job"] != job["job"] || !strings.Contains(out["error"].(string), "busy with job") {
		t.Fatalf("eval during job: %d %v", code, out)
	}
	if code, out := call("GET", jobPath, ""); code != 200 || out["state"] != JobRunning {
		t.Fatalf("get: %d %v", code, out)
	}
	if code, out := call("DELETE", jobPath, ""); code != 200 || out["state"] != JobStopped {
		t.Fatalf("delete: %d %v", code, out)
	}
	if code, out := call("POST", path+"/eval", `{"source":"2+2"}`); code != 200 || out["value"] != 4.0 {
		t.Fatalf("eval after stop: %d %v", code, out)
	}
	if code, _ := call("GET", path+"/jobs/job-0000", ""); code != http.StatusNotFound {
		t.Fatalf("unknown job: %d", code)
	}
	if code, _ := call("POST", "/sessions/session-missing/jobs", `{"source":"1"}`); code != http.StatusNotFound {
		t.Fatalf("unknown session: %d", code)
	}
	r := httptest.NewRequest("GET", "http://127.0.0.1:3791"+path+"/jobs", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	var list []JobView
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || len(list) != 1 || list[0].State != JobStopped {
		t.Fatalf("list: %s %v", w.Body, err)
	}
}
