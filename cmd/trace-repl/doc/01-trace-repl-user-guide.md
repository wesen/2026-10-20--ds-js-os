---
Title: "Trace REPL User Guide"
Slug: "trace-repl-user-guide"
Short: "Start a trace service, build an investigation in a persistent JavaScript session, and tell measured answers from missing ones."
Topics:
- trace-repl
- compiler-evidence
- javascript
Commands:
- serve
- open
- eval
- job
- close
- sessions
- results
- info
Flags:
- archive
- session
- code
- job
- arg
IsTopLevel: true
IsTemplate: false
ShowPerDefault: true
SectionType: Tutorial
---

`trace-repl` is a local service for answering questions about compiler output with evidence. It loads a captured archive of LLVM pass dumps once and verifies every stream against its manifest. It then gives each researcher a persistent JavaScript session over that archive. The same session can load the PicoCalc Typed compiler at any git revision, run its RV32 output on a native interpreter, read repository files, and compare board measurements with shared statistics.

This guide explains how those pieces fit together and why the API has the shape it has. By the end you should be able to start a service, build an investigation one cell at a time, run long work as a job, keep results with their provenance, and recognise when the evidence cannot answer a question.

One running example threads through the chapters: the `row` function of the ray tracer's checked variant, followed through LLVM's middle end. Every output quoted below comes from a real session against the `PICOCALC-ROW-IR` capture. The companion pages hold the material this guide does not repeat:

- `trace-repl help trace-repl-query-examples` runs 25 complete example scripts and shows their outputs.
- `trace-repl help trace-repl-js-api` is the JavaScript API reference.
- `trace-repl help trace-repl-cli-and-http` covers the commands, flags, limits and HTTP routes.

## 1. Why a persistent session

A compiler question rarely ends with its first query. You might first ask how many loads `row` performs through its first argument after some pass. Then you ask which pass removed them. Then whether the emulator agrees that the program now executes fewer instructions, and whether the board agrees with the emulator. Each step uses names that the previous step defined. A one-shot script would inflate 31 MB of pass dumps for every question and rebuild every intermediate handle. A notebook of copied numbers would lose track of where each number came from.

The trace REPL addresses both problems with one decision. The evidence lives in a long-running service, and the investigation lives in a *session* that keeps its JavaScript bindings between requests. You define `row` once, `middle` once and `loads` once, and every later cell refers to them. The service inflates and verifies the capture before it starts listening. A damaged capture therefore fails at startup, not after you have cited one of its numbers, and no query pays for decompression.

The second half of the design is that answers are not bare numbers. Each query result carries:

- its *unit*: `static instruction sites`, `executed guest instructions` or `P4 microseconds`;
- its *status*: `available`, `absent`, `unavailable` or `unsupported`;
- a *reference* to the exact bytes it was computed from.

Those fields make it hard to compare a static count with a dynamic one by accident, and impossible to report a missing measurement as zero.

## 2. The pieces

The service is one process bound to a loopback address. The `trace-repl` subcommands other than `serve` are thin HTTP clients. Each session is an isolated JavaScript VM (goja) with its own bindings. All sessions share the verified inputs.

```text
 shell                            trace-repl serve  (one process, 127.0.0.1 only)
 -----                            ------------------------------------------------
 trace-repl open    --HTTP-->     POST /sessions
 trace-repl eval    --HTTP-->     POST /sessions/ID/eval  -->  +-----------------------+
 trace-repl job     --HTTP-->     /sessions/ID/jobs/JOB        | session: one goja VM  |
 trace-repl results --HTTP-->     GET  /results                |   your bindings       |
 trace-repl info    --HTTP-->     GET  /info                   |   q a profiles ...    |
                                                               +-----------+-----------+
                                  verified before listening:               | reads
                                    archive          (--archive)    <------+
                                    device study     (--device-study)      |
                                    SIMD study       (--simd-study)        |
                                    repository       (--repo)              |
                                    mounted files    (--mount NAME=PATH)   |
                                  results directory  (--results)    <------+ writes
```

