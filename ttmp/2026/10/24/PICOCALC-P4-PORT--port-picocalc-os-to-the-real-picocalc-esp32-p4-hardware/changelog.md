# Changelog

## 2026-10-24

- Initial workspace created

## 2026-10-24

Port implemented and running on the ESP32-P4: port seam (host pixel-identical), ESP-IDF project with real clock, I2C/SPI worker tasks, PSRAM heaps, embedded JS, UART console with framebuffer shots; fixed -O2 strict-aliasing crash, heap alignment, int32_t; System app cpu% and overflow fix; measurements in design doc section 15

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/port/esp32p4/main/bus_p4.c — bus worker tasks
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/port/esp32p4/main/main_p4.c — kernel task loop and console
