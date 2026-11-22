"""Regenerate cmd/trace-repl/doc/02-trace-repl-query-examples.md from the example scripts.

    python3 cmd/trace-repl/examples/gen-doc.py --bin ~/bin/trace-repl --addr 127.0.0.1:3791
    python3 cmd/trace-repl/examples/gen-doc.py --outputs DIR      # DIR/NN-name.json from earlier runs

It runs every script in one new session of a service started on the PICOCALC-ROW-IR archive
(script 19 as a job), then writes the page: each script verbatim (doc/doc_test.go checks that),
its real output abridged (64-character digests cut to 8, long arrays cut with "... N more"), and the
prose below. The prose quotes numbers from the outputs; after a compiler or archive change, check
the notices against the regenerated outputs before committing.
"""
import argparse, json, os, re, subprocess, sys, tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--bin", default="trace-repl")
parser.add_argument("--addr", default="127.0.0.1:3791")
parser.add_argument("--outputs", help="read NN-name.json responses from this directory instead of running the scripts")
opts = parser.parse_args()
here = os.path.dirname(os.path.abspath(__file__))
repo = os.path.normpath(os.path.join(here, "..", "..", ".."))
examples = here


def record(outdir):
    """Run every script against the service and store each JSON response as outdir/NN-name.json."""
    sid = subprocess.run([opts.bin, "open", "--addr", opts.addr], capture_output=True, text=True, check=True).stdout.strip()
    try:
        for name in sorted(f[:-3] for f in os.listdir(examples) if re.fullmatch(r"\d\d-.*\.js", f)):
            job = ["--job", "--job-timeout", "300"] if name.startswith("19-") else []
            with open(os.path.join(examples, name + ".js")) as script:
                run = subprocess.run([opts.bin, "eval", "--addr", opts.addr, "--session", sid, *job], stdin=script,
                                     capture_output=True, text=True)
            if run.returncode != 0:
                sys.exit("%s failed: %s%s" % (name, run.stdout[:400], run.stderr[:400]))
            with open(os.path.join(outdir, name + ".json"), "w") as out:
                out.write(run.stdout)
            print("ran", name, file=sys.stderr)
    finally:
        subprocess.run([opts.bin, "close", "--addr", opts.addr, "--session", sid])


if opts.outputs:
    outdir = opts.outputs
else:
    outdir = tempfile.mkdtemp(prefix="trace-repl-examples-")
    record(outdir)


def abridge(v, cfg):
    drop, max_items, max_str = cfg.get("drop", ()), cfg.get("max_items", 4), cfg.get("max_str", 140)
    if isinstance(v, str):
        if re.fullmatch(r"[0-9a-f]{40,64}", v):
            return v[:8] + "…"
        return v if len(v) <= max_str else v[:max_str] + "…"
    if isinstance(v, list):
        out = [abridge(x, cfg) for x in v[:max_items]]
        if len(v) > max_items:
            out.append("… %d more" % (len(v) - max_items))
        return out
    if isinstance(v, dict):
        return {k: abridge(x, cfg) for k, x in v.items() if k not in drop}
    return v


def fmt(v, indent=0, width=100):
    one = json.dumps(v, ensure_ascii=False)
    if not isinstance(v, (dict, list)) or len(one) + indent <= width or not v:
        return one
    # A flat object or array (no nested containers), such as a ref, stays on one line when it fits in 130 columns.
    flat = all(not isinstance(x, (dict, list)) for x in (v.values() if isinstance(v, dict) else v))
    if flat and len(one) + indent <= 130:
        return one
    pad, end = " " * (indent + 2), " " * indent
    if isinstance(v, dict):
        body = ",\n".join(pad + json.dumps(k, ensure_ascii=False) + ": " + fmt(x, indent + 2, width) for k, x in v.items())
        return "{\n" + body + "\n" + end + "}"
    return "[\n" + ",\n".join(pad + fmt(x, indent + 2, width) for x in v) + "\n" + end + "]"


def keep(d, *keys):
    return {k: d[k] for k in keys if k in d}


