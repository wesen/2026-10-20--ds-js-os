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
	"regexp"
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	"github.com/dop251/goja"
	"github.com/go-go-golems/glazed/pkg/cli"
	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/go-go-golems/glazed/pkg/cmds/logging"
	"github.com/go-go-golems/glazed/pkg/cmds/schema"
	"github.com/go-go-golems/glazed/pkg/cmds/values"
	"github.com/go-go-golems/glazed/pkg/help"
	help_cmd "github.com/go-go-golems/glazed/pkg/help/cmd"
	"github.com/go-go-golems/picocalc-trace/cmd/trace-repl/doc"
	"github.com/go-go-golems/picocalc-trace/pkg/traceapi"
	"github.com/go-go-golems/picocalc-trace/pkg/tracearchive"
	"github.com/go-go-golems/picocalc-trace/pkg/tracecompiler"
	"github.com/go-go-golems/picocalc-trace/pkg/tracehardware"
	"github.com/go-go-golems/picocalc-trace/pkg/tracerepl"
	"github.com/go-go-golems/picocalc-trace/pkg/tracerepo"
	"github.com/go-go-golems/picocalc-trace/pkg/traceresults"
	"github.com/go-go-golems/picocalc-trace/pkg/tracesimd"
	"github.com/pkg/errors"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"golang.org/x/sync/errgroup"
)

const defaultAddr = "127.0.0.1:3791"

