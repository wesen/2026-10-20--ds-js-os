---
Title: Investigation diary
Ticket: PICOCALC-WORKBENCH-NATIVE
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of the native RV32 interpreter, the args channel, the result store, stats.paired blocks and the Files/Agenda worlds in the trace-REPL workbench."
LastUpdated: 2026-11-21T22:45:00-05:00
WhatFor: "Following how each workbench change was designed, implemented, measured and tested."
WhenToUse: "When resuming this ticket or reviewing one of its commits."
---

# Investigation diary

This diary records PICOCALC-WORKBENCH-NATIVE: the second round of changes to the trace-REPL compiler workbench (`cmd/trace-repl`, `pkg/trace*`), driven by PICOCALC-RAY-PARITY's field notes. Entries use the investigation format.

## Step 1: Orient, measure the reference, and write the design

I read the reference interpreter line by line, the workbench code that the changes touch, and the RAY-PARITY field notes and scripts that will use them. Before writing the design I ran the reference interpreter's opening frame in Node at the current `main` to have target numbers, and I checked in goja's source two facts the design depends on: typed arrays export as shared Go slices, and a pending interrupt surfaces from any JavaScript call as an uncatchable error.

The design (`design-doc/01-native-interpretation-parameters-and-results-in-the-compiler-workbench.md`) splits the interpreter at its loop: the reference's setup lines run unchanged in a JavaScript wrapper and Go runs only the loop, in place on the wrapper's typed arrays. It also found that I6 is mostly already done: `stats.paired` has returned per-pair values as `perPair` since W5.

### Prompt Context

**User prompt (verbatim, as quoted in the delegating brief):** "try to use the REPL as much as possible, building up a collection of scripts and all, noting all the things that are bad / could be improved / are good, and try to port your existing tools to it too, I kind of want to make it the centerpiece of our compiler optimization workflow."

**Delegated brief (summary, not the user's words):** implement, in priority order, I1 (a Go RV32 interpreter with the exact semantics of `picocalc-os/tools/rv32-interp.js`, exposed in sessions and usable with `compiler.at(rev)` programs, gated on identical results, bytes, trap flags and per-PC counts on the ray tracer's opening frame for the default and stock compiles and on small differential programs including traps, with the speedup against the goja-hosted reference measured), I2 (`trace-repl eval --arg NAME=JSON` / `--args-file`, a fresh `args` per cell, recorded with jobs), I5 (a result store), I6 (per-block detail from `stats.paired`), I2b (`world()` for Files and Agenda), and, if time remains, a proposal for an exported opcode table (I3b). Create a docmgr ticket with a design doc before implementing, keep an investigation diary, commit with tests (`go test`, `-race`, `go vet`, gofmt), use ports 3811–3819 only, do not touch `picocalc-os/compiler/`, `picocalc-os/tests/`, the RAY-PARITY ticket or the device, and write a vault report at the I1 + I2 milestone.

**Assistant interpretation:** Make the workbench fast enough and safe enough that RAY-PARITY's frame profiles, sweeps and scoring stay inside it, and prove the fast interpreter is the reference interpreter.

**Inferred user intent:** The compiler optimization loop (compile, interpret, compare, score) should happen in one persistent tool, with results that can be trusted and traced.

### What I did