Every session starts with the same globals. Each one answers `.help()`, and `q.help()` names the archive the service mounted.

| Global | What it answers | Requires |
| --- | --- | --- |
| `q` | The query engine: plans, IR metrics, comparisons, parameters, help topics | `--archive` |
| `a` | The pass-dump archive: variants, streams, events, functions | `--archive` |
| `profiles` | Dynamic emulator totals per compiler arm | `--archive` |
| `hardware` | Paired ESP32-P4 timings and on-device compile costs | `--device-study` |
| `simd` | SIMD decisions joined to per-PC execution counts | `--simd-study` |
| `compiler` | The Typed compiler and its tools at a git revision or the working tree | the repository |
| `rv32` | The RV32 reference interpreter, run natively in Go | nothing |
| `repo`, `mounts` | Read-only repository files, and files mounted at startup | the repository, `--mount` |
| `results` | Named results that outlive the session, saved with provenance | the results directory |
| `stats` | Medians, quantiles and paired block comparisons | nothing |
| `args` | The parameters of the current cell or job | `--arg`, `--args-file` |

A study that was not mounted is still a global, and it says why it is empty. With no `--device-study`, `hardware.help().available` is `false`, and every data call fails with `missingDeviceStudy`. The error also tells you not to substitute emulator counts for device time.

## 3. A first session

From the repository root, build the binary and start a service in a terminal multiplexer, so that the service outlives your shell. The Go module expects the adjacent checkout `../go-go-golems/go-go-goja`. `go run ./cmd/trace-repl` works everywhere this guide writes `trace-repl`, but every invocation then pays for a compile.

```sh
go build -o ~/bin/trace-repl ./cmd/trace-repl
tmux new-session -d -s trace-repl \
  'trace-repl serve --archive ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes'
tmux capture-pane -pt trace-repl -S -5     # the last line reads "trace REPL ready" with the address
trace-repl info | head -20                 # what this service mounted
```

The default address is `127.0.0.1:3791`. Several services often run side by side; give each its own `--addr 127.0.0.1:PORT`, and pass the same flag to every client command. `trace-repl info --addr ...` tells them apart.

`open` allocates a session and prints its ID. `eval` sends one cell to that session:

```sh
sid=$(trace-repl open)
trace-repl eval --session "$sid" --code 'const row = a.variant("checked").function("row")'
trace-repl eval --session "$sid" --code 'const middle = row.timeline("middle")'
trace-repl eval --session "$sid" --code 'q.run(middle.count()).value'
```

```json
{"ok":true,"value":null,"kind":"undefined"}
{"ok":true,"value":null,"kind":"undefined"}
{"ok":true,"value":144}
```

