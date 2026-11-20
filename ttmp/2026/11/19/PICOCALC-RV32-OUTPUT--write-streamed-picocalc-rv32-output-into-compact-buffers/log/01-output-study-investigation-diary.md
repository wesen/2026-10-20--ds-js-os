---
Title: Output study investigation diary
Ticket: PICOCALC-RV32-OUTPUT
Status: active
Topics:
    - picocalc
    - esp32-p4
    - performance
    - native
    - quickjs
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T19:31:35.875181814-05:00
WhatFor: ""
WhenToUse: ""
---

# Output study investigation diary

## Step 1 — Trace production ownership and record the experimental design

The production native entry has default streamed input. I traced the last use of each input operation array, the conversion from per-function JS arrays to an exact raw image, and the copies of the reactor on both sides of the C/JS boundary. I wrote the intern guide before changing output storage. The guide compares a compact-store lane and a direct-copy lane so the result can attribute a change to one decision.

### Prompt context

The original user prompt is held by the supervising task. The delegated scope asks for a ticket-local output experiment and design, matched host and coordinated physical evidence, exact native equivalence, and an intern guide for publication. The delegation identifies revision `6426798` as the reference and reserves the board for the supervisor.

### What I did

- Read the research index, production report, prior findings on streaming and negative results, and the earlier C cold-entry harness.
- Read `FunctionCode.lower`, `typedRv32.compile`, `typedRv32.linkSlot`, `compileTypedWorldRv32`, `p4_typed_compile` and the P4 heap functions.
- Created this ticket and its design guide using docmgr. Sent the supervisor the planned generator command and flat phase enum.

### Why

Raw API equivalence alone would miss the copy into the reactor and the SDK trampoline fixups. A comparison with only two variants would also conflate storing words densely with skipping the intermediate image.

### What worked

Confirmed the current lowering and linking order directly from the source. Identified the point where an output store can replace the word arrays while preserving the ordering of fixup checks and diagnostic precedence.

### What didn't work

The shell glob for `picocalc-os/compiler/*react*` returned `zsh:1: no matches found`. The relevant linker lives in `typed-rv32.js`, while C copies are explicit in `typed_p4.c`. I read both files directly.

### What I learned

Heap ownership and phase timing need independent evidence. The production peak excludes the original C reactor and returned C output. JS function streaming releases the input operation arrays and still retains all machine words and fixups.

### What was tricky to build

The previous local and global jump targets use different offset bases. The new store needs one absolute coordinate space, while offsets exposed to raw consumers must remain bytes. Keep the original error ordering by patching jumps after the frontend has returned.

### What warrants a second pair of eyes

Independently test simultaneous error cases, slab boundaries, input reactor view offsets, exact slot fit and reuse of an earlier result after later compiles.

### What should be done in the future

Measure the compact and direct lanes in the same cold entry. Consider changes to C copies only after phase evidence shows how much coexistence they contribute.

### Code review instructions

Read the design guide's ownership table and follow the three entry functions in source. Inspect the control-flow and SDK fixup paths before choosing an equivalence fixture.

### Technical details

Phase markers in profiled JS will call `globalThis.outputPhase(n)` synchronously. The enum is frontend 0, one-function lowering 1, assembly 2, world validation 3, slot scan 4, slot output 5 and return 6. Clean generated files omit markers.

## Step 2 — Generate the candidates and locate the Linux allocator peaks

I implemented two generated variants anchored to the pinned Git object. Both use an absolute word cursor shared by all functions. Compact converts the slabs to a contiguous image. Direct supplies the slabs to the slot linker and retains the ordinary raw entry for its existing consumers. All three production workload wrappers now take the direct path in the generated variant.

The important host finding is a change in which phase sets high water. An Editor baseline assembly peak of 1,919,200 B falls below 1,600,000 B in both candidates. At that point the linker copy sets the maximum instead. Files is small enough for the linker to dominate the Linux profile in every mode.

### Prompt context