RUN = 'trace-repl eval --session "$sid" < cmd/trace-repl/examples/%s.js'
PARTS = [
    ("Orientation", "Run these two first against any service you did not start yourself. They say what the service holds and what it cannot answer."),
    ("Events and prints", "The archive is a set of pass-print streams. These scripts find events by their fields and read the print an event wrote."),
    ("Static IR metrics", "A metric counts instructions in one snapshot. Bound to a whole timeline, it shows which pass changed the count."),
    ("Machine-function properties", "Backend prints after instruction selection are machine functions. Their property line is a set of boolean metrics."),
    ("Dynamic totals", "Profiles hold executed work per compiled arm, in their own units, kept apart from static sites."),
    ("Plan tools", "Parameters, bundles and explanations work on any plan."),
    ("What the evidence cannot answer", "Two kinds of no: a gap in the capture comes back as a result with a reason; a malformed question is refused."),
    ("The compiler workbench", "The same session loads the Typed compiler at any revision and runs its output on the native RV32 interpreter."),
    ("Repository evidence, results and statistics", "Sessions read their own inputs from the repository, keep results with provenance and share one statistics implementation."),
]
EX = [
    dict(n="01-orientation", part=0, title="What the service mounted", max_items=6,
         ask="Before building on a service, find out which archive it holds, which functions and arms it can answer about, and which questions will come back unavailable.",
         notice="`limits` lists every capability whose status does not start with `available`. Read it before planning an investigation: in this archive, a question about source locations or optimization remarks comes back `unavailable` however it is written. `device` and `simd` are `false` because the service was started without `--device-study` and `--simd-study`."),
    dict(n="02-event-counts", part=0, title="Count every event", max_items=2,
         ask="How large is the archive? A count is a plan, and `q.run` evaluates it.",
         notice="The result says what it counted (`of`), in which unit (`events`) and over how many streams. `byStream` carries each stream's SHA-256, the identity that every later `ref` cites."),
    dict(n="03-find-passes", part=1, title="Find where passes ran", max_items=3,
         ask="Where did the loop vectorizer first run in the checked variant's middle end, and which events have a loop scope?",
         notice="`where` filters with an ordinary JavaScript predicate over event fields, and `select` keeps only the fields you need. Ordinals 88, 89 and 90 are positions in the original stream: filtering did not renumber them. `ref.start` and `ref.end` locate each print inside the inflated stream."),
    dict(n="04-read-a-print", part=1, title="Read one print", max_items=3,
         pick=lambda v: {"state": v["state"], "hits": {**{k: x for k, x in v["hits"].items() if k != "source"}, "hits": v["hits"]["hits"][:2] + ["… %d more" % (len(v["hits"]["hits"]) - 2)]}},
         ask="What does `row` look like after EarlyCSE at ordinal 74, and where does it load from `%work`?",
         notice="Evaluating a state reports its coverage (`function`), its line range inside the print, its size and its arguments. The excerpt is a text search for reading. Its six hits agree with the metric in the next example only because the search string happens to be that specific. Count with selectors, not with text."),
    dict(n="05-static-metric", part=2, title="Count static loads at one state",
         ask="How many `i32` loads through `row`'s first argument exist after event 74?",
         notice="The value is 6 static instruction sites, and each witness is a counted line with its basic block. `row.argument(0)` is resolved again in every snapshot from that print's `define` line, so the metric keeps its meaning when passes rename `%work`."),
    dict(n="06-pass-effects", part=2, title="Which pass changed the count", max_str=400,
         ask="Across `row`'s whole middle-end timeline of 144 events, which passes changed the number of those loads?",
         notice="Exactly one: EarlyCSE at ordinal 74 took the count from 11 to 6. The script keeps only `known` changes, the ones that compare consecutive full prints and can therefore be credited to one pass. `of` spells out the whole plan, so the result documents its own question."),
    dict(n="07-def-use", part=2, title="Follow def-use edges", max_items=2,
         ask="Which instructions use the loads through argument 0?",
         notice="Each edge names the user's opcode, the operand position and a `ref` to the user's line. The loads feed `icmp` comparisons as operand 0: they are the row's bounds checks. `q.capabilities()` lists def-use edges as available, with `operandIndex` known for a subset of opcodes."),
    dict(n="08-machine-properties", part=3, title="Machine-function properties", drop=("ref",), max_items=5,
         ask="Which machine-function properties does `row` have after the virtual register rewriter, and when did `NoVRegs` become true?",
         notice="Properties come from the `# Machine code for function row:` line, which is the witness. A boolean metric's change carries a `transition` (`false→true`) and no numeric delta. The flip happens at `virtregrewriter` (78), directly after `greedy` (77), where register allocation ends."),
    dict(n="09-profile-totals", part=4, title="Totals per arm", max_items=13,
         ask="How much work does each compiled program execute on the opening workload?",
         notice="`totals()` is eager and returns `[{metric, value, unit}]`. The script folds it into one row per arm. C arms count QEMU guest instructions inside the row symbol, and Typed arms count RV32 interpreter steps (plus `packets` for the SIMD arms). Neither is cycles."),
    dict(n="10-compare-arms", part=4, title="Compare two arms",
         pick=lambda v: {**keep(v, "kind", "status", "unit", "delta", "percent", "denominator", "matchedOn"),
                         "before": keep(v["before"], "arm", "metric", "value"), "after": keep(v["after"], "arm", "metric", "value")},
         ask="What is loop strength reduction worth to the checked row under `llc`?",
         notice="LSR removes 41,949 executed instructions, 3.29% of the count without it. `matchedOn` shows that both sides share workload, region, checked contract and unit. If any of them differed, the comparison would be `incomparable` with a `null` delta."),
    dict(n="11-sum-totals", part=4, title="Sum disjoint totals",
         pick=lambda v: {**keep(v, "kind", "label", "status", "value", "unit", "formula"), "parts": [keep(p, "arm", "metric", "value", "unit") for p in v["parts"]]},
         ask="How many direct stack accesses does the stock Typed compile execute?",
         notice="`q.add` keeps the parts and the formula. It sums only disjoint categories of one dimension: `q.add(s.total(\"instructions\"), s.total(\"stackLoads\"))` is refused with `[incompatibleUnits]` and a suggestion to use `q.compare` or `q.bundle`."),
    dict(n="12-parameters", part=5, title="One plan, several bindings",
         ask="Which passes removed at least `minimum` loads, for `minimum` 1 and 4?",
         notice="The predicate reads the parameter through `ctx.param` and declares it in `dependsOn`. Metric values are cached by definition, so the second `q.run` reuses the measurements of the first and only the predicate runs again."),
    dict(n="13-bundle", part=5, title="Several questions at once", max_items=1,
         ask="Evaluate three unrelated plans in one call and keep the answers apart.",
         notice="A bundle result is `{kind: \"bundle\", outputs, keys}`, and every output is a complete result with its own unit. The 144 events of `row`'s timeline are a subset of the stream's 195 events."),
    dict(n="16-explain-and-cache", part=5, title="Explain a plan and inspect the caches", max_items=3,
         ask="What does a plan consist of, and what has this session cached?",
         notice="`q.explain` lists the nodes, their inputs and how many consumers each has, without evaluating anything. `q.cache()` reports the bounded session caches with hits, misses and evictions. Cache keys use only declarative plan parts and never lambdas. `q.cache({clear: true})` empties them."),
    dict(n="14-unavailable", part=6, title="A question the capture cannot answer",
         ask="Where in the source is `row`, and which other capabilities are unavailable?",
         notice="The answer is a result, not an error: status `unavailable`, reason `missingDebugLocations`. An empty list of locations would have looked like a real answer. The capability reasons say what each gap would need."),
    dict(n="15-errors", part=6, title="Refusals", max_str=300,
         ask="What happens when the question itself is wrong?",
         notice="Refusals throw. `err.code` is stable for programs to branch on. `q.run` refusals add `err.got` (what arrived) and `err.fix` (the call you probably meant). An out-of-range ordinal names the valid range, and an unknown name lists the valid ones."),
    dict(n="17-compile-at-revisions", part=7, title="The compiler at two revisions",
         run='trace-repl eval --session "$sid" --arg base=\'"04b0854"\' < cmd/trace-repl/examples/17-compile-at-revisions.js',
         ask="How do the Step 19 compiler (`04b0854`) and the working tree differ on the ray tracer?",
         notice="The digests are equal, so both images render the same opening frame. The working tree's image is 56 bytes smaller and executes 160,304 fewer instructions (4.7%). A commit is evaluated once per session and then reused, while `\"worktree\"` is re-read on every call, so an edit shows up in the next cell."),
    dict(n="18-opening-frame", part=7, title="Profile the opening frame",
         ask="Where does the kernel-policy ray tracer spend its executed instructions?",
         notice="`frameProfile` runs the frame on the native interpreter and returns per-function rows. Shading (`typedRayLitRow`) takes 2,299,371 of 3,239,635 steps and tracing (`typedRayComputeRow`) 925,448. `--arg policy='\"default\"'` profiles another policy."),
    dict(n="19-policy-sweep", part=7, title="Sweep the policies as a job", max_items=5,
         run='trace-repl eval --session "$sid" --job --job-timeout 300 < cmd/trace-repl/examples/19-policy-sweep.js',
         ask="What do the five named policies cost in compile time, and what do they buy in executed instructions?",
         notice="All five render the same frame (`b3c26cc8`). Host compile time grows several-fold from `stock` to `kernel` (the milliseconds vary from run to run), while frame steps fall from 15.5 million to 3.2 million. The sweep takes about a second, so it would also fit in a cell. It runs as a job to show the pattern: the same script over more revisions or workloads outgrows the 15-second cell deadline, and `--detach` returns a job ID at once."),
    dict(n="20-hot-pcs", part=7, title="The hottest instructions of one function", max_items=5,
         ask="Which instructions of `typedRayLitRow` run most often in the opening frame?",
         notice="`frame.counts` is a `Uint32Array` with one count per 4-byte word of the image, and `program.entries` maps function names to byte offsets. `rv32.classify(word, next, after)` labels a word, and it needs the two following words to recognise bounds tests and capacity loads. The five hottest instructions run 52,917 times each and lie between `0x190c` and `0x1920`, inside one loop body."),
    dict(n="21-watch-the-passes", part=7, title="Watch the compiler's passes", max_items=8,
         ask="How does one function's tape change through the backend's transforms, and how many register homes does the planner assign?",
         notice="`observeTape(name, phase, code)` receives a copy of each function's tape after each phase, and `observePlan(name, plan)` receives the operand-location plan. `version` nearly doubles `typedRayInShadow` (331 to 605 cells), because it adds a guarded fast copy of the loop. The planner scores 41 locations and gives 21 of them a register home. The callbacks are read-only views and do not change the image."),
    dict(n="22-board-evidence", part=8, title="Score a board run from the repository",
         run='trace-repl eval --session "$sid" --arg board=\'"ttmp/2026/11/21/PICOCALC-RAY-PARITY--make-typed-compiler-optimizations-cumulative-and-close-the-ray-tracer-s-gap-to-c/various/92-board-reuse"\' < cmd/trace-repl/examples/22-board-evidence.js',
         ask="Did the candidate image beat the control on the ESP32-P4, block by block?",
         notice="The rows come from `repo.read`, so nothing is pasted into the cell, and the record of the run is the file in the repository. `stats.paired` pairs control and candidate by `block` and refuses unmatched or duplicate blocks. In RAY-PARITY run 15, the candidate saved a median 1.59% per block and won all six blocks. The C renderer took 7,733 µs."),
    dict(n="23-files-at-revisions", part=8, title="Files now and at a commit", max_items=15,
         ask="Has the policy table changed since the RV32 backend was split into modules?",
         notice="The SHA-256 is the same at `2a5be8f` and in the working tree. `repo.show` resolves the revision to a full commit SHA, and `repo.list` reads a directory. Paths may not leave the repository, even through a symlink."),
    dict(n="24-save-a-result", part=8, title="Save a result with its provenance",
         ask="Keep a frame measurement beyond this session, and see what the record says about how it was made.",
         notice="The record names the session, whether a cell or a job saved it (`unit`), the repository's HEAD commit and every compiler revision the session had loaded. Here that includes `04b0854`, loaded by example 17 in the same session. `trace-repl results --name example-opening-frame` prints the record from the shell."),
    dict(n="25-summary-statistics", part=8, title="Summary statistics", max_items=2, drop=("perPair",),
         ask="Summarize six control timings, and compare control with candidate block by block.",
         notice="`medianPercentSaved` (4.54%) is the median of the per-block savings. `percentSavedOfMedians` (4.98%) compares the two arm medians. They answer different questions, so `stats.paired` reports both. `spread` summarizes the per-block savings, which shows how far the blocks disagree."),
]

