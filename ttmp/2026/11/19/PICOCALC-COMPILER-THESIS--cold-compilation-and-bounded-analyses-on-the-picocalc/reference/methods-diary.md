---
Title: Independent review of compiler representation and cold comparison
Ticket: PICOCALC-COMPILER-THESIS
DocType: reference
Status: active
Topics: [compiler, picocalc, measurement]
---

# Methods review diary

## Step 1. Identify the observable boundaries

I traced an Editor compile from the first bundle read in the firmware to the C-owned output buffer, and followed the resident QuickJS harness from compiler evaluation to the return from its JS function call. The review concerns which costs each number includes, which artifacts can be compared byte for byte, and which conclusions survive a change in the shape of the input.

### Prompt context

The project owner's request is transcribed verbatim in [the supervisor's diary, step 1](01-supervisor-investigation-diary.md). The supervisor assigned this review:

> Act as independent Astra thesis reviewer for the per-function representation/streaming experiment 88263e0 and root's cold factorial benchmark. In /home/manuel/code/wesen/2026-10-20--ds-js-os, ticket ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc. Sources under scripts/representation and scripts/supervisor and various/{representation,supervisor}, drafts various/reports/{representation,synthesis}.md. Evaluate reproducibility, phase scopes, production feasibility, determinism/diagnostics, design of comparisons. Run an independent test/analysis to challenge core claims; communicate significant findings early. Keep your own extensive investigation diary per /home/manuel/.codex/skills/diary/SKILL.md and separate notes (reference/methods-{diary,notes}.md), experiments confined to scripts/methods and receipts various/methods; write detailed standalone deep dive technical blog article in textbook style, no analogies per textbook-authoring/obsidian-vault-writing skills, various/reports/methods.md. Commit owned paths at appropriate milestones using --only, shared checkout. Parent publishes collectively to vault. Provide findings and hashes then finish.

I interpreted the assignment as an independent qualification of the research claims. The primary output should explain both how the measurements were obtained and how to reproduce a comparison which stresses a proposed explanation.

### What I did and why

- Read the generated-lane transformations, both C harnesses, the firmware allocator and interrupt checks, compiler/linker implementations, and Editor build options. The cold script compares a complete compiler bundle change, including removal of parts of the frontend, while the phase harness times fewer operations.
- Checked the default compiler allocator in the vendored QuickJS against both host configurations. The resident memory harness updates QuickJS's allocation accounting with Linux usable size plus overhead, while the firmware updates its own heap totals. QuickJS checks its own allocation state to trigger cycle collection.
- Read the return point for diagnostics in the stream transform. A captured lowering failure is reported after the remainder of the frontend succeeds. The existing oracle compares exception class and text. Firmware can also print a JS stack with internal line numbers.
- Read firmware bundle wiring. The same frontend bundle is loaded unconditionally, and individual worlds can select Wasm or native at build time. The prototype's Wasm writer removal changes the exported entry points in mixed builds.

### What worked and what I learned

The interval in the cold firmware includes filesystem reads, runtime construction, compiler evaluation, native lowering, ELF linking, copy-out and QuickJS destruction. The host writes the copied ELF after the timer stops. The resident full-call interval starts after compiler loading and excludes ELF linking, runtime destruction and freeing the returned value. Prepared-input replay times native code generation and raw image writing with a persistent prepared object.

### What didn't work

I checked whether this machine could also model 32-bit heap layouts with a native multiarch build. The exact probe was:

```sh
cc -m32 -x c - -o /tmp/picocalc-methods-m32 <<'C'
#include <malloc.h>
int main(void) { return sizeof(void *) != 4; }
C
```

Compilation stopped in `/usr/include/features-time64.h` with `fatal error: bits/wordsize.h: No such file or directory`. All reported review experiments use the installed 64-bit toolchain. The P4 comparison remains a separate experiment.

### What was tricky and what warrants a second pair of eyes

The runtime name or version string alone cannot establish equal GC behavior, and equal ELF size cannot establish equal compiled contents. I asked the supervisor to consider the allocator distinction and the native-only API boundary in the synthesis.

### Future work and review instructions

Inspect `picocalc-os/port/esp32p4/main/{editor_p4,typed_p4}.c`, `js_trigger_gc` in the vendored QuickJS, and the timing helpers in `scripts/representation/quickjs-runner.c`. A physical comparison would also need metadata describing the PSRAM allocator and free heap outside QuickJS.

## Step 2. Change the order and size of completed functions

I tested a prediction narrower than “streaming saves memory.” If the largest input function and total emitted code were sufficient predictors, permuting the position of the large body with all arithmetic work held fixed would leave the peak close to its previous value. The measured increase was large compared with allocator-order variation.

### Prompt context

See step 1. This is a mechanism check on the lifetime explanation, independent of the selection of Files, Agenda and Editor as workloads.

### What I did and why

