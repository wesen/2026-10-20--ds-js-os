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
