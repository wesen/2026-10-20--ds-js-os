# Compiler trace REPL

`trace-repl` opens the PicoCalc LLVM capture once on the host. Each session has its own JavaScript VM. Bind a query, a derived table or a closure to a variable and use it in later cells. Session variables last until the session closes or the server exits.

## Start and query

Run these commands from the repository root. The Go module uses the adjacent checkout `../go-go-golems/go-go-goja` (tested at tag `v0.10.7`). Go selects toolchain 1.26.10.

```sh
tmux new-session -d -s trace-repl \
  'go run ./cmd/trace-repl serve --archive ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes'
tmux capture-pane -pt trace-repl -S -10
sid=$(go run ./cmd/trace-repl open)
go run ./cmd/trace-repl eval --session "$sid" --code 'q.help()'
go run ./cmd/trace-repl eval --session "$sid" --code 'const doubled = n => n * 2'
go run ./cmd/trace-repl eval --session "$sid" --code 'doubled(21)'
go run ./cmd/trace-repl close --session "$sid"
```

Before it listens, the server inflates every pass-dump stream once and checks it against the manifest digest and each index header; a damaged capture stops startup, and every reference a session hands out cites verified bytes. It then writes a readiness record with its address. To choose another port, give every command the same `--addr 127.0.0.1:PORT`. To query the independent ESP32-P4 timing captures as well, pass `--device-study ttmp/2026/11/21/PICOCALC-PIE-LOOPS--infer-and-lower-packed-loop-regions-in-unchanged-typed-programs` when starting the server. `hardware.pairs(baseline, candidate, phase)` gives within-block paired device times and `hardware.loads(treatment?)` gives the on-device cold compile cost of each treatment. Without `--device-study`, `hardware.help().available` is false and every data call fails with `missingDeviceStudy`; guest instruction counts in `profiles` are not a substitute for device time. To join compiler SIMD decisions to per-PC execution counts, pass `--simd-study FILE`, one `p4-simd-evidence-v1` JSON file holding RV32 images, decisions with byte ranges, complete per-PC traces and packet sets. The server verifies image digests, ranges, PCs and exact step sums before listening and refuses a malformed file. `simd.executions(decisionID, traceID, role)` sums executions inside one role's ranges and refuses a decision and trace from different images. Without the flag, or with a file that records nothing, `simd.help().available` is false and every data call fails with `missingSIMDStudy` or `emptySIMDStudy`. Server logs support `--log-level debug`. The CLI also reads multi-line programs from stdin when `--code` is absent.

## Inspect SIMD decisions by emitted image

The SIMD lab service on `127.0.0.1:3794` mounts the ray packet experiments and physics reference. Use the same address for each request. From the project checkout:

```sh
sid=$(go run ./cmd/trace-repl open --addr 127.0.0.1:3794)
go run ./cmd/trace-repl eval --addr 127.0.0.1:3794 --session "$sid" \
  --code "simd.executions('empty-row','empty-opening','scalar-lane-load')"
go run ./cmd/trace-repl close --addr 127.0.0.1:3794 --session "$sid"
```

The query counts 9,182 dynamic instructions on the captured opening-scene workload and returns the image digest, the static byte intervals and contributing instruction addresses. The prior packed producer executed 26,070 lane loads on the same fixture. Cross-image address joins fail explicitly. To start an equivalent study or replay its example cells, see the [capture and launch scripts](../../ttmp/2026/11/21/PICOCALC-SIMD-LAB--choosing-simd-packet-boundaries-in-the-typed-compiler-on-esp32-p4/scripts/evidence).

For the six SIMD experiments, open a session that also contains the physical frame, particle, contact and collision trials. From the repository root, this loader prints an ID after it verifies the example queries.

~~~sh
ticket=$(ls -d ttmp/2026/11/21/PICOCALC-SIMD-LAB--*)
python3 "$ticket/scripts/director/09-open-lab-session.py" --keep
~~~

Reuse the printed ID with the same `eval --addr 127.0.0.1:3794 --session` command above. These are separate expressions that can be evaluated in any order.

~~~js
lab.rayVersusC("default", "clean")            // paired time ratios to scalar and hand-PIE C
lab.packetPrediction()                        // predicted vs executed scratch loads
lab.packetCosts("opening", "mixed")           // physical hand kernel cycles per packet
lab.frame("default","clean","baseline","empty") // paired physical microseconds
lab.selection("dynamic", 3, 35)              // prediction, image hash and cycles per call
lab.physicsPair("contact", 128, "grouped-scalar", "grouped-pie")
~~~

The director loader adds the `lab` binding only in its new session. The `simd` provider is available in every session of the mounted study. [Study index](../../ttmp/2026/11/21/PICOCALC-SIMD-LAB--choosing-simd-packet-boundaries-in-the-typed-compiler-on-esp32-p4/index.md)

