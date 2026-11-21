package tracerepl

import (
	"encoding/json"
	"io"
	"mime"
	"net"
	"net/http"
	"sync"

	"github.com/go-go-golems/go-go-goja/pkg/replsession"
	"github.com/pkg/errors"
	"github.com/rs/zerolog"
)

const MaxSessions = 32

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
			response(w, http.StatusTooManyRequests, Result{Error: "session limit reached; close an unused session"})
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
		if media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || media != "application/json" {
			response(w, http.StatusUnsupportedMediaType, Result{Error: "send application/json with a source string"})
			return
		}
		// A JS string in JSON can use six wire bytes per source byte.
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 6*MaxSourceBytes+1024))
		dec.DisallowUnknownFields()
		var body struct {
			Source *string `json:"source"`
		}
		if err := dec.Decode(&body); err != nil {
			var limit *http.MaxBytesError
			status := http.StatusBadRequest
			if errors.As(err, &limit) {
				status = http.StatusRequestEntityTooLarge
			}
			response(w, status, Result{Error: err.Error()})
			return
		}
		if body.Source == nil || dec.Decode(&struct{}{}) != io.EOF {
			response(w, http.StatusBadRequest, Result{Error: "send exactly one object with a source string"})
			return
		}
		if len(*body.Source) > MaxSourceBytes {
			response(w, http.StatusRequestEntityTooLarge, Result{Error: "source exceeds 64 KiB"})
			return
		}
		result, err := s.Evaluate(r.Context(), r.PathValue("id"), *body.Source)
		if err != nil {
			failure(w, err)
			return
		}
		logger.Debug().Bool("ok", result.OK).Int("sourceBytes", len(*body.Source)).Msg("evaluated trace cell")
		response(w, http.StatusOK, result)
	})
	mux.HandleFunc("DELETE /sessions/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		mu.Lock()
		defer mu.Unlock()
		if err := s.Release(r.Context(), id); err != nil {
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
	status := http.StatusInternalServerError
	if errors.Is(err, replsession.ErrSessionNotFound) {
		status = http.StatusNotFound
	}
	if errors.Is(err, replsession.ErrSessionClosing) || errors.Is(err, replsession.ErrSessionClosed) {
		status = http.StatusGone
	}
	response(w, status, Result{Error: err.Error()})
}

func response(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
