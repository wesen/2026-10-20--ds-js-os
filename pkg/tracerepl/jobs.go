package tracerepl

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/go-go-golems/go-go-goja/pkg/replsession"
	"github.com/pkg/errors"
)

const (
	// DefaultMaxJob caps a job's deadline unless the service sets another.
	DefaultMaxJob = 10 * time.Minute
	// jobsKept bounds the finished jobs a session remembers.
	jobsKept = 16
)

// ErrSessionBusy is returned for a cell or job sent to a session that is
// already running or queueing a job.
var ErrSessionBusy = errors.New("session is busy with a job")

// ErrJobNotFound is returned for a job ID the session does not know.
var ErrJobNotFound = errors.New("job not found")

// BusyError names the job that holds a session.
type BusyError struct{ Job string }

func (e *BusyError) Error() string {
	return fmt.Sprintf("session is busy with job %s; poll GET /sessions/{id}/jobs/%s, or stop it with DELETE (trace-repl job --stop)", e.Job, e.Job)
}
func (e *BusyError) Unwrap() error { return ErrSessionBusy }

// Job states. A job is queued until it holds the session gate.
const (
	JobQueued  = "queued"
	JobRunning = "running"
	JobDone    = "done"
	JobFailed  = "failed"
	JobStopped = "stopped"
)

// Job is one background evaluation. All fields are guarded by Service.mu.
type Job struct {
	id        string
	session   string
	state     string
	submitted time.Time
	started   time.Time
	finished  time.Time
	timeout   time.Duration
	result    *Result
	err       string
	cancel    context.CancelCauseFunc
	done      chan struct{}
}

// JobView is the JSON form of a job.
type JobView struct {
	ID             string     `json:"job"`
	Session        string     `json:"session"`
	State          string     `json:"state"`
	Submitted      time.Time  `json:"submitted"`
	Started        *time.Time `json:"started,omitempty"`
	Finished       *time.Time `json:"finished,omitempty"`
	TimeoutSeconds float64    `json:"timeoutSeconds"`
	ElapsedSeconds float64    `json:"elapsedSeconds"`
	Result         *Result    `json:"result,omitempty"`
	Error          string     `json:"error,omitempty"`
}

func (j *Job) view(withResult bool) JobView {
	v := JobView{ID: j.id, Session: j.session, State: j.state, Submitted: j.submitted, TimeoutSeconds: j.timeout.Seconds(), Error: j.err}
	if !j.started.IsZero() {
		started := j.started
		v.Started = &started
		end := time.Now()
		if !j.finished.IsZero() {
			end = j.finished
		}
		v.ElapsedSeconds = end.Sub(j.started).Seconds()
	}
	if !j.finished.IsZero() {
		finished := j.finished
		v.Finished = &finished
	}
	if withResult {
		v.Result = j.result
	}
	return v
}

// sessionEntry is what the service remembers about a session it opened.
type sessionEntry struct {
	created  time.Time
	lastUsed time.Time
	cells    int
	jobCount int
	jobs     []*Job // newest last, at most jobsKept finished ones
	active   *Job
	busy     int // cells and jobs holding or waiting for the gate
}

func newID(prefix string) string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return prefix + hex.EncodeToString(b[:])
}

func (s *Service) register(id string) {
	now := time.Now().UTC()
	s.mu.Lock()
	s.live[id] = &sessionEntry{created: now, lastUsed: now}
	s.mu.Unlock()
}

// claim admits a cell: the session must be known and hold no job.
func (s *Service) claim(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.live[id]
	if e == nil {
		return s.missing(id)
	}
	if e.active != nil {
		return &BusyError{Job: e.active.id}
	}
	e.busy++
	e.lastUsed = time.Now().UTC()
	return nil
}

// touch records the end of a cell (cell) or a job.
func (s *Service) touch(id string, cell bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if e := s.live[id]; e != nil {
		e.busy--
		e.lastUsed = time.Now().UTC()
		if cell {
			e.cells++
		}
	}
}

// missing explains an unknown session ID; the caller holds s.mu.
func (s *Service) missing(id string) error {
	if reason, ok := s.expired[id]; ok {
		return &ExpiredError{ID: id, Reason: reason}
	}
	return errors.Wrapf(replsession.ErrSessionNotFound, "session %s", id)
}

