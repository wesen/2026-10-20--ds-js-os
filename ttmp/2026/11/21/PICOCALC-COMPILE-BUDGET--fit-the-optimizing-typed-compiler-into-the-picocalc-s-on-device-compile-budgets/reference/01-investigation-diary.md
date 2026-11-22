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

## Step 2: The device measures each boot world under every step policy (run 1)

The arms firmware ran on the P4 and measured three of the four worlds. Every compile was reproducible: both rounds agreed to within 10 ms, and each arm's module digest was the same in every round. A bug in the stager cost the Chess data. The wrapper's final, real compile kept the caller's start time, which already included the arm compiles. Editor's twelve arm compiles took 63 s, so its real compile met the 60 s deadline at once, the manifest failed again, and Chess was never compiled.

### What I did

- Built the image with `scripts/01-stage-arms-firmware.py` at `1b33fe6`, a Candela docs commit whose compiler and firmware equal `2712684` (receipt: `various/02-arms-run-1-receipt.json`).
- Ran `scripts/02-run-arms-firmware.py --boots 2 --seconds 300` (`various/02-arms-run-1/`).

### What worked

Device compile time in seconds (`CCARM` rows of boot 0; the second round equal to within 0.01 s):

| World | stock | step6 | step7 | step8 | step11 | step13 | 75% of deadline |
|---|---:|---:|---:|---:|---:|---:|---:|
| Files | 0.49 | 0.52 | 0.59 | 0.64 | 0.67 | 0.74 | 1.28 |
| Agenda | 0.83 | 0.98 | 1.69 | 1.96 | 2.33 | 2.75 | 1.28 |
| Editor | 2.76 | 3.35 | 5.14 | 5.86 | 6.57 | 7.90 | 4.50 |

Heap peaks: Agenda 1.03 MB (stock) to 1.61 MB (step13), out of 2 MiB. Editor 2.75 MB to 3.87 MB, out of 4 MiB, so step13 has 3% heap margin on Editor.

### What didn't work

- **The final compile's clock** (above). Fixed in `6350c61`: the world's own compile now starts its own clock.
- **The capture length.** 300 s did not reach the `worlds` reply because the manifest never loaded, so `worlds-0.json` is `null`.

### What I learned

- **The decision rule picks step6 for both Agenda and Editor, and step13 for Files.** For Agenda and Editor, inlining (step7) is the step that breaks the budget: +0.71 s and +1.79 s.
- **The `stock` arm is slower than the old firmware's compile:** Agenda 0.83 s against 0.61 s, Files 0.49 s against 0.32 s, Editor 2.76 s against 2.40 s. Code generation is the same, so the difference has to come from something every compile does. The prime suspect is evaluating the compiler sources: `typed-rv32.js` grew from 19 KB to 98 KB during RAY-PARITY. Run 2 times evaluation separately (`evalUs`).

## Step 3: Run 2 completes the table and separates source evaluation; the policy decision

Run 2 used the fixed stager at `6350c61`: one round per arm, one boot, and an `evalUs` field. It reached Chess and the world list. Every module digest equals run 1's, so the inliner rewrite and the opt-in facts code changed no output on the device. The new field shows the largest fixed cost in a device compile: before the compiler sees the world's source, the runtime spends 0.41 s (Files, Agenda) or 0.53 s (Editor, Chess) creating itself and evaluating the compiler's JavaScript.

### What I did

