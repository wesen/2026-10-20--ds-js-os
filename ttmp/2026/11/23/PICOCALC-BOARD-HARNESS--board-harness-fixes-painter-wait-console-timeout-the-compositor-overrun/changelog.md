# Changelog

## 2026-11-23

- Initial workspace created

## 2026-11-23

15f41e4: painter wait in both peripheral modes; console deadline checked before every line and #OK accepted at a line's end; health judges a fresh boot (console reboot when up > 120 s); 5 s bus window in every health record; tests/board (fake console, 16 tests) in make test

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a54a6f95d4fecae9d/bench/board/device.py — the fixes
- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a54a6f95d4fecae9d/tests/board/test_device.py — fake-serial tests

## 2026-11-23

ff2a33c: install holds the firmware before esptool resets it. Install gate (stored 507a7064, peripherals on): write and verify OK; health failed on the keyboard, i2c0 248/248 transfers NACKed over 5.26 s. Board work stopped: needs a power cycle by a person
