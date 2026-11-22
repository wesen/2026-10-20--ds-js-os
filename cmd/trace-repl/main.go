// Command trace-repl runs a local, in-memory compiler evidence workbench.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"syscall"
	"time"

	"github.com/dop251/goja"
	"github.com/go-go-golems/glazed/pkg/cli"
	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/go-go-golems/glazed/pkg/cmds/schema"
	"github.com/go-go-golems/glazed/pkg/cmds/values"
	"github.com/go-go-golems/picocalc-trace/pkg/traceapi"
	"github.com/go-go-golems/picocalc-trace/pkg/tracearchive"
	"github.com/go-go-golems/picocalc-trace/pkg/tracehardware"
	"github.com/go-go-golems/picocalc-trace/pkg/tracerepl"
	"github.com/go-go-golems/picocalc-trace/pkg/tracesimd"
	"github.com/pkg/errors"
	"github.com/rs/zerolog"
	"github.com/spf13/cobra"
	"golang.org/x/sync/errgroup"
)

const defaultAddr = "127.0.0.1:3791"

type settings struct {
	Addr        string `glazed:"addr"`
	Archive     string `glazed:"archive"`
	DeviceStudy string `glazed:"device-study"`
	SIMDStudy   string `glazed:"simd-study"`
	Session     string `glazed:"session"`
	Code        string `glazed:"code"`
	LogLevel    string `glazed:"log-level"`
}

type command struct {
	*cmds.CommandDescription
	action func(context.Context, settings) error
}

var _ cmds.BareCommand = (*command)(nil)

func (c *command) Run(ctx context.Context, vals *values.Values) error {
	var cfg settings
	if err := vals.DecodeSectionInto(schema.DefaultSlug, &cfg); err != nil {
		return err
	}
	if err := tracerepl.ValidateAddress(cfg.Addr); err != nil {
		return err
	}
	return c.action(ctx, cfg)
}

func root() (*cobra.Command, error) {
	root := &cobra.Command{
		Use:           "trace-repl",
		Short:         "Explore compiler traces in persistent JavaScript sessions",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	addr := fields.New("addr", fields.TypeString, fields.WithDefault(defaultAddr), fields.WithHelp("Loopback host:port of the trace service"))
	session := fields.New("session", fields.TypeString, fields.WithRequired(true), fields.WithHelp("ID printed by open"))
	archive := fields.New("archive", fields.TypeString, fields.WithRequired(true), fields.WithHelp("Path to the PICOCALC-ROW-IR ticket directory"))
	device := fields.New("device-study", fields.TypeString, fields.WithHelp("Optional PICOCALC-PIE-LOOPS ticket directory containing measured physical trials"))
	simd := fields.New("simd-study", fields.TypeString, fields.WithHelp("Optional p4-simd-evidence-v1 JSON file of SIMD decisions, RV32 images and per-PC traces"))
	level := fields.New("log-level", fields.TypeString, fields.WithDefault("info"), fields.WithHelp("Server log level (debug, info, warn, error)"))
	code := fields.New("code", fields.TypeString, fields.WithHelp("JavaScript cell; omit to read stdin"))
	defs := []*command{
		{
			cmds.NewCommandDescription("serve", cmds.WithShort("Open the captured archive and serve in-memory sessions"), cmds.WithFlags(addr, archive, device, simd, level)),
			serve,
		},
		{
			cmds.NewCommandDescription("open", cmds.WithShort("Allocate a session and print its ID"), cmds.WithFlags(addr)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "open") },
		},
		{
			cmds.NewCommandDescription("eval", cmds.WithShort("Evaluate JavaScript from --code or stdin in an open session"), cmds.WithFlags(addr, session, code)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "eval") },
		},
		{
			cmds.NewCommandDescription("close", cmds.WithShort("Release a session and its JavaScript bindings"), cmds.WithFlags(addr, session)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "close") },
		},
		{
			cmds.NewCommandDescription("info", cmds.WithShort("Print what a running service mounted: archive, studies, sessions and limits"), cmds.WithFlags(addr)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "info") },
		},
	}
	for _, def := range defs {
		sub, err := cli.BuildCobraCommand(def)
		if err != nil {
			return nil, err
		}
		root.AddCommand(sub)
	}
	return root, nil
}

