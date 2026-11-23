# Candela gallery references

`rv32-4-passes.jsonl`: frame-0, accumulation and display digests of the 18 gallery scenes after 4 passes, from the
same Candela kernel compiled for rv32emu (PICOCALC-CANDELA-GALLERY `scripts/04-build-ref.py rv32`, copied from that
ticket's `various/references/`). `bench/board/gallery.py` compares the device's `gallery digest ID 4 psram` with it.

`typed-4-passes.jsonl`: the same three digests for the gallery's Typed arm (PICOCALC-CANDELA-TYPED): the kernel and
the scenes' sections generated in Typed (`apps/typed/candela-gallery`), rendered by the program's WebAssembly build
(bit-identical to its RV32 build) and fed through the gallery's renderer core built for rv32imafc with newlib, in
the counting interpreter, as for `rv32-4-passes.jsonl` (that ticket's `scripts/03-typed-ref.py`; an x86-64 replay
gives other display digests where the tone map's libm calls round differently). `bench/board/gallery.py --arm typed` compares `gallery digest ID 4 psram typed` with it.
