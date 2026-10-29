# Changelog

## 2026-10-26

- Initial workspace created

## 2026-10-28

P4/P6 (bed309e): ESP-IDF power management (240/40 MHz, light sleep, tickless idle; kernel/EPD/I2C locks; touch INT wake) and real EPD update times via waitDisplay. Idle on USB: kernel 0.8%, EPD 1.6%; the USB console blocks light sleep, battery measurement pending.

## 2026-10-28

P5 progress (137387a..5a8e692): per-op prof; faster glyphs; caches (32 KB I, 64 B D lines); retained painting with a paint check; dirty bands; sys.worlds fields; prelude compiled once to bytecode with an mquickjs atom-table fix. System repaint 109 -> 31 ms; world restart 150-180 -> 10-25 ms.

## 2026-10-28

P5 closed after step 13 by the user's choice. Left open: the compositor's interpreter time (~14 ms per repaint), frame JSON decode (~4 ms), the compositor's 254 ms parse at boot, lower mem_kb limits.