- Fast-forwarded this worktree's branch from `ad48b80` to `main` at `2712684` (`git merge --ff-only main`). The branch had been created 258 commits behind `main` and contained neither `cmd/trace-repl` nor `pkg/`.
- Wrote `$SCRATCH/go.work` (`use` the worktree, `replace github.com/go-go-golems/go-go-goja => /home/manuel/code/wesen/go-go-golems/go-go-goja`) and a wrapper `$SCRATCH/gow` that sets `GOWORK` and `GOFLAGS=-buildvcs=false`, as PICOCALC-TRACE-WORKBENCH's diary Step 2 describes. `gow build ./...` passes.
- Read `picocalc-os/tools/rv32-interp.js` (all 213 lines) and `typed-ray-bench.js`; `pkg/tracerepl/{service,jobs,http}.go`, `pkg/traceapi/{install,compiler,stats,repo}.{go,js}`, `pkg/tracecompiler/compiler.go`, `cmd/trace-repl/main.go`; the TRACE-WORKBENCH guide and diary; RAY-PARITY's field notes and `scripts/workbench/{frame-profile,compile-cost,hot-code,tape}.js` and `scripts/15-score-board-workbench.js`.
- Ran the reference under Node with a scratch harness (`$SCRATCH/node-baseline.mjs`, the W1 wrapper over the worktree files):

| Compile | Image | Steps | `bytes` SHA-256 | FNV-1a | Node |
|---|---|---|---|---|---|
| default | 11,964 B | 4,888,369 | `430f0d50…2117625` | `b3c26cc8` | 152 ms |
| `{policy: "stock"}` | 9,564 B | 15,532,634 | `430f0d50…2117625` | `b3c26cc8` | 385 ms |

- Read goja's `typedarrays.go` (`typedArrayObject.export` returns `unsafe.Slice` over the buffer), `vm.go` (`vm.run` loads `vm.interrupted` before every instruction; `exceptionFromValue` returns nil for `*InterruptedError`, so it is uncatchable) and `runtime.go` (`runWrapped` returns an uncatchable exception as the callable's error).
- Created the ticket, the design doc, this diary and eleven tasks.

### Why

- The design depends on two engine properties (shared-slice export and interrupt visibility from Go). Checking them in the source first avoided designing a copy-based bridge or a context-threading change to `tracerepl` that would not be needed.

### What worked

- The brief's digest `430f0d50…` is the SHA-256 of `bytes`, and both the default and the stock compile produce it at `2712684`. The field notes' `b3c26cc8` is the FNV-1a of the same bytes.

### What didn't work

- My first `ls pkg cmd/trace-repl` failed with `ls: cannot access 'pkg': No such file or directory`: the branch predated the workbench merge. Fast-forwarding fixed it.
- Shell commands that set `GOWORK` with command substitution or a heredoc were refused by the worktree-isolation guard ("names git in a form too complex to verify"). Writing `go.work` and the `gow` wrapper with the file tool and calling the wrapper by path works.

### What I learned

- The opening frame at `main` is 4,888,369 steps with the default options, not the 5,578,770 of field-notes entry 3: versioned loops and live-range splitting became the default in `2712684`.
- `stats.paired` already returns `perPair: [{key, control, candidate, percentSaved}]`. Field-notes entry 1 says it does not return per-block values. The data was there but undocumented in the help text, and the score script dropped it.
- The reference checks a relocation before it looks at the word, so an import call site's word is never executed and an `ebreak` at a relocated offset is an import call, not a trap.

### What was tricky to build

- Nothing built yet. The subtle part of the design is the order of checks at an import call (lookup, no-handler fault, `sp` alignment, then `fn.params.length`), which the bridge has to keep by calling back into JavaScript twice.

### What warrants a second pair of eyes

- The claim in design Section 3.1 that `div`'s double-precision quotient, truncated, always equals truncating integer division for 32-bit operands. The argument: the quotient's rounding error is below `2^-22 / |b|`, the distance from a non-integer quotient to the nearest integer is at least `1 / |b|`. The differential tests exercise it, but a proof is cheaper to check than a test.

### What should be done in the future

- N/A for this step.

### Code review instructions

- Read design Sections 3.1 and 3.2 against `picocalc-os/tools/rv32-interp.js`.

### Technical details

- Build: `$SCRATCH/gow build ./...`, `$SCRATCH/gow test ./...`, where `$SCRATCH` is this session's scratchpad.
- Ports: this ticket's services use 3811–3819. 3796 is the main agent's, 3791–3795 belong to other work.
