# Tasks

## TODO
- [x] Verify the design against the code; record refinements in the design doc <!-- t:gjsy -->
- [x] Vector format, generator (bench/rv32/generate.mjs) and suite (bench/rv32/vectors.mjs) <!-- t:ckt1 -->
- [x] P4 capture app (bench/board/rv32-vectors) and capture script (bench/board/rv32-capture.py); capture 15,454 vectors and restore the playable image <!-- t:lhpd -->
- [x] Reference interpreter: full RV32IM, RV32F with fcsr, F CSRs, checks switch; passes every vector <!-- t:ji87 -->
- [x] Go machine (pkg/tracerv32): the same, bit-identical with the reference; conformance and differential tests <!-- t:qj98 -->
- [x] Split bench/emu/emu.c by concern (scripts/01-split-emu.py) <!-- t:kxw2 -->
- [x] RV32F and the vector harness in rv32emu; passes every vector <!-- t:z4m6 -->
- [x] Runners in make test (test-rv32, test-generated, test-go) <!-- t:c0qg -->
- [x] Document the executors' roles (docs/rv32-executors.md) <!-- t:z1wj -->
- [x] Gates: make test, make test-host (default and kernel), trace REPL bit identity <!-- t:cwh0 -->