## Load the Typed compiler at a revision

`compiler.at(rev)` loads `picocalc-os/compiler/{typed-wasm,typed-async,typed-world,typed-rv32,typed-pie-loops}.js` and `picocalc-os/tools/{rv32-interp,typed-ray-bench}.js` at a git revision, and `compiler.at("worktree")` loads them from disk. Several revisions coexist in one session: the service evaluates each revision's files inside one function scope that shadows `globalThis`, so revisions share no module objects and nothing reaches the real global object. The compiled wrapper is shared by all sessions, and the 64 KiB cell limit does not apply to it.

```js
const base = compiler.at("eaf0872"), work = compiler.at("3213028")
const ray = work.ray                                   // raytrace.typed at 3213028
base.typedRv32.compile(ray, [], 96 * 1024).image.length // 8632
work.typedRv32.compile(ray, [], 96 * 1024, {operandLocations: {forward: true, capacity: true, homes: true, saved: true, direct: true}}).image.length // 8048
work.rayBench.frameProfile(work.typedRv32.compile(ray, [], 96 * 1024)).steps
work.world("chess").text                               // assembled from worlds/chess/source.list
work.files                                             // [{path, sha256, bytes, line}]
```

A revision object also has `typedWasm`, `typedAsync`, `typedWorld`, `typedPieLoops`, `interp` (`typedRv32Interp`), `globals` (every name the files published, such as `compileTypedWorldRv32`), `read(path)`, `typedSources()`, `missing` (optional files absent at that revision; the two tools exist from `eaf0872` on) and `where(line)`, which maps a `compiler@REV:LINE` stack position to a file and line. A commit is evaluated once per session and `compiler.at` returns the same object again. `"worktree"` re-reads the files on every call. `GET /info` lists the cached commits.

## Read repository files and mounted inputs

A session reads its own inputs instead of receiving them through `eval`. `repo.read(path)` returns a working-tree file as `{path, revision: "worktree", sha256, bytes, gzip, text}`, and `.json()` parses its text. `repo.show(rev, path)` returns the same object for a git revision, with the full commit SHA in `revision`. `repo.list(path, rev?)` lists a directory and `repo.resolve(rev)` names a commit. Paths are relative to the repository root and may not leave it, also not through a symlink; `.git` is not readable. Files are capped at 32 MiB, and a `.gz` file is inflated while its `sha256` and `bytes` describe the compressed file. Content at a revision is cached for all sessions; working-tree reads are not.

The repository is `--repo DIR`, or by default the git work tree that contains the server's current directory. For a file elsewhere, pass `--mount NAME=PATH` (repeatable) when starting the server. The file is read and digested before the server listens, appears in `GET /info`, and is `mounts.NAME` in every session. `mounts.list()` describes all mounts without their text.

```js
const rows = repo.read("ttmp/2026/11/21/PICOCALC-RAY-PARITY--…/various/13-board/rows.json").json()
repo.show("eaf0872", "picocalc-os/compiler/typed-rv32.js").sha256
mounts.board.json()          // started with --mount board=/tmp/bench/rows.json
```

## Session lifetime

A service holds at most 32 sessions. A session that nobody has used for `--idle` (default `2h`; `0` keeps sessions until they are closed) is unloaded, and its bindings are gone. A session that is running or queueing a cell or job is never idle, and its idle time starts when that work ends. A later request to an unloaded session gets HTTP 404 with the reason, for example `session session-… expired after 2h0m0s idle`. `trace-repl sessions --addr …` lists the open sessions with their creation and last-use times, cell and job counts and any running job.

## Run long work as a job

A cell must finish within 15 seconds. A job is a cell with its own deadline, up to the service's `--max-job` (default `10m`). It runs in the same session VM, so it sees every binding of earlier cells and its own top-level declarations persist. While a job is queued or running, the session refuses cells and other jobs at once with HTTP 409 and the job's ID, instead of letting them wait out their deadline. A job's result obeys the same 512 KiB limit as a cell's. A session remembers its last 16 finished jobs.

```sh
go run ./cmd/trace-repl eval --session "$sid" --job --job-timeout 300 < sweep.js   # waits and prints the result like eval
job=$(go run ./cmd/trace-repl eval --session "$sid" --job --detach --code 'longWork()')
go run ./cmd/trace-repl job --session "$sid" --job-id "$job"           # state, and the result once finished
go run ./cmd/trace-repl job --session "$sid" --job-id "$job" --stop    # interrupt it
```

Interrupting `eval --job` with Ctrl-C stops the job on the service as well. Closing the session stops its job with the reason "job stopped because its session was closed".

## Shared statistics