The first two cells declare bindings and return nothing. The third uses both bindings. It counts 144 events in `row`'s middle-end timeline: the pass prints of the checked variant's 195 middle-end events that can contain `row`. For anything longer than one line, put the cell in a file and send it on stdin. When you are done, release the session:

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/05-static-metric.js
trace-repl close --session "$sid"
```

## 4. Cells and what comes back

A *cell* is a JavaScript program in script syntax. The service evaluates it in the session's VM and returns the value of its last expression as JSON. That is all the protocol does, and the rest of the API is ordinary JavaScript. The rules that matter in practice all follow from the bindings persisting:

- **Top-level declarations last for the whole session.** Declaring `const row` a second time is a `SyntaxError` with a hint. Declare names you intend to reassign with `let`. If a cell fails before a top-level `let`, `const` or `class` it declares has been initialized (in `throw ...; const late = 1`, for example), that name stays unusable for the rest of the session. The error names it, and choosing a new name or opening a new session recovers. Names the failing cell had already initialized remain usable.
- **Wrap reusable scripts in a function.** Every file under `cmd/trace-repl/examples/` is one expression, `(() => { ... })()`. Its locals vanish when it returns, so you can send it again and again to the same session.
- **End with `undefined` to keep a large value without shipping it.** `const big = ...; undefined` stores the binding, and a later `big.length` reads from it. A result larger than 512 KiB is refused.
- **Errors do not end the session.** A failing cell returns `{"ok":false,"error":"..."}`, and `eval` exits with status 1. The next cell runs normally.
- **Console output travels with the result.** `console.log("rows", 3); [1, 2, 3].length` returns `{"ok":true,"value":3,"console":[{"kind":"log","message":"rows 3"}]}`.
- **The API is synchronous.** A standalone `await expr` cell works for an already settled promise. `const r = await q.run(plan)` inside a larger cell is a syntax error; write `const r = q.run(plan)`.

A cell must finish within 15 seconds, including any wait for the session. Work that needs longer runs as a job (chapter 12).

## 5. The evidence: variants, streams and events

The archive is the output of LLVM's `-print-after-all`, which prints the IR after every pass. The `PICOCALC-ROW-IR` capture recorded it for three *variants* of the ray tracer's row code, each in two *phases*:

- `checked` keeps the bounds checks, and `unchecked` drops them. `firmware` is the whole firmware build, which is why its streams are an order of magnitude longer.
- `middle` is the `opt` middle end. `backend` is `llc`, whose prints become machine-function dumps after instruction selection.

Each (variant, phase) pair is one *stream*, and each `IR Dump After ...` header in it is one *event*:

| Variant | middle events | backend events |
| --- | ---: | ---: |
| checked | 195 | 116 |
| unchecked | 195 | 116 |
| firmware | 2,061 | 1,450 |

`q.run(a.events().count())` returns all 4,133 events, with a per-stream breakdown.

An event's *ordinal* is its position in its original stream, counted from 0. Filtering never renumbers. `middle.at(74)` is the event at ordinal 74 of checked/middle whether you reached it through `row`'s timeline, through `run.events("middle")`, or after a `where`. This is what makes ordinals safe to cite. An ordinal that belongs to another function is refused with `[notInSelection]`, so it is never quietly mapped to the nearest event.

Every event carries a `ref`: the stream's SHA-256 and the byte range of the print in the inflated stream. The first `LoopVectorizePass` in checked/middle, for example, is ordinal 166, bytes 806,352 to 814,146 of stream `bbd3b983...`. The `ref` is the citation, and it points at bytes the service verified at startup.

An event's `scope` says what its print covers: `function`, `module`, `cgscc`, `loop`, `machineFunction`, or `unresolved` for an `llc` header that only the print can resolve. Loops need care. A loop pass prints only the loop, and its header names only the loop's header block (`on for.body29`), not the function that owns it. The service does not guess an owner. `scope.function` stays `null`, every function's timeline keeps the event, and whole-function metrics on that print come back `unavailable` with reason `loopFragment`. `scope.ownerHint` offers the nearest earlier single-function event, and it is labelled as a tentative hint.

A *function timeline*, such as `row.timeline("middle")`, is the subset of one stream whose prints can contain that function. That means its own function and CGSCC events, module prints, and loop events whose owner is that function or is unknown. That is how 195 events become `row`'s 144.

## 6. Plans: describing a question before answering it

Most calls in the archive API do not compute anything. `a.variant("checked").events("middle").count()` returns a *plan*: a description of a question. `q.run(plan)`, or `plan.run()`, evaluates it.

Why not compute at once? A plan knows its own definition, so several things become possible:

- The result can say what it is. Every result has an `of` field holding the expression that produced it.
- A plan can take parameters and be evaluated again with other bindings (`q.param`, chapter 10), reusing the metric values it already computed.
- `q.explain(plan)` can list a plan's nodes and the inputs they share before anything runs.
- `q.bundle({...})` can evaluate several plans in one call and keep their outputs apart by name.

Calls that list things return plain values immediately. These include `a.variants()`, `run.functions()`, `profiles.arms()` and every `describe()`. `q.help("plans")` lists which calls are which.

The most common mistake is to read a result field from a plan. The service refuses it rather than returning `undefined`:

```json
{"ok":false,"error":"QueryError: [notEvaluated] this is a plan (a.variant(\"checked\").function(\"row\").timeline(\"middle\").count()); .value belongs to its result\n  fix: q.run(plan).value ..."}
```

The opposite mistake is just as explicit. `q.run(42)` throws `[notAPlan]` with `err.got === "number"` and an `err.fix` naming the call you probably meant. A refused call evaluated nothing: it is never a zero or an empty set. `q.run` passes an already evaluated result or a `describe()` descriptor through unchanged, so code that is not sure whether it holds a plan can still call it.

A count result looks like this:

```json
{"kind": "count", "value": 4133, "unit": "events", "of": "a.events()", "streams": 6,
 "byStream": [{"variant": "checked", "phase": "backend", "streamSHA": "8139...", "events": 116}, "..."]}
