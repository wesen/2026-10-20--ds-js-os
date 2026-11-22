# Tasks

## TODO
- [x] Measure every boot world under every RAY-PARITY step policy on the P4 (arms firmware run 1) <!-- t:2y76 -->
- [x] Choose a named budget policy for the boot worlds by the decision rule (slowest compile <= 75% of the deadline) <!-- t:y8xu -->
- [x] Wire the policy through p4_compile_limits.policy for Files, Agenda, Editor and Chess; pin its ray image in the tests <!-- t:jd2x -->
- [x] Build, install and qualify the playable firmware with the new compiler and the budget policy (world list, Chess oracle on the device) <!-- t:u5qd -->
- [ ] Compile-speed work with byte-identical output (inliner done: ~2-3%) <!-- t:jrsr -->
- [ ] Add the arms firmware as a gate to RAY-PARITY's qualification of any new default <!-- t:ktvh -->
- [ ] Tiered compilation design (ticket) if the budget policy costs too much generated-code speed <!-- t:9761 -->
- [ ] Arms run on the smooth-chess configuration (3D Chess at 4.69 s = 78% of its deadline; Candela 2.00 s); choose their policies by measurement <!-- t:3zb6 -->
- [ ] Persist the compiler bytecode cache in flash across boots, keyed by source digest (the boot's first compile still parses, ~0.5 s) <!-- t:c33z -->