type settings struct {
	Addr        string   `glazed:"addr"`
	Archive     string   `glazed:"archive"`
	DeviceStudy string   `glazed:"device-study"`
	SIMDStudy   string   `glazed:"simd-study"`
	Repo        string   `glazed:"repo"`
	Mounts      []string `glazed:"mount"`
	Session     string   `glazed:"session"`
	Code        string   `glazed:"code"`
	Job         bool     `glazed:"job"`
	JobTimeout  int      `glazed:"job-timeout"`
	Detach      bool     `glazed:"detach"`
	Args        []string // --arg, a raw cobra flag (see root)
	ArgsFile    string   `glazed:"args-file"`
	JobID       string   `glazed:"job-id"`
	Stop        bool     `glazed:"stop"`
	MaxJob      string   `glazed:"max-job"`
	Idle        string   `glazed:"idle"`
	Results     string   `glazed:"results"`
	Name        string   `glazed:"name"`
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
	var evalArgs *[]string
	root := &cobra.Command{
		Use:           "trace-repl",
		Short:         "Explore compiler traces in persistent JavaScript sessions",
		SilenceUsage:  true,
		SilenceErrors: true,
		// --log-level, --log-format, --log-file and the other logging flags are
		// root flags; serve logs through the logger they configure.
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			return logging.InitLoggerFromCobra(cmd)
		},
	}
	if err := logging.AddLoggingSectionToRootCommand(root, "trace-repl"); err != nil {
		return nil, err
	}
	helpSystem := help.NewHelpSystem()
	if err := doc.AddDocToHelpSystem(helpSystem); err != nil {
		return nil, err
	}
	if err := help_cmd.SetupCobraRootCommandE(helpSystem, root); err != nil {
		return nil, err
	}
	addr := fields.New("addr", fields.TypeString, fields.WithDefault(defaultAddr), fields.WithHelp("Loopback host:port of the trace service"))
	session := fields.New("session", fields.TypeString, fields.WithRequired(true), fields.WithHelp("ID printed by open"))
	archive := fields.New("archive", fields.TypeString, fields.WithRequired(true), fields.WithHelp("Path to the PICOCALC-ROW-IR ticket directory"))
	device := fields.New("device-study", fields.TypeString, fields.WithHelp("Optional PICOCALC-PIE-LOOPS ticket directory containing measured physical trials"))
	simd := fields.New("simd-study", fields.TypeString, fields.WithHelp("Optional p4-simd-evidence-v1 JSON file of SIMD decisions, RV32 images and per-PC traces"))
	repo := fields.New("repo", fields.TypeString, fields.WithHelp("Repository whose files repo.read/show/list and compiler.at may read (default: the git work tree containing the current directory)"))
	mount := fields.New("mount", fields.TypeStringList, fields.WithHelp("NAME=PATH: one more read-only file, digested at startup and bound as mounts.NAME; repeat for more"))
	code := fields.New("code", fields.TypeString, fields.WithHelp("JavaScript cell; omit to read stdin"))
	job := fields.New("job", fields.TypeBool, fields.WithDefault(false), fields.WithHelp("Run the code as a background job with its own deadline and wait for its result"))
	jobTimeout := fields.New("job-timeout", fields.TypeInteger, fields.WithDefault(0), fields.WithHelp("With --job: deadline in seconds (0 means the service's --max-job)"))
	detach := fields.New("detach", fields.TypeBool, fields.WithDefault(false), fields.WithHelp("With --job: print the job ID and return instead of waiting"))
	argsFile := fields.New("args-file", fields.TypeString, fields.WithHelp("JSON object file of parameters for args; --arg values replace its fields"))
	jobID := fields.New("job-id", fields.TypeString, fields.WithRequired(true), fields.WithHelp("ID printed by eval --job --detach"))
	stop := fields.New("stop", fields.TypeBool, fields.WithDefault(false), fields.WithHelp("Interrupt the job instead of reporting it"))
	idle := fields.New("idle", fields.TypeString, fields.WithDefault("2h"), fields.WithHelp("Unload sessions unused for this long (Go duration; 0 keeps them until closed)"))
	results := fields.New("results", fields.TypeString, fields.WithHelp("Directory of results.save records (default: the user cache directory's picocalc-trace-repl/results)"))
	name := fields.New("name", fields.TypeString, fields.WithHelp("Print this result's record instead of the list"))
	maxJob := fields.New("max-job", fields.TypeString, fields.WithDefault("10m"), fields.WithHelp("Longest deadline a background job may have (Go duration, e.g. 10m)"))
	defs := []*command{
		{
			cmds.NewCommandDescription("serve", cmds.WithShort("Open the captured archive and serve in-memory sessions"), cmds.WithFlags(addr, archive, device, simd, repo, mount, results, maxJob, idle)),
			serve,
		},
		{
			cmds.NewCommandDescription("open", cmds.WithShort("Allocate a session and print its ID"), cmds.WithFlags(addr)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "open") },
		},
		{
			cmds.NewCommandDescription("eval", cmds.WithShort("Evaluate JavaScript from --code or stdin in an open session (--job for work longer than the cell deadline)"),
				cmds.WithFlags(addr, session, code, job, jobTimeout, detach, argsFile)),
			func(ctx context.Context, cfg settings) error {
				if evalArgs != nil {
					cfg.Args = *evalArgs
				}
				return client(ctx, cfg, "eval")
			},
		},
		{
			cmds.NewCommandDescription("job", cmds.WithShort("Report a background job, with its result once finished, or stop it with --stop"), cmds.WithFlags(addr, session, jobID, stop)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "job") },
		},
		{
			cmds.NewCommandDescription("close", cmds.WithShort("Release a session and its JavaScript bindings"), cmds.WithFlags(addr, session)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "close") },
		},
		{
			cmds.NewCommandDescription("sessions", cmds.WithShort("List open sessions: created, last used, idle time, cells, jobs and any running job"), cmds.WithFlags(addr)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "sessions") },
		},
		{
			cmds.NewCommandDescription("results", cmds.WithShort("List the service's saved results, or print one record with --name"), cmds.WithFlags(addr, name)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "results") },
		},
		{
			cmds.NewCommandDescription("info", cmds.WithShort("Print what a running service mounted: archive, studies, sessions and limits"), cmds.WithFlags(addr)),
			func(ctx context.Context, cfg settings) error { return client(ctx, cfg, "info") },
		},
	}
	for _, def := range defs {
		sub, err := cli.BuildCobraCommand(def)
		if err == nil && def.Name == "eval" {
			// Glazed string lists are pflag StringSlices, which split and unquote
			// their values as CSV and so break JSON such as {"a": 1, "b": 2}.
			// A StringArray keeps every --arg value exactly as given.
			evalArgs = sub.Flags().StringArray("arg", nil, "NAME=JSON: one parameter, visible to the cell or job as args.NAME "+
				"(a fresh object per cell); repeat for more, e.g. --arg rev='\"worktree\"' --arg arms='{\"base\": {}}'")
		}
		if err != nil {
			return nil, err
		}
		root.AddCommand(sub)
	}
	return root, nil
}

