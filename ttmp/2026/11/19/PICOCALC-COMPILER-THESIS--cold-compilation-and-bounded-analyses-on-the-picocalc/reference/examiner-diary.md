---
Title: Independent examination diary for PicoCalc lowering and bounds proofs
Ticket: PICOCALC-COMPILER-THESIS
DocType: reference
Status: active
Topics: [picocalc, compilers, experiments]
---

# Independent examination diary

## Step 1. Make the bounds experiment fail closed under more demanding inputs

I examined the production lowerer at `f0846ba` and the ticket-local proof and emitter at `c1e3777`. The first question was whether an inferred fact could outlive a call hiding inside an expression, a loop iteration, or the analyzer's own work limit. I used the production emitter as the oracle, compiling the same source independently under direct and chained modes.

The three compilers agreed on all 760 argument tuples, including 16 traps. A large accepted function lost its previously justified removal after reaching the analysis limit and its module matched the original byte for byte. This checkpoint records the evidence before moving to independent guest code execution.

### Prompt context

The actual authored request appears verbatim in [the supervisor diary](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments). The review assignment is to examine the two implementations independently, track findings and produce a vault-ready article. I interpret independence as developing new observable cases and using a second machine execution path wherever possible.

### What I did

Read `FunctionCode`, `FunctionEmitter`, the two author reports, `proof.mjs`, `emitter.mjs`, and both differential harnesses. Wrote `scripts/examiner/bounds.mjs` with a fresh suite. Ran the following from the repo root.

```sh
ticket=$(ls -d ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--*)
node "$ticket/scripts/examiner/bounds.mjs"
```

### Why

A fact about an i32 local lasts until reassignment. A fact about the memory word addressed by a receiver can expire while evaluating another expression. Reversing the order of the same check and optional mutation distinguishes correct invalidation from a pass that systematically retains all checks. Running out of work after a successful query tests an independent property of the rewriting pass.

### What worked

`shortCircuitEffect` retained its check under both modes, and `shortCircuitFresh` removed it under both. The first trapped three times and the second zero times. The mirror-image chain of comparisons removed one check only under chained mode. The inclusive loop admitted a wrapped counter and retained the guard. The high-bit header cases exercised the signed comparison across the boundary at 2³¹. Each call compared the full 65,536 bytes after a return or trap.

### What did not work

No mismatches occurred in this run. A standalone command discovery check, `which qemu-riscv32 clang ld.lld riscv32-unknown-elf-gcc riscv64-linux-gnu-gcc`, found only `/usr/bin/clang` on the ordinary search path. The author notes identify a separate ESP toolchain and the ticket's CJI emulator. Both files exist.

### What I learned

The event limit is retrospective across the whole function. A successful proof early in a small function disappeared when 3,270 straight-line assignments were added after it. The rollback returned original bytes at event 50,001. This shows the emission consequence of the limit and says little about peak analysis memory because the emitter has built its trace before the walk starts.

### What was tricky to build

The inclusive-loop test needs a finite run that reaches signed wrap immediately. Starting at INT32_MAX and testing against INT32_MAX makes the first increment wrap. On the next trip a small signed header admits the negative index. The original object check then traps. Negative signed headers in that loop can produce very long paths, so its wrap cases use an ordinary small header. Separate finite calls test high-bit headers.

### What warrants a second pair of eyes

Function arguments are valid offsets into private test memory. Some call paths deliberately bind two typed arguments to the same test storage. The mutating and nonmutating choices and all six signed index values are kept in the replay source so the reader can inspect exactly which paths the comparison exercises.

### What should be done in the future

Determine whether replacing the analyzer's all-facts kill with separate scalar and header lifetimes could recover useful Editor proofs. This requires observing hot program sites and measuring compiler memory.

### Code review instructions

