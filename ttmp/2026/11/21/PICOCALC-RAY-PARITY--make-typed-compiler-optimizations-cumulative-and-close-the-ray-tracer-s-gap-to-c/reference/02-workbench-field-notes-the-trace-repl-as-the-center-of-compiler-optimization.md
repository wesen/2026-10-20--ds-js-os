---
Title: 'Workbench field notes: the trace REPL as the center of compiler optimization'
Ticket: PICOCALC-RAY-PARITY
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
Summary: "Running notes on using the merged trace-REPL workbench (PICOCALC-TRACE-WORKBENCH W1-W7) for RAY-PARITY's compiler work: which tools moved into it, what each use cost, what worked, what did not, and what to change."
LastUpdated: 2026-11-21T22:10:00-05:00
WhatFor: "Deciding what the workbench should become, from evidence gathered while doing real compiler optimization with it."
WhenToUse: "Before changing the trace REPL, or before choosing whether a RAY-PARITY task runs in the workbench or as a host script."
---

# Workbench field notes: the trace REPL as the center of compiler optimization

## Purpose

The user asked on 2026-11-21 that the trace REPL become the center of the compiler optimization workflow:

> try to use the REPL as much as possible, building up a collection of scripts and all, noting all the things that are bad / could be improved / are good, and try to port your existing tools to it too, I kind of want to make it the centerpiece of our compiler optimization workflow. Keep a detailed report document as you go, taking notes, inside the docmgr ticket, in addition to your diary. Take veyr detailed note if possible.

This document is that record. The investigation diary (`reference/01-investigation-diary.md`) records the compiler work and its measurements. This document records how the workbench served that work.

- Each use gets a dated entry: the task, the script, the time it took, and the friction.
- The tool inventory says what runs where.
- The assessment sections at the end hold the conclusions, each with the evidence behind it.

The workbench is the merged result of PICOCALC-TRACE-WORKBENCH (merge commit 2953d57). Its additions are:

- `compiler.at(rev)` (W1)
- `repo.read`, `repo.show`, `repo.list` and `--mount` (W2)
- background jobs (W3)
- `GET /info` (W4)
- the `stats` global (W5)
- rename-aware LLVM timelines (W6)
- idle session reaping (W7)

## Setup used in these notes

- **Service.** One service built from main and stamped with its commit: `go build -o $SCRATCH/trace-repl ./cmd/trace-repl`, then `trace-repl serve --addr 127.0.0.1:3796 --archive ttmp/2026/11/21/PICOCALC-ROW-IR--…`. `trace-repl info` reports `build.revision` a6cd14c, a 15 s cell limit, a 600 s job limit and 32 sessions.
  - The older services on 3791–3795 run builds from before the merge. They lack `compiler`, `repo`, `stats` and jobs. I leave them running because other tickets' notes refer to them.
- **Session.** Opened with `trace-repl open --addr 127.0.0.1:3796`, with its id kept in a scratch file, because every later command needs it.
- **Scripts** live in `scripts/workbench/` in this ticket. Each is one cell or one job, and the header comment shows the command that runs it.

## Tool inventory: what runs where

| Task | Before | In the workbench now | Script | Notes |
|---|---|---|---|---|
| Score a paired board run | `12-score-board.py` binds the rows into a session and evaluates `12-score-board.js`, which has its own median and block pairing | Yes | `scripts/15-score-board-workbench.js` (moving to `scripts/workbench/score-board.js`) | `repo.read` + `stats.paired`; identical output to `12-score-board` on the Step 11 rows, field for field |
| Opening-frame profile, instruction mix, bounds-check count | `tools/typed-ray-profile.mjs` and scratch scripts (`mix.mjs`, `access.mjs`, `left.mjs`) in Node | Yes, as a job | `scripts/workbench/frame-profile.js` | 12.6 s per arm in goja, against about 0.5 s in Node |
| Compile cost in goja | `13-compile-cost-arms.py`: one REPL cell per compile, to stay under the 15 s cell deadline | To port (as one job) | — | jobs remove the deadline workaround |
| Planner equivalence across revisions | `02-planner-equivalence.{py,js}` with a baseline session | Ported by the subagent | TRACE-WORKBENCH `scripts/03-planner-equivalence.js` | `compiler.at` holds both revisions in one session |
| Hot instruction listing and disassembly | scratch `hot.mjs` | To port | — | needs a small RV32 disassembler in the script |
| Dump a function's tape after inlining and rotation | a scratch copy of `typed-rv32.js` with a `globalThis.__tapes` hook | Not possible yet | — | the compiler exposes no transformed tapes (improvement I3) |
| Chess engine oracle | `05-chess-engine-oracle.mjs`: GCC + rv32emu | No | — | needs native processes |
| 24 host replays | `04-replays.sh` | No | — | needs `make`, GCC and rv32emu |
| C frame instruction count | `14-c-frame-instructions.mjs`: GCC + rv32emu | No (results could be mounted) | — | needs native processes |
| Board image build, flash, run, import | `10-stage-board.py`, SIMD-LAB `02-run-board.py`, `11-import-board.py` | No | — | ESP-IDF, esptool and the serial port are host-only by design |

## Session log

### 2026-11-21, entry 1: scoring a board run with `repo.read` and `stats.paired`

