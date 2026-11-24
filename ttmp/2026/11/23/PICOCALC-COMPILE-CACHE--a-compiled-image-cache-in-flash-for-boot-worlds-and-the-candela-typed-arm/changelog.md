# Changelog

## 2026-11-23

- Initial workspace created

## 2026-11-23

Refinements recorded in the design (hash at boot, every typed/ bundle in the key, I/O on internal stacks, deferred writes, byte budget, background Typed compile)

## 2026-11-23

Milestone 1: typed_cache.{h,c} and tests/native/test_typed_cache.py, 20 tests (a3cbffc)

## 2026-11-23

Device code: the cache in p4_typed_app_compile, writer task, console; candela-gallery in playable with Typed as the default arm; candela-typed profile removed. make test and make test-host (both policies, 25/25) pass; board paused (keyboard wedged)

## 2026-11-23

Device sessions A1-A3: unpaced writes broke turns (436961b paced pieces); a writer above the kernel broke them again (03d09de keeps it below and inside the kernel's gaps); the compile allocator never fed QuickJS's collector (d8520cd), so the gallery's Typed program now compiles at 13.4 MB in 113.5 s and loads from the cache in 0.30 s; warm boots hit in 29-89 ms and draw ~15 s earlier; verify 6/6 byte-identical; corrupt gate healthy; host gates green at 063ba96

### Related Files

- firmware/port/esp32p4/main/typed_cache_p4.c — paced writer below the kernel
- firmware/port/esp32p4/main/typed_p4.c — collector accounting and PSRAM reserve

## 2026-11-23

Session B on merged main (54ec123 = main ebbade8, image 85be45dd): no world crash; cold compiles within 73% of deadline; warm hits 28-89 ms, first frames ~15 s earlier; Typed default loads from the cache in 0.33 s (182 s background compile on first use); verify 6/6; gallery 18/18 on both arms; B-01 disp 23d7885f on both; health warm and corrupt passed; health cold stopped on a harness race (TYPEDCOMPILE printed in pieces), fixed in f465d37

### Related Files

- bench/board/device.py — painter reply found inside another line
