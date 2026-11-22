# Tasks

## TODO
- [x] Phase 0: remove the operand-location planner's tape-decoding compile cost with byte-identical output <!-- t:3f8k -->
- [x] Phase 0: make the qualified options the default compile path, with an explicit stock policy for controls <!-- t:8yt9 -->
- [x] Phase 0: one host ray profiler (RV32 interpreter + per-function counts) usable from node and the REPL <!-- t:4mw9 -->
- [x] Phase 0: write the intern guide (system, evidence, gap decomposition, phased implementation plan) <!-- t:rkpc -->
- [x] Phase 0: upload the intern guide to reMarkable <!-- t:1s7m -->
- [x] Phase 0: keep REPL field notes and write the verdict on what would make the REPL more useful <!-- t:wzb4 -->
- [x] Phase 1: non-leaf register homes (callee-saved s1-s11) for functions that make calls <!-- t:orjp -->
- [x] Phase 2: capacity caching past pure leaves (effect summary or immutable capacity) <!-- t:kymv -->
- [x] Phase 3: whole-loop / whole-function bounds admission with checked fallback <!-- t:92y6 -->
- [x] Phase 4: constant division by multiplication <!-- t:py78 -->
- [ ] Phase 5: span and row-shadow algorithm in raytrace.typed, ported to C for the fair reference <!-- t:dw4u -->
- [ ] Phase 6: typed views of other element widths (i16/i32) <!-- t:b40e -->
- [x] Device: paired P4 trial of the new default (frame, primary, shadow predicate, cold compile) against C <!-- t:9ji7 -->
- [ ] Device: rebuild the playable firmware with the new default (TYPED-CHESS recipe), qualify all four apps on the P4, install it <!-- t:xxxn -->
- [ ] Phase 3b: non-negativity facts for division and remainder by constants (loop counters, products of non-negative values) <!-- t:papy -->
- [ ] Phase 3c: reduce the compile cost of versioning (ray cold compile 1.45 s on the device) <!-- t:483s -->
- [ ] Phase 3d: hoist the per-pixel guard of the inlined sphere loop (count reloaded from work per pixel) <!-- t:uxvd -->
- [ ] Workbench: native RV32 interpreter global (I1), --arg channel (I2), result store (I5), per-block stats.paired (I6) <!-- t:inx0 -->
- [ ] Candela: survey and design for running a Candela subset on the P4 (subagent ticket PICOCALC-CANDELA-P4) <!-- t:8xrn -->
