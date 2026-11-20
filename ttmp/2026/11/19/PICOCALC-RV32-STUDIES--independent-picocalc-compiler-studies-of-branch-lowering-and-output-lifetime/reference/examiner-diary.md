---
Title: Independent examination diary for branch lowering and output storage
Ticket: PICOCALC-RV32-STUDIES
DocType: reference
Status: active
Topics: [picocalc, native, performance]
---

# Independent examination diary

## Step 1. Establish the reference and write the review plan

I inspected both compilers at `6426798f69c691f5c1979233ebdeb540f8ce7c61`. A typed source comparison can produce either a boolean value or an immediate control decision. The existing emitter already uses both forms. A second change to output allocation could preserve both while damaging a call patched during linking. I chose independently observable outputs for each path before seeing the candidate implementations.

### Prompt and scope

The parent commissioned an independent examiner for the two studies, asked for runnable guest semantics and failure checks, and retained ownership of board experiments and synthesis. The authored thesis request is recorded in the [supervisor diary](01-supervisor-investigation-diary.md). I will limit repository changes to examiner files in this ticket.

### Review plan

1. Compile signed relations and boolean negation at comparison boundaries, including expression contexts in which a boolean must survive as a value. Execute at register-resident and spilled depths. Distinguish the return value from the count and order of side effects.
2. Exercise a real unsigned comparison through string indexing with a negative position and at both sides of the limit. Require an emulator breakpoint for an expected RV32 trap and a RuntimeError for Wasm.
3. Compare raw native images and metadata for the output experiment, including relocations in later functions and function names that also name JavaScript object properties. Compare complete linked output and caller input bytes through the public world compiler. Exercise exact-fit slots, truncated slots, and overlapping diagnostic categories.
4. Check the order of frontend, lowerer, assembly, interface and slot diagnostics against the frozen compiler, including a local jump just outside the legal range. Retry a valid module in the same realm. Date/hash generated sources and evidence.
5. Separate static machine bytes, executed guest instructions, host compilation time, retained representations, linked ELF size and board observations in the report. Reproduce the key performance mechanism using an independent observation wherever a second measurement is practical.

### Why these boundaries

`FunctionEmitter.statement` emits a loop as a block containing a loop, condition, `eqz`, conditional exit and back edge. `codeUnitAddress` emits an unsigned greater-or-equal guard before address calculation. `FunctionCode.branch` places an inverted short branch before a long jump. Neither a source-level truth table alone nor a count of emitted words checks which instruction executes.

The frozen `compile` first parses the whole module, reports the first lowering error if parsing succeeded, then computes and resolves jumps. The complete-world wrapper validates program signatures and records before it asks the ELF slot linker to check its input. An intervention that moves this work forward can expose a different diagnostic on an otherwise identical source.

### Evidence and open checks

I read `picocalc-os/compiler/typed-{wasm,rv32,world}.js`, the previous examination's guest runner and the emulator's syscall handling. System call 10 returns the running guest instruction count. The emulator prints `ebreak at` on a generated trap. I found the locally built emulator and ESP GCC. The simulator and attached hardware remain with the supervisor.

The principal review risks are a test that merely reimplements the lowered state machine and a host-allocation proxy described as a device peak. Real Wasm and compiled RV32 execution address the first. Candidate evidence and host-vs-device accounting will determine the second.

## Step 2. Execute the generated instructions before assessing speed

The guest suite produces one typed source module and uses the frozen Wasm frontend to produce an executable reference. A separate assembly driver calls the actual machine code with the same scalar inputs and equivalent native pointers. The register values used by the harness survive guest calls under the RISC-V calling convention. It checks that the stack pointer returns to its starting value on every normal call.

I ran both implementations of 637 returning calls and six separate trap processes. Every return, record update, checked UTF-16 data word and expected trap agreed with Wasm. Summing identical instruction windows across the successful calls gives 41,051 for the baseline and 39,026 for fusion. The lowerer hashes in the receipts distinguish the implementations.

### What I did and why

The matrix crosses signed extrema, zero and unit values for each source-level comparison. A call in a short-circuit operand updates a count and ordered integer digest even when a subsequent boolean determines the return. The expression-depth cases put a min/max predicate beneath zero, four, five, six or eight live operands. The long conditional body performs 475 record updates on the taken arm. Valid and invalid operations read and write a three-unit buffer, including surrogate code units.

