# Changelog

## 2026-11-23

- Initial workspace created

## 2026-11-23

Instrumentation (8c6a1ff), one bundler (b2efc56), kernel pass group (c7fca6b, 84/84 digests), JS_STRIP_DEBUG in compile runtimes (4239fde; host: compiler bytecode 1,065 KB -> 191 KB, realm 1,139 KB -> 579 KB, rejected-compile messages unchanged). First board session stopped at health: keyboard I2C NACKing (wedged before the install).

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a34a9eec183baabff/compiler/typed/bundle.mjs — the shared bundler
- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a34a9eec183baabff/compiler/typed/rv32/passes/kernel-group.js — kernel-only passes
- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a34a9eec183baabff/firmware/port/esp32p4/main/typed_p4.c — TYPEDCOMPILE line and COMPILER_STRIP

## 2026-11-23

Host work complete: heap counters (de8065d), arena parking (7682d93), TYPED-VALUES merged (3905072; bundles identical to main's, 84/84 digests, make test and test-host both policies green). Slowdown mechanism found on the host (compile +1.1% instructions hidden by cheaper loading; arena churn that moves with realm composition). Board paused since 13:20 (keyboard NACK); all arms built and sessions scripted (diary step 8).

## 2026-11-23

Board work done. Merged CANDELA-KERNEL-CODEGEN (rows, coalesce in the kernel group) and main's optimistic merge (ebfe8fb, with COMPILE-CACHE: compiles collect cycles). Split typed_compile_heap.{h,c} out of typed_p4.c (f1ecb93). Paired boot study on 20a4b23 (4 arms x 3 blocks, cache emptied before each boot): kernel group -133 ms Candela, strip -40 to -216 ms and -337 to -597 KB per boot app, parking -27..+21 ms (taken out, d76d9bf). The P4-only pass-group slowdown is heap placement (in-image E2/E2p/E3 on 54dfe3b). TYPEDCOMPILE now one write (91aeb52): printed in pieces it broke the harness's painter health check. Gate image f20954b9 (d76d9bf): healthy twice with peripherals on, every boot app at most 72.7% of its deadline.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a34a9eec183baabff/firmware/port/esp32p4/main/typed_compile_heap.c — compile heap and TYPEDCOMPILE line
- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a34a9eec183baabff/ttmp/2026/11/23/PICOCALC-COMPILER-DEVICE-COST--what-the-typed-compiler-costs-on-the-p4-stripped-source-pass-groups-one-bundler/various/04-boot-study-20a4b23/summary.txt — boot study table
