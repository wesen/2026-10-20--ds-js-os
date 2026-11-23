# Changelog

## 2026-11-23

- Initial workspace created

## 2026-11-23

Instrumentation (8c6a1ff), one bundler (b2efc56), kernel pass group (c7fca6b, 84/84 digests), JS_STRIP_DEBUG in compile runtimes (4239fde; host: compiler bytecode 1,065 KB -> 191 KB, realm 1,139 KB -> 579 KB, rejected-compile messages unchanged). First board session stopped at health: keyboard I2C NACKing (wedged before the install).

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a34a9eec183baabff/compiler/typed/bundle.mjs — the shared bundler
- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a34a9eec183baabff/compiler/typed/rv32/passes/kernel-group.js — kernel-only passes
- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a34a9eec183baabff/firmware/port/esp32p4/main/typed_p4.c — TYPEDCOMPILE line and COMPILER_STRIP
