---
Title: Program diary
Ticket: PICOCALC-TYPED-NEXT
Status: active
Topics:
    - compiler
    - firmware
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:44:23.526013874-05:00
WhatFor: ""
WhenToUse: ""
---

# Program diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

# Program diary: PICOCALC-TYPED-NEXT

## Step 1: The next program, five tickets and their designs

PICOCALC-TYPED-FIRST finished with a list of follow-ups. This step turned the ones that pay off into five tickets with designs. It also recorded the user's instruction to run complex tickets on Opus subagents at `xhigh` effort.

### Prompt Context

**User prompt (verbatim):** "Ok, continue then. same approach, always write diaries according to skill format (including subagent), and write vault report in a textbook authhoring style at important milestones."

**User message mid-step (verbatim):** "for complex tasks, run opus xhigh subagent"

**Assistant interpretation:** Run the follow-up list as a new program the same way as TYPED-FIRST: tickets with designs, subagents in worktrees, merges with gates, a program diary, and textbook-style vault reports at milestones. Complex tickets go to Opus at `xhigh`.

**Inferred user intent:** Keep the project moving toward Typed-first with the same evidence discipline. Use the strongest agents for the hard tickets.

### What I did

- **Saved the subagent preference** as a feedback memory (`subagents-opus-xhigh.md`).
- **Read the code the designs depend on.**
  - Boot compiles are synchronous: `kernel_boot` → `add_world` → `port_read_file` → `p4_typed_world_read` → `p4_typed_compile`. So every first frame waits for every compile.
  - The FAT partition `files` (0x7D0000 bytes) is mounted at `/files` (`fs_p4.c`).
  - `JS_SetStripInfo` exists in our QuickJS (`quickjs.h:969`) and is never called.
  - The pass groups are built by `compiler/typed/rv32/build.mjs`; `split` is in the loop group.
- **Created the umbrella ticket PICOCALC-TYPED-NEXT and five tickets,** each with a design doc:
  - COMPILE-CACHE;
  - TYPED-VALUES;
  - COMPILER-DEVICE-COST;
  - BOARD-HARNESS;
  - CANDELA-KERNEL-CODEGEN (wave 2, after TYPED-VALUES).

### Why

- **The cache first.** Boot latency is the largest user-visible regression TYPED-FIRST left. It also blocks the Typed Candela arm.
- **Value types before Candela codegen.** The generator's workarounds are where the kernel's 2.5× gap comes from. Language support has to exist before the generator can drop them.

### What warrants a second pair of eyes

- **The cache key must include every compiler bundle a compile may load,** including the lazily loaded pass groups. A key that misses one serves stale modules after a firmware update that changed only that group.

## Step 2: Wave 1 launched

Four tickets started in parallel, each on an Opus subagent at `xhigh` effort in its own worktree from `6e9c08c`: COMPILE-CACHE, TYPED-VALUES, COMPILER-DEVICE-COST and BOARD-HARNESS. CANDELA-KERNEL-CODEGEN waits for TYPED-VALUES.

### What I did

- **Wrote each brief to stand alone:** the ticket line; files to read in order; the design doc; the diary skill's investigation format; milestones; gates with their numbers (ray `430f0d501659`, Chess 6,981 words, 25/25); and the board rules.
- **Added a rule from TYPED-FIRST's last step:** stop every background shell before the final report.
- **Constrained BOARD-HARNESS's 30-minute compositor run** to the installed image, sampled in short lock acquisitions, so the three agents that flash experiment images are not locked out for half an hour.

### What warrants a second pair of eyes

- **Three agents share one board.** The lock serializes operations, but an agent may restore playable between another agent's two steps. Each agent re-installs its own image per session, so that is safe, but board timings may be noisier than in TYPED-FIRST.

## Step 3: BOARD-HARNESS merged for its host part; the keyboard wedged again

BOARD-HARNESS fixed and tested four harness defects and found a fifth. Its board gates could not run because the keyboard's I2C was NACKing every transfer. I merged its branch early because the fifth fix protects every other agent's installs, and paused board work for the program.

### Prompt Context

**User messages (verbatim):** "test"; "ng the agents to kick them off" (read as "ping"). I pinged all four agents to start their diaries and first milestones.

### What I did

