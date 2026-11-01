# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01

Cause found and fixed: LP SRAM (RTC fast memory) was in the heap; QuickJS blocks there cost 994 ns per access (14 ns elsewhere). sdkconfig.defaults keeps it out (4168b95). Also: cachestat instrument (6631809), Logs sends only its visible window (26c5eb6), SPI transfers without spi_master copies (8ab3b51), README (3edc6b4). Benchmark 113-116 ms / 30.5 ms in every firmware; stress runs clean.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/js/apps/logs.js — visible window
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/port/esp32p4/main/bus_p4.c — aligned SPI transfers
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/port/esp32p4/main/perf_p4.c — cachestat
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/port/esp32p4/sdkconfig.defaults — LP SRAM out of the heap

## 2026-11-01

Ticket closed
