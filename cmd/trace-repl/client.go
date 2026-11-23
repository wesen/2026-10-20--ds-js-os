package main

// The client commands: each sends one request to a running service and prints the result.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/go-go-golems/picocalc-trace/pkg/tracerepl"
	"github.com/pkg/errors"
)

var httpClient = http.Client{Timeout: 24 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}

// call sends one request to the service and decodes a successful response into out.
func call(ctx context.Context, cfg settings, method, path string, body, out any) error {
	var input io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		input = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, "http://"+cfg.Addr+path, input)
	if err != nil {
		return err
	}
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return errors.Wrap(err, "contact the running trace-repl serve process")
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		var failure struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&failure)
		return errors.Errorf("%s: %s", resp.Status, failure.Error)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func readSource(cfg settings) (string, error) {
	source := cfg.Code
	if source == "" {
		b, err := io.ReadAll(io.LimitReader(os.Stdin, tracerepl.MaxSourceBytes+1))
		if err != nil {
			return "", err
		}
		source = string(b)
	}
	if len(source) > tracerepl.MaxSourceBytes {
		return "", errors.New("source exceeds 64 KiB")
	}
	return source, nil
}

// withArgs adds args to a request body only when there are some, so this
// client still talks to services that predate the args field.
func withArgs(body map[string]any, args json.RawMessage) map[string]any {
	if args != nil {
		body["args"] = args
	}
	return body
}

var argName = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*$`)

// cellArgs builds the args object of one eval from --args-file and --arg.
// Each --arg replaces the file's field of the same name; naming one twice is
// an error, because it is almost always a mistake in a script.
func cellArgs(cfg settings) (json.RawMessage, error) {
	fields := map[string]json.RawMessage{}
	if cfg.ArgsFile != "" {
		data, err := os.ReadFile(cfg.ArgsFile)
		if err != nil {
			return nil, errors.Wrap(err, "--args-file")
		}
		if err := tracerepl.ValidateArgs(data); err != nil {
			return nil, errors.Wrapf(err, "--args-file %s", cfg.ArgsFile)
		}
		if err := json.Unmarshal(data, &fields); err != nil || fields == nil {
			return nil, errors.Errorf("--args-file %s: give one JSON object", cfg.ArgsFile)
		}
	}
	seen := map[string]bool{}
	for _, spec := range cfg.Args {
		name, value, ok := strings.Cut(spec, "=")
		if !ok || !argName.MatchString(name) || name == "__proto__" {
			return nil, errors.Errorf("--arg %q: use NAME=JSON with a JavaScript identifier as NAME", spec)
		}
		if seen[name] {
			return nil, errors.Errorf("--arg %s given twice", name)
		}
		seen[name] = true
		if !json.Valid([]byte(value)) {
			return nil, errors.Errorf("--arg %s: %q is not JSON; quote strings, for example --arg %s='\"%s\"'", name, value, name, value)
		}
		fields[name] = json.RawMessage(value)
	}
	if len(fields) == 0 && cfg.ArgsFile == "" {
		return nil, nil
	}
	data, err := json.Marshal(fields)
	if err != nil {
		return nil, err
	}
	return data, tracerepl.ValidateArgs(data)
}

func printResult(result tracerepl.Result, what string) error {
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		return err
	}
	if !result.OK {
		return errors.Errorf("%s failed; see the error in its JSON response", what)
	}
	return nil
}

func printJSON(v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}

func client(ctx context.Context, cfg settings, action string) error {
	sessionPath := "/sessions/" + url.PathEscape(cfg.Session)
	switch action {
	case "open":
		var session struct {
			ID string `json:"id"`
		}
		if err := call(ctx, cfg, http.MethodPost, "/sessions", nil, &session); err != nil {
			return err
		}
		fmt.Println(session.ID)
	case "close":
		return call(ctx, cfg, http.MethodDelete, sessionPath, nil, nil)
	case "sessions":
		var sessions []tracerepl.SessionView
		if err := call(ctx, cfg, http.MethodGet, "/sessions", nil, &sessions); err != nil {
			return err
		}
		return printJSON(sessions)
	case "results":
		path := "/results"
		if cfg.Name != "" {
			path += "/" + url.PathEscape(cfg.Name)
		}
		var out json.RawMessage
		if err := call(ctx, cfg, http.MethodGet, path, nil, &out); err != nil {
			return err
		}
		var pretty bytes.Buffer
		if err := json.Indent(&pretty, out, "", "  "); err != nil {
			return err
		}
		fmt.Println(pretty.String())
	case "info":
		var info json.RawMessage
		if err := call(ctx, cfg, http.MethodGet, "/info", nil, &info); err != nil {
			return err
		}
		var pretty bytes.Buffer
		if err := json.Indent(&pretty, info, "", "  "); err != nil {
			return err
		}
		fmt.Println(pretty.String())
	case "eval":
		source, err := readSource(cfg)
		if err != nil {
			return err
		}
		args, err := cellArgs(cfg)
		if err != nil {
			return err
		}
		if !cfg.Job {
			var result tracerepl.Result
			if err := call(ctx, cfg, http.MethodPost, sessionPath+"/eval", withArgs(map[string]any{"source": source}, args), &result); err != nil {
				return err
			}
			return printResult(result, "cell")
		}
		body := withArgs(map[string]any{"source": source}, args)
		if cfg.JobTimeout > 0 {
			body["timeoutSeconds"] = cfg.JobTimeout
		}
		var job tracerepl.JobView
		if err := call(ctx, cfg, http.MethodPost, sessionPath+"/jobs", body, &job); err != nil {
			return err
		}
		if cfg.Detach {
			fmt.Println(job.ID)
			return nil
		}
		return waitForJob(ctx, cfg, job.ID)
	case "job":
		jobPath := sessionPath + "/jobs/" + url.PathEscape(cfg.JobID)
		var job tracerepl.JobView
		method := http.MethodGet
		if cfg.Stop {
			method = http.MethodDelete
		}
		if err := call(ctx, cfg, method, jobPath, nil, &job); err != nil {
			return err
		}
		return printJSON(job)
	}
	return nil
}

// waitForJob polls until the job finishes and prints its result like a cell's.
// Interrupting the client (Ctrl-C) stops the job on the service as well.
func waitForJob(ctx context.Context, cfg settings, id string) error {
	jobPath := "/sessions/" + url.PathEscape(cfg.Session) + "/jobs/" + url.PathEscape(id)
	delay := 100 * time.Millisecond
	for {
		var job tracerepl.JobView
		if err := call(ctx, cfg, http.MethodGet, jobPath, nil, &job); err != nil {
			if ctx.Err() != nil {
				stopCtx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
				defer cancel()
				_ = call(stopCtx, cfg, http.MethodDelete, jobPath, nil, &job)
				return errors.Errorf("interrupted; stopped job %s (state %s)", id, job.State)
			}
			return err
		}
		if job.State != tracerepl.JobQueued && job.State != tracerepl.JobRunning {
			if job.Result == nil {
				return errors.Errorf("job %s %s before it ran: %s", id, job.State, job.Error)
			}
			return printResult(*job.Result, "job")
		}
		select {
		case <-ctx.Done():
			stopCtx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			_ = call(stopCtx, cfg, http.MethodDelete, jobPath, nil, &job)
			return errors.Errorf("interrupted; stopped job %s (state %s)", id, job.State)
		case <-time.After(delay):
		}
		if delay < time.Second {
			delay *= 2
		}
	}
}
