# Changelog

## 2026-11-22

- Initial workspace created

## 2026-11-23

- b3f788d compiler(typed): large RV32 frames through s0; Wasm memory and source-limit options; test typed-rv32-large-frame
- dd995e1 gen(candela): the WGSL -> Typed generator (tools/gen/candela/typed, kernel-typed.mjs), apps/typed/candela-gallery generated; all 18 scenes within the image-error bound against C++
- The gallery's Typed arm in firmware (candela_typed_p4.c, cg_instance.begin, console arm selection), host Typed reference digests, profile candela-typed. Device run 1: compile 85.9 s and 16.3 MB of heap; the relocation panicked from a PSRAM stack (fixed, not yet run on the device)
- Board: keyboard I2C0 NACKs after the panic; playable restored (flash verified), but its health check fails until a power cycle