- **Merged `worktree-agent-a54a6f95d4fecae9d`** (`15f41e4`, `ff2a33c`, `e00abcf`).
  - `make test` exit 0, including the new `make test-board` (18 fake-board tests).
  - Default gates pass: ray `430f0d501659`, Chess 6,981 words, 25/25.
- **What changed in `bench/board`:**
  - one painter wait for both modes;
  - console deadlines checked before every buffered line;
  - `#OK CMD` accepted at the end of a line;
  - `health` reboots a board that has been up more than 120 s before judging it;
  - the keyboard qualifies on a 5 s bus window (deltas);
  - `install` holds the firmware before esptool's reset.
- **Paused board work for COMPILE-CACHE, TYPED-VALUES and COMPILER-DEVICE-COST** until the user power-cycles the board. Each was told to merge main before its next board session.

### What didn't work

- **The install gate** (`playable.py install --stored ... --peripherals on`, image `507a7064`):

  ```
  physical keyboard I2C0 did not qualify over 5.26 s: {'transfers': 248, 'errors': 248, 'busyMs': 3178.91}
  ```

  The UART shows `I2C transaction unexpected nack detected` from the first keyboard transfer of the boot, and 7,522/7,522 errors two minutes later.

### What I learned

- **The likeliest cause of the repeated wedges is our own installs.** Every install and restore reset the ESP32 through esptool without the firmware's `hold`, which quiesces i2c0. A reset in the middle of a keyboard transfer leaves the STM32 holding the bus. It is not known whether this install or an earlier one caused today's wedge. From now on, restores from main hold first.

### What should be done next

- **The user power-cycles the board.** Then resume BOARD-HARNESS for:
  1. the install gate;
  2. the 30-minute compositor soak;
  3. the `--health-only` gate.

  Then release the other agents for board work.

## Step 4: TYPED-VALUES merged; CANDELA-KERNEL-CODEGEN launched

TYPED-VALUES delivered all seven language features on both targets with every host gate green and integer images byte-identical. Only its device check is outstanding, waiting on the board. I merged it and launched wave 2.

### What I did

