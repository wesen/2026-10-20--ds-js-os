# A paired P4 cycle benchmark for generated Files code

This ESP-IDF v5.4.2 application executes the RISC-V code for the real typed `filesCompare` function from two production compilers in one boot. It calls the public `typedRv32.compile` entry for the complete, identical Files source, extracts the function, and verifies that its PC-relative branches remain within its extent. The harness uses the Files ABI from the two matching source revisions. Every input string starts with its 32-bit length followed by UTF-16 code units. Boolean directory flags and both pointers occupy the ordinary RV32 argument registers.

## Build and verify

Run from the repository root. The build uses a scratch project under `/tmp` and can reuse that project's IDF object cache on subsequent runs.

```sh
source /home/manuel/esp/esp-idf-5.4.2/export.sh
TICKET=ttmp/2026/11/19/PICOCALC-COMPILER-INTEGRATION--integrate-qualified-compiler-optimizations-into-the-picocalc-toolchain
WORK=/tmp/files-compare-p4-methods
"$TICKET/scripts/files-compare-p4/build.sh" 4452064 e082ec3 "$WORK"
```

The generator writes `$WORK/manifest.json` with the full revisions and SHA-256 digests for the compilers, Files source, ABI, whole native image and both function slices. GCC links the already emitted words as executable assembly. The post-link check verifies the two symbols' executable sections, lengths, cache-line offsets and complete SHA-256 values. The baseline function occupies 428 bytes and the candidate occupies 364 bytes. The generated binary is `$WORK/build/files_compare_cycles.bin`.

## Run on the test device

The board operator owns the serial port and restores the production image after measurement. On the existing PicoCalc layout the factory application begins at `0x10000`. Use application-only flashing so the loader, partition table and storage retain their existing contents. From the scratch project with the IDF environment active:

```sh
cd "$WORK"
idf.py -p "$PORT" app-flash
idf.py -p "$PORT" monitor
```

The monitor can reset the board to capture one complete boot. Save its UART output, from the `FCBENCH START` line through `FCBENCH COMPLETE`, as a file. To collect and summarize:

```sh
python3 "$TICKET/scripts/files-compare-p4/summarize.py" /tmp/files-compare-uart.log "$WORK/manifest.json"
```

Run the summary command from the repository root when using the relative ticket variable. An ordinary console capture can include ESP-IDF log lines. The parser checks the reported revisions, function bytes and hashes, core, known result for all 80 paired observations, alternating call order and the terminating marker.

## What the counter measures

Each fixture receives two warmup pairs and sixteen measured pairs. Each sample calls the named routine 128 times on identical arguments using the same generated C loop, folds the signed return into a 32-bit checksum, and measures the elapsed core-cycle counter. The first measured variant alternates by block and by fixture. The benchmark keeps all observed pairs and prints them after collecting the timings. Timings include direct calls, the checksum and loop overhead, plus interrupts that occurred during a sample. Both functions start at the same offset modulo 64 and execute from mapped flash in this standalone image. The data live in static internal memory. The recorded interval does not exercise file enumeration, full sorting, the production world loader, or filesystem I/O.

| Fixture | Source path exercised | Expected return |
| --- | --- | ---: |
| `equal91` | Equal names of 91 UTF-16 code units | 0 |
| `late91` | Different last code unit of a 91-unit common-length pair | −31 |
| `prefix` | Equal first 71 units, lengths 71 and 91 | −20 |
| `first` | First code unit differs | 7 |
| `dir` | Directory ordering returns before inspecting text | −1 |

The image computes a check over each linked function's bytes on the device before timing and compares the actual return to its independent expected integer. It checks the checksum of every timed batch. The summary computes medians within each fixture and the median of the sixteen within-block savings. A result from one fixture cannot predict the distribution of comparisons in an actual directory sort.