Separate RV32 processes distinguish a generated breakpoint from a timeout or invalid guest access. The harness rejects a success exit from an expected trap and checks for the emulator's breakpoint message. Only returning calls contribute to the instruction sum. Counter system calls delimit the same handler, loads, indirect entry and return bookkeeping per input in both executables.

### What failed and how it was resolved

On the first run, Node 24.18.0 reported `Error: spawnSync git EPERM` while reading `6426798…:picocalc-os/compiler/typed-wasm.js`. The sandbox run exited 1. I reran the same read/compile/execute workload with approval for subprocess execution. Both baseline and candidate completed. I did not use the partial redirected file from the failed run.

### Replay and verification

From the repo root use the compiler driver in `scripts/examiner/guest.mjs`. Pass the ESP GCC executable, the CJI emulator executable, a label and optionally the generated lane directory from the branch ticket. The raw receipts are `various/examiner/guest-{baseline,branch}.json`. The emitted-source fixture and oracle output digests identify the common input and result.

The frame-saving cases depend on an independent Wasm execution of the same source. A frontend mistake shared by both backends can escape this comparison. The test separately demands Wasm runtime traps on the six invalid accesses and checks expected locations of ordinary effects through returned/memory values. Application interactions belong to the application replays. These synthetic inputs were chosen to expose control-flow mistakes.

## Step 3. Cross a slab boundary inside a two-instruction patch

I generated legal source padding until a function began at word 1,023. Its two prologue placeholders land in different 1,024-word slabs. The same module calls local functions and imported functions above index 127. Both output modes matched all original image bytes, function entries, signatures, record fields and relocation offsets under default, explicit streaming and buffered operation. I retained the returned images during subsequent compilations and compared them again afterward.

### Public entry points and diagnostics

Three actual wrappers linked a real Files, Agenda and Editor template with a nonzero input view offset. Both candidates returned identical full ELFs and preserved the caller's entire input including sentinel bytes around the view. Tracking numeric byte-array constructions identified one raw buffer per compact compilation (3,216, 16,232 and 87,544 bytes) and none per direct compilation. Separate word-array tracing counted all 4,096-byte slabs. The observer reports object-argument byte-array constructors separately because some merely create a view over an existing backing store.

A 116-byte two-entry program fit a 256-byte synthetic slot exactly. The next smaller aligned capacity, 252, produced the pinned fit diagnostic. One 67,847-code-unit function expands UTF-16 literal stores into more than a megabyte of control span. I paired its failed jump with a nine-parameter function and a trailing type error to test three error phases in every relevant order. I also combined a short/malformed runtime with invalid application signatures. All 11 selected diagnostics agreed with the frozen compiler, including the late type-error position.

### Replay, uncertainty and review

Use `scripts/examiner/output.mjs compact|direct CANDIDATE_DIR REACTOR_DIR` with the generated variants and all three reactor templates. `output-{compact,direct}.json` names template and result digests. The explicit source allowance in the far-jump test is 128 Ki code units. This is a backend diagnostic exercise using the public limit parameter. The actual app wrappers keep their own limits.

A missing intermediate allocation is directly observable. Whether that allocation overlapped the maximum simultaneous live bytes needs allocator data. The phase and uninstrumented cold-run comparison are the remaining evidence for this question. The real reactor ELF bytes here have their own hashes. A separate reactor build can have a different linked-file hash even for the same raw instruction image.

## Step 4. Reconstruct the physical evidence from the serial stream

The supervisor captured a primary boot of the qualification firmware. I wrote a separate reader of the raw capture and extracted the board function bytes independently from executable ELF program segments using the symbol addresses from `nm -S`. I verified the SHA-256, size and FNV for both functions, the reported addresses and frequency, the fixture and order of every batch, every expected checksum, the uninstrumented compile rows and the 12 phase samples in each profile run.

The primary Editor peak was lower under compact but slightly higher under direct. In four matched blocks the median candidate-minus-baseline peak difference for direct was +3,218 bytes, while duration decreased by 150,657.5 microseconds. On the profiled runs the direct assembly-stage high-water fell by 206,460 bytes. The highest charge moved to the final ELF template copy. Reporting a saving equal to the missing contiguous image would be wrong. The report uses uninstrumented runs for the candidate's resource change.

### Measurement checks and recovery

The previous standalone comparator validator expected core 0. This experiment runs inside the OS kernel task pinned to core 1 in `main_p4.c`. The observed 360 MHz core-1 header is consistent with the actual runner. The two symbols are both at address 56 modulo 64 and have lengths 428 and 392 bytes. The 80 blocks each timed 128 calls with output hashing. On the directory-only path eight baseline-first and eight candidate-first blocks had opposite tiny median differences. I reported no resolved improvement there.

