---
Title: Program diary
Ticket: PICOCALC-TYPED-FIRST
Status: active
Topics:
    - compiler
    - os
    - testing
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-22T19:30:11.406592747-05:00
WhatFor: ""
WhenToUse: ""
---

# Program diary

The coordinator's diary for the Typed-first program. Each ticket's subagent keeps its own diary in its ticket (`reference/01-diary.md`); this one records the plan, the merges, the gates after each merge, firmware installs and the vault reports.

## Step 1: Tickets and designs

The user asked for tickets covering the architecture review (compiler, emulators, repository structure) and the splitting of long files, then for subagents to build them. I created the umbrella ticket and ten new tickets, widened PICOCALC-TYPED-F32 and gave PICOCALC-AGENDA-TYPED-WORLD a real design, and wrote one design document per ticket from the review's findings.

### Prompt Context

**User prompt (verbatim):** "Ok, creat ehte tickets, make design docs for each, then  build them using subagents, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

Each subagent should keep their own diary, and when they come back, write vault reports at important milestones (I guess 3-4 vault reports total)."

**Earlier user messages this builds on (verbatim):**
- "can we do floats in typed? I want to avoid using C actually, this is about oding everything in typed in order to learn about efficiently compiling code to riscv32. in fact put this in the AGENTS.md or something: the goal of this project is to build an operating system based on typed javascript, with quickjs only as fallback, and C if it can't be avoided, or as benchmark (like in this case with raytracing)."
- "what's the architecture of our compiler, how could we clean it up and refactor it, same for the emulators, and in general the structure of this project?"
- "what tickets would you do to cover the above? also i want to split files that are too long into files / directories / odules"

**Assistant interpretation:** Turn the review into tickets with designs, run each ticket as a subagent in its own worktree in dependency order, merge and gate on main, keep this diary, and write four vault reports at milestones.

**Inferred user intent:** A compiler and repository that make Typed the default implementation language, and floats possible, without losing the measurement discipline.

### What I did

- Created PICOCALC-TYPED-FIRST and ten tickets (TYPED-TAPE, TYPED-FRONTEND, TYPED-PIPELINE, RV32-REGISTERS, RV32-CONFORMANCE, TYPED-BITWISE, CANDELA-TYPED, TYPED-ASYNC-TAPE, TYPED-APP-MANIFEST, SPLIT-FILES).
- Wrote the design documents. TYPED-F32 gets `design-doc/02` (whole kernel, explicit Wasm/RV32 semantics, a Typed math library). AGENDA-TYPED-WORLD gets `design-doc/02` (Agenda and Files onto the generic world reactor).
- Every design ends with the same rules: the goal, gates, byte identity, the board protocol (only the coordinator installs playable firmware), generated files, checked scripts for moves, the diary format, commits.
- Added one merge task per ticket and one task per vault report to this ticket.

### Why

- **Who installs firmware.** Only the coordinator installs firmware and rewrites `PLAYABLE.json`, because several subagents may use the one board, and `PLAYABLE.json` must name what is actually installed.
- **Splits go into the rewriting tickets.** A file that a ticket rewrites is split inside that ticket, so no file moves twice and parallel branches conflict less.

### What was tricky

- **The wave plan.** Dependencies decide it. TAPE, CONFORMANCE, APP-MANIFEST and SPLIT-FILES touch disjoint areas and start together. FRONTEND, PIPELINE and BITWISE wait for TAPE; REGISTERS waits for PIPELINE; F32 waits for TAPE, REGISTERS and CONFORMANCE.
- **The serial lock.** SPLIT-FILES and APP-MANIFEST both want a board check. The lock serializes them, and each restores the playable image.

### Decisions recorded

- **cji** is on the file-length exception list. It is the book's compiler, and a fallback under the goal.
- **`calc.js`** is ported to Typed later instead of being split.

### Technical details

- Designs: `ttmp/2026/11/22/PICOCALC-*/design-doc/01-*.md`, `PICOCALC-TYPED-F32/design-doc/02-*.md`, `PICOCALC-AGENDA-TYPED-WORLD/design-doc/02-*.md`.
- Commit: `56cd256` (tickets and designs).

## Step 2: Wave 1 launched

