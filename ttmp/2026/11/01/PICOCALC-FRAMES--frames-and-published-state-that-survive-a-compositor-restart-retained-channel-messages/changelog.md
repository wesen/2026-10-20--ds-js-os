# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01

Retained channel posts (0da00ca): a post with { retain: true } (nw_publish_retained) is kept per publisher and channel and replayed to a world that starts later; a world's frame is its retained post on frames. Power drivers and the PaperS3 clock retain. Host tests (RetainTests, CompositorRestartTests, native retain) and the device: after a compositor crash Calc, Files, Logs and the battery come back.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/nucleus/kernel.c — kernel_retain, replay_retained, frame_message, the hooks
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/tests/test_sys_native.py — RetainTests and CompositorRestartTests

## 2026-11-01

Ticket closed