func serve(ctx context.Context, cfg settings) error {
	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		return err
	}
	logger := zerolog.New(os.Stderr).Level(level).With().Timestamp().Logger()
	service, err := newService(ctx, cfg, logger)
	if err != nil {
		return err
	}
	defer service.Close(context.Background())
	ln, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return errors.Wrap(err, "listen")
	}
	return serveListener(ctx, ln, service, logger)
}

// newService opens the evidence once for all sessions. It verifies every
// stream before serving, so a damaged capture fails here rather than after a
// researcher has cited one of its references, and no first query pays for
// decompression. The device study stays optional and visibly absent.
func newService(ctx context.Context, cfg settings, logger zerolog.Logger) (*tracerepl.Service, error) {
	archive, err := tracearchive.Open(cfg.Archive)
	if err != nil {
		return nil, errors.Wrap(err, "open evidence archive")
	}
	started := time.Now()
	if err := archive.Verify(); err != nil {
		return nil, errors.Wrap(err, "verify evidence archive")
	}
	stats := archive.Stats()
	logger.Info().Interface("streams", stats["streamInflations"]).Interface("bytes", stats["inflatedBytes"]).
		Dur("elapsed", time.Since(started)).Msg("verified pass-dump streams against the manifest and indexes")
	var hardware *tracehardware.Study
	if cfg.DeviceStudy != "" {
		hardware, err = tracehardware.Open(cfg.DeviceStudy)
		if err != nil {
			return nil, errors.Wrap(err, "open physical trial study")
		}
		meta := hardware.Metadata()
		logger.Info().Str("sourceSHA", meta.SourceSHA).Int("pairs", len(hardware.Rows())).Int("loads", len(hardware.Loads())).Msg("device study available")
	} else {
		logger.Info().Msg("no --device-study: hardware.* reports device timings as unavailable")
	}
	var simd *tracesimd.Study
	if cfg.SIMDStudy != "" {
		simd, err = tracesimd.Open(cfg.SIMDStudy)
		if err != nil {
			return nil, errors.Wrap(err, "open SIMD study")
		}
		logger.Info().Str("sha256", simd.SHA256()).Bool("empty", simd.Empty()).Int("decisions", len(simd.Decisions())).
			Int("traces", len(simd.Traces())).Msg("SIMD study verified")
	} else {
		logger.Info().Msg("no --simd-study: simd.* reports SIMD attribution as unavailable")
	}
	inputs := inventory{archive: archive, hardware: hardware, hardwarePath: absPath(cfg.DeviceStudy), simd: simd, simdPath: absPath(cfg.SIMDStudy)}
	return tracerepl.New(ctx, func(vm *goja.Runtime) error {
		if err := traceapi.Install(vm, archive); err != nil {
			return err
		}
		if err := traceapi.InstallHardware(vm, hardware); err != nil {
			return err
		}
		return traceapi.InstallSIMD(vm, simd)
	}, logger, tracerepl.WithInventory(inputs.describe))
}

// inventory is what GET /info reports about the service's verified inputs.
// Every field is fixed at startup, so concurrent requests only read it.
type inventory struct {
	archive      *tracearchive.Archive
	hardware     *tracehardware.Study
	hardwarePath string
	simd         *tracesimd.Study
	simdPath     string
}

