---
Title: Files comparison P4 microbenchmark investigation diary
Ticket: PICOCALC-COMPILER-INTEGRATION
DocType: reference
Status: active
Topics: [compiler, picocalc, performance]
---

# Files comparison P4 microbenchmark investigation diary

## Step 1. Verify the native function and observation boundary

The production change removes redundant text bounds checks in the Files name comparator. To measure the user-facing compiler feature at the point where the machine executes it, I isolated the actual compiled function and passed it its ordinary four-argument RV32 inputs. This avoids timing a hand translation of the typed source. One P4 image contains both revisions so board speed, application setup and fixture storage are common.

### Prompt context

The parent records the owner's request in [the integration diary](01-compiler-integration-diary.md). The supervisor's assignment was:

> Please build a small ticket-local reproducible paired on-device microbenchmark for the actual generated filesCompare native function. Use a separate build under /tmp and ticket scripts only, no production writes, no serial access (I own board). Capture both function variants ideally in one tiny standalone ESP-IDF test image w/ direct identical input fixtures, hardware cycle timer, warm interleaved blocks, correctness/hash checks, prevent dead call elimination; extract images or code with actual compiler public functions old 4452064 and new pending bounds. Coordinate with bounds and send me runnable build and exact instructions when ready, and keep your own detailed integration diary. Consider loading constants as static executable assembly .long and direct calls, pure function no other calls. If measurement requires disproportionate effort tell me promptly. Parent will handle real serial+flash and publishing. Commit ticket code/documentation only. Ticket is ttmp/2026/11/19/PICOCALC-COMPILER-INTEGRATION--integrate-qualified-compiler-optimizations-into-the-picocalc-toolchain.

### What I did and why

- Examined the `filesCompare` source, `slots.h` and `compileFilesRv32`. The native Files wrapper calls `typedRv32.compile(source)`, validates signatures and links its program into a prebuilt reactor. The per-function microbenchmark calls that same public compiler on the complete mandatory source, then uses the offsets recorded in its public result.
- Verified that the typed string ABI is a 32-bit length followed by an array of 96 unsigned 16-bit units and that both directory flags use the C API's Boolean type. The longest benchmark value is 91 units.
- Received the new production bounds revision `e082ec3` from the bounds researcher and pinned the numeric-operand control at `4452064`. Their source and ABI header bytes match. Their public native compilations return different `filesCompare` bodies.
- Wrote a compiler-output generator that rejects calls, foreign relocation sites, PC-relative address materialization and jump targets outside the selected function. The generated assembly keeps the native instruction words. A final ELF reader checks symbol extent, section execute permission, relative cache-line placement and SHA-256 of each complete linked function.

### What worked and what I learned

Both functions begin at offset 1,712 in their respective compiled Files programs. The control has 428 bytes and the candidate 364 bytes. Their differing bodies correspond to an actual production compiler change with the same input and ABI. No repository production files needed writing.

### What didn't work

The command that began the initial smoke build in the ordinary sandbox was `bash -c 'source /home/manuel/esp/esp-idf-5.4.2/export.sh >/dev/null && "$1" 4452064 4452064 /tmp/files-compare-p4-methods --smoke' _ "$TICKET/scripts/files-compare-p4/build.sh"`. On Node v24.18.0, the Git child produced bytes but `execFileSync` returned `Error: spawnSync git EPERM`. The scoped approved host build used the now-available real candidate revision and resolved the sandbox error.

### What warrants a second pair of eyes

Both code ranges have internal PC-relative control flow. An import relocation check alone would miss a direct jump to another typed function after whole-program fixups. The generator validates the decoded displacement of every direct jump and branch.

### Review instructions

Read `scripts/files-compare-p4/generate.mjs`, then compare the fields and SHA-256 values in the emitted `/tmp/files-compare-p4-methods/manifest.json`. The Files wrapper and original typed source under `picocalc-os/worlds/files` specify the relevant normal entry point.

## Step 2. Build controlled loops and inspect the final linked image

I used a fixed-frequency ESP-IDF v5.4.2 app running its main task on CPU 0. It invokes each extracted function through the same C sample body specialized to the respective external symbol. Repeated calls and a checksum ensure the optimizer must consume the result before sampling the ending counter. The five fixture shapes exercise 91 successful loop iterations, a late difference, a shorter prefix, a first-unit difference and the directory-flag fast return.

### What I did and why

Each fixture receives two untimed-for-analysis warmup pairs followed by sixteen measured pairs of 128 calls. The harness checks each result once directly against an independently encoded expected integer, then checks the checksum of every batch. The P4 computes FNV-1a on each function's linked bytes at start; build-time SHA-256 provides a separate integrity check. Measurements from a complete run include both lanes in every block, the actual clock frequency and the identities of the compiled programs.

The shell build stage writes to `/tmp/files-compare-p4-methods`. The repository contains source code, the operator instructions and this diary. The supervisor owns the serial port, flashing and subsequent production restoration.

### What didn't work and how I corrected it

The first candidate link requested a 64-byte section alignment for the assembly inputs. The exact build was `"$TICKET/scripts/files-compare-p4/build.sh" 4452064 e082ec3 /tmp/files-compare-p4-methods` after sourcing the IDF environment. The linker rejected `section .flash.text VMA [40000040,4001395d] overlaps section .flash_rodata_dummy VMA [40000020,4002001f]`. The standard IDF script expects the primary flash mapping at an offset of 32. Raising the global output section alignment moved its start.

I kept the assembly section's natural word alignment and inserted padding **between** the two complete function bodies. Their starting addresses now have the same offset modulo 64. The padding lies outside both function symbols. The standard ELF executed byte checks pass and the linker script and production firmware are untouched.

### What worked

The completed artifact at `/tmp/files-compare-p4-methods/build/files_compare_cycles.bin` has SHA-256 `7b303001b66ba8e12d7dcaf47da14e185ce74a2e1ae85d60969182d64499edbb`. The control and candidate function SHA-256 digests are `4c36ee97faa432f65afca16c316d58553a70562a14165574cffee85b0c60f999` and `4da076aa8ee335ae835b9adeb5b13834ba12e4a6d245bfbc65a9b5695b820d51`. Their device-side fingerprints are `b9639eb4` and `16c2beba`. The board operator received the app-only binary and complete raw-log instructions.

Disassembling `sample_old` and `sample_next` with the IDF RV32 objdump showed matching instruction sequences surrounding their direct `jal` instruction. The loops read `mcycle`, load the repeat count 128, call `40007254 <compare_old>` or `40007414 <compare_next>`, fold the return into the FNV accumulator, loop, and then read `mcycle` again. The firmware configuration specifies CPU 0, PM disabled, 360 MHz and UART 115200.

### What I learned, what should be done next and review instructions

The direct-call and byte identity checks answer separate questions. ELF inspection proves the selected machine code survived linking and the measured loop uses it. It cannot supply a device speedup. The unfiltered board pairs and per-fixture distribution determine the measured effect. Mapped flash and statically allocated internal inputs are specific conditions of this isolated comparison. Timing a real directory sort would introduce comparison-path frequency and storage placement effects.

See [the benchmark instructions](../scripts/files-compare-p4/README.md). `summarize.py` reconstructs the expected checksum and validates all 80 reported pair records before calculating per-fixture matched savings. The operator will capture the actual device evidence under this ticket.