Read the two short-circuit function bodies in the examiner script first. Inspect `visit`, `condition`, `loopHead`, and the exception handler in the authors' `scripts/bounds/proof.mjs`. Check `counts`, `traces`, and `rollback` in `various/examiner/bounds.json`.

### Technical details

The largest input had 58,954 source bytes. Its sole query was near the start. With a short tail it succeeded. With the long tail, the saved module SHA-256 was `a207749bd5536718d8868ecff07826e0d3a2a170fdef15f33dcb543e9acc386f`. Recorded dynamic trap counts count original inputs once, although each was run through three implementations.

## Step 2. Execute the call matrix in the separate CJI emulator

The authors' focused tests implemented RV32 instructions in JavaScript and actively destroyed volatile registers in each imported handler. I wanted both the effect of a hostile register clobber and instruction execution by a separate implementation. I generated actual RISC-V callees, put the compiler's emitted words into a test executable and compared its binary output against the host Wasm engine.

The matrix covers all 81 combinations of zero through eight surviving operands and zero through eight arguments. Across 405 inputs the two backends and the Wasm implementation produced identical 3,240-byte streams. Both guest executables restored the caller's stack pointer at every top-level return and presented aligned stacks at every tested import.

### Prompt context

See Step 1. Code and evidence for the previous step are in `07ae1c6`. This step addresses the independent review of production commit `f0846ba`.

### What I did

Authored `scripts/examiner/registers.mjs`. It extracts both revisions from Git, verifies the same frontend source, emits the numeric functions, builds a Wasm module with real imports, creates guest assembly, cross-links it and executes the two ELF files. Each run writes two little-endian words per test. The receipt records the emulator digest, compiler versions, sizes and hashes.

### Why

The first five depths are special because the allocator maps those values into registers that the caller must protect. An eighth argument can occupy a hardware register whereas an eighth operand can live in a frame slot. The independent arity and depth axes force those two counts to differ. Distinct import values and nested calls make an error in argument order, restoration order or branch selection visible to the comparison.

### What worked

ESP GCC 14.2.0 cross-linked both RV32IM ELF files. The CJI emulator output matched the Wasm oracle digest `0a77bee1a843d079d7754df0621e08fa6d957b088fe0deb015f2278307c777e6` in both lanes. The deterministic Wasm reference executed 1,170 imports. The image shrank from 80,056 to 60,024 bytes for this call-heavy family.

### What did not work

