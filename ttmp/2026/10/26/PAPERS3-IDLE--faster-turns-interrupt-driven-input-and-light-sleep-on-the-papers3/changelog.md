# Changelog

## 2026-10-26

- Initial workspace created

## 2026-10-28

P4/P6 (bed309e): ESP-IDF power management (240/40 MHz, light sleep, tickless idle; kernel/EPD/I2C locks; touch INT wake) and real EPD update times via waitDisplay. Idle on USB: kernel 0.8%, EPD 1.6%; the USB console blocks light sleep, battery measurement pending.
