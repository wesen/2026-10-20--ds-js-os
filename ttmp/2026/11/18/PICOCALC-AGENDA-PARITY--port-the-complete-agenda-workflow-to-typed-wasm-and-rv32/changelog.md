# Changelog

## 2026-11-18

- Initial workspace created

## 2026-11-18

Ported complete prompt normalization, with Wasm and RV32 differential evidence for 292 full prompts and 3,924 token cases.

## 2026-11-18

Linked typed prompt normalization into both reactors and implemented F2 task creation with real Wasm simulator filesystem coverage and RV32 reactor emulation.

## 2026-11-18

Port grouped task order, navigation, completed filtering and bounded viewport to the Wasm and RV32 reactors. Match the original app in the keyboard-driven simulator; capture the grouped frame and record the rebuilt P4 image size.

## 2026-11-18

Expand the P4 app partition from 4 MiB to 8 MiB. Back up and verify the original layout, reset the relocated world store and FAT partitions, and prove the boot and filesystem mount on the PicoCalc.

## 2026-11-18

Implement selected-task toggle, F3 edit and two-press F5 deletion. Match the original update bytes and conflict behavior in the simulator, execute the native module under emulation, and verify writes on the PicoCalc.

## 2026-11-18

Implement F6 through a narrowed file capability, verify refusal, timeout and successful replacement, and save through the bundled Editor on the PicoCalc.