out = []
out.append("""---
Title: "Trace REPL Query Examples"
Slug: "trace-repl-query-examples"
Short: "Twenty-five runnable scripts, from orientation and pass attribution to compiler sweeps and board statistics, each with its real output."
Topics:
- trace-repl
- compiler-evidence
- examples
Commands:
- eval
- open
Flags:
- session
- arg
- job
IsTopLevel: true
IsTemplate: false
ShowPerDefault: true
SectionType: Example
---

This page walks through the 25 scripts in `cmd/trace-repl/examples/`. Each one answers one concrete question about the ray tracer's compiled code. The page shows the script verbatim, the output it produced against the `PICOCALC-ROW-IR` capture, and what to notice in that output. Read the scripts in order to learn the API by use. Or jump to the part you need, and copy a script as the starting point for your own question.

Every script follows two conventions that make it safe to send repeatedly to the same session:

- **The script is one expression, `(() => { ... })()`.** Its locals vanish when it returns, so sending it a second time does not collide with the bindings of the first.
- **Parameters come from `args`.** Defaults apply when an argument is absent, and the comment at the top shows the `--arg` form. Because `args` is fresh in every cell, a script never sees another script's values.

Open a session and send one script on stdin:

```sh
sid=$(trace-repl open)
trace-repl eval --session "$sid" < cmd/trace-repl/examples/05-static-metric.js
```

`run-all.sh` runs every script in one new session and prints `ok` or `FAIL` per script. It passes its arguments to `open`, `eval` and `close`, and it reads the binary from `TRACE_REPL`:

```sh
TRACE_REPL=~/bin/trace-repl cmd/trace-repl/examples/run-all.sh --addr 127.0.0.1:3791
```

Scripts 01 to 16 need only the archive. Scripts 17 to 25 also read the service's repository, which by default is the checkout the service was started in. Script 24 writes the record `example-opening-frame` into the service's results directory. None of them needs a device or SIMD study.

The outputs below are the real values, abridged in two ways. A 64-character digest is cut to its first 8 characters followed by `…`. A long array keeps its first items, and a final `"… N more"` entry says how many were left out. Numbers are never changed.

| Part | Scripts | Topic |
| --- | --- | --- |
""")
for i, (name, _) in enumerate(PARTS):
    nums = ", ".join(e["n"][:2] for e in EX if e["part"] == i)
    out.append("| %d | %s | %s |\n" % (i + 1, nums, name))