func (in inventory) describe() map[string]any {
	info := map[string]any{
		"build": buildInfo(),
		"archive": map[string]any{
			"path": in.archive.Dir(), "label": in.archive.Label(), "manifestSHA256": in.archive.ManifestSHA256(),
			"streams": in.archive.Streams(),
		},
		"deviceStudy": nil,
		"simdStudy":   nil,
	}
	if in.hardware != nil {
		meta := in.hardware.Metadata()
		info["deviceStudy"] = map[string]any{"path": in.hardwarePath, "sourceSHA": meta.SourceSHA, "firmwareSHA": meta.FirmwareSHA,
			"pairs": len(in.hardware.Rows()), "loads": len(in.hardware.Loads())}
	}
	if in.simd != nil {
		info["simdStudy"] = map[string]any{"path": in.simdPath, "sha256": in.simd.SHA256(), "empty": in.simd.Empty(),
			"decisions": len(in.simd.Decisions()), "traces": len(in.simd.Traces())}
	}
	return info
}

// buildInfo reports the toolchain's VCS stamp. `go build` in a checkout
// records it; `go run` does not, and then revision is absent.
func buildInfo() map[string]any {
	out := map[string]any{"revision": nil}
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return out
	}
	out["goVersion"] = info.GoVersion
	out["module"] = info.Main.Path
	for _, setting := range info.Settings {
		switch setting.Key {
		case "vcs.revision":
			out["revision"] = setting.Value
		case "vcs.time":
			out["revisionTime"] = setting.Value
		case "vcs.modified":
			out["modified"] = setting.Value == "true"
		}
	}
	return out
}

func absPath(path string) string {
	if path == "" {
		return ""
	}
	if abs, err := filepath.Abs(path); err == nil {
		return abs
	}
	return path
}

func serveListener(ctx context.Context, ln net.Listener, service *tracerepl.Service, logger zerolog.Logger) error {
	srv := &http.Server{
		Handler:           tracerepl.Handler(service, logger),
		ReadHeaderTimeout: 4 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      25 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	logger.Info().Str("addr", ln.Addr().String()).Msg("trace REPL ready")
	group, groupCtx := errgroup.WithContext(ctx)
	group.Go(func() error {
		err := srv.Serve(ln)
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	})
	group.Go(func() error {
		<-groupCtx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(shutdown)
	})
	return group.Wait()
}

func client(ctx context.Context, cfg settings, action string) error {
	path := "http://" + cfg.Addr + "/sessions"
	method := http.MethodPost
	var input io.Reader
	if action == "eval" {
		source := cfg.Code
		if source == "" {
			b, err := io.ReadAll(io.LimitReader(os.Stdin, tracerepl.MaxSourceBytes+1))
			if err != nil {
				return err
			}
			source = string(b)
		}
		if len(source) > tracerepl.MaxSourceBytes {
			return errors.New("source exceeds 64 KiB")
		}
		body, err := json.Marshal(map[string]string{"source": source})
		if err != nil {
			return err
		}
		input = bytes.NewReader(body)
		path += "/" + url.PathEscape(cfg.Session) + "/eval"
	} else if action == "close" {
		method = http.MethodDelete
		path += "/" + url.PathEscape(cfg.Session)
	} else if action == "info" {
		method = http.MethodGet
		path = "http://" + cfg.Addr + "/info"
	}
	req, err := http.NewRequestWithContext(ctx, method, path, input)
	if err != nil {
		return err
	}
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	c := http.Client{Timeout: 24 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := c.Do(req)
	if err != nil {
		return errors.Wrap(err, "contact the running trace-repl serve process")
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		var result tracerepl.Result
		_ = json.NewDecoder(resp.Body).Decode(&result)
		return errors.Errorf("%s: %s", resp.Status, result.Error)
	}
	switch action {
	case "open":
		var session struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
			return err
		}
		fmt.Println(session.ID)
	case "eval":
		var result tracerepl.Result
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return err
		}
		if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
			return err
		}
		if !result.OK {
			return errors.New("cell failed; see the error in its JSON response")
		}
	case "info":
		var info json.RawMessage
		if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
			return err
		}
		var pretty bytes.Buffer
		if err := json.Indent(&pretty, info, "", "  "); err != nil {
			return err
		}
		fmt.Println(pretty.String())
	}
	return nil
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	root, err := root()
	if err == nil {
		err = root.ExecuteContext(ctx)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