- **Merged `worktree-agent-a78b28ed420b7fd04`** (`83dadd8` … `976fca5`). Clean merge; bundles current; `make test` exit 0; gates pass with both policies (ray `430f0d501659`, Chess 6,981 words, 25/25).
- **Decisions the ticket made** (its design's Refinements):
  - `value record Vec3 {…}`, constructed `Vec3(a, b, c)` and scalar-replaced by the front end; no pass sees a value record.
  - Record results through Wasm multi-value, and on RV32 in a0–a7/fa0–fa7, then the caller's stack-argument area.
  - `continue` through a block around the body.
  - `?:` as `if (result T)`.
  - `u32` as an i32 with unsigned operations.
  - `new Float32Array(N)` local arrays, with counted-loop counters unchecked (proved in the front end).
- **Effects it measured:**
  - A Vec3 loop: 3,020 instructions against 5,124 for the memory-record workaround.
  - Boot apps compile 1–7 % slower on host QuickJS. Chess is estimated at about 65 % of its deadline on the P4; the device check will settle it.
- **Launched CANDELA-KERNEL-CODEGEN** (Opus, `xhigh`). Host steps first: regenerate, keep the three Candela checks, profile, then compiler work. The board study waits for the power cycle.

### What warrants a second pair of eyes

- **The TYPED-VALUES device check is now on the coordinator.** The next playable install, after the power cycle, must confirm every boot compile within 75 % of its deadline, Chess above all.
- **A pre-existing bug the ticket found:** Wasm inspection crashes on `0xfc`-prefixed operations, so `i32(f32)` cannot be inspected through Wasm. It is a task.

## Step 5: COMPILER-DEVICE-COST's host work done; merge held for the board study

COMPILER-DEVICE-COST finished everything that can be done off the board and stopped at the board pause. I did not merge it. Its changes are safe functionally, but two of them (debug stripping and arena reuse) exist to change device memory and time, and neither has been measured on the P4.

### What the ticket delivered (host)

- **`TYPEDCOMPILE` instrumentation** per compile: per-source load and run time, heap, teardown, and PSRAM-heap calls.
- **`JS_STRIP_DEBUG`** in every compile runtime. Compiler bytecode went from 1,065 KB to 191 KB (to 263 KB with `JS_STRIP_SOURCE` only). The compile peak dropped 324 KB for Agenda and 438 KB for Chess with a device-like allocator. Compile-error messages are identical (33 cases); stack traces lose file:line.
- **A deviation from the design.** Moving `split` alone changed nothing: Files compiles under `interactive`, and `default` needs `version` and `hoist`. Instead the kernel-only passes became a third group (`typed-rv32-kernel.js`).
- **One bundler** (`compiler/typed/bundle.mjs`), with every bundle byte-identical.
- **Arena reuse,** outside the ticket: compiles keep up to 64 freed 4 KB arenas. On the host, Chess's heap allocations fell from 4,149 to 1,955.
- **The pass-group slowdown,** partly explained. The compile runs 0.4–1.1 % more instructions in the lazy layout, and the arena churn changes with which bundles are loaded. That accounts for about 20 of Chess's 96 ms.

### What's left (board)

1. An in-image session of about 18 min.
2. A paired boot study, 4 arms × 3 blocks.
3. The final image gate.

All of it is scripted.

### What warrants a second pair of eyes

- **The board runs the ticket's bench image `fa144453`, not playable.** After the power cycle the first step must be `make restore-playable` from main, before anything else judges health.

## Step 6: CANDELA-KERNEL-CODEGEN's host work merged

CANDELA-KERNEL-CODEGEN regenerated Candela with the value types, profiled the kernel and changed the compiler where the profile pointed. On the host, the kernel-bound scenes went from 1.89× to 1.41× C++. The board study waits for the power cycle. I merged the host work, since it changes only f32 functions under `kernel`, which no playable boot app uses.

### What I did

- **Merged `worktree-agent-a981885913a6ed2d3`** (`416e220` … `ea2b511`).
  - Clean merge; bundles and generated files current (`regenerate.mjs --check`).
  - `make test` exit 0; gates pass with both policies (ray `430f0d501659`, Chess 6,981 words, 25/25).

### What the ticket found and changed

- **The regenerated kernel was slower before any compiler change.** B-01 went from 10,279 to 11,464 instructions per sample, even with a source 302 KB instead of 372 KB.
- **The profile pointed at the frame, not the arena.**
  - Float arithmetic is under 7 % of instructions.
  - The cost is frame loads and stores, register moves, and about 8 instructions of address and range check per `getF32`.
- **Compiler changes, all limited to f32 functions under `kernel`:**
  - an inlining budget (400 locals);
  - the `rows` pass (one check and one base address per row, grouped by affine index);
  - `coalesce`;
  - float registers in call-free functions;
  - open inlining of record results;
  - result leaves written straight into locals.
- **Host results** (16 rows of frame 0):
  - kernel-bound geometric mean 1.885 → 1.410× C++;
  - all 18 scenes 1.290 → 1.034×;
  - the deepest stack 9,120 → 6,288 B.
- **Checks:**
  - E_rel ≤ 4.3e-4;
  - Wasm vs RV32 identical on 14 scenes over 4 passes, and on 16 rows for the 4 heaviest;
  - Typed reference digests unchanged;
  - 84 of 84 integer digests identical.

### What warrants a second pair of eyes

- **The host ratio understates the device.** The baseline was 1.89× on the host and 2.49–2.79× on the P4 for the same scenes. The ≤ 1.5× kernel-bound target is only met if that gap has also narrowed. The board study decides.
- **A merge conflict ahead.** COMPILER-DEVICE-COST, not yet merged, moved the kernel-only passes into a `typed-rv32-kernel.js` group. The new `rows` and `coalesce` passes are kernel-only, so its next merge of main must place them in that group.

## Step 7: After the power cycle, a restore fix, the new playable, and the board released

The user power-cycled the PicoCalc. The first restore with BOARD-HARNESS's new code crashed on a missing flag. Once fixed, the restore held the keyboard bus before flashing and passed health. The new playable from main was installed and doubled as TYPED-VALUES' device check. Then I released the board to the four agents.

### Prompt Context

**User message (verbatim):** "ok, power cycled"

### What I did

- **Built the playable from main** (`209af25`) in the background.
- **`make restore-playable` failed:**

  ```
  AttributeError: 'Namespace' object has no attribute 'health_only'
  ```

  BOARD-HARNESS made `--stored` and `restore` share one path, which reads `args.health_only`. Only the `install` parser defines that flag. I fixed it with `getattr(args, "health_only", False)` and committed (`fix(board): playable.py restore has no --health-only flag`).
- **Restore again:** exit 0, `heldBeforeFlash: true`, `rebooted: false`, i2c0 253 transfers in the 5 s window.
- **Installed `54cfa09b` (209af25):** health passed with peripherals on; gallery 18/18. Committed `d66fb5f`.
- **TYPED-VALUES' device check:**

  | App | Compile | Deadline | Share |
  |---|---:|---:|---:|
  | Chess | 4.35 s | 6 s | 72.6 % |
  | painter | 5.70 s | 8 s | 71.3 % |
  | Agenda | 2.84 s | 4 s | 70.9 % |
  | Editor | 3.54 s | 6 s | 58.9 % |
  | Files | 1.52 s | 3 s | 50.6 % |
  | Candela scene | 2.81 s | 8 s | 35 % |

  All are within the 75 % rule. Chess rose from 4.19 s (69.8 %) to 4.35 s, consistent with the ticket's +1–7 % front-end estimate. Three apps are now above 70 %.
- **Released the board** to BOARD-HARNESS (install gate, soak, `--health-only`), COMPILER-DEVICE-COST (merge main first: put `rows` and `coalesce` into its kernel group; then session, study, gate), CANDELA-KERNEL-CODEGEN (gallery arms and the paired study) and COMPILE-CACHE. All four were told to hold the lock per measurement block.

### What I learned

- **The harness's tests did not cover `restore`.** The fake-board suite tested `install` paths only. A one-line test of each subcommand's parsing would have caught it. Added as a follow-up.

### What warrants a second pair of eyes

- **Boot-compile margins are thinning.** Chess, the painter and Agenda are all at 71–73 % of their deadlines. The compile cache removes this pressure on warm boots, but a cold boot after every firmware update still compiles everything. COMPILER-DEVICE-COST's stripping and arena reuse are the candidates for the cold-boot margin.

## Step 8: Optimistic merges of COMPILE-CACHE and COMPILER-DEVICE-COST

Four agents queued on one board stretched every study two- to four-fold. The user asked whether we could merge optimistically and let the agents fix things in parallel. I merged both unmerged branches into main on their host evidence. Their board studies continue, and fixes land as follow-up commits. The playable firmware is not reinstalled until the board numbers are in.

### Prompt Context

**User messages (verbatim, in order):**
- "i think something might be off in reandering say "B-01" can you compare ? or  is that something already on the menu"
- "how far are we now?"
- "can we like "optimistically merge" and then have them fix in parallel? something like that?"

### What I did

- **B-01.** The C++ and Typed display references are the same digest (`23d7885f`), so any visible difference between the arms on the device is a bug. Every check so far compares digests against references, and none looks at the screen. Four agents were driving the screen at the time. I asked the user what "off" looks like, and asked COMPILE-CACHE, whose image makes Typed the default arm, to check B-01's display digest on both arms.
- **Merged COMPILE-CACHE** (`7a503c0`, branch at `2c7f5f4`, 31 commits). Clean merge.
- **Merged COMPILER-DEVICE-COST** (`ebfe8fb`, 25 commits). `typed_p4.c` conflicted in eight hunks. Both tickets had rewritten the compile allocator, and both had found that compiles never ran QuickJS's cycle collector. Resolution:
  - `account(JSMallocState *, …)` maintains `malloc_size`/`malloc_count` (the cache's fix);
  - the cache's PSRAM reserve and refusal counters stay;
  - DEVICE-COST's arena parking, heap-cycle timing, eval records and `TYPEDCOMPILE` line stay;
  - parked arenas are freed after `JS_FreeRuntime` by subtracting from `live` directly, since no `JSMallocState` exists then.
- **Gates.**
  - The playable profile builds: `make firmware PROFILE=playable`, exit 0, no warnings in `typed_p4.c`.
  - Both host gates pass.
  - `make test` failed once:

    ```
    firmware/port/esp32p4/main/typed_p4.c: 602 lines, over 500; split it, or list it in tools/file-length-exceptions.txt with a reason
    ```

    I listed it with COMPILER-DEVICE-COST as owner; then exit 0.
- **Told both agents** what changed under them. GC now runs during compiles on main, which changes what their arms measure, so each must state its base. DEVICE-COST is to review the resolution and split the file.

### What didn't work

- **My first merge-check build:** `bash firmware/port/esp32p4/build.sh playable …` failed with `idf.py: command not found` (exit 127). `make firmware PROFILE=…` loads ESP-IDF; the script alone does not.

### What warrants a second pair of eyes

- **The allocator resolution:** the arena-parking path never calls `account` on park or reuse, so a parked block stays in `live` and in QuickJS's `malloc_size`. That is intended: it keeps the peak honest. But the collector's trigger then sees parked memory as live. Up to 64 × 4 KB = 256 KB may make collections slightly earlier. The board study will show whether that matters.

## Step 9: B-01 looked at; CANDELA-KERNEL-CODEGEN's board study merged with an out-of-memory fix

The user's B-01 report checks out as the scene's normal look under few samples. CANDELA-KERNEL-CODEGEN's paired study brought the Typed kernel from 1.764× to 1.463× C++ on the P4, short of the 1.3× target. On the way it found that the compiler's new changes made the device compile of the gallery program run out of memory. I merged its fix at once, because main also has COMPILE-CACHE making the Typed arm the default.

### Prompt Context

**User message (verbatim):** "it seemed like it was lit from inside (the sphere) but tbh I didn't pay too close attention and if it was just a single pass thing or so"

### What I did

- **B-01.**
  - The preset is a red, rough sphere (roughness 0.4) on an 18 % grey card under a physical sky.
  - I compared two device screenshots of the C++ arm: CANDELA-GALLERY's `scene-B-01.png` at 30 spp, and today's `02-gallery-209af25/boot.png` at 24 spp. They look the same: soft, nearly uniform sky lighting, slightly brighter at the top, a soft shadow, and bright per-pixel noise.
  - At a few dozen samples that reads as glowing from within. The arms' display references are the same digest, and the host Typed digest did not change through today's compiler work.
  - Conclusion: very likely the scene's look, not a bug. COMPILE-CACHE was asked to compare the arms' B-01 display digests on its image.
- **Merged CANDELA-KERNEL-CODEGEN's board work** (`9c81fae`, `47d86d4`, `0fd2156`). Clean merge; `make test` exit 0; both gates pass.
- **Told COMPILE-CACHE** to merge main before its final Typed-arm runs.

### What the study found

- **The device compile ran out of memory** on the first image (`d66fb5f`):

  ```
  candela-gallery compile ... status=failed us=114296568 peak_js_bytes=17835904
  ```

  Settings and the compositor crashed out of memory during it. The RV32 backend kept every function's emitter until assembly. `9c81fae` releases each after lowering: host peak 27.4 → 20.9 MB; device 115 s, peak 13.6 MB. Output is identical (84/84, image 434,996 B).
- **Paired study** (18 scenes × 4 blocks, alternating order, 4 passes at 160×160; all 144 digests match):

  | | Baseline | Now |
  |---|---:|---:|
  | 18-scene geometric mean | 1.764 | 1.463 |
  | Kernel-bound geometric mean | 2.593 | 2.034 |

  The Typed kernel's own cycles per sample fell 13–27 % on every scene but X-04. Block-to-block spread ±1 %.
- **The device gains less than the host.** Host instructions say 1.41× kernel-bound, device cycles say 2.03×. The ticket's untested hypothesis: the remaining frame traffic hits a PSRAM stack, and the module's code is fetched from PSRAM.

### What didn't work

- **The board-sharing protocol.** Other agents changed the image before every one of the study's four blocks, so each block reinstalled (about 20 min under the lock). The final restore waited about 40 min for the lock. Four agents on one board roughly doubled every board step.

### What warrants a second pair of eyes

- **The hypothesis is the next measurement.** The host-device gap (1.41 vs 2.03) is now the largest open question about Typed's code quality. Testing it is cheap: run the same module with the gallery worker's stack in internal RAM, or with the module copied to internal RAM, and compare cycles per sample. It should be its own ticket.
- **The 115 s first-use compile** is longer than the 85 s baseline, and the Typed default arm depends on the cache making it a one-time cost.

## Step 10: COMPILER-DEVICE-COST finished and merged

COMPILER-DEVICE-COST's board study kept debug stripping, removed arena parking, and explained the P4-only pass-group slowdown as heap placement. Its follow-up commits fix the problems my optimistic merge brought into main. Merged; all gates pass and the playable profile builds.

### What I did

- **Merged `worktree-agent-a34a9eec183baabff`** (head `a930799`).
  - Clean merge.
  - `typed_p4.c` is 456 lines, with the compile heap in `typed_compile_heap.{h,c}`; its file-length exception is gone.
  - `make test` exit 0; both gates pass.
  - `make firmware PROFILE=playable` exit 0.
- **Did not install the agent's gate image `f20954b9`** (built from `d76d9bf`). Main has moved past it: the CANDELA-KERNEL-CODEGEN emitter fix, and COMPILE-CACHE's work, whose board validation is still running. The next playable comes from main after COMPILE-CACHE reports.

### What the ticket measured (boot study, 4 arms × 3 blocks, cache emptied before every boot)

| App | control | strip (Δ) |
|---|---|---|
| Candela scene | 2.818 s, 1,880 KB | −216 ms, −462 KB (plus −133 ms, −136 KB from the kernel group) |
| Editor | 3.558 s | −66 ms, −590 KB |
| Agenda | 2.797 s | −50 ms, −337 KB |
| Files | 1.522 s | −40 ms, −346 KB |
| Chess | 4.391 s | −40 ms, −438 KB |

- **Arena parking:** no boot gain (+2 to +21 ms), so it was removed.
- **The pass-group slowdown:** heap placement.
  - Identical work moves up to about 2 % with allocation placement: holding a block in front of the heap moved Agenda from 2,719 to 2,766 ms.
  - Lazy minus eager loading flips sign for Chess between two placements.
  - Rule added to `docs/typed-compiler.md`: a compiler-speed claim below about 2 % needs several heap placements.

### What I learned

- **My optimistic merge broke the board harness, and the agent's study caught it.** In the merged `typed_p4.c` the `TYPEDCOMPILE` line was printed in pieces. Another task's `painter` reply landed inside it, and the harness's health check raised `StopIteration` on 9 of 12 study boots. Main carried that from `ebfe8fb` to this merge. An optimistic merge of firmware is safe only while nobody installs main; it was not installed.

## Step 11: COMPILE-CACHE finished; the new playable with the cache and the Typed arm installed

COMPILE-CACHE delivered on the device: warm boots take their modules from the cache, and the Typed Candela arm is the gallery's default. I merged its last commits, built the playable from main (`3df1fc7`), installed it with health passing, and started the gallery check on both arms.

### What I did

- **Merged the rest of `worktree-agent-ad7c201df38aa233c`:** `f465d37` (the painter record found anywhere in a line), diary steps 8–10, and the evidence. `make test` exit 0; default gates pass.
- **`make playable` at `3df1fc7`**, then `playable.py install`: exit 0, health passed with peripherals on. Cold boot compiles:

  | App | Compile | Share | Peak |
  |---|---:|---:|---:|
  | Chess | 4.34 s | 72.3 % | 2.10 MB |
  | painter | 5.65 s | 70.6 % | 1.21 MB |
  | Agenda | 2.79 s | 69.7 % | 1.86 MB |
  | Editor | 3.48 s | 58.1 % | 2.31 MB |
  | Files | 1.52 s | 50.7 % | 1.35 MB |
  | Candela scene | 2.45 s | 30.6 % | 1.19 MB |

  Against the `54cfa09b` image, peaks fell 0.6–1.1 MB per compile (stripping, and compiles now collecting cycles); times are equal or slightly lower.
- **Started `gallery.py --arm cpp` and `--arm typed --wait 400`.**

### What the ticket measured

| App | Cold compile | Warm hit | Write to FAT |
|---|---:|---:|---:|
| Chess | 4.34–4.40 s | 89 ms | 10–12 s |
| Agenda | 2.75 s | 79–81 ms | 9–11 s |
| Editor | 3.50 s | 79–80 ms | 9–11 s |
| Files | 1.50 s | 76–78 ms | 9–11 s |

- **First frames:** 18.4–21.2 s cold, 3.6–6.4 s warm. Boot work ends 3.4 s after reset.
- **Integrity:** `typed cache verify` found 6 of 6 cached modules byte-identical to a fresh compile. A flipped and a truncated entry were each detected, deleted and recompiled.
- **The Typed arm:** compiles in the background while C++ draws (113.5 s alone, 177–182 s beside the writer, peak 9.87 MB); cached load 0.30–0.35 s.
- **The writer:** paced below the kernel, writing 4 KB pieces only in idle gaps of 10 ms or more. An unpaced writer made Agent, Files and the compositor overrun their turn budgets, because a flash erase pauses for 20 ms.
- **B-01:** display digest `23d7885f` on both arms. The user's "lit from inside" is sample noise; the Typed shot had 18 spp against 39.

### What warrants a second pair of eyes

- **Health is judged at about 10 s uptime, before the writer starts.** A writer-induced turn overrun would not be caught. The soak (BOARD-HARNESS) is the place to see it.
- **`typed cache clear` does not stop a queued write.**
- **Chess's cold compile is at 72–73 % of its deadline.** The margin keeps shrinking with every front-end feature.

## Step 12: Wrap-up: soak results, the last merges, two vault reports

The user called the soaks and tests done. I stopped the remaining board runs, merged the harness's soak evidence, committed the playable install, wrote the program's two vault reports and closed the program. `main` is not pushed this time: the push needs the user's go-ahead.

### Prompt Context

**User messages (verbatim, in order):**
- "what's left?"
- "how long for the soak?"
- "how long for the typed gallery check?"
- "how far is it now?"
- "ok whatever, i think we're good with the soaks and tests. let's wrap it up"

### What I did

- **Stopped** my Typed gallery run (still queued behind the soak, never reached the board) and the BOARD-HARNESS agent (its soak was at round 11 of 15 in its third run). Neither flashes, so the board stayed on playable `3df1fc7`, which had passed health.
- **The soak.**
  - Committed the three runs' evidence on the harness branch and merged it.
  - Summary: 71 samples over 15 rounds; i2c0 errors 0; no world with restarts or a last error; no `crashed handling` or turn-budget lines in any UART log.
  - The compositor overrun from TYPED-FIRST did not recur, which supports it having followed the I2C error storm.
- **Committed the playable record** (`80b8bb0`). The C++ gallery was 18/18 on this image. The Typed arm's gallery was not run on it; CANDELA-KERNEL-CODEGEN (`22abf5aa`) and COMPILE-CACHE (`3db56908`) each ran it 18/18 on images with the same compiler.
- **Vault reports**, go-go-parc `a4e0ab1`:
  1. "PROJECT REPORT - PicoCalc OS - Booting Without Compiling - A Compiled-Module Cache, What the Compiler Costs on the P4, and a Harness That Stopped Wedging the Keyboard - A Technical Deep Dive"
  2. "PROJECT REPORT - PicoCalc Compiler - Value Types in a Streaming Compiler - Scalar Replacement Without a Syntax Tree, and Candela's Kernel from 1.76x to 1.46x C++ - A Technical Deep Dive"

  I corrected one sentence in report 2 that went beyond the agent's evidence (why float registers went unused).
- **Closed the 7 merge and report tasks;** added six follow-ups and the changelog entry.

### What didn't work

- **The push.** A combined command that ended in `git push origin main` was refused by the permission classifier. Pushing needs the user's approval in this context; the commits are local.

### What the program delivered

| Ticket | Result |
|---|---|
| COMPILE-CACHE | warm boots: first frames 3.6–6.4 s instead of 18.4–21.2 s; Typed Candela the default arm, 0.3 s cached load |
| COMPILER-DEVICE-COST | `JS_STRIP_DEBUG`: −40 to −216 ms and −337 to −590 KB per boot compile; the pass-group slowdown explained as heap placement |
| BOARD-HARNESS | installs hold the keyboard bus before resetting; fresh-boot health; a 5 s bus window; 18 fake-board tests |
| TYPED-VALUES | value records, record results, local arrays, `continue`, `?:`, `u32`, stack parameters |
| CANDELA-KERNEL-CODEGEN | P4: 1.764 → 1.463× C++ (18 scenes), 2.593 → 2.034× (kernel-bound) |

### What should be done next

1. **The PSRAM hypothesis** for the host–device gap.
2. **Cold-compile speed.**
3. **The two cache follow-ups:** cancelling queued writes on clear, and health after the writer has run.
