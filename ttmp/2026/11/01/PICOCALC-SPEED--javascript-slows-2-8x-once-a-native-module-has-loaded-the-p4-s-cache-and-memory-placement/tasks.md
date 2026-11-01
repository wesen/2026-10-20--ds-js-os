# Tasks

## TODO
- [x] Restore the device: flash the normal firmware (no ELF modules) with the PICOCALC-FRAMES fix; bench at boot, 20 s, 60 s <!-- t:4qtg -->
- [x] Instrument: a cachestat console command (L1/L2 hit, miss, conflict counters around the benchmark) <!-- t:kdnc -->
- [x] Experiments 1-5 of the design: counters fast vs slow, per-turn costs, benchmark placement, the moment of the switch <!-- t:wjg9 -->
- [x] Evaluate candidate fixes (QIO flash, XIP from PSRAM, larger L2) against the acceptance criteria <!-- t:xc70 -->
- [x] Apply the chosen fix and validate (bench within 10 %, no overruns while switching apps, internal SRAM >= 64 KB) <!-- t:vex3 -->
