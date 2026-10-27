# Tasks

## TODO
- [x] Guide: analysis/design/implementation for faster turns, interrupt-driven input, light sleep; upload to reMarkable <!-- t:y49j -->
- [x] P0: profiler (per-world engine/render time, kernel wakeups/idle, prof console command); device baseline <!-- t:sag0 -->
- [ ] P1: remove idle work (compositor waitFrame/banners via sleep, minute-aligned clock, power 60 s, no 50 ms kernel cap) <!-- t:i0ta -->
- [ ] P2: timer control (timers.stop/start, paused) and render-only-front (sys.front); apps stop timers on blur <!-- t:373y -->
- [ ] P3: GPIO interrupts as messages (kernel M_IRQ, port API, device ISR, simulator GT911 INT); touch driver on irq <!-- t:06pi -->
- [ ] P4: power management (PM_ENABLE, tickless idle, locks, GPIO wakeup, USJ); measure idle current <!-- t:fjaw -->
- [ ] P5: faster turns (arena placement, cache, prelude fast path, settle without JSON; bytecode investigation) <!-- t:ujem -->
- [ ] P6: panel timing measured with waitDisplay <!-- t:6ifv -->