```

## 7. States, metrics and witnesses

A *state* is the program at one point in a timeline:

- `middle.at(74).after` is the print that event 74 wrote.
- `middle.at(74).before` is the previous print of the same function, which the result labels with `derivedFrom`.
- `run.initialModule().state("row")` is the function as the front end produced it.

Evaluating a state reports its coverage and size. After EarlyCSE at ordinal 74, `row` has 126 instructions in 35 blocks and two arguments, `ptr %work` and `i32 %y`.

A *metric* is built from `q.ir.instructions()` by adding filters and ending with `count()` (or `sites()` for the matching lines themselves). `metric.at(state)` binds it to one state:

```js
const loads = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count()
q.run(loads.at(middle.at(74).after))
```

```json
{"status": "available", "value": 6, "unit": "static instruction sites",
 "witnesses": [{"line": 13, "block": "for.cond.cleanup", "text": "%0 = load i32, ptr %work, align 4"},
               {"line": 30, "block": "for.body", "text": "%2 = load i32, ptr %work, align 4"}, "..."]}
```

The witnesses are the lines that were counted, so a reader can check the number by eye. Notice the pointer filter: it takes `row.argument(0)`, not the string `"%work"`. Printed local names are not identities. Passes rename values freely, and the same name can mean different values in two prints. An argument handle is resolved again in every snapshot from that print's `define` line. The service refuses printed `%x` names as pointers, because a count keyed on them would silently change meaning from print to print.

The IR parser recognises labels, `#dbg_*` records and the full LLVM instruction set in opaque-pointer form. A line it does not recognise makes the whole snapshot `unsupported`, and a partial count is never returned. For reading rather than counting, `state.excerpt({contains, context})` searches the print's text and returns hits with line, column and stream offset. `state.text({maxLines})` returns the print itself.

`state.instructions()` starts a selector already bound to one snapshot, and `.uses()` follows def-use edges inside it. In `row` after event 74, the loads through `%work` feed `icmp` instructions as operand 0, such as `icmp ugt i32 %0, 16`: they are the row's bounds checks.

## 8. Timelines and changes: which pass did it?

Binding a metric to every state in a timeline answers "which pass changed this?". `timeline.measure(metric)` produces one row per event. `.changes()` takes differences between consecutive prints:

```js
q.run(middle.measure(loads).changes()
  .where(c => c.status === "known" && c.delta !== 0)
  .table("ordinal", "pass", "before", "after", "delta"))
```

```json
{"kind": "rows", "unit": "static instruction sites", "count": 1,
 "rows": [{"ordinal": 74, "pass": "EarlyCSEPass", "before": 11, "after": 6, "delta": -5}]}
```

Across 144 events, exactly one pass changed the number of i32 loads through the row pointer: EarlyCSE at ordinal 74 merged five redundant loads of the same field. The `status` of each change row decides whether its delta can be attributed to a single pass:

| Status | Meaning |
| --- | --- |
| `known` | Both prints are full prints at consecutive original ordinals. The delta belongs to this pass. |
| `first` | The first row of the timeline, which has nothing to take a difference against. |
| `unavailable` | This print cannot be measured, for example a loop fragment. |
| `unknown` | The previous print was unavailable, so the difference restarts here. |
| `gap` | The two rows are not adjacent in the stream. `skipped` and `skippedOrdinals` list what lies between them. |

The `gap` status exists because filtering before taking differences changes the question. `middle.where(e => e.pass === "EarlyCSEPass").measure(loads).changes()` compares one EarlyCSE print with the next one, and every pass in between contributed to that delta. The engine marks such a row as a gap instead of crediting EarlyCSE with the whole change. Filter the change rows (as above), not the timeline, when you want per-pass attribution.

Machine-function properties work the same way in the backend stream. `q.machine.property("NoVRegs")` is a boolean metric, and its first `known` change in `row`'s backend timeline is `false -> true` at ordinal 78, `virtregrewriter`, directly after `greedy` at 77. That is the point where register allocation finishes. Machine instruction metrics, such as spills, copies and MIR opcodes, are `unsupported` in this release.

Functions sometimes continue under another name. In the PICOCALC-SHADOW-LLVM capture, for example, `kernel` takes over the body of its alias `checked_shadow` at GlobalOpt. `run.renames()` lists such renames. `timeline(phase, {follow: true})` uses each earlier name before its rename, and the rows say which name they measured.

## 9. Dynamic evidence and its units

Pass dumps are static: they say what code exists, not how often it runs. Executed work comes from `profiles`, a separate namespace with its own units. A profile *arm* is one compiled program, and its totals are summed over a workload (`opening-160-rows`, verified by `rowsVerified === 160`) inside a region (`row`, the measured row symbol):

| Arm | executed instructions | direct stack loads |
| --- | ---: | ---: |
| `checked-gcc` | 1,136,142 | 1,120 |
| `checked-llc` | 1,233,611 | 320 |
| `checked-llc-nolsr` | 1,275,560 | 0 |
| `typed-stock` | 3,608,697 | 936,328 |
| `typed-scalar` | 3,199,910 | 729,553 |
| `typed-pie` | 3,131,435 | 729,553 |

For C arms, these are QEMU guest instructions inside the row symbol. For Typed arms, they are RV32 interpreter steps. Neither is cycles or board time, and the units in every result say so. `profiles.arm(name).describe()` explains what an arm *is*: its role, design and provenance, which totals it has, what a comparison between two arms isolates, and what it cannot attribute.

Comparisons are plans too, and they check that their two sides measure the same thing:

```js
const t = arm => profiles.arm(arm).region("row").workload("opening-160-rows").total("instructions")
q.run(q.compare(t("checked-llc-nolsr"), t("checked-llc"))
  .matchOn("workload", "region", "checkedContract", "unit")
  .percentChange({denominator: "before"}))
// -> delta -41,949 executed guest instructions, percent -3.29 (denominator 1,275,560)
```

Loop strength reduction removes 3.3% of the checked row's executed instructions under `llc`. If the two sides differed in any `matchOn` key, the comparison would come back with status `incomparable` and a `null` delta. `q.add(t1, t2)` sums disjoint categories of one dimension. For example, `typed-stock`'s 936,328 stack loads plus its 353,778 stack stores are 1,290,106 direct stack accesses, and the result keeps the formula. Adding totals of different units, or totals that overlap, is refused (`incompatibleUnits`, `doubleCount`).

Device time is the third kind of evidence, and it has its own global. `hardware.pairs(baseline, candidate, phase)` returns within-block paired ESP32-P4 timings in microseconds. `hardware.loads(treatment)` returns on-device cold-compile costs. Keeping `hardware` apart from `profiles` is deliberate. An emulator count is not a device time, and no call converts one into the other. `simd` joins compiler SIMD decisions to complete per-PC execution histograms, and only when both name the same image SHA. Both namespaces exist only when their study is mounted.