A dependency check for the optional Python ELF parser produced `ModuleNotFoundError: No module named 'elftools'`. Native `nm` plus Python's standard `struct` module were sufficient. The first local staging attempt had also reported `fatal: Unable to create '…/.git/index.lock': Read-only file system`. After obtaining the configured index-write approval, the eight examiner paths were committed at `d433cce`.

Run `scripts/examiner/board.py UART ELF MANIFEST SUPERVISOR_JSON` to reproduce the independent audit. It obtains measurements, offsets and digests from the first three inputs, compares the supervisor's block rows and checks the expected ELF hash per mode against the fourth. The retained receipt is `various/examiner/board-first.json`. No flash, restore or user-interaction operation was performed by the examiner.

### Author's second reading before publication

I completed separate report and guide drafts, then read each as a reader who has never operated this repository. I noted these comprehension gaps before revising:

- The guest pseudocode and article need a clear reason to observe two trace fields when a single final integer might look sufficient. Introduce an explicit skipped call and name the order digest without making it a collision-proof trace.
- A newcomer could mistake an ELF entry stub for the destination function. State the roles of both jump cells at the first slot description.
- The report's phase conclusion needs the ordinary C allocation boundary and an explanation of why phase 6 can show the same peak as phase 5.
- The guide's last page gives a reproducible execution path but the toolchain paths are unnecessarily long for an e-ink page. Use a command on PATH for the installed SDK compiler, show the relative emulator lookup on a second line, and name precisely which template file the physical audit needs.
- Check that percentage claims describe the median of paired fractional savings and that the alternating directory path is described as unresolved. Check that aggregate records of calls are described as sampled evidence, and make the checked memory sizes explicit.

## Step 5. Repeat the physical audit and publish the two documents

I ran the same independent serial/ELF audit against the supervisor's second complete boot. The code identity checks, four-way scheduling, compiled Editor hashes, 48 phase rows and all 80 warm pairs verified again. Both the published article and intern guide identify their board results as those of the primary boot. This separate replication entry preserves the second experiment's independent estimates without pooling boots.

| Median paired difference from frozen compiler | First boot | Second boot |
|---|---:|---:|
| Branch cold time | −32.96 ms | −2.98 ms |
| Branch peak | −16,150 B | −16,142 B |
| Compact cold time | −78.95 ms | −60.98 ms |
| Compact peak | −7,720 B | −7,716 B |
| Direct cold time | −150.66 ms | −124.54 ms |
| Direct peak | +3,218 B | +3,214 B |

A faster compile is a weak argument for branch fusion. Its second cold-time difference was only 0.003 seconds compared with a run lasting about 2.46 seconds. The long warmed comparator paths and peak differences reproduced much more closely. Second-boot paired savings were 13.96% for equal length-91 strings, 13.96% for a last-unit difference, 13.90% for the prefix and 9.47% for a first-unit mismatch. The directory flag case was 0.10%, about 0.03 cycles per call. The separate receipt is `various/examiner/board-replicate.json`.

I finished a practical intern guide with an execution-path diagram, pseudocode, a slab-boundary example, API and file references and commands. The separate technical article follows one comparison and one module through the independent measurements. The final reader pass clarified the result and memory checks, template entry/service responsibilities, the inherited peak at phase 6, the scope of cycle and percentage estimates, and how to supply the inputs. Neither document claims an observed UI latency effect from leaf-function timing.

### Publication and recovery

The unique vault note is `Projects/2026/11/19/PROJECT REPORT - PicoCalc Compiler - Independent Examination of RV32 Branches and Output Storage.md` in `go-go-golems/go-go-parc`. I used `cmp` against the ticket article before staging. A normal first push returned `[rejected] HEAD -> main (fetch first)`. Inspection after fetching showed one unrelated remote article and only my new unpublished report locally. Rebasing that commit and pushing produced `3828f65..c128253 HEAD -> main`. The verified vault revision is `c12825399128e2efc5bf554cfdcbb2fe8974fca8`.

The practical guide was submitted with `remarquee upload bundle`, the requested unique name and destination, with no overwrite. The final receipt was `OK: uploaded PicoCalc RV32 Independent Examination.pdf -> /ai/2026/11/19/PICOCALC-RV32-STUDIES`. This is a successful cloud upload. Physical device synchronization was outside this check.
