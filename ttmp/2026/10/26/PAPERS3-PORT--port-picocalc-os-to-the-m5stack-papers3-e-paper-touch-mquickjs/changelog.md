# Changelog

## 2026-10-26

- Initial workspace created

## 2026-10-26

Guide written (engine seam, mquickjs binding with prelude thenables, gray8 + proportional fonts, EPD refresh planner in JS, GT911/BM8563/ADC drivers, paper compositor, host sim, ESP32-S3 port); uploaded to reMarkable /ai/2026/10/26/PAPERS3-PORT; published as artifact XAQDfRBhT24JDpy1s24rLv

## 2026-10-26

P0 seams (engine, board, pixel_t/proportional fonts) with PicoCalc shots byte-identical; P1 MicroQuickJS binding + ES5 Task prelude + PaperS3 simulator (GT911, BM8563, EPD glass), conformance manifest passes incl. SAN

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/js-papers3/prelude.js — the ES5 world API with Tasks
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/nucleus/vm_mqjs.c — the MicroQuickJS binding

## 2026-10-26

P2/P3 done (7f96c33): display driver with refresh planner, paper compositor, touch/clock/power drivers, seven apps, 22 deterministic captures. P4 (78bba9a): ESP32-S3 firmware builds with IDF 5.3.4 (1.6 MB); not flashed, cdc_acm missing on the host. Guide artifact v3 shows simulator captures.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/js-papers3/drivers/display.js — refresh planner
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/js-papers3/system/compositor.js — paper compositor
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/port/esp32s3-papers3/main/bus_s3.cpp — device bus workers (i2c1, epd0 via M5GFX)

## 2026-10-26

Firmware runs in Espressif QEMU (d925eb4): conformance worlds clean on Xtensa; fixed unchecked temporary-context mallocs in vm_mqjs.c; QEMU RTC-fast-memory limit identified (core 1 reads zeros). Guide §6.11/§10/§11/§15 updated; artifact v4.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/nucleus/vm_mqjs.c — checked temporary contexts
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/port/esp32s3-papers3/qemu.sh — QEMU runner for the firmware