## 10. When the evidence cannot answer

The API distinguishes two kinds of "no", and treats them differently on purpose.

A *refusal* means the question was malformed: an unknown variant, an ordinal out of range, a plan read as a value, or a comparison of incompatible units. Refusals are thrown as `[code] message` with a `fix:` line, and `err.code` carries the code:

```text
[unknownVariant] variant "release" is unknown. Valid: checked, firmware, unchecked
[ordinalOutOfRange] no event with ordinal 10000 in checked/middle (ordinals 0..194, 195 events)
```

A *scientific gap* means the question was well formed but the capture cannot answer it. Gaps come back as ordinary results, with a status and a reason:

| Question | Result |
| --- | --- |
| `run.initialModule().sourceLocations({function: "row"})` | `unavailable`, `missingDebugLocations`: the module has no debug info |
| `run.remarks().forEvent(e)` | `unavailable`, `missingRemarksArtifact`, which does not mean zero remarks |
| `q.joinPCs(profiles.arm("checked-llvm"), run.finalImage())` | `unavailable`, with `reasons` `missingPCSamples` and `missingInput`: no per-PC samples and no registered final image |
| a whole-function metric on a loop print | `unavailable`, `loopFragment` |
| a function a module print does not define | `absent` |
| an IR line the parser does not know | `unsupported` |

The reason for the split is that a zero, an empty array or `undefined` would be indistinguishable from a real measurement of nothing. `q.capabilities()` lists every capability of the mounted archive with its status and the call to use, so you can check what is answerable before you build on it.

Plans can take parameters. `q.param.int("minimum", {min: 1, max: 16, default: 1})` declares one, a predicate reads it through `ctx.param(minimum)` and lists it in `dependsOn`, and `q.run(plan, {bindings: {minimum: 4}})` evaluates with a value. Metric values are cached by definition, so a second binding reuses them. Reading a parameter the plan did not declare is refused with `[undeclaredParam]`.

## 11. The compiler workbench

The archive is fixed evidence about LLVM. The workbench half of the service is live. `compiler.at(rev)` loads the Typed compiler's files at a git revision into the session: the front end, the RV32 backend, the world assembler, and the `rv32-interp` and `typed-ray-bench` tools. `compiler.at("worktree")` loads them from disk instead.

Several revisions coexist in one session, each evaluated in its own scope, so they share no module objects. A commit is evaluated once per session, and `compiler.at` returns the same object again. `"worktree"` re-reads the files on every call, so an edit shows up in the next cell.

That makes before-and-after experiments a single cell. Example 17 compiles the ray tracer with the kernel policy at `04b0854`, the Step 19 compiler, and at the working tree. It then runs the opening frame of both on the native interpreter:

| Revision | image bytes | frame steps | output digest |
| --- | ---: | ---: | --- |
| `04b0854` | 11,600 | 3,399,939 | `b3c26cc8` |
| worktree | 11,544 | 3,239,635 | `b3c26cc8` |

The equal digests show that both programs render the same frame. The working-tree compiler executes 4.7% fewer instructions for it, the effect of the induction-variable and argument-register changes of Steps 20 and 21.

`rev.native.rayBench` is the revision's benchmark with the interpreter bound to `rv32`, the Go implementation. It takes about 50 ms per opening frame. `rev.rayBench` keeps the JavaScript reference, which takes 12 to 45 seconds in goja. Both return the same results, bytes, registers and per-PC counts. The equivalence is tested on 4,000 seeded random programs and on recorded frame digests.

The compiler can also be observed while it works. `typedRv32.compile` accepts two callbacks:

- `observeTape(name, phase, code)` receives a copy of each function's tape after every transform.
- `observePlan(name, plan)` receives the operand-location plan of each function.

