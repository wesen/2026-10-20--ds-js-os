# Tasks

## TODO
- [x] Language: f32 type, literals, conversions, operators, Math functions, record fields, getF32/setF32 (b2773a5) <!-- t:3jba -->
- [x] Tape rows and the three pseudo-ops; Wasm backend with typed locals and expansions (b2773a5) <!-- t:ba4t -->
- [x] RV32F emission: f operand stack, homes, calls, frameless leaves (b2773a5) <!-- t:7gwc -->
- [x] Differential tests: Wasm vs RV32 (reference interpreter, five policies) vs JS model; Go machine fixture (b2773a5, 88d11bd) <!-- t:eez5 -->
- [x] Math library in Typed with ulp accuracy (88d11bd) <!-- t:6u51 -->
- [x] Candela fragments within 1.5x of GCC -O2 instruction counts (88d11bd) <!-- t:t62v -->
- [x] Paired board study: fragments in Typed vs GCC on the ESP32-P4 <!-- t:gqoc -->
- [ ] Widen the f32-only code generation (frameless functions, a0 kept, constant homes, returned value in a0) to integer functions, with a board study <!-- t:pfq5 -->
- [ ] powf with a two-part log2; sin/cos reduction beyond 51,000 (Payne-Hanek) if a kernel needs it <!-- t:dqms -->
- [ ] Range facts and value sets for functions with f32 operations (ranges/value-sets reject them today) <!-- t:ynkf -->
- [ ] Use the math library from Candela's generated kernel (PICOCALC-CANDELA-TYPED) <!-- t:ead0 -->
- [ ] Cold-compile board study of this branch vs main (Editor, Chess): host callgrind shows +1.6-2.1% compile, +15M instructions to load the larger compiler <!-- t:db0i -->
- [ ] Math.round, f32 in the world ABI (imports/exports), f32 with async functions <!-- t:t301 -->
