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
lab.packetPrediction()                        // predicted vs executed scratch loads
lab.packetCosts("opening", "mixed")           // physical hand kernel cycles per packet
lab.frame("default","clean","baseline","empty") // paired physical microseconds
lab.selection("dynamic", 3, 35)              // prediction, image hash and cycles per call
lab.physicsPair("contact", 128, "grouped-scalar", "grouped-pie")
~~~

The director loader adds the `lab` binding only in its new session. The `simd` provider is available in every session of the mounted study. [Study index](../../ttmp/2026/11/21/PICOCALC-SIMD-LAB--choosing-simd-packet-boundaries-in-the-typed-compiler-on-esp32-p4/index.md)

## HTTP protocol

| Request | Response |
| --- | --- |
| `POST /sessions` with empty body | HTTP 201, `{"id":"session-…"}` |
| `POST /sessions/{id}/eval` with `Content-Type: application/json` and `{"source":"7 * 6"}` | HTTP 200, `{"ok":true,"value":42}` |
| JS parse or evaluation error | HTTP 200, `{"ok":false,"error":"…"}`. A subsequent valid cell can still run. |
| Unknown session | HTTP 404 with a JSON error |
| `DELETE /sessions/{id}` | HTTP 204 |

A declaration produces `"value":null,"kind":"undefined"`. A cell can emit `console.log`, `info`, `debug`, `warn` or `error`, which appear in the response's optional `console` array. End a cell with a data value to see it as JSON. Return `undefined` explicitly when you want to keep a large binding without transporting its contents. For example, `const values = [1,2,3]; undefined`, followed by `values.length` in a new cell. Redeclaring a top-level lexical binding is a JavaScript error. Use `let` for names that you want to reassign. A cell that fails after declaring a top-level `let`, `const` or `class` leaves that name unusable for the rest of the session; the error names it, and a new name or a new session recovers.

Evaluations within a session execute serially. The execution deadline is 15 seconds including the wait to enter that session. Separate sessions can execute concurrently over the archive. A standalone `await expression` cell can consume an immediately settled promise. Ordinary multi-statement cells follow script syntax, so `const r = await q.run(plan)` is a syntax error; write `const r = q.run(plan)`. An interrupted cell reports whether it reached the deadline or its session or the service closed. The API operates on local evidence synchronously. Promise-based external I/O has no event source.

Use this service with trusted researchers on a local machine. It binds a loopback address and provides the selected archive and standard JavaScript objects. It omits a general host module loader. The evaluator caps the size of incoming source and outgoing serialized results and captures a limited amount of console output. JavaScript can still allocate memory in the host process. For jobs that require a hard process-memory limit, choose an operating-system resource boundary for the server.