// Submit starts source as a background job in the session and returns at
// once. timeout <= 0 means the service maximum; a longer one is capped to it.
func (s *Service) Submit(id, source string, timeout time.Duration) (JobView, error) {
	if len(source) > MaxSourceBytes {
		return JobView{}, errors.Errorf("source exceeds %d bytes", MaxSourceBytes)
	}
	if timeout <= 0 || timeout > s.maxJob {
		timeout = s.maxJob
	}
	s.mu.Lock()
	e := s.live[id]
	if e == nil {
		s.mu.Unlock()
		return JobView{}, s.missing(id)
	}
	if e.active != nil {
		s.mu.Unlock()
		return JobView{}, &BusyError{Job: e.active.id}
	}
	ctx, cancel := context.WithCancelCause(s.lifetime)
	job := &Job{id: newID("job-"), session: id, state: JobQueued, submitted: time.Now().UTC(), timeout: timeout, cancel: cancel, done: make(chan struct{})}
	e.active = job
	e.busy++
	e.jobCount++
	e.lastUsed = job.submitted
	e.jobs = append(e.jobs, job)
	if len(e.jobs) > jobsKept+1 {
		e.jobs = e.jobs[len(e.jobs)-jobsKept-1:]
	}
	view := job.view(false)
	s.mu.Unlock()

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer close(job.done)
		defer cancel(nil)
		runCtx, stop := context.WithTimeout(ctx, timeout)
		defer stop()
		result, err := s.run(runCtx, id, source, "job", timeout, func() {
			s.mu.Lock()
			job.state, job.started = JobRunning, time.Now().UTC()
			s.mu.Unlock()
		})
		cause := context.Cause(runCtx)
		s.mu.Lock()
		defer s.mu.Unlock()
		job.finished = time.Now().UTC()
		switch {
		case err != nil:
			job.state, job.err = JobFailed, err.Error()
			if errors.Is(cause, errJobStopped) || errors.Is(err, replsession.ErrSessionClosing) || errors.Is(err, replsession.ErrSessionClosed) ||
				errors.Is(err, replsession.ErrServiceClosing) || errors.Is(err, replsession.ErrServiceClosed) {
				job.state = JobStopped
			}
		case result.OK:
			job.state = JobDone
			job.result = &result
		default:
			// A cell error, the job deadline or a stop request. Only the last is "stopped".
			job.state = JobFailed
			job.result = &result
			if errors.Is(cause, errJobStopped) {
				job.state = JobStopped
			}
		}
		if e := s.live[id]; e != nil {
			if e.active == job {
				e.active = nil
			}
			e.busy--
			e.lastUsed = job.finished
		}
	}()
	return view, nil
}

func (s *Service) findJob(id, jobID string) (*sessionEntry, *Job, error) {
	e := s.live[id]
	if e == nil {
		return nil, nil, s.missing(id)
	}
	for _, j := range e.jobs {
		if j.id == jobID {
			return e, j, nil
		}
	}
	return e, nil, errors.Wrapf(ErrJobNotFound, "job %s in session %s (a session keeps its last %d finished jobs)", jobID, id, jobsKept)
}

// Job reports one job, with its result once it has finished.
func (s *Service) Job(id, jobID string) (JobView, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, j, err := s.findJob(id, jobID)
	if err != nil {
		return JobView{}, err
	}
	return j.view(true), nil
}

// Jobs lists a session's jobs, oldest first, without their results.
func (s *Service) Jobs(id string) ([]JobView, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.live[id]
	if e == nil {
		return nil, s.missing(id)
	}
	out := make([]JobView, 0, len(e.jobs))
	for _, j := range e.jobs {
		out = append(out, j.view(false))
	}
	return out, nil
}

// StopJob interrupts a queued or running job and waits for it to finish, at
// most until ctx ends. Stopping a finished job reports it unchanged.
func (s *Service) StopJob(ctx context.Context, id, jobID string) (JobView, error) {
	s.mu.Lock()
	_, j, err := s.findJob(id, jobID)
	if err != nil {
		s.mu.Unlock()
		return JobView{}, err
	}
	j.cancel(errJobStopped)
	done := j.done
	s.mu.Unlock()
	select {
	case <-done:
	case <-ctx.Done():
	}
	return s.Job(id, jobID)
}
