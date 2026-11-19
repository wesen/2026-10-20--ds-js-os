# Changelog

## 2026-11-19

- Initial workspace created
- Merged buffered numeric operands in 4452064. Verified six unchanged linked artifacts across Wasm and RV32 and retained a pinned reproducer.
- Merged direct bounds proofs in e082ec3. Began independent review, application replays and physical qualification against the numeric-only compiler.
- User clarified the second change is streaming. Reverted the bounds pass in 3785155 and retained its pinned research, independent examination and physical compile observations.
- Integrated per-function streaming in 2317696, recorded six cross-target artifact comparisons and exact diagnostic parity, then exposed the firmware option in 3c0add0. Buffered native compilation remains the default.
- Measured the same production JS compiler across four buffered and four streamed cold boots of native Files, Agenda and Editor. A 64 KiB streamed Editor preview matched its framebuffer reference outside the clock. Published the combined report in go-go-parc at b40a951.
- Selected streaming as the native default in 7677932. Explicit buffering remains available. The default and opt-out matched all three complete linked executables; both ESP32-P4 firmware configurations built.
