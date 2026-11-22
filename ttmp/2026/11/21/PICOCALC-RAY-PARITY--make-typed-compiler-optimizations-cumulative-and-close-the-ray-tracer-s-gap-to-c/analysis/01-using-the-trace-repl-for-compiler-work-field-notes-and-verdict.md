---
Title: Using the trace REPL for compiler work - field notes and verdict
Ticket: PICOCALC-RAY-PARITY
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: cmd/trace-repl/README.md
      Note: Service protocol and mounts
    - Path: pkg/tracerepl/service.go
      Note: MaxSourceBytes (64 KiB) and the 15 s cell deadline
    - Path: ttmp/2026/11/21/PICOCALC-RAY-PARITY--make-typed-compiler-optimizations-cumulative-and-close-the-ray-tracer-s-gap-to-c/scripts/repl_client.py
      Note: Client written to work around the limits recorded here
ExternalSources: []
Summary: "What the trace REPL did and did not do while it was used as the main workbench for a real compiler change, and what to change so it becomes the inner loop of compiler work."
LastUpdated: 2026-11-21T19:45:00-05:00
WhatFor: "Deciding what to build next in cmd/trace-repl"
WhenToUse: "Before extending the REPL or starting a compiler study that will use it"
---

# Using the trace REPL for compiler work: field notes and verdict

This document records how the trace REPL behaved while it was used as the main workbench for PICOCALC-RAY-PARITY. That work is a sequence of real compiler changes, not a study of the REPL. The notes are chronological observations with the exact errors. The verdict at the end is updated as the work proceeds.

## What the REPL is

`cmd/trace-repl` is a Go service built on go-go-goja. `serve` loads one LLVM pass-dump capture, the required `--archive`, and optionally a PIE-LOOPS device study (`--device-study`) and a SIMD evidence file (`--simd-study`). It verifies every stream digest and exposes JavaScript sessions over HTTP on loopback. A session keeps its bindings between cells. The globals are `q` (query builder), `a` (archive), `profiles`, `hardware` and `simd`.

## Field notes

### N1. Five services, no inventory

Five services were running when the work began, on ports 3791–3795, each a separate `go run` started by an earlier lab. One mounts a file under `/tmp`. No endpoint reports what a service has mounted. `GET /` returns `404 page not found`, so the only way to tell them apart was `ps -eo args` and the tmux session names. The help text on port 3795 says "queries over the PicoCalc LLVM row archive" while that service mounts the SHADOW-LLVM capture.

### N2. The query language works, with known friction

On the SHADOW-LLVM capture, `run.functions()` listed `checked_read`, `checked_shadow` and `kernel`. A bundle `q.run({allocas: …, calls: …, phis: …})` over `kernel`'s middle timeline returned one call-site change, at ordinal 80 (JumpThreadingPass, 14 → 12), and five phi changes, each with byte-exact references. `q.run(run.functions())` failed with `[notAPlan]`, the same error the persona studies recorded. The suggested fix in the message was correct.

### N3. Renamed functions split their history

SROA removed the shadow kernel's 18 allocas while the function was still `checked_shadow`. GlobalOpt renamed it to `kernel` at middle ordinal 17. `kernel`'s timeline therefore shows zero alloca changes. A reader has to know the rename to find the promotion. The archive has the information to link the two names, since the rename is visible in consecutive prints.

### N4. The REPL is most useful as a persistent compiler sandbox

The session VM can hold the Typed compiler itself. After chunked loading (N5), `typedRv32.compile` ran unmodified in goja and produced the same 9,564-byte stock ray image as Node. goja is a bytecode interpreter, as QuickJS on the P4 is. It reproduced the planner's cold-compile overhead that V8 hides: `operandLocations: {}`, with no policy enabled, cost +24% of a ray compile. That observation located the cause in minutes, and it led to the first compiler change of this ticket (diary Step 2).

### N5. The 64 KiB cell limit applies to code and data

`typed-wasm.js` is 70,183 bytes. Evaluating it returned `source exceeds 64 KiB`. The assembled Editor source is over 64 KiB as a string literal and returned HTTP 413. `scripts/repl_client.py` works around both: it appends 30,000-character chunks to a global string and evaluates or binds the result. Every user who wants their own data in a session has to rebuild this. OPERAND-HOMES pushed rows 64 at a time with `rows.push(...)`.

### N6. The 15-second deadline makes the REPL unsuitable for batch work as it stands

A cell comparing 38 inputs × 7 option sets × 2 compilers stopped with `cell stopped at its evaluation deadline (at most 15s, including the wait for this session)`. Benchmarks and equivalence sweeps must be split into one cell per unit by an external driver. That turns a REPL session into an RPC target for a Python script.

### N7. Statistics are rewritten in every study

Each study defines its own `median` and paired-block comparison. OPERAND-HOMES `scripts/05-query.js` and this ticket's `03-compile-cost.py` both contain one. A shared, tested `stats` global would remove a source of small inconsistencies, for example a median of paired percentages against a percentage of medians.

## Verdict (in progress)

The REPL's archive queries answer narrow questions about LLVM passes precisely and with verifiable references. Its larger value is the persistent VM, which can run the Typed compiler and keep large inputs and helper functions between questions. As built, both uses are held back by the same three limits: no way to load files or data except through eval, a 64 KiB cell cap, and a 15-second deadline. Recommendations, highest value first:

1. **A compiler workbench module.** Preload `typed-wasm`, `typed-async`, `typed-world`, `typed-rv32` and `typed-pie-loops` from a named revision or the working tree. Expose `compiler.at(rev)` so a session can hold a base and a candidate backend. This replaces `scripts/01-open-compiler-session.py`.
2. **Mounted inputs instead of eval-shipped data.** `--mount name=path` for files under the repository, read-only, bound as strings or parsed JSON. This removes N5 for everything except interactive snippets.
3. **Long-running jobs.** `POST /sessions/{id}/jobs` returning an ID, with the result fetched later, and the 15-second limit kept for interactive cells. This removes N6.
4. **An inventory endpoint.** `GET /info` listing mounts, digests, repository revision and session count, plus correct per-mount help text. This removes N1.
5. **Rename-aware function identity** in LLVM timelines (N3).
6. **A shared `stats` global** with median, paired percentage change by block, and win counts (N7).
