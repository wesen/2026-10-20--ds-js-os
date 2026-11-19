# Changelog

## 2026-11-19

- Initial workspace created
- Merged buffered numeric operands in 4452064. Verified six unchanged linked artifacts across Wasm and RV32 and retained a pinned reproducer.
- Merged direct bounds proofs in e082ec3. Began independent review, application replays and physical qualification against the numeric-only compiler.
- User clarified the second change is streaming. Reverted the bounds pass in 3785155 and retained its pinned research, independent examination and physical compile observations.
- Integrated per-function streaming in 2317696, recorded six cross-target artifact comparisons and exact diagnostic parity, then exposed the firmware option in 3c0add0. Buffered native compilation remains the default.