See Step 1 for the delegated research scope. The supervisor requested all three production wrappers on Linux and common phase markers for a physical Editor experiment.

### What I did

- Implemented `scripts/01-prepare.py` and shared its clean/profile invocation with the board operator.
- Built a fresh set of vendored QuickJS objects. Passed the exact production `typed_p4.c` file to the Linux harness for clean observations. A separate generated C file installs the profiler for phase observations.
- Ran the Linux harness in six balanced blocks per app per measurement series with the Files, Agenda and Editor reactors from the prior ESP-IDF qualification build. The receipt includes their fingerprints, compiler fingerprints and the exact build ELF digest for each mode.
- Compared full ELF bytes, raw bytes and metadata in Node. Decoded the Editor's 145 SDK call instructions and entry stubs against their target addresses. Decoded the custom fixture's direct interfunction call and backward loop jump.
- Simulated the explicit little-endian serialization path and compared it to the raw and linked baseline. Covered exact slot fit, a slot one word short, a reactor view starting at a nonzero byte offset and a second compile sharing the same JS realm.

### Why

Elapsed time and peak bytes require clean measurements. Full allocation capture changes the work the allocator performs and introduces timer calls. A second series with profiling identifies the phase and distinguishes retained bytes from memory that a phase creates.

### What worked

The clean Linux medians for Editor were 69.486, 66.650 and 66.949 ms and peaks were 1,920,216, 1,632,152 and 1,651,264 B for baseline, compact and direct. All modes produced identical linked ELFs for the three applications. Raw code, signatures, records, entry offsets and relocation arrays matched for omitted, explicitly streamed and explicitly buffered options. All 15 selected error comparisons matched in type and message. The examiner independently tested a prologue straddling a slab, larger relocation sets, exact-fit linking and disappearance of direct-path raw allocations.

### What didn't work

My first cold build failed with `error: unknown type name ‘p4_compile_limits’`. The feature-guarded P4 compiler declaration needs `-DPICOCALC_TYPED_EDITOR=1` when compiling the generic host harness. I added that production feature define and reused the freshly built engine objects. The first Node invocation started before the host driver had produced its inputs, yielding `ENOENT: no such file or directory, open '/tmp/picocalc-output-host-clean/inputs/files/program.typed'`. I reran after input preparation. The first profile processes and part of the initial Node check overlapped. The clean series had already completed. Phase timings show observed magnitudes and phase peaks, with host scheduling variability.

### What I learned

Linux allocation peak for a given output can move to slot linking even when the bytes at the end of assembly fall. Direct removes one contiguous raw allocation but retains 22 slab objects for Editor at linking. On this host the direct candidate peaked 19,112 B higher than compact. Source script, collector and object residency can also contribute to that delta.

### What was tricky to build

The compact writer must preserve import patch order even though all functions now use one coordinate system. A `jal` target for an SDK call remains an import index. The raw image must still contain a zero placeholder. Range checks for internal branches remain in assembly so valid existing frontend and earliest lowering errors retain priority.

### What warrants a second pair of eyes

Compare production-like P4 and Linux phase traces before drawing a device conclusion. Treat the phase markers at function exits and before the return as boundaries that can inherit a preceding phase's live maximum. Confirm full ELF hashes from exact same reactor inputs.

### What should be done in the future

Evaluate the device measurements before choosing either patch. Use the later C handoff only if the allocator trace identifies an overlap relevant to an explicit memory objective.

### Code review instructions

Run `scripts/05-cold.py` with the three hardware reactor ELF files to prepare inputs, then execute `scripts/02-identity.mjs` using the inputs and clean generated directories. Read `various/identity.json` for the artifact digests and tested diagnostic precedence cases.

### Technical details

`various/host-clean.json` contains 54 clean cold processes. `various/host-profile.json` contains 54 profiled processes with per-stage elapsed time, first entry and last exit live allocation, absolute phase peak and allocator-accounting callback count. Each profiled process verifies that its largest phase maximum equals its custom allocator peak.

