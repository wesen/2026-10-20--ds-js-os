package tracerepl

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/go-go-golems/go-go-goja/pkg/replsession"
	"github.com/pkg/errors"
	"github.com/rs/zerolog"
)

const MaxSessions = 32

// routes is what GET / lists, so a client that finds a port can discover the protocol.
var routes = []string{
	"GET /info: inventory of mounted inputs, sessions and limits",
	"POST /sessions: open a session",
	`POST /sessions/{id}/eval: evaluate {"source": "..."} within the cell deadline`,
	`POST /sessions/{id}/jobs: start {"source": "...", "timeoutSeconds": N} in the background (202)`,
	"GET /sessions/{id}/jobs: list jobs; GET /sessions/{id}/jobs/{job}: state and result",
	"DELETE /sessions/{id}/jobs/{job}: stop a job",
	"DELETE /sessions/{id}: close a session",
}

// Handler serves the in-process operator API. Browser-origin requests are not
// part of the protocol. Test the Host header as well as the listener address.
func Handler(s *Service, logger zerolog.Logger) http.Handler {
	mux := http.NewServeMux()
	var mu sync.Mutex
	live := make(map[string]struct{})
	mux.HandleFunc("POST /sessions", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if len(live) >= MaxSessions {
			// Name only paths a client may take: it can close sessions it opened.
			response(w, http.StatusTooManyRequests, Result{Error: fmt.Sprintf("session limit (%d) reached; close a session you opened (trace-repl close --session ID) or ask the operator to restart the service", MaxSessions)})
			return
		}
		id, err := s.Open(r.Context())
		if err != nil {
			failure(w, err)
			return
		}
		live[id] = struct{}{}
		logger.Debug().Str("id", id).Msg("opened trace session")
		response(w, http.StatusCreated, map[string]string{"id": id})
	})
	mux.HandleFunc("POST /sessions/{id}/eval", func(w http.ResponseWriter, r *http.Request) {
		body, ok := decodeSource(w, r, false)
		if !ok {
			return
		}
		result, err := s.Evaluate(r.Context(), r.PathValue("id"), body.Source)
		if err != nil {
			failure(w, err)
			return
		}
		logger.Debug().Bool("ok", result.OK).Int("sourceBytes", len(body.Source)).Msg("evaluated trace cell")
		response(w, http.StatusOK, result)
	})
	mux.HandleFunc("POST /sessions/{id}/jobs", func(w http.ResponseWriter, r *http.Request) {
		body, ok := decodeSource(w, r, true)
		if !ok {
			return
		}
		job, err := s.Submit(r.PathValue("id"), body.Source, time.Duration(body.TimeoutSeconds*float64(time.Second)))
		if err != nil {
			failure(w, err)
			return
		}
		logger.Debug().Str("job", job.ID).Float64("timeoutSeconds", job.TimeoutSeconds).Int("sourceBytes", len(body.Source)).Msg("submitted trace job")
		response(w, http.StatusAccepted, job)
	})
	mux.HandleFunc("GET /sessions/{id}/jobs", func(w http.ResponseWriter, r *http.Request) {
		jobs, err := s.Jobs(r.PathValue("id"))
		if err != nil {
			failure(w, err)
			return
		}
		response(w, http.StatusOK, jobs)
	})
	mux.HandleFunc("GET /sessions/{id}/jobs/{job}", func(w http.ResponseWriter, r *http.Request) {
		job, err := s.Job(r.PathValue("id"), r.PathValue("job"))
		if err != nil {
			failure(w, err)
			return
		}
		response(w, http.StatusOK, job)
	})
	mux.HandleFunc("DELETE /sessions/{id}/jobs/{job}", func(w http.ResponseWriter, r *http.Request) {
		// The interrupt takes effect at the VM's next instruction; wait briefly
		// so the response usually reports the stopped job.
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		job, err := s.StopJob(ctx, r.PathValue("id"), r.PathValue("job"))
		if err != nil {
			failure(w, err)
			return
		}
		response(w, http.StatusOK, job)
	})
	mux.HandleFunc("GET /info", func(w http.ResponseWriter, r *http.Request) {
		info := s.inventory()
		mu.Lock()
		info["sessions"] = map[string]int{"open": len(live), "max": MaxSessions}
		mu.Unlock()
		response(w, http.StatusOK, info)
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		response(w, http.StatusOK, map[string]any{"service": "trace-repl", "routes": routes})
	})
	mux.HandleFunc("DELETE /sessions/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		mu.Lock()
		defer mu.Unlock()
		if err := s.Release(r.Context(), id); err != nil {
			// A session that no longer exists must not keep holding capacity.
			if errors.Is(err, replsession.ErrSessionNotFound) || errors.Is(err, replsession.ErrSessionClosed) {
				delete(live, id)
			}
			failure(w, err)
			return
		}
		delete(live, id)
		w.WriteHeader(http.StatusNoContent)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Header.Get("Origin") != "" || !localAddress(r.Host) {
			response(w, http.StatusForbidden, Result{Error: "the trace service accepts local CLI requests"})
			return
		}
		mux.ServeHTTP(w, r)
	})
}

