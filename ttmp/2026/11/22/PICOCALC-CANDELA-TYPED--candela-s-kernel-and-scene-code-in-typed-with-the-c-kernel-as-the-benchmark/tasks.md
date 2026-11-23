# Tasks

## Done

- [x] Milestone 1: WGSL -> Typed generator for the kernel and B-01; Wasm and RV32 bit-identical on B-01 at 4 passes (dd995e1)
- [x] Milestone 2 (host): all 18 scenes within the image-error bound against the C++ arm (E_rel <= 0.02; max 4.3e-4)
- [x] Compiler: large RV32 frames through s0; Wasm memoryPages and maxSourceLength options (b3f788d)
- [x] Host Typed reference digests through the renderer core (bench/reference/candela-gallery/typed-4-passes.jsonl)
- [x] Gallery arms in firmware: cg_instance.begin, candela_typed_p4.c, `gallery arm`, `gallery digest ... typed|cpp`, gallery.py --arm
- [x] Milestone 3: on the device (candela-typed 6c7e2ca0) the Typed arm compiles in 85 s (16.3 MB heap), relocates, and draws all 18 scenes with the host's digests (RV32 newlib reference); gallery.py 18/18 typed and 18/18 cpp; Chess 69.8% and its painter 71.9% of their deadlines
- [x] Milestone 4: paired board study, 18 scenes x 4 blocks: Typed/C++ cycles per sample geomean 1.76 (0.81 to 2.79)

## TODO

- [ ] Milestone 2 (RV32): the last scene (G-03) of the Wasm-vs-RV32 bit-identity run on the reference interpreter (17/17 identical so far)
- [ ] Caching the compiled image (85 s first compile on the device; a flash cache keyed by the source and compiler digest), the prerequisite of milestone 5
- [ ] Milestone 5: the Typed arm as the playable gallery's default (ARM_DEFAULT), after the cache (the coordinator: not before)
- [ ] Kernel code quality: the fixed kernel is 2.5x C++ (B-01, R-01, L-03, V-02); static frame records, vector results through K, inline-pass frame growth are the suspects
- [ ] The renderer core (passes, accumulation, display, digests) in Typed (still nucleus/candela_gallery.c)
- [ ] Compiler gap: `continue`
- [ ] Compiler gap: a conditional expression (ternary)
- [ ] Compiler gap: u32 (unsigned compare, divide, conversion)
- [ ] Compiler gap: local records and arrays (the generator uses static per-function frames)
- [ ] Compiler gap: buffer methods on record fields, and assignment to two-level fields
- [ ] Compiler gap: more than 8 x / 8 f parameters, multiple results
- [ ] Compiler gap: the inline/split passes multiply locals (sampleLobe 607 under kernel); f32 range analyses
- [ ] Compiler: the device compile of the 372 KB source takes 85.9 s and 16.3 MB of QuickJS heap