## Step 3 — Resolve the device peak with two balanced runs

The supervisor executed both board boots, checked every output against the exact host reactor and artifact oracle, and provided the phase traces. I reduced the two receipts with `scripts/06-board-summary.py`, preserving full clean timings and ELF digests at the shared source ticket. The two device runs agree in direction on every matched comparison.

### Prompt context

See Step 1. The supervisor provided a primary device series and a separate balanced replication. My scope covers consuming the verified receipts and updating the guide. The supervisor owned board operations.

### What I did

- Compared four blocks in each boot, each containing the baseline, compact, direct and branch lanes.
- Derived compact and direct within-block savings against baseline. Compared the independently profiled production and direct JS phases.
- Reread the whole guide as a new implementer. Clarified absolute word versus byte offsets and distinguished after-link C result ownership from simultaneously live JS reactor buffers. Changed the fixture guidance to treat recursion and forward calls as diagnostics for the current language.

### Why

The device allocator and value representation differ from the host. A similar peak value can mask a large reduction in one intermediate stage. The second boot repeats the relevant comparisons under a separate runtime startup and retains the original algorithm comparison.

### What worked

Baseline Editor medians were 2,483.993 and 2,463.365 ms, and direct medians were 2,335.968 and 2,330.993 ms. The matched savings for direct were 150.658 and 124.544 ms. The direct lane’s clean peak was 1,414,092 and 1,414,090 B versus 1,410,878 and 1,410,872 B for baseline. All compact and direct ELF digests matched production across both boots. Primary profiling puts the baseline peak in assembly at 1,415,086 B and direct in slot output at 1,414,468 B. The replicate reached the same phase conclusions.

### What didn't work

The original expectation of a large device peak reduction did not hold. The direct slot output still allocates a full reactor copy while the input and instruction slabs are live. The Linux absolute peak improvement does not transfer to this device workflow.

### What I learned

Compact and direct are both cold-latency candidates for the measured Editor. The large storage benefit applies to the assembly phase. The next phase simultaneously owns two 240,452-byte QuickJS buffers, so qualifying larger apps needs a separate bound or a change to that overlap.

### What was tricky to build

The return boundary reports an already-live peak from slot output. The guide credits the allocator event in linker output. The device phase profile includes only baseline and direct and therefore attributes the whole output-store change within assembly, rather than claiming a measured split between compact fixups and the bypassed raw copy.

### What warrants a second pair of eyes

If either mode is proposed for production, evaluate the time gain on other deployed native applications and a source near its heap limit. The tested corpus supports exact ELF and diagnostic equality under the reported limits.

### What should be done in the future

Treat a storage-ceiling objective and a latency objective separately in any promotion decision. Include C and QuickJS ownership accounting together if changing the C bridge.

### Code review instructions

Run `scripts/06-board-summary.py` with the shared primary and replicate JSON receipts. Compare the derived medians and fixed ELF hash with `various/board-summary.json`.

### Technical details

Primary lane clean order is balanced across four positions, with two separate phase runs per profiled mode. A sample begins with a fresh QuickJS runtime inside a boot. The replication repeats that schedule in a separate boot on the same physical PicoCalc.

## Step 4 — Deliver the guide and publish the research note

The finalized guide was uploaded to reMarkable and the new dated vault report was committed and pushed. I checked that the canonical shared board receipts reproduce the ticket’s derived summary byte for byte.

- ReMarkable reported `OK: uploaded PicoCalc RV32 Output Intern Guide.pdf -> /ai/2026/11/19/PICOCALC-RV32-OUTPUT`. The destination was used without the overwrite flag.
- Vault commit `9616ac1f88d32d0cec0082b354243b199b447ba6` added only `Projects/2026/11/19/PROJECT REPORT - PicoCalc Compiler - Compact Native Output and Peak Allocation.md`. The push advanced `origin/main` from `15585a7` to `9616ac1`.
- The experiments and reproduction commands are in this ticket. The completed study supports a separate promotion decision with the app and metric stated explicitly.