type sourceBody struct {
	Source         string
	TimeoutSeconds float64
}

// decodeSource reads exactly one JSON object with a source string and, for
// jobs, an optional timeoutSeconds. It writes the error response itself.
func decodeSource(w http.ResponseWriter, r *http.Request, job bool) (sourceBody, bool) {
	if media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || media != "application/json" {
		response(w, http.StatusUnsupportedMediaType, Result{Error: "send application/json with a source string"})
		return sourceBody{}, false
	}
	// A JS string in JSON can use six wire bytes per source byte.
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 6*MaxSourceBytes+1024))
	dec.DisallowUnknownFields()
	var cell struct {
		Source *string `json:"source"`
	}
	var batch struct {
		Source         *string  `json:"source"`
		TimeoutSeconds *float64 `json:"timeoutSeconds"`
	}
	var target any = &cell
	if job {
		target = &batch
	}
	if err := dec.Decode(target); err != nil {
		var limit *http.MaxBytesError
		status := http.StatusBadRequest
		if errors.As(err, &limit) {
			status = http.StatusRequestEntityTooLarge
		}
		response(w, status, Result{Error: err.Error()})
		return sourceBody{}, false
	}
	source := cell.Source
	var timeout float64
	if job {
		source = batch.Source
		if batch.TimeoutSeconds != nil {
			if *batch.TimeoutSeconds <= 0 {
				response(w, http.StatusBadRequest, Result{Error: "timeoutSeconds must be positive; omit it for the service maximum"})
				return sourceBody{}, false
			}
			timeout = *batch.TimeoutSeconds
		}
	}
	if source == nil || dec.Decode(&struct{}{}) != io.EOF {
		response(w, http.StatusBadRequest, Result{Error: "send exactly one object with a source string"})
		return sourceBody{}, false
	}
	if len(*source) > MaxSourceBytes {
		response(w, http.StatusRequestEntityTooLarge, Result{Error: "source exceeds 64 KiB"})
		return sourceBody{}, false
	}
	return sourceBody{Source: *source, TimeoutSeconds: timeout}, true
}

func localAddress(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	return host == "localhost" || net.ParseIP(host).IsLoopback()
}

// ValidateAddress is shared by the listener and CLI client.
func ValidateAddress(addr string) error {
	if !localAddress(addr) {
		return errors.New("use a loopback host and port, for example 127.0.0.1:3791")
	}
	return nil
}

func failure(w http.ResponseWriter, err error) {
	var busy *BusyError
	if errors.As(err, &busy) {
		response(w, http.StatusConflict, map[string]any{"ok": false, "error": err.Error(), "job": busy.Job})
		return
	}
	status := http.StatusInternalServerError
	if errors.Is(err, ErrJobNotFound) {
		status = http.StatusNotFound
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		status = http.StatusRequestTimeout
	}
	if errors.Is(err, replsession.ErrSessionNotFound) {
		status = http.StatusNotFound
	}
	if errors.Is(err, replsession.ErrSessionClosing) || errors.Is(err, replsession.ErrSessionClosed) {
		status = http.StatusGone
	}
	if errors.Is(err, replsession.ErrServiceClosing) || errors.Is(err, replsession.ErrServiceClosed) {
		status = http.StatusServiceUnavailable
	}
	response(w, status, Result{Error: err.Error()})
}

func response(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