I added `scripts/methods/function-shape.py` to generate exactly 2,048 increments over one, eight or 64 independent functions. Two 64-function sources have 63 four-increment bodies and one 1,796-increment body. The large body goes first in one source and last in the other. Function identifiers and source definition order are identical in both, and no functions call each other. The synthetic functions need a single mutable local, occupy no large RV32 frame and require no host import. I reconstructed the frozen compiler and QuickJS via the representation lab's generator.

I ran `python3 -B "$TICKET/scripts/methods/function-shape.py" "$TICKET/various/methods/function-shape.json"`. All five shapes passed the original four-way image and metadata comparison. I took four Linux allocator measurements per shape, shifting initialization order. Each lane runs alone in a new runtime for this measurement, while the ordering of previous allocations in the process can vary.

### What worked and what I learned

The uneven layouts have 14,784 packed cells in total, 12,579 in the largest function and 85,248 emitted machine-code bytes each. Packed-buffered median peaks agree at 899,640 incremental bytes. The streamed median rose from 601,344 to 766,608 bytes when the large function moved to the end. The ranges, respectively 561,112–602,496 and 766,608–775,552, were disjoint. Across layouts the byte contents can differ because different named functions receive the large body. Equivalence was checked within each layout.

### What didn't work

No compilation or equivalence check failed. The initial idea of treating a single heap reading per shape as deterministic would have obscured substantial variation associated with process allocation history. The receipt keeps all four orderings.

### What was tricky and what warrants a second pair of eyes

A completed function descriptor remains reachable through `FunctionCode.program`. Clearing its `code` property disconnects the array. Native output words and fixups persist through module assembly. Even a one-function program showed a reduction, so saving storage by dropping previous *functions* cannot be the entire explanation. Our heap observer measures an all-phase maximum. The identity of the instruction causing that maximum is unobserved.

### Future work and review instructions

Read the source generator and compare `large-first` and `large-last` in the shape receipt. Future instrumentation could mark operand construction, native lowering and image assembly, recording local maxima separately to locate the exact high-water events.

## Step 3. Add a cold packed-buffered comparison and a script-pruning control

I fixed the register backend at f0846ba and tested five frontend configurations through the complete firmware compile entry. This design addresses two questions that the original two-by-two experiment could not distinguish. Does streaming improve cold latency over a compiler with the same numeric operands? How much does pruning unused compiler JavaScript save even with identical function data?

### Prompt context

See step 1. The new trial reuses the supervisor's host port services and the lane generator. It builds its own engine and uses a fresh temporary directory for all build inputs and test bundles.

### What I did and why

- Added `scripts/methods/cold-stages.py`. It archives the compiler, Editor, SDK reactor, five vendored QuickJS translation units, P4 entry points and headers from f0846ba. Compiler flags, version strings, source/archive hashes and treatment hashes are recorded.
- Created a pruned lane that removes only the Wasm module writer and preserves the frontend body, LEB encoding and native reader. The remaining lanes remove framing, then switch operands to direct numeric cells, then vary function consumption.
- Pinned all 50 timed child processes to CPU 6. Ten five-treatment blocks use a five-row sequence and its reverses, shuffled as whole blocks by a recorded seed. Each treatment appears twice at each period and every distinct within-block predecessor pair occurs twice. The fresh process includes the real firmware compile and link path on Linux.
- Checked every returned ELF against one digest across all treatments. Checked reported byte length against the host's saved file.

### What worked and what I learned

The rebuilt reactor, Editor source and linked ELF hash matched the supervisor's existing register-backend receipt. The five median cold compiles took 50.277, 49.932, 48.315, 41.007 and 41.823 ms, respectively. Within blocks, seven of ten packed-versus-stream comparisons favored buffered packing for latency and ten of ten favored packing over unframed bytes. All peak byte counts were stable within treatment. With the register backend, streaming reduced peak by 697,496 bytes from buffered packing.

### What didn't work

The original supervisor harness used `build/qjs/*.o` from the checkout, which does not identify how those objects were built. The supervisor found that the existing QuickJS object differed from the current build's object and took ownership of rebuilding the original series. The review trial built directly from the frozen engine's C sources; it needed no repair when that difference was discovered.

### What was tricky and what warrants a second pair of eyes

The median of paired differences need not equal the difference between treatment medians. I report the wall-time treatment medians and matched changes separately. The pruned lane preserves the LEB encoders, body framing and all native lowering; its JS load size fell from 25,347 to 17,262 frontend bytes.

### Future work and review instructions

Run `python3 -B "$TICKET/scripts/methods/cold-stages.py" "$RV32_GCC" /tmp/methods-cold.json --cpu 6` with an available CPU and Espressif GCC. Match output hashes and inspect per-block times before interpreting timing differences. These are host-conditional causal comparisons over one frozen Editor workload. Selected settings, such as the ordering seed and local 64-bit compiler, appear in the receipt.
