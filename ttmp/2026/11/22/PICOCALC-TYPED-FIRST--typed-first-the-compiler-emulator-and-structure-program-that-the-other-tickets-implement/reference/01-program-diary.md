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

## Step 4: A playable install with the keyboard off, and SPLIT-FILES merged

The playable build at `bf30d31` is installed and recorded. SPLIT-FILES is merged with three conflicts resolved by hand. The two wave-2 agents were told to merge the new `main` before reporting.

### What I did

- **Install, first attempt.** `make playable` built `1f99bf386f64a3dd…` (app digest prefix). `playable.py install` wrote and verified it, then failed health on the keyboard:

  ```
  ValueError: physical keyboard I2C0 did not qualify: {'busyMs': 4821.6, 'transfers': 260, 'bytes': 1043, 'errors': 260} -> {'busyMs': 4969.05, 'transfers': 266, 'bytes': 1068, 'errors': 266}
  ```

  Every transfer errored. That is the pattern of a keyboard the user has switched off. SPLIT-FILES saw the same on its probe boot.
- **Install, second attempt.** Per the standing rule, I reran `install … --health-only --peripherals off-by-user`. It passed (every judged world up, nothing restarting) and rewrote `PLAYABLE.json`: commit `bf30d31`, dirty false, peripherals off-by-user. Committed with the evidence in `various/01-install-playable-bf30d31` and `various/02-health-bf30d31-off-by-user`.
- **Merging SPLIT-FILES** (`9be534a`). Conflicts and what I did:
  - Root `Makefile`, `test-generated`: CONFORMANCE's `vectors.mjs --check` and SPLIT-FILES' `check-file-length.mjs`. Kept both.
  - CONFORMANCE's new `pkg/tracerv32/{conformance_test,fpexec,fpu}.go`: they followed the directory's move to `tools/trace-repl/pkg/tracerv32`. The conformance test's relative path to the vectors went from `../../` to `../../../../`.
  - The `bench/emu/emu.c` entry in `tools/file-length-exceptions.txt` was removed. CONFORMANCE split that file, and the check fails on entries that are no longer needed.
  - Repointed `pkg/trace*` references in the docs and code CONFORMANCE added (`docs/rv32-executors.md`, `docs/typed-compiler.md`, `bench/emu`, `bench/host/rv32-interp.js`, the root `Makefile`, `tests/rv32`).
- **Gates on the merge.** `make test` exit 0. `gates.sh` default and `kernel`: digests and counts as in Step 3, with 24/24 replays both times.
- **Messages to FRONTEND and PIPELINE.** They are told to merge `main` (new paths, the length check, removing their exception entries) and to report against the merged state.

### What didn't work

- **The first install's health check.** It failed as shown above. Not debugged, per the rule about switched-off peripherals.
- **The restore in SPLIT-FILES' probe.** `make restore-playable PERIPHERALS=off-by-user` reported "painter sources=0" after restoring `f8f36bd1`. Chess never sends its painter sources while the display is off. The board was then on the recorded image, and it is superseded by this step's install.

### What warrants a second pair of eyes

- **Health with the display off.** "Off-by-user" health passes, but the painter check depends on the display being on. While the user keeps the peripherals off, health checks don't cover the painter path.
- **The installed firmware lags `main`.** SPLIT-FILES changes the firmware (the nucleus split and the device-tools text in Settings). I install the next playable after APP-MANIFEST, which also changes the firmware, to avoid two installs back to back.

### What SPLIT-FILES left