Every session has a `stats` global, so studies stop re-implementing medians and paired comparisons. `stats.median`, `stats.mean`, `stats.quantile(xs, p)` (linear interpolation, R type 7) and `stats.summary(xs)` refuse empty arrays and non-finite values. `stats.paired(rows, {key, control, candidate, value, better})` pairs one control row with one candidate row per key, for example per load block, and returns the median of the per-pair percentage saved, `100 * (1 - candidate / control)`, with wins, losses and ties. It also returns `percentSavedOfMedians`, the change between the two arm medians, which is a different number. It refuses rows that match both arms, duplicate keys within an arm and keys present in only one arm, and names them. `stats.help()` lists the rest.

```js
stats.paired(rows, {key: "block", control: r => r.arm === 2, candidate: r => r.arm === 3, value: "value"})
// → {pairs: 6, controlMedian, candidateMedian, medianPercentSaved, percentSavedOfMedians, wins, losses, ties, method, perPair}
```

## Find out what a running service mounted

Several services often run side by side on different ports. `trace-repl info --addr 127.0.0.1:PORT` prints the inventory of one of them: the archive's directory, ticket name, title and stream digests, the device and SIMD studies (or `null`), open sessions against the limit, and the per-cell limits. `build.revision` is the git commit that `go build` stamped into the binary. A `go run` service has no stamp, so the field is `null`. A binary built inside a git worktree is stamped with the enclosing main checkout's commit, not the worktree's, so build there with `-buildvcs=false`. `q.help()` names the same archive.

## HTTP protocol

| Request | Response |
| --- | --- |
| `GET /` | HTTP 200, the list of routes |
| `GET /info` | HTTP 200, `{"service","build","repo":{"root","head"},"mounts","archive","deviceStudy","simdStudy","sessions":{"open","max"},"limits":{"sourceBytes","resultBytes","cellSeconds"},"started"}` |
| `POST /sessions` with empty body | HTTP 201, `{"id":"session-…"}`; HTTP 429 at 32 open sessions |
| `GET /sessions` | HTTP 200, `[{"id","created","lastUsed","idleSeconds","cells","jobs","activeJob","busy"}]`, oldest first |
| `POST /sessions/{id}/eval` with `Content-Type: application/json` and `{"source":"7 * 6"}` | HTTP 200, `{"ok":true,"value":42}` |
| JS parse or evaluation error | HTTP 200, `{"ok":false,"error":"…"}`. A subsequent valid cell can still run. |
| Unknown session | HTTP 404 with a JSON error; for a session unloaded after `--idle`, the error says `session … expired after 2h0m0s idle` |
| `POST /sessions/{id}/jobs` with `{"source":"…","timeoutSeconds":600}` (`timeoutSeconds` optional) | HTTP 202, `{"job":"job-…","state":"queued","timeoutSeconds":600,…}` |
| `GET /sessions/{id}/jobs/{job}` | HTTP 200, `{"job","session","state","submitted","started","finished","timeoutSeconds","elapsedSeconds","result"}`; `state` is `queued`, `running`, `done`, `failed` or `stopped`, and `result` is a cell result once finished |
| `GET /sessions/{id}/jobs` | HTTP 200, the session's jobs without results, oldest first |
| `DELETE /sessions/{id}/jobs/{job}` | HTTP 200, the job after it stopped (waits up to 5 s) |
| `eval` or a job sent while a job holds the session | HTTP 409, `{"ok":false,"error":"session is busy with job …","job":"job-…"}` |
| `DELETE /sessions/{id}` | HTTP 204 |

A declaration produces `"value":null,"kind":"undefined"`. A cell can emit `console.log`, `info`, `debug`, `warn` or `error`, which appear in the response's optional `console` array. End a cell with a data value to see it as JSON. Return `undefined` explicitly when you want to keep a large binding without transporting its contents. For example, `const values = [1,2,3]; undefined`, followed by `values.length` in a new cell. Redeclaring a top-level lexical binding is a JavaScript error. Use `let` for names that you want to reassign. A cell that fails after declaring a top-level `let`, `const` or `class` leaves that name unusable for the rest of the session; the error names it, and a new name or a new session recovers.

Evaluations within a session execute serially. The execution deadline is 15 seconds including the wait to enter that session. Work that takes longer, such as an equivalence sweep or a compile-cost measurement, runs as a background job (below). Separate sessions can execute concurrently over the archive. A standalone `await expression` cell can consume an immediately settled promise. Ordinary multi-statement cells follow script syntax, so `const r = await q.run(plan)` is a syntax error; write `const r = q.run(plan)`. An interrupted cell reports whether it reached the deadline or its session or the service closed. The API operates on local evidence synchronously. Promise-based external I/O has no event source.

Use this service with trusted researchers on a local machine. It binds a loopback address and provides the selected archive and standard JavaScript objects. It omits a general host module loader. The evaluator caps the size of incoming source and outgoing serialized results and captures a limited amount of console output. JavaScript can still allocate memory in the host process. For jobs that require a hard process-memory limit, choose an operating-system resource boundary for the server.
