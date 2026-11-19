# Changelog

## 2026-11-18

- Initial workspace created

## 2026-11-18

Compiled stored Agenda task lines, including the normalized title and declared task record, to Wasm and matched 6,411 reference cases.

## 2026-11-18

Published the stored-line parser deep dive to go-go-parc main at 5f1dd76.

## 2026-11-18

Linked and ran compiled Agenda in WAMR with a capability-checked read of notes/todo.txt and a published file-backed view.

## 2026-11-18

Verified Wasm Agenda reads, renders and delivers a clock-driven reminder with suppression across a persisted cold restart.

## 2026-11-18

Pushed the storage, clock and display deep dive to go-go-parc at fe8b62d. The live compile entry now checks the typed runtime layout.

## 2026-11-18

Verified cold on-device Wasm Agenda builds and measured the linker optimization. File-to-frame p95 was 606 ms for bundled source on the settled OS. The physical keyboard returned I2C NACKs.

## 2026-11-18

Restored the prior PicoCalc firmware with a verified app-partition write and published the Wasm hardware deep dive to go-go-parc at 3b4640c.

## 2026-11-18

Compiled the typed Agenda parser to RV32 on the P4, verified the relocated reminder, frame and restart behavior under emulation, and recorded native timing and firmware restore evidence.

## 2026-11-18

Measured full-boot stages and reduced median headless RV32 source-to-first-frame latency by 339 ms through bounded CJI relocation deferral.

## 2026-11-18

Measured the repeated QuickJS prelude initialization cost and reduced median headless RV32 cold response by 572 ms with an in-memory compiled prelude.

## 2026-11-18

Recorded eight full headless RV32 boots under two seconds after linker optimization. Measured CJI relocation and built a clean peripheral-enabled image for the distinct physical test.

## 2026-11-18

Measured matched Wasm and RV32 cold boots and source rebuilds on the P4. All twelve cold boots passed two seconds. Preserved both peripheral-enabled builds for the separate physical test.

## 2026-11-18

Booted the peripheral-enabled RV32 image and recorded Agenda publication alongside the nonresponsive STM32 keyboard bus. Restored and verified the prior app.

## 2026-11-18

Confirmed the powered keyboard and display buses complete transfers without errors. Measured a 667 ms editable Agenda build and two slower full boots.

## 2026-11-18

Attributed 529 ms of the 559 ms powered startup settlement delay to measured dispatch segments, led by the compositor and peripheral drivers.