- **Long files left alone:** the two `compositor.js` files and `agent.js` (a QuickJS world loads one file), and `sdk/typed/world.c` and `agent_p4.c` (compiled from APP-MANIFEST's lists). They have tasks in its ticket.
- **PaperS3 links fail before and after.** `native.c` was never in its CMake list, and the host build is missing `port_net_*` and `port_tz_set`.

## Step 5: APP-MANIFEST and FRONTEND merged; the board and its record disagreed; wave 3

Wave 1 is now fully merged (TAPE, CONFORMANCE, SPLIT-FILES, APP-MANIFEST), and so is the first wave-2 ticket (FRONTEND). APP-MANIFEST's merge had six conflicts. ASYNC-TAPE and AGENDA-TYPED-WORLD are unblocked and started. A probe showed that the board was not running the image `PLAYABLE.json` recorded.

### What I did

- **APP-MANIFEST merge** (`c8b5846`). Six conflicts:
  - `firmware/nucleus/kernel.c`. SPLIT-FILES had moved the boot section (`kernel_init`, `add_world`, `kernel_boot`) to `kernel_supervision.c`. I kept that layout and carried APP-MANIFEST's manifest fallback (a world whose compiled file is missing runs its `"fallback"` JS) into `kernel_supervision.c`'s `add_world`. APP-MANIFEST's removal of the Agenda boot hooks merged cleanly; `grep` finds no `p4_agenda_` left in the nucleus.
  - `firmware/port/esp32p4/main/CMakeLists.txt`. I took APP-MANIFEST's structure (the `cmake/*.cmake` includes, 96 lines) and kept SPLIT-FILES' split nucleus sources, minus the benchmarks APP-MANIFEST moved out (`raybench_p4.c`, `perf_p4.c`). `typed/tape.js` joined `TYPED_COMPILER` in `cmake/typed-apps.cmake`.
  - `firmware/port/esp32p4/main/typed_p4.c`. Took APP-MANIFEST's rewritten eval chain; `typed/tape.js` is evaluated before `typed/wasm.js`. TAPE's 12-entry bytecode cache survived.
  - `firmware/Makefile`. SPLIT-FILES' `../tests/native/` paths plus APP-MANIFEST's new fallback test, which I moved to `tests/native/` with `git mv`. It imports its harness from `test_fs_native.py` next to it.
  - `firmware/README.md` and `tools/trace-repl/README.md`. Kept both sides' edits.
  - Also removed the `main/CMakeLists.txt` entry from the file-length exceptions.
- **A test broken by the merge.**

  ```
  Error: ENOENT: no such file or directory, open '…/apps/typed/editor/source.list'
  ```

  TAPE's tape-coverage test assembled units from `source.list`, which APP-MANIFEST replaced with `app.json`'s `sources`. The test now reads `app.json`. After the fix, `make test` exit 0, and the gates pass (both policies; digests and counts as before; 24/24).
- **FRONTEND merge.** Clean. `make test` exit 0; gates pass.
- **Wave 3.**
  - Started ASYNC-TAPE (needs TAPE and FRONTEND) and AGENDA-TYPED-WORLD (needs APP-MANIFEST).
  - Sent PIPELINE the new bundle wiring (`TYPED_COMPILER`, the `app.json` compiler modules, FRONTEND's kept fifth parameter).
  - BITWISE waits for PIPELINE, because it edits the RV32 emitters PIPELINE is restructuring.
- **Firmware.** Started a build of the playable profile at the FRONTEND merge, its install with `--peripherals off-by-user`, and the gallery's digest check.

### What didn't work

- **The probe.** `python3 bench/board/run.py --probe` failed at `esptool.py … verify_flash 0x10000 …/1f99bf38…/picocalc-os-p4.bin` (exit status 2). APP-MANIFEST's last step was `make restore-playable` in its worktree, whose `PLAYABLE.json` still named `f8f36bd1`. So it overwrote the `1f99bf38` I had installed and recorded in Step 4.
  - **Lesson:** "restore the playable image" in a worktree restores that branch's record, not `main`'s.
  - **Fix for the remaining briefs:** pass the restore target explicitly, or tell agents to merge `main` first. The current briefs say "restore the playable image"; ASYNC-TAPE and AGENDA-TYPED-WORLD start from a `main` whose record is replaced by this step's install, so theirs will also be stale. I'll check the board after each ticket with `--probe`.
- **The keyboard.** APP-MANIFEST saw it work with peripherals on at the start of its board session, then fail on every transfer, on the old image as well. That fits the keyboard controller wedging after resets of only the ESP32, a failure noted in earlier tickets. Not debugged. The handheld needs a power cycle by a person.

## Step 6: The playable image at 6195cab installed, the gallery checked, the keyboard back

The playable image built at `6195cab` (`10695eee…`) is installed and recorded. The gallery agrees with the reference on all 18 scenes. Health passes with the peripherals on, because the user reset the keyboard.

### Prompt Context

**User messages (verbatim, mid-step):** "i reset the keyboard i think" and "feel free to always leave the latest firmware on there".

### What I did

- **Build, install and gallery check.** `make playable` at `6195cab` (the FRONTEND merge), then `playable.py install … --peripherals off-by-user`. The image was written and verified, but health failed on the painter:

  ```
  RuntimeError: painter {'sources': 0, 'compiles': 0, 'installed': False, …}
  ```

  With peripherals off, `device.health` checks the painter immediately, before Chess has delivered its source; APP-MANIFEST reported the same. `bench/board/gallery.py` on that boot: 18/18 scenes agree (`various/04-gallery-6195cab`).
- **Health rerun with peripherals off.** `--health-only --peripherals off-by-user`, minutes later: passed (`various/05-…`).
- **Health rerun with peripherals on.** After the user's keyboard reset, `--health-only --peripherals on`: passed, with every world healthy, the painter installed and the keyboard answering (`various/06-…`). `PLAYABLE.json` now records commit `6195cab`, dirty false, app `10695eee…`, peripherals on.

### What I learned

- **Keyboard state.** The keyboard's wedged I2C cleared with a reset by a person; it was not switched off. While wedged, every transfer errored with NACK.

### What should be done in the future

- **The painter check with peripherals off.** `device.health(…, "off-by-user")` should wait for the painter, as the peripherals-on branch does. It is a small fix in `bench/board/device.py`; I'll do it at the next idle point.

## Step 7: The black screen, and ASYNC-TAPE merged

The user reported a black display. The cause was the screen's on/off state, not a fault. ASYNC-TAPE came back no-go on its main idea, with a useful cleanup, and is merged.

### Prompt Context

**User messages (verbatim):** "i don't see anything on the display though, is that normal?"; "sorry i was messing with the keys, maybe t was showing a black screen or so? maybe there's nothing in the gallery?"; "it flashed and work in whatever you did in the previous turn a minute ago. now it's black again".

### What I did

- **Bus statistics** (`buses`):
  - i2c0: 1,048 transfers, 0 errors, so the keyboard was fine.
  - spi2: 246 transfers since boot, unchanged across my capture.
- **Framebuffer capture** (`shot`): the launcher, not black. The compositor was drawing, but nothing was going to the panel.
- **Looked for a screen-off timer.** There is none. `apps/js/picocalc/drivers/power.js` turns the backlight to 0 when the compositor sends `screen`, and the compositor sends that only on the power key (`compositor.js:591`). A power-key press among the user's key presses would turn the screen off.
- **Pressed the power key** with `key power` on the console. spi2 went from 246 to 630 transfers, so frames reach the panel again.
- **Asked the user to confirm.** If it is very dim, the STM32 reset may have reset the backlight register.
- **ASYNC-TAPE merge.**
  - Clean merge. Both generated bundles check current.
  - `make test` exit 0; the gates pass with both policies (digests and counts as before; 24/24).
  - I accepted its compile-peak deviation: +8,160 B in the RV32 backend's final assembly, which the ticket did not touch; +0.14 % absolute. The agent's control showed that adding small dead functions to the base compiler moves the same metric by 4–12 KB.

### What didn't work

- **Querying the power driver.** `send power screen {}` returned `unknown command send (try help)`. The playable profile doesn't build the console's `send` command, so I couldn't read the power driver's state directly.

### What I learned

- **Silent SPI means a dark or idle panel.** A framebuffer capture shows what the compositor drew, not what the panel shows. When the spi2 transfer count doesn't move, the panel isn't being updated, or the screen is off.
- **ASYNC-TAPE's no-go reasons** (details in its design doc's Study section):
  - Editor's layout is already minimal (57 declared + 13 lowered fields).
  - A tape-level lowering would rebuild the control tree the statement skeleton already has, and would need binding names the tape doesn't carry.
  - Streaming still needs a whole-program pre-pass.
  - Text generation is about 6 % of the rewrite on the device.
- **What ASYNC-TAPE delivered instead:**
  - `compiler/typed/async/` modules, bundled back into one file.
  - Errors mapped to source positions without a second compile.
  - A real async test with 18 diagnostics checked on both targets.

## Step 8: PIPELINE merged; REGISTERS and BITWISE started

PIPELINE came back with byte-identical output. Two lazily loaded pass groups cut the compiler's peak heap by 122–157 KB for the boot apps that use them, and cost 15–96 ms of boot compile on the P4, for a reason not yet found. I merged it and started REGISTERS and BITWISE.

### What I did

- **Merged PIPELINE.** Clean merge; all three generated bundles check current. `make test` exit 0. `gates.sh` default and `kernel`: ray `430f0d501659`, Chess 6,981 words, 24/24 replays.
- **Started REGISTERS and BITWISE in parallel.** Both touch `rv32/emit` and `rv32/encoding`. REGISTERS keeps its table additive, and BITWISE keeps its emitter cases local.
- **Started a playable build, install and gallery check** at the PIPELINE merge.

### Why I accepted the slowdown

PIPELINE's paired board study (3 blocks):

| App | Compile, control → candidate | Peak heap |
|---|---|---|
| Agenda | 0.700 → 0.715 s | −149 KB |
| Editor | 3.219 → 3.237 s | −157 KB |
| Files | 0.447 → 0.471 s | +34 KB |
| Chess | 3.920 → 4.016 s | −122 KB |

- Every app stays within 75 % of its deadline. Chess is closest, at 4.016 s against 4.50 s.
- Memory is the scarcer resource for boot apps (a 768 KiB world allowance; Editor's compile peak is near its cap), so the heap saving is worth the time.
- The slowdown happens only on the device: callgrind counts are equal on the host. It is recorded as an open question in PIPELINE's ticket, with suspects: memory placement, evaluating the group inside the compile, the emitter's prototype mixins.

### What warrants a second pair of eyes

- **Chess's deadline margin is 0.48 s.** Any later compile-time growth for Chess must be measured against it.
- **Files loads both pass groups.** Moving `split` into the core would save its 34 KB.

### Milestone 1 status

Vault report 1 (the compiler's new architecture) waits for REGISTERS and BITWISE. TAPE, FRONTEND, PIPELINE and ASYNC-TAPE are merged.

## Step 9: The playable image at f4fc56c, and a gallery check that no longer needs the gallery in front

The playable image `0a0d5d8f…` (built at `f4fc56c`, the PIPELINE merge) is installed and recorded. Health passes with the peripherals on, and the 18 scenes agree with the RV32 reference.

### What didn't work

- **The first gallery check.**

  ```
  AssertionError: no CGAL scene record within 120 s: the gallery is not drawing
  ```

  The healthy-input check presses keys, and the gallery draws only while it is on screen, so the gallery was not in front. APP-MANIFEST hit the same.

### What I did

- **`bench/board/gallery.py` waits at most `--wait` seconds (default 60)** for a scene, records `drawing` (null when not drawing), and runs the digests anyway; `gallery digest` does not need the gallery in front. Rerun into `various/09-gallery-f4fc56c`: 18/18 agree.
- **Committed** `PLAYABLE.json`, the evidence and the script change.

## Step 10: BITWISE and REGISTERS merged, F32 started, vault report 1

Milestone 1 is complete: TAPE, FRONTEND, PIPELINE, REGISTERS, BITWISE and ASYNC-TAPE are on `main`. The first vault report is published, and F32 is running.

### Prompt Context

**User message (verbatim, mid-step):** "how muchis left / ahead of us?" Answered with the ticket status.

### What I did

- **Merged BITWISE.** Clean merge; bundles current; `make test` exit 0; gates pass with both policies.
- **Installed the BITWISE firmware.** `a5420d94…`, built at `06fac5f`. Every boot app compiled through the updated C lexical index. Health passes with peripherals on; gallery 18/18.
- **Merged REGISTERS** (`5784a35`). Clean merge; the agent had already merged `main` in. Bundles current; `make test` exit 0; gates pass with both policies (digests and counts as before; 24/24).
- **Started F32** from `156e595`, with the REGISTERS agent's "left for F32" list in the brief.
- **Vault report 1:** "PROJECT REPORT - PicoCalc Compiler - One Tape, a Target-Neutral Front End, Declared Passes and Register Classes - Refactoring the Typed Compiler for Floats - A Technical Deep Dive", go-go-parc `6058943`. The tape example in Section 2 came from compiling `clampAdd` with `observeTape` (18 RV32 words under `interactive`).

### What didn't work

- **The first vault push** was rejected because the remote had moved (another project's report). `git pull --rebase` then `git push` succeeded.

### What warrants a second pair of eyes

- **Compiler load memory.** REGISTERS grew it by about 45 KB on the host (about 26 KB on the P4). The root cause is that the firmware does not set `JS_STRIP_SOURCE`, so QuickJS keeps the bundles' source text resident. This is a small firmware change with a large memory effect. It is worth its own measured change: boot compile peak before and after, and confirming that error messages still carry what the firmware needs.
