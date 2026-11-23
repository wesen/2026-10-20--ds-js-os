#!/usr/bin/env python3
"""Split the trace REPL's Go files over 500 lines by responsibility.

usage: python3 02-split-go-files.py FILE [--dry-run]       FILE: main | service | study | archive

  cmd/trace-repl/main.go (701)        the command tree stays; serve.go: the service, its inventory and listener;
                                      client.go: the client commands
  pkg/tracerepl/service.go (559)      the service and its sessions stay; cell.go: parsing and evaluating one cell
  pkg/tracesimd/study.go (530)        the types, Parse and the accessors stay; check.go: the validation of a study
  pkg/tracearchive/archive.go (511)   Open, the streams and their events stay; profiles.go: execution summaries and
                                      the initial module; label.go: the archive's label and stream listing
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import splitlib  # noqa: E402

SPLITS = {
    "main": ("cmd/trace-repl/main.go", [(1, 186), (690, 701)], {
        "cmd/trace-repl/serve.go": ("// serve: the workbench service, its inventory of evidence and its listener.", [(187, 442)]),
        "cmd/trace-repl/client.go": ("// The client commands: each sends one request to a running service and prints the result.", [(443, 689)]),
    }),
    "service": ("pkg/tracerepl/service.go", [(1, 379)], {
        "pkg/tracerepl/cell.go": ("// One cell: its arguments, its parse (one await at most), its evaluation and how a failure is explained.", [(380, 559)]),
    }),
    "study": ("pkg/tracesimd/study.go", [(1, 154), (211, 299), (412, 530)], {
        "pkg/tracesimd/check.go": ("// Validation: every key a study must carry, and the checks of decisions, traces and packet sets.", [(155, 210), (300, 411)]),
    }),
    "archive": ("pkg/tracearchive/archive.go", [(1, 337), (435, 444)], {
        "pkg/tracearchive/profiles.go": ("// Execution summaries (profiles) and the initial module of a variant.", [(338, 434)]),
        "pkg/tracearchive/label.go": ("// The archive's label, from its ticket directory, and the list of its streams.", [(445, 511)]),
    }),
}

args = [a for a in sys.argv[1:] if a != "--dry-run"]
assert len(args) == 1 and args[0] in SPLITS, __doc__
sys.argv = [sys.argv[0]] + [a for a in sys.argv[1:] if a == "--dry-run"]
source, keep, parts = SPLITS[args[0]]
splitlib.go_split(source, keep, parts)