- Rebuilt the image incrementally (`--rebuild --rounds 1`) and ran `02-run-arms-firmware.py --boots 1 --seconds 240` (`various/04-arms-run-2/`, summary `various/04-arms-run-2-summary.json`). The playable app was restored afterwards, with eight healthy worlds.
- Added `POLICIES.interactive` (the Step 6 set) to `typed-rv32.js`. The pin test now checks that `{policy: "interactive"}` reproduces Step 6's P4-timed ray image `6b854512…`.
- Gave Agenda and Editor `.policy = "interactive"` in `agenda_p4.c` and `editor_p4.c`. In `typed_p4.c`, a zero heap or deadline in `p4_compile_limits` now means the default.
- Replayed all 24 workflows with a scratch copy of the compiler whose default resolves to `interactive` (`scripts/05-replays-policy.sh`, which loads the variant through COMPILER-THESIS's `replay-baseline.mjs`). Result: 24/24 PASS (`various/05-replays-interactive.log`). The reported module sizes prove the variant was used: Files 3,444 → 2,160 B and Agenda 21,724 → 11,284 B, which are the Step 6 sizes.

### What worked

| World | stock | step6 | step7 | step8 | step11 | step13 | 75% of deadline | evaluation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Files | 0.52 s | 0.55 | 0.62 | 0.66 | 0.69 | 0.77 | 1.28 | 0.41 |
| Agenda | 0.86 | 1.01 | 1.69 | 1.97 | 2.33 | 2.75 | 1.28 | 0.41 |
| Editor | 2.82 | 3.40 | 5.10 | 5.83 | 6.53 | 7.89 | 4.50 | 0.53 |
| Chess | 1.64 | 1.98 | 2.93 | 3.14 | 3.49 | 4.34 | 4.50 | 0.53 |

The times are about 0.03 s higher than run 1's. `typed-rv32.js` gained the facts code in between, so each evaluation has more source to parse.

### What didn't work

- The first replay launch: RAY-PARITY's copy of the replay script looks for `replay-baseline.mjs` in its own directory, but that file exists only in COMPILER-THESIS. All 24 runs failed with `ERR_MODULE_NOT_FOUND`, and no world was compiled. `05-replays-policy.sh` points at the original hook.

### What I learned

- **Policies, by the decision rule:**
  - Files: `default` (0.77 s of 1.28 s).
  - Agenda: `interactive` (1.01 s; step7 would take 1.69 s).
  - Editor: `interactive` (3.40 s; step7 would take 5.10 s).
  - Chess: `default` (4.34 s of 4.50 s, the thinnest margin).
- **Evaluation is the next lever.** It costs the same under every policy, and every boot repeats it four times. Caching each compiler source as QuickJS bytecode after its first evaluation would remove most of it from the later compiles of a boot.

## Step 4: A bytecode cache removes most of the evaluation cost; the keyboard bus then stops answering

`eb70b4e` caches each compiler source as QuickJS bytecode. The first runtime to evaluate a source compiles it with `JS_EVAL_FLAG_COMPILE_ONLY` and keeps `JS_WriteObject`'s output in PSRAM, outside every compiler heap. Later runtimes call `JS_ReadObject` and `JS_EvalFunction` instead of parsing. Run 3 measured it: every module digest equals run 2's, and evaluation fell from 0.41–0.53 s to 0.05–0.06 s for every compile after a source's first. The run then failed its final health check. Every I2C transfer to the keyboard controller errors, and it keeps doing so across ESP32 resets after the verified playable app is back on flash.

### What I did

- Implemented the cache in `typed_p4.c`: a fixed table of 8 entries filled under a mutex and never freed, with a fallback to parsing if a read fails. Rebuilt the arms image incrementally. Its receipt (`various/06-arms-run-3-receipt.json`) says `36446bc`, dirty: the tree held exactly the cache change, committed seconds later as `eb70b4e`.
- Ran `02-run-arms-firmware.py --boots 1 --seconds 200` (`various/06-arms-run-3/`).
- After the failed health check, probed the board without flashing (SIMD-LAB `02-run-board.py --probe`; copy in `various/07-probe-after-run-3/`). Same failure.

### What worked

| World | step6, run 2 → run 3 | step13, run 2 → run 3 | evaluation, run 2 → run 3 |
|---|---:|---:|---:|
| Files | 0.55 → 0.18 s | 0.77 → 0.40 s | 0.41 → 0.05 |
| Agenda | 1.01 → 0.65 | 2.75 → 2.38 | 0.41 → 0.05 (the first compile of the boot: 0.49) |
| Editor | 3.40 → 2.92 | 7.89 → 7.39 | 0.53 → 0.06 (first: 0.20, for `async.js` and `world.js`) |
| Chess | 1.98 → 1.51 | 4.34 → 3.86 | 0.53 → 0.06 |

With the cache, each world's own compile is: Editor under `interactive` 2.91 s, Chess under `default` 3.86 s. Agenda is the boot's first compile, so it still parses: about 1.1 s under `interactive`.

### What didn't work

- **The final health check**, in `board_common.health` → `input_ready`:

  ```text
  ValueError: physical keyboard I2C0 did not qualify: {'busyMs': 2863.94, 'transfers': 136, 'bytes': 547, 'errors': 136} -> {'busyMs': 3966.24, 'transfers': 158, 'bytes': 635, 'errors': 158}
  ```

  `restore-verify.log` confirms that the app slot and the partition table match `/tmp/picocalc-scalar-breakdown-verified/build` (`e7b771aa…`). The probe a few minutes later showed 3,090 transfers and 3,090 errors.
- Every earlier restore tonight passed this check: runs 1 and 2, and board run 10. The keyboard's microcontroller is not reset by an ESP32 reset, and it is either hung or unpowered, for example a drained battery while the ESP32-P4 runs on USB. Either way someone has to power-cycle the device. Device work stops until then.

### What I learned

- Agenda's step7 arm now takes 1.34 s with the cache, just over its 1.28 s target. A cache kept in flash across boots would also remove Agenda's first-compile parse.
