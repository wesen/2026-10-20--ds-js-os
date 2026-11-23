package main

// serve: the workbench service, its inventory of evidence and its listener.

import (
	"context"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/traceapi"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracearchive"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracecompiler"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracehardware"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracerepl"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracerepo"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/traceresults"
	"github.com/go-go-golems/picocalc-trace/tools/trace-repl/pkg/tracesimd"
	"github.com/pkg/errors"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
)

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
