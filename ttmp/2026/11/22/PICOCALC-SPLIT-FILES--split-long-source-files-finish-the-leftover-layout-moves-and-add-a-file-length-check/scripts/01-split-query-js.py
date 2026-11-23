#!/usr/bin/env python3
"""Split pkg/traceapi/query.js (2,545 lines) into pkg/traceapi/query/NN-*.js by namespace.

usage: python3 01-split-query-js.py [--dry-run]       (on a clean tree)

The library stays one scope, as compiler/typed/rv32/*.js do for typed-rv32.js: install.go embeds query/*.js and
evaluates them in file-name order inside the function that used to open and close query.js (lines 6, 7 and 2545,
which move to install.go). Each part gets a one-line header naming what it holds.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from splitlib import Part, split  # noqa: E402

D = "pkg/traceapi/query/"
H = "  // query/{}: {} (one scope with the other files here; install.go joins them in file-name order)\n"
PARTS = [
    Part(D + "00-errors-bridge-caches.js", [(1, 5), (8, 98)], between={1: H.format("00", "errors, names, the bridge, bounded caches")}),
    Part(D + "10-plans-and-scopes.js", [(99, 434)], head=H.format("10", "plans, the synchronous terminal, event headers and scopes")),
    Part(D + "20-rows-prints-timelines.js", [(435, 757)], head=H.format("20", "row plans, prints, event selections and timelines")),
    Part(D + "30-archive-and-ir.js", [(758, 1104)], head=H.format("30", "the archive (global a), runs, functions, the LLVM IR parser")),
    Part(D + "40-snapshots-states-metrics.js", [(1105, 1566)], head=H.format("40", "snapshots, states, value references, metrics, measured timelines")),
    Part(D + "50-machine-and-profiles.js", [(1567, 1864)], head=H.format("50", "machine-function properties (q.machine), execution summaries")),
    Part(D + "60-compare-params-module.js", [(1865, 2139)], head=H.format("60", "add and compare, parameters (q.param), the initial module, missing artifacts")),
    Part(D + "70-fragments-and-sessions.js", [(2140, 2295)], head=H.format("70", "def-use edges, fragments, explain, session pins (q.session), the profiles facade")),
    Part(D + "80-help-and-surface.js", [(2296, 2544)], head=H.format("80", "help, capabilities, status, and the public surface (q, a, profiles)")),
]

OLD_EMBED = '''//go:embed query.js
var library string
'''
NEW_EMBED = '''//go:embed query/*.js
var queryFiles embed.FS

// library is the query language: the files in query/, in file-name order, inside one function that receives the
// global object and the bridge. They share that function's scope (each uses names the others declare), as
// compiler/typed/rv32/*.js share typed-rv32.js's.
var library = func() string {
	entries, err := queryFiles.ReadDir("query")
	if err != nil {
		panic(err)
	}
	var b strings.Builder
	b.WriteString("(function (root, bridge) {\\n  'use strict';\\n")
	for _, e := range entries {
		text, err := queryFiles.ReadFile("query/" + e.Name())
		if err != nil {
			panic(err)
		}
		b.Write(text)
	}
	b.WriteString("})(typeof globalThis !== 'undefined' ? globalThis : this, typeof __trace !== 'undefined' ? __trace : undefined);\\n")
	return b.String()
}()
'''
EDITS = {
    "pkg/traceapi/install.go": [
        ('\t_ "embed"\n\t"encoding/json"\n\t"fmt"\n', '\t"embed"\n\t"encoding/json"\n\t"fmt"\n\t"strings"\n', 1),
        (OLD_EMBED, NEW_EMBED, 1),
    ],
    "pkg/traceapi/workbook_test.go": [("pkg/traceapi/query.js", "pkg/traceapi/query/*.js", 1)],
    "pkg/traceapi/coverage_test.go": [("integration of query.js", "integration of query/*.js", 1)],
    "pkg/traceapi/release_test.go": [("the merged query.js", "the merged query library (query/*.js)", 1)],
}

split("pkg/traceapi/query.js", PARTS, moved=[(6, 7), (2545, 2545)], edits=EDITS)