Four subagents started at `56cd256`, each in its own git worktree, on the tickets with no dependencies: PICOCALC-TYPED-TAPE, PICOCALC-RV32-CONFORMANCE, PICOCALC-TYPED-APP-MANIFEST and PICOCALC-SPLIT-FILES. Each brief names the files to read (AGENTS.md, the program design, its own design), the diary skill's investigation format, the gates, the board rules (the serial lock, experiment images only, restore the playable image, never write `PLAYABLE.json`), and the files the other three own.

### Why these four together

- **Disjoint files.** They touch largely disjoint files:
  - TAPE: `compiler/typed`, the loaders, one line in the bundle list;
  - CONFORMANCE: the executors and a capture app;
  - APP-MANIFEST: the P4 port and profiles;
  - SPLIT-FILES: the nucleus, `pkg`, `cmd` and tools.
- **Ordered for merging.** SPLIT-FILES does the trace-repl move last, so it rebases easily over TAPE's change to `pkg/tracecompiler`.

### What warrants a second pair of eyes

- **Three tickets may want the board at once.** CONFORMANCE (capture), APP-MANIFEST (qualification) and SPLIT-FILES (a probe boot) may all want it. `bench/board/device.py`'s lock serializes them. Each brief requires restoring the playable image, but an agent that dies mid-experiment could leave an experiment image installed. After each wave I check with `python3 bench/board/run.py --probe`.

## Step 3: TAPE and CONFORMANCE merged, wave 2 launched

The first two tickets came back with every gate passing. TAPE fast-forwarded onto `main`, ending at `0e375c2`. CONFORMANCE needed a merge commit (`bf30d31`), because its branch was fast-forwarded to `4b9a80b`, not to TAPE. Both pass on `main`, and wave 2 (FRONTEND, PIPELINE) started from `bf30d31`.

### What I did

- Merged both branches and reran the gates on `main`:
  - `make test`: exit 0. It now includes `test-rv32` and the tape-coverage test.
  - `gates.sh` with the default policy: ray 4,888,369 instructions, digest `430f0d501659`; Chess 6,981 words, 128,152,624 instructions; 24/24 replays.
  - `gates.sh` with `kernel`: ray 3,239,635 instructions, same digest; Chess 118,361,847 instructions; 24/24 replays.
- Reran `firmware/tools/wasm-toolchain.sh` in the main checkout. Both agents reported that `firmware/build/wasm-toolchain/res/lib/wasi` still pointed into `picocalc-os/`, which was left over from the rename in Phase D.
- Started FRONTEND and PIPELINE. BITWISE waits for both, because it edits the tokenizer in `typed-wasm.js` and the RV32 emitters.
- Started building and installing the playable firmware at `bf30d31`. TAPE adds `typed/tape.js` to the compiler bundle, so the image changes.

### What the agents found (from their reports; details in their diaries)

- **TAPE.**
  - With the design's singular effect names, `CALL = 4` (an effect bit) overwrote the opcode constant `CALL = 0x10`, and every call compiled as an `if`. `tape.js` now refuses a name defined twice.
  - The compiler bytecode cache on the device held 8 entries for 8 sources. A ninth source would never have been cached, so the cache now holds 12.
  - Output stayed byte-identical over 84 digests.
- **CONFORMANCE.**
  - The suite has 15,664 vectors, 15,454 of them run on the P4 (chip revision 1.3, `misa` 0x40901125).
  - The P4's FPU follows the RISC-V F specification in every captured case: canonical NaN `0x7fc00000`, subnormals kept, tininess detected after rounding, `fcvt` saturating.
  - All three executors now run RV32IMF. rv32emu turned out to have been RV32IMC, not what its Makefile claimed. It is kept rather than replaced by the Go machine.

### What didn't work

- **Go in worktrees.** `go test` fails there, because `go.mod`'s `replace ../go-go-golems/go-go-goja` is relative. Both agents worked around it with a GOWORK or `-modfile` file outside the tree. Wave 2's briefs say so.

### What warrants a second pair of eyes

- **Wave 2 has two bundlers.** FRONTEND bundles `typed-wasm.js` from its modules with its own generator, while PIPELINE writes the bundler for `rv32/`. I allowed both and will unify them after merging, if that is simpler.