In example 21, `typedRayInShadow`'s tape grows from 331 to 605 cells at the `version` phase, because loop versioning duplicates the loop into a guarded fast copy. The planner then scores 41 locations and assigns 21 register homes. Example 20 goes one level lower: it reads per-PC execution counts from a frame, finds the hottest instructions of `typedRayLitRow`, and classifies them with `rv32.classify`.

## 12. Inputs, parameters, jobs and results

A session reads its own inputs instead of receiving them through `eval`:

- `repo.read(path)` returns a working-tree file as `{path, revision, sha256, bytes, text}` with `.json()`.
- `repo.show(rev, path)` returns the same file at a commit.
- `repo.list(dir)` lists a directory.
- `mounts.NAME` holds a file given to `serve` with `--mount NAME=PATH`.

Paths cannot leave the repository, not even through a symlink, and `.git` is not readable. This keeps large inputs out of the 64 KiB cell limit and puts a digest on every input.

**Parameters.** A reusable script takes its parameters from `args`, which holds a fresh object in every cell. It is `{}` when none are given, so a script never picks up a value another script left behind. Values are JSON, so a string needs its quotes:

```sh
trace-repl eval --session "$sid" --arg rev='"04b0854"' --arg policies='["kernel", "default"]' < sweep.js
trace-repl eval --session "$sid" --args-file arms.json --arg rev='"worktree"' < compile-cost.js
```

**Jobs.** Anything longer than the 15-second cell deadline runs as a *job*: a cell with its own deadline, up to the service's `--max-job` (10 minutes by default). A job runs in the same VM, so it sees every binding and its own declarations persist.

```sh
trace-repl eval --session "$sid" --job --job-timeout 300 < cmd/trace-repl/examples/19-policy-sweep.js
job=$(trace-repl eval --session "$sid" --job --detach --code 'longWork()')
trace-repl job --session "$sid" --job-id "$job"          # state, and the result once finished
trace-repl job --session "$sid" --job-id "$job" --stop   # interrupt it
```

While a job holds a session, cells and other jobs sent to that session are refused at once with HTTP 409 and the job's ID, so they do not wait out their own deadlines. Ctrl-C on a waiting `eval --job` stops the job on the service. Example 19 is a job. It compiles the ray tracer under all five policies and runs each frame, which shows the compile-time and run-time trade the policies make:

| Policy | frame steps | image bytes | host compile (one run) |
| --- | ---: | ---: | ---: |
| `stock` | 15,532,634 | 9,564 | 40 ms |
| `interactive` | 8,997,126 | 6,792 | 54 ms |
| `balanced` | 5,578,770 | 8,048 | 101 ms |
| `default` | 4,888,369 | 11,964 | 135 ms |
| `kernel` | 3,239,635 | 11,544 | 220 ms |

**Results.** A value worth keeping goes to `results.save(name, value)`. The service writes it as `NAME.json` in its results directory, which by default is the user cache directory and never the repository. The record names what produced the value:

- the session, and whether a cell or a job saved it;
- the SHA-256 and size of that cell's source, and its `args`;
- the repository's checked-out commit;
- every compiler revision the session loaded, with file digests.

A result computed on `"worktree"` therefore still identifies the exact uncommitted files. `trace-repl results --name NAME` prints a record from the shell.

**Statistics.** Board studies all ask the same question: is the candidate faster than the control within each load block, and by how much? `stats.paired(rows, {key, control, candidate, value})` answers it in one place. Example 22 scores the RAY-PARITY run-15 board directly from its `rows.json`. Over six blocks the candidate saved a median 1.59% per block (11,164.5 µs to 10,986 µs), won all six, and the C frame was 7,733 µs. `stats.paired` refuses rows that match both arms, duplicate keys within an arm and keys present in only one arm. It returns the median of per-pair savings and, separately, the change between the arm medians, because those are different numbers.

## 13. Sessions, limits and trust