The initial ordinary `git add -- <three examiner files>` attempt failed with `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. The following commit saw unknown pathspecs. The scoped escalated add and commit succeeded. The first sandboxed `node "$ticket/scripts/examiner/registers.mjs" "$gcc" "$emu"` failed with `Error: spawnSync git EPERM` during `git show f0846ba:picocalc-os/compiler/typed-wasm.js`. The same command completed under approved execution. No compiler change was needed.

### What I learned

A newly defined corpus with many calls and deep operand prefixes can be nearly 25% smaller with register homes, while the published Editor image shrinks by about half. The new images answer a coverage question and give a workload-dependent static-size comparison. Their guest driver outputs do not supply timings or dynamic instruction counts.

### What was tricky to build

The hash maintained by the Wasm imports and the guest stubs has to wrap modulo 2³² after each arithmetic step. The guest returns the updated hash in a0 after writing distinct values to all argument and temporary registers. The assembly uses a non-relaxing linker and four-byte instructions so embedding words and resolving placeholders preserves internal branch distances. Callee-side code checks stack alignment. The guest driver checks the restored stack pointer after every call into typed code.

### What warrants a second pair of eyes

The driver substitutes actual guest calls for unresolved import words. This bypasses the production ELF slot linker, which is covered by the authors' separate complete-world replays. The oracle uses the same frontend bodies as the lowerer, so this test isolates lowering and ABI behavior. It cannot independently validate the source parser.

### What should be done in the future

For a change that alters lowering at branches, exercise any newly introduced branch kinds directly. The current frontend emits ordinary joins for value-producing ifs and branches with void targets in its loops.

### Code review instructions

Start with `assembly(program)` and `handlers` in the examiner script. Compare the arity-specific callee recurrence, volatile register writes, return comparison and ordered digest comparison. Reproduction commands appear in the examiner notes.

### Technical details

Per-import state starts with `17 * previous + arity`, then incorporates each ordered argument with `33 * state + argument`. Every call into typed code resets the state to 0x13579bdf. Final results and import state are each checked independently for every input. The transcript's routine checks compare complete byte streams before hashes are printed.

## Step 3. Change one invalidation rule and count the resulting proofs

The first two steps found no correctness blocker within their tested scope. The bounds report identifies broad invalidation on calls as a possible cause of missing proofs. I isolated one part of that explanation by preserving relations exclusively among scalar Wasm locals and zero through memory effects. The production compiler and the original experiment remain separately available for comparison.

The treatment removed one check in a matched three-function control. It found exactly the same three removable sites on the 419-site corpus. Chained search inspected 191 edges compared with 151 for the authors' algorithm. Preserving scalar facts by itself therefore failed to improve coverage on these inputs.

### Prompt context

See Step 1. This independent probe tests an innovation suggested by the source-level findings without extending the production change.

### What I did

Created `scripts/examiner/scalar-facts.mjs`. It applies two checked source substitutions to the analyzer and inserts a filter over relation endpoints. Both the baseline and treatment analyze the same app bodies, signatures and indices. Each site's identity includes its function, expanded source line and byte/code-unit position in the ASCII corpus input. Replayed the three new controls under both policies.

### Why

Callees can mutate linear memory, and branch conditions can read scalar i32 values captured before a call. Within the tested Wasm semantics, locals are private to each active function invocation. Killing edges that mention header nodes retains relations with no dependency on future memory loads. The loop summary still has to invalidate every locally assigned endpoint in the loop.

### What worked

The fixture with a fresh header comparison removes its check only under the treatment. A stale upper bound and a changed loop counter retain their checks. Each proof policy matches original Wasm for 24 calls with eight traps, including full memory digests. Both policies choose the same two sites in `filesCompare` and one in `entryPut`. The Editor count stays zero. Direct edge inspections rise from 103 to 127, chained inspections from 151 to 191.

### What did not work

The proposed scalar precision did not recover any new corpus site. The accepted synthetic control established that the intervention can affect the decision, so the observed absence of additional sites is informative about this corpus.

### What I learned

A global count of rejected queries cannot tell which fact domain to enrich. Preserving more true facts can increase work per BFS query without supplying the missing inequality. This experiment did not distinguish contracts absent from the typed source from facts lost at other control-flow boundaries.

### What was tricky to build

A memory effect within a loop and a scalar assigned on another iteration must be summarized independently. The treatment first filters header edges, then drops all edges mentioning a loop-assigned local. Applying just the memory filter to an effectful loop leaves stale scalar facts. The `changed` control exercises that distinction.

### What warrants a second pair of eyes

The scalar result applies to Wasm locals under the compiler's existing typed API and analyzes the same optional header aliases as the bounded proof. The treatment scrutinizes edge endpoints, not intermediate derivations. A derived relation among captured unchanged scalar values remains true after an underlying header changes.

### What should be done in the future

Identify which missing inequality blocks a frequently executed Editor access and where that fact could originate. Data distinguishing signed range, captured span, purity and header stability could direct the next experiment.

### Code review instructions

Review the three small source transformations in the examiner script. Compare `controls`, then compare `sites` and `edgeInspections` in each app under the four mode-policy combinations in `various/examiner/scalar-facts.json`.

### Technical details

The original query budget of 128 and six-hop chained limit were held fixed. The corpus scan operated over emitted typed function bodies. The dynamic control runs used complete standalone Wasm functions and private 64 KiB memories. These are proposal measurements with an independently stored proof variant.