- **Task:** score Step 11's pointer-home run (`various/47-board-pointers`, 1,932 rows).
- **What I did:** wrote `scripts/15-score-board-workbench.js`, the N-mode generalization of `12-score-board.js`. It reads `rows.json` and `receipt.json` with `repo.read(...).json()`, and every comparison is `stats.paired(rows, {key: "block", value: "value", control, candidate})`. Chess compares per-block means of six rows, built in the script as derived rows and then paired by `stats.paired`.
- **Check:** a field-by-field comparison of its output with `various/48-board-pointers-scores.json` found no difference.
- **Good:** no Python wrapper, no row shipping through `eval`, and no hand-written median. `stats.paired` returns `pairs`, which makes the 6-block requirement checkable in one line. The script reads the rows at the path it names, so the result is tied to a file, not to whatever the client sent.
- **Friction:**
  - Parameters have no channel, so the board directory is prepended as `globalThis.BOARD = "…";` on stdin. The subagent's acceptance scripts hard-code their inputs instead.
  - `stats.paired` does not return the per-block values or savings. I could not print the six per-block savings to judge spread without re-deriving them.

### 2026-11-21, entry 2: scoring the placement run (Step 12)

- **Task:** score the paired PSRAM-versus-internal `work` run (`various/50-board-placement`).
- **Result:** `various/51-board-placement-scores.json` straight from the workbench, the first board result in this ticket scored only there. The wrapper output is `{"ok":true,"value":…}`, so every consumer has to unwrap `value` (`d.get("value", d)` in my one-liners).

### 2026-11-21, entry 3: the opening-frame profile as a job

- **Task:** compare the default, `operandLocations.split`, and `select.version` + `split` (the Phase 3 work of Step 13) by executed instructions, bounds checks and stack traffic.
- **What I did:** wrote `scripts/workbench/frame-profile.js`. It loads `compiler.at(REV)` (`"worktree"` here), compiles `c.ray` for each arm, interprets the opening frame with `c.rayBench.openingFrame`, rebuilds the per-function rows with `c.interp.profile`, and classifies the per-PC counts into an instruction mix with an inline decoder.
- **Timings:**
  - The first version ran `frameProfile()` and then `openingFrame()` again for the counts, because `frameProfile()` does not return them: 83 s for three arms.
  - The second version interprets once per arm: 12.7 s wall for one arm, of which 60 ms is the compile and 12,576 ms the frame.
  - Node runs the same frame in about 0.5 s, so goja is about 25 times slower here.
- **Agreement:** every number matched the Node profiler (`5,578,770` default, `5,504,927` split, `4,888,369` version + split; digest `b3c26cc8` for all three).
- **Good:**
  - `compiler.at("worktree")` picked up my uncommitted compiler edits without a restart.
  - A job ran past the 15 s cell limit without any change to the script.
  - The result came back as structured JSON that I could post-process.
- **Friction:**
  - A 12.6 s interpretation per arm makes a four-arm sweep about a minute. Iterating on a planner heuristic in the workbench is therefore slower than in Node.
  - A job holds the session (a second cell gets 409), so I cannot inspect a result while the next sweep runs, unless I open another session.

## Assessment so far

### Good

- **`repo.read` and `stats.paired` replace a whole class of glue code.** Scoring went from a Python binder plus a hand-written median to one self-checking cell. A result traced to a file path and digest is better evidence than a result over rows the client claimed to send.
- **`compiler.at("worktree")` makes uncommitted compiler edits testable** in a long-lived session without restarting anything. `compiler.at(rev)` keeps older revisions available next to it for equivalence checks.
- **Jobs remove the deadline workarounds.** `13-compile-cost-arms.py` sends one compile per cell only to stay under 15 s. A job does not need that.

### Bad

- **Interpretation speed.** The RV32 interpreter in goja takes about 12.6 s per opening frame. This is the main obstacle to making the workbench the place where heuristics are tuned.
- **No parameters.** Every reusable script needs inputs (arms, a board directory, a revision). The choices today are hard-coding or prepending JavaScript to stdin.
- **No view of the compiler's intermediate tapes.** Diagnosing Step 13's register collapse needed the tape after inlining, commutation, rotation and versioning. That needed a hacked copy of the compiler outside the workbench.
- **Results die with the session.** Nothing in the workbench writes a result file. The client redirects stdout and unwraps `{"ok", "value"}` itself.
- **Native steps stay outside.** The C reference, the Chess oracle, the replays and the board pipeline need GCC, rv32emu, ESP-IDF and the serial port.

### Improvements, in the order I would make them

- **I1. A native RV32 interpreter as a workbench global** (`rv32.run(image, entry, args, memory, {counts: true})`). It would be Go, sharing nothing with the JavaScript interpreter except its tests. The JavaScript interpreter stays the reference, and a test checks that both agree on the opening frame and the Chess workload. Expected effect: frame profiles in well under a second, making the workbench faster than Node for sweeps.
- **I2. Parameters for cells and jobs:** `trace-repl eval --arg NAME=JSON` (repeatable), visible as `args.NAME`, recorded with the job.
- **I3. A tape observer in the compiler:** `options.observeTape(name, phase, code)` after each tape transform (inlining, commutation, rotation, versioning, splitting). It does not change output. The workbench script would then show what the planner saw.
- **I4. Return the per-PC counts from `typedRayBench.frameProfile`,** so profilers need one interpretation. This is a one-line change in `tools/typed-ray-bench.js`, which `compiler.at` loads per revision.
- **I5. A result store:** `results.save(name, value)` writing `$scratch/results/NAME.json` with the session, revision and script digest. The client would no longer redirect and unwrap.
- **I6. Per-block detail from `stats.paired`** (`blocks: [{key, control, candidate, savedPct}]`), to judge spread without re-deriving it.
- **I7. Mounted native results:** a documented convention for mounting the outputs of host-only steps (C counts, Chess oracle, replays), so a workbench report can cite them by digest.