for i, (name, intro) in enumerate(PARTS):
    out.append("\n## Part %d: %s\n\n%s\n" % (i + 1, name, intro))
    for e in [e for e in EX if e["part"] == i]:
        script = open(os.path.join(examples, e["n"] + ".js")).read().rstrip("\n")
        value = json.load(open(os.path.join(outdir, e["n"] + ".json")))["value"]
        if "pick" in e:
            value = e["pick"](value)
        out.append("\n### %s. %s\n\n%s\n\n" % (e["n"][:2], e["title"], e["ask"]))
        out.append("```sh\n%s\n```\n\n" % e.get("run", RUN % e["n"]))
        out.append("```js\n%s\n```\n\n" % script)
        out.append("```json\n%s\n```\n\n" % fmt(abridge(value, e)))
        out.append(e["notice"] + "\n")
out.append("""
## Writing your own

Most new questions are an edit of one of these scripts. A few habits keep a new script as reusable as the originals:

- **Return a small, named object.** `({steps: f.steps, digest: f.digest})` survives the 512 KiB result limit and reads well in a diff. Return `undefined` after binding something large that later cells will use.
- **Keep the plan, not only its value.** `q.run(plan)` returns `of`, `unit` and `ref`, and those are what make a number citable. Strip them only at the end, when you build the summary object.
- **Check statuses before arithmetic.** A change row with status `gap` or `unknown` has no attributable delta, and a measurement with status `unavailable` has no value.
- **Save what you will cite.** `results.save(name, value)` records the script's digest, its `args`, the commit and the compiler revisions next to the value.

## Troubleshooting

| Problem | Cause | Solution |
| --- | --- | --- |
| `FAIL 17-...` with `unknown revision` | The service's repository does not contain `04b0854`. | Pass another base, `--arg base='"HEAD~3"'`, or start `serve` with `--repo` pointing at this checkout. |
| `FAIL 22-...` with a missing `rows.json` | The RAY-PARITY ticket is not in the service's repository. | Pass `--arg board='"PATH/TO/BOARD/DIR"'` for a board directory that has `rows.json`. |
| A script fails with `Identifier ... has already been declared` | It was edited to declare top-level names. | Keep the body inside `(() => { ... })()`. |
| `run-all.sh` prints `FAIL` for every script | The binary or the address is wrong. | Set `TRACE_REPL` to the built binary and pass the service's `--addr`. |
| 19 fails with `deadline` | The sweep was given more work than its timeout allows. | Raise `--job-timeout`, up to the service's `--max-job`. |

## See Also

- `trace-repl help trace-repl-user-guide`: the concepts behind these scripts (plans, states, timelines, units, statuses).
- `trace-repl help trace-repl-js-api`: every method these scripts call, with arguments and result shapes.
- `trace-repl help trace-repl-cli-and-http`: `eval`, `--arg`, `--job` and the HTTP protocol.
""")
dest = os.path.join(repo, "cmd/trace-repl/doc/02-trace-repl-query-examples.md")
open(dest, "w").write("".join(out))
print(dest, sum(len(x) for x in out))
