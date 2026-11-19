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