A service holds at most 32 sessions. A session that nobody has used for `--idle` (two hours by default; `0` disables the timeout) is unloaded with its bindings. A session that is running or queueing work is never idle. A later request to an unloaded session gets HTTP 404 with the reason, for example `session ... expired after 2h0m0s idle`. `trace-repl sessions` lists open sessions with their creation and last-use times, cell and job counts and any running job.

The per-request limits are 64 KiB of source, 64 KiB of `args`, 512 KiB of result and 15 seconds per cell. A session remembers its last 16 finished jobs.

The service is for trusted researchers on one machine. It binds only loopback addresses, offers no general module loader, and reads files only inside the repository and the mounts. JavaScript can still allocate memory in the host process. If you need a hard memory limit, run the server under an operating-system resource boundary.

## Key points

- The service inflates and verifies the evidence once, before it listens. Every reference a session hands out points at verified bytes.
- A session keeps its bindings, so an investigation grows one cell at a time. Wrap reusable scripts in a function so they can be sent again.
- Archive calls build plans, and `q.run(plan)` evaluates them. Results carry their unit, status, definition (`of`) and references.
- Ordinals are positions in the original stream and never change under filtering. Attribute a change to a pass only when its status is `known`.
- Static sites, executed instructions and device microseconds live in different namespaces with different units, and the API refuses to mix them.
- A malformed question is refused with a code and a fix. A question the evidence cannot answer returns `absent`, `unavailable` or `unsupported` with a reason, never zero.
- `compiler.at(rev)` and `rv32` turn the same session into a compiler workbench. Long work runs as a job, and `results.save` keeps the answer with its provenance.

## Troubleshooting

| Problem | Cause | Solution |
| --- | --- | --- |
| `[notEvaluated] this is a plan ...` | A result field such as `.value` was read on a plan. | Evaluate first: `q.run(plan).value`. |
| `SyntaxError: Identifier 'row' has already been declared` | Top-level names last for the whole session. | Reuse the binding, declare it with `let`, or wrap the script in `(() => { ... })()`. |
| `Cannot access a variable before initialization` | An earlier cell failed before initializing that `let`, `const` or `class`. | Use a new name, or open a new session; the hint names the binding. |
| `cell stopped at its evaluation deadline` | The cell ran longer than 15 seconds. | Send it as a job: `eval --job --job-timeout 300`. |
| HTTP 409 `session is busy with job ...` | A job holds the session. | Wait with `trace-repl job --job-id ID`, stop it with `--stop`, or use another session. |
| HTTP 404 `session ... expired after 2h0m0s idle` | The session was unloaded after `--idle`. | Open a new session and rerun your setup cells. |
| `missingDeviceStudy` or `missingSIMDStudy` | The service was started without that study. | Restart `serve` with `--device-study DIR` or `--simd-study FILE`, or report the value as unavailable. |
| A change row has status `gap` | The timeline was filtered before taking differences. | Filter the change rows (`.changes().where(...)`), not the timeline. |
| `--arg rev=worktree` is refused as not JSON | `--arg` values are JSON. | Quote strings: `--arg rev='"worktree"'`. |
| `unknown flag` when a shell variable holds several flags | zsh does not split unquoted variables into words. | Use an array, `A=(--addr 127.0.0.1:3796); trace-repl open $A`, or write the flags out. |
| `dial tcp 127.0.0.1:3791: connect: connection refused` | No service on that address, or it is still verifying the archive. | Check `tmux capture-pane -pt trace-repl` for "trace REPL ready", and use the same `--addr` as `serve`. |

## See Also

- `trace-repl help trace-repl-query-examples`: 25 runnable scripts with their outputs, from orientation to board statistics.
- `trace-repl help trace-repl-js-api`: every global, method, result shape, status and error code.
- `trace-repl help trace-repl-cli-and-http`: commands, flags, logging, limits and the HTTP protocol.
- `cmd/trace-repl/README.md`: the original service notes, including the SIMD lab loader.
- `ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/index.md`: the design history and the persona studies that shaped the API.
