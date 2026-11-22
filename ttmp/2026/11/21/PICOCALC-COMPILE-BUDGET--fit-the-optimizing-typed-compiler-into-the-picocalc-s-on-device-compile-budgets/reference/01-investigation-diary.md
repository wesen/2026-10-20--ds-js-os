---
Title: Investigation diary
Ticket: PICOCALC-COMPILE-BUDGET
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
Summary: ""
LastUpdated: 2026-11-21T22:26:52.802834507-05:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

## Step 1: The new defaults miss two boot deadlines on the device

I rebuilt the playable firmware at RAY-PARITY's `2712684`, the commit that made versioned loops and split locals the default, and installed it with TYPED-CHESS's install script. The install failed its boot check. Agenda and Editor hit their compile deadlines on the device, the manifest did not load, and the handheld showed no worlds. I restored the previous playable app (`e7b771aa…`) and opened this ticket to measure each world's compile on the device, which no earlier step had done.

### Prompt Context

**User prompt (verbatim):** "have you run the compiler on the device since all these improvements? or the resulting programs?"

Earlier standing requests, recorded in RAY-PARITY's diary (Steps 1 and 13), apply here as well: commit at intervals, keep a detailed diary, split work into tickets with design docs, use the REPL workbench, and write a vault report per milestone.

**Assistant interpretation:** The question is whether the optimizing compiler and its output were validated on the hardware. The honest answer was "partly": only the ray tracer and a Chess kernel, inside the board benchmark.

**Inferred user intent:** Confidence that the compiler improvements work on the PicoCalc as a whole, not only on the host and in one benchmark.

### What I did

- Built the playable firmware from `2712684` with TYPED-CHESS's `16-build-playable-firmware.sh`, into `/tmp/picocalc-playable-ray-parity-2712684`. The app SHA-256 begins `daa3c106`.
- Ran `17-install-playable-firmware.py`. It flashed the app and then raised `ValueError: incomplete boot world list`.
- Read `install/boot.log`:

  ```text
  agenda compile rejected: InternalError: interrupted
      at inlineCalls (typed/rv32.js:946:29)
  agenda compile source=bundle status=failed us=1746878 peak_js_bytes=1248612 module_bytes=0
  files compile source=bundle status=ok us=746629 peak_js_bytes=891080 module_bytes=24424
  editor compile rejected: InternalError: interrupted
      at step (typed/rv32.js:558:66)
  editor compile source=bundle status=failed us=6101996 peak_js_bytes=3460032 module_bytes=0
  cannot read js/editor/compiled.bin
  E (11206) picocalc-os: the manifest did not load
  ```

- Wrote RAY-PARITY `scripts/16-restore-playable.py`, which writes and verifies the app slot and then runs the board health check. Restored `/tmp/picocalc-scalar-breakdown-verified/build` (`e7b771aa…`). Health: eight worlds, painter compiled and installed, no rejects. That firmware's own boot log is the baseline: Files 0.32 s, Agenda 0.61 s, Editor 2.40 s, Chess 1.94 s.
- Found the limits in `port/esp32p4/main/typed_p4.c`. `compile_interrupt` returns true once `port_clock() >= deadline`. The deadline is `COMPILER_US` = 1.7 s unless a world's `p4_compile_limits` sets another: 6 s for Editor and Chess, 8 s for Candela and the painter. The entry is called with two arguments, so worlds compile with the compiler default.
- Timed every world under the cumulative RAY-PARITY policies:
  - In goja, as a workbench job: `various/58-compile-cost-steps-arms.json` (arms) and the job's output, summarized in the design doc.
  - In jitless Node: `scratchpad/world-prof.cjs`.
  - CPU-profiled the Step 13 compiles of Editor, Agenda and Chess.
- Counted the inliner's walks with a scratch copy of the compiler (Editor: 238 calls, 130 full walks, 42 of them changing nothing).
- Wrote this ticket's design doc and `scripts/01-stage-arms-firmware.py`, `02-run-arms-firmware.py` and `03-summarize-arms.py`. The first build attempt failed because `sdkconfig.agent-elf` is untracked and so missing from the copied tree. The stager now reads it from the repository, as TYPED-CHESS's stager does.

### Why

The board benchmark compiles on the device but only two inputs. The replays and the oracle check correctness on the host. No gate covered "does every boot-compiled world still fit its deadline on the device".

### What worked

- The restore path: `16-restore-playable.py` brought the device back without needing the broken firmware to cooperate.
- Jitless Node as a proxy. It predicts the device's growth ratios far better than goja: Files 2.0× against 2.4× on the device; Agenda 4.6× against more than 2.9×; Editor 3.1× against more than 2.5×.

### What didn't work

- **goja as the compile-cost proxy for large worlds.** It showed Editor growing 1.6× from `stock` to Step 13, against at least 2.5× on the device. On the device the lexer index is native (`typed_lex_index_install`), while goja runs the lexer as JavaScript, so goja's Editor time is mostly frontend.
- **The qualification method itself.** RAY-PARITY's gates never compiled the four boot worlds on the device, so a 2–5× compile-time growth reached a firmware install before anything noticed.

### What I learned

- The compile time grew with every step, not just at Step 13. In jitless Node, Step 7 (inlining) and Step 13 (versioning) are the largest jumps.
- The cost is spread over all phases: the top self time is `inlineCalls` at 9–13%, then `planLocations` at about 8%. A 2× reduction cannot come from one hotspot.

### What warrants a second pair of eyes

- The arms image's `us` includes loading the compiler sources into a fresh runtime, as the firmware's own line does. Compare arms with each other, not with a host proxy's backend-only time.

### What should be done in the future

- Run the arms firmware (Step 2), then apply the design doc's decision rule.
- Add the arms firmware to the RAY-PARITY qualification gates before any further default change.

### Code review instructions

- `scripts/01-stage-arms-firmware.py`: the `typed_p4.c` patches (wrapper, 60 s deadline, third-argument options) and the build flags, which must match `16-build-playable-firmware.sh`.
- `scripts/02-run-arms-firmware.py`: the `finally` restore and health check.