func serve(ctx context.Context, cfg settings) error {
	logger := log.Logger
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
	repo, err := openRepo(cfg)
	if err != nil {
		return nil, err
	}
	for _, m := range repo.Mounts() {
		logger.Info().Str("name", m.Name).Str("path", m.Path).Str("sha256", m.SHA256).Int("bytes", m.Bytes).Msg("mounted read-only file")
	}
	logger.Info().Str("root", repo.Root()).Str("head", repo.Head()).Msg("repository available read-only")
	compilers := tracecompiler.New(repo)
	store, err := openResults(cfg)
	if err != nil {
		return nil, err
	}
	logger.Info().Str("dir", store.Dir()).Msg("results.save writes here")
	// A record names the commit checked out when it was saved, not at startup.
	provenance := func() map[string]any {
		head := repo.Head()
		if commit, err := repo.Resolve("HEAD"); err == nil {
			head = commit
		}
		return map[string]any{"root": repo.Root(), "head": head}
	}
	maxJob := tracerepl.DefaultMaxJob
	if cfg.MaxJob != "" {
		if maxJob, err = time.ParseDuration(cfg.MaxJob); err != nil || maxJob <= 0 {
			return nil, errors.Errorf("--max-job %q: give a positive Go duration such as 10m", cfg.MaxJob)
		}
	}
	idleFor := tracerepl.DefaultIdle
	if cfg.Idle != "" {
		if idleFor, err = time.ParseDuration(cfg.Idle); err != nil || idleFor < 0 {
			return nil, errors.Errorf("--idle %q: give a Go duration such as 2h, or 0 to keep sessions", cfg.Idle)
		}
	}
	inputs := inventory{archive: archive, hardware: hardware, hardwarePath: absPath(cfg.DeviceStudy), simd: simd, simdPath: absPath(cfg.SIMDStudy),
		repo: repo, compilers: compilers}
	return tracerepl.New(ctx, func(vm *goja.Runtime) error {
		if err := traceapi.Install(vm, archive); err != nil {
			return err
		}
		if err := traceapi.InstallRepo(vm, repo); err != nil {
			return err
		}
		if err := traceapi.InstallRV32(vm); err != nil {
			return err
		}
		if err := traceapi.InstallCompiler(vm, compilers); err != nil {
			return err
		}
		if err := traceapi.InstallHardware(vm, hardware); err != nil {
			return err
		}
		if err := traceapi.InstallSIMD(vm, simd); err != nil {
			return err
		}
		return traceapi.InstallStats(vm)
	}, logger, tracerepl.WithInventory(inputs.describe), tracerepl.WithMaxJob(maxJob), tracerepl.WithIdle(idleFor),
		tracerepl.WithResults(store, provenance))
}

// inventory is what GET /info reports about the service's verified inputs.
// Every field is fixed at startup, so concurrent requests only read it.
type inventory struct {
	archive      *tracearchive.Archive
	hardware     *tracehardware.Study
	hardwarePath string
	simd         *tracesimd.Study
	simdPath     string
	repo         *tracerepo.Repo
	compilers    *tracecompiler.Provider
}

// openResults opens --results, or the user cache directory's
// picocalc-trace-repl/results, so saving never writes into the repository.
func openResults(cfg settings) (*traceresults.Store, error) {
	dir := cfg.Results
	if dir == "" {
		cache, err := os.UserCacheDir()
		if err != nil {
			return nil, errors.Wrap(err, "no --results directory and no user cache directory")
		}
		dir = filepath.Join(cache, "picocalc-trace-repl", "results")
	}
	store, err := traceresults.Open(dir)
	return store, errors.Wrap(err, "open --results")
}

// openRepo confines file access to --repo, or to the git work tree that
// contains the current directory, and reads every --mount now.
func openRepo(cfg settings) (*tracerepo.Repo, error) {
	root := cfg.Repo
	if root == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, err
		}
		if root, err = tracerepo.Discover(cwd); err != nil {
			return nil, err
		}
	}
	mounts := map[string]string{}
	for _, spec := range cfg.Mounts {
		name, file, ok := strings.Cut(spec, "=")
		if !ok || name == "" || file == "" {
			return nil, errors.Errorf("--mount %q: use NAME=PATH", spec)
		}
		if _, dup := mounts[name]; dup {
			return nil, errors.Errorf("--mount %s given twice", name)
		}
		mounts[name] = file
	}
	repo, err := tracerepo.Open(root, mounts)
	return repo, errors.Wrap(err, "open repository")
}

func (in inventory) describe() map[string]any {
	mounts := []tracerepo.MountInfo{}
	for _, m := range in.repo.Mounts() {
		mounts = append(mounts, m.Info())
	}
	info := map[string]any{
		"repo":     map[string]any{"root": in.repo.Root(), "head": in.repo.Head()},
		"mounts":   mounts,
		"compiler": map[string]any{"modules": tracecompiler.Modules, "cachedCommits": in.compilers.Cached()},
		"build":    buildInfo(),
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
