# Tasks

## Done

- [x] Milestone 1: WGSL -> Typed generator for the kernel and B-01; Wasm and RV32 bit-identical on B-01 at 4 passes (dd995e1)
- [x] Milestone 2 (host): all 18 scenes within the image-error bound against the C++ arm (E_rel <= 0.02; max 4.3e-4)
- [x] Compiler: large RV32 frames through s0; Wasm memoryPages and maxSourceLength options (b3f788d)
- [x] Host Typed reference digests through the renderer core (bench/reference/candela-gallery/typed-4-passes.jsonl)
- [x] Gallery arms in firmware: cg_instance.begin, candela_typed_p4.c, `gallery arm`, `gallery digest ... typed|cpp`, gallery.py --arm

## TODO

- [ ] Milestone 2 (RV32): finish the 18-scene Wasm-vs-RV32 bit-identity run on the reference interpreter
- [ ] Milestone 3: on the device, the Typed arm's relocation from an internal-stack task (fix untested), its digests against typed-4-passes.jsonl (`gallery.py --arm typed`), compile time and heap; gallery.py 18/18 on the C++ arm on the candela-typed image; Chess deadline margin on that image
- [ ] Board: the keyboard controller (I2C0 0x1f) NACKs every transfer since the first experiment image's panic; needs a power cycle before any install's health check passes
- [ ] Milestone 4: paired board study, Typed vs C++, cycles per sample and seconds per pass
- [ ] Milestone 5: the Typed arm as the playable gallery's default (ARM_DEFAULT), when 3 and 4 hold
- [ ] Caching the compiled image (85.9 s first compile on the device; flash or PSRAM cache keyed by the source digest)
- [ ] The renderer core (passes, accumulation, display, digests) in Typed (still nucleus/candela_gallery.c)
- [ ] Compiler gap: `continue`
- [ ] Compiler gap: a conditional expression (ternary)
- [ ] Compiler gap: u32 (unsigned compare, divide, conversion)
- [ ] Compiler gap: local records and arrays (the generator uses static per-function frames)
- [ ] Compiler gap: buffer methods on record fields, and assignment to two-level fields
- [ ] Compiler gap: more than 8 x / 8 f parameters, multiple results
- [ ] Compiler gap: the inline/split passes multiply locals (sampleLobe 607 under kernel); f32 range analyses
- [ ] Compiler: the device compile of the 372 KB source takes 85.9 s and 16.3 MB of QuickJS heap
