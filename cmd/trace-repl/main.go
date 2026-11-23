// Command trace-repl runs a local, in-memory compiler evidence workbench.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/go-go-golems/glazed/pkg/cli"
	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/go-go-golems/glazed/pkg/cmds/logging"
	"github.com/go-go-golems/glazed/pkg/cmds/schema"
	"github.com/go-go-golems/glazed/pkg/cmds/values"
	"github.com/go-go-golems/glazed/pkg/help"
	help_cmd "github.com/go-go-golems/glazed/pkg/help/cmd"
	"github.com/go-go-golems/picocalc-trace/cmd/trace-repl/doc"
	"github.com/go-go-golems/picocalc-trace/pkg/tracerepl"
	"github.com/spf13/cobra"
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
