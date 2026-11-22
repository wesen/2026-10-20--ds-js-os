package tracerepl

import (
	"context"
	"sort"
	"time"

	"github.com/go-go-golems/go-go-goja/pkg/replsession"
)

const (
	// DefaultIdle unloads sessions nobody has used for this long.
	DefaultIdle = 2 * time.Hour
	// expiredKept bounds how many expired session IDs keep their explanation.
	expiredKept = 256
)

// WithIdle sets how long an unused session lives; 0 keeps sessions until
// they are closed. A session that runs or queues a cell or job is never idle.
func WithIdle(d time.Duration) Option {
	return func(s *Service) {
		if d >= 0 {
			s.idle = d
		}
	}
}

// SessionView is one entry of GET /sessions.
type SessionView struct {
	ID          string    `json:"id"`
	Created     time.Time `json:"created"`
	LastUsed    time.Time `json:"lastUsed"`
	IdleSeconds float64   `json:"idleSeconds"`
	Cells       int       `json:"cells"`
	Jobs        int       `json:"jobs"`
	ActiveJob   string    `json:"activeJob,omitempty"`
	Busy        bool      `json:"busy"`
}

// ExpiredError reports a session the service unloaded because it was idle.
type ExpiredError struct{ ID, Reason string }

func (e *ExpiredError) Error() string {
	return "session " + e.ID + " " + e.Reason + "; its bindings are gone, open a new session (trace-repl open)"
}
func (e *ExpiredError) Unwrap() error { return replsession.ErrSessionNotFound }

// Sessions lists the open sessions, oldest first.
func (s *Service) Sessions() []SessionView {
	now := time.Now().UTC()
	s.mu.Lock()
	out := make([]SessionView, 0, len(s.live))
	for id, e := range s.live {
		v := SessionView{ID: id, Created: e.created, LastUsed: e.lastUsed, IdleSeconds: now.Sub(e.lastUsed).Seconds(),
			Cells: e.cells, Jobs: e.jobCount, Busy: e.busy > 0}
		if e.active != nil {
			v.ActiveJob = e.active.id
		}
		if v.Busy {
			v.IdleSeconds = 0
		}
		out = append(out, v)
	}
	s.mu.Unlock()
	sort.Slice(out, func(i, j int) bool { return out[i].Created.Before(out[j].Created) })
	return out
}

// SessionCount is the number of open sessions.
func (s *Service) SessionCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.live)
}

// Idle is the configured idle lifetime (0: never expire).
func (s *Service) Idle() time.Duration { return s.idle }

// reap runs until the service lifetime ends, unloading idle sessions.
func (s *Service) reap() {
	defer s.wg.Done()
	period := s.idle / 4
	if period > time.Minute {
		period = time.Minute
	}
	if period < 10*time.Millisecond {
		period = 10 * time.Millisecond
	}
	ticker := time.NewTicker(period)
	defer ticker.Stop()
	for {
		select {
		case <-s.lifetime.Done():
			return
		case <-s.closing:
			return
		case <-ticker.C:
			s.reapIdle(time.Now().UTC())
		}
	}
}

// reapIdle unloads every session unused for longer than the idle lifetime.
// The decision and the removal from the registry happen under one lock, so a
// cell that claims the session first keeps it, and one that comes later is
// told the session expired.
func (s *Service) reapIdle(now time.Time) []string {
	var victims []string
	s.mu.Lock()
	for id, e := range s.live {
		if e.busy == 0 && e.active == nil && now.Sub(e.lastUsed) > s.idle {
			victims = append(victims, id)
			delete(s.live, id)
			s.expire(id, "expired after "+s.idle.String()+" idle")
		}
	}
	s.mu.Unlock()
	for _, id := range victims {
		_ = s.sessions.UnloadSession(context.Background(), id)
	}
	return victims
}

// expire records why a session disappeared; the caller holds s.mu.
func (s *Service) expire(id, reason string) {
	s.expired[id] = reason
	s.expiredOrder = append(s.expiredOrder, id)
	if len(s.expiredOrder) > expiredKept {
		delete(s.expired, s.expiredOrder[0])
		s.expiredOrder = s.expiredOrder[1:]
	}
}
