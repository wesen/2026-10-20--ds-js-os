---
Title: Numeric lowering experiment diary
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources:
    - https://tc39.es/ecma262/#sec-numeric-types-number-multiply
    - https://tc39.es/ecma262/#sec-numeric-types-number-remainder
    - https://tc39.es/ecma262/#sec-samevaluezero
    - https://webassembly.github.io/spec/core/exec/numerics.html#integer-operations
    - https://www.lua.org/manual/5.4/manual.html#3.4.1
Summary: A bounded local numeric frontend compared with CJI's whole-program proof and a proof-off timing probe.
LastUpdated: 2026-11-18T16:26:00-05:00
WhatFor: Reproduce numeric analysis removal and review its arithmetic, failure, compatibility, and performance evidence.
WhenToUse: When evaluating numeric semantics or a lower-latency CJI frontend for device-authored worlds.
---

# Numeric lowering experiment diary

## Step 1 — Specify a local decision and an unsafe timing control

CJI's inference includes an independent whole-program numeric analysis. It refines provisional integers using loop heads, function summaries and mutable state. Guarded library expansion already skips most early proofs, but the final proof can demote arithmetic, returns, fields and array elements. The experiment replaces the global numeric proof with a syntax-bounded decision. It keeps the structural fixpoint that identifies the receiver of a library method or the fields in a record.

The prototype keeps the existing binary64 semantics for uncertain arithmetic. Control and candidate both use CJI's existing checked projections at `Int` storage, typed calls and index boundaries. A second build skips numerical proof and demotion entirely and serves as a timing probe.

### Prompt Context

**User prompt (verbatim)**

> we can move away from javascript semantics, especially if this is about preserving edge cases. We want a "JS like" language but don't need to maintain costly properties if avoidable.
>
> Do a fulll fundamental analysis and rethink and validate and research everything, you can use cheaper (much cheaper probably) subagents to do work and experiments for you, although they should keep their experiments in the scripts folder and write their own diaries as they work). Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

**Assistant interpretation.** Implement and validate a sandboxed compiler experiment that removes the whole-program numeric proof, measures the compile-time cost, and gives every optimized arithmetic operation a defined result.

**Inferred user intent.** Find where compile-time latency originates and choose numerics a device programmer can reason about while editing a real world.

**Commit (code).** `df7fcaf` — Prototype CJI numeric lowering without whole-program ranges.

### What I did

- Applied the guarded-range and combined trie experiment to isolated source copies in `/tmp`. Used the original imported stage0 to build each changed compiler as input, then used it to compile world and probe sources under the changed policy.
- Wrote [local-numbers.js](../scripts/numeric/local-numbers.js) and [configure.py](../scripts/numeric/configure.py). The generated inference copies write the `double` mark for the same syntactic operator decision used to infer the result type. The ordinary checker and cast insertion consume that mark.
- Removed the terminal proof-driven inference invocation after library expansion. Each expansion round still calls structural inference on the previous round's result plus the new helper definitions.
- Added the independently rebuilt `proof-off` variant. It leaves provisional `Int` choices untouched and shares the local variant's structural-only schedule.

### Why

A machine integer result is sound when all input possibilities are safe integers and the particular operation stays exact, with no negative zero. The compiler can find this with fixed rules for literals and primitive operator results. A rule for `x + 1` would require knowing that `x` is below the safe upper bound. With neither annotations nor global proof, selecting binary64 discharges that requirement.

An alternative language could declare fixed-width integers whose operations wrap modulo a power of two. WebAssembly specifies that for integer addition, subtraction and multiplication and has separate conditions for integer division and remainder. Lua 5.4 distinguishes integer and float arithmetic and defines wrapping for integer overflow. Either policy needs an explicit contract for conversions, comparisons, numeric identity and keys. [WebAssembly integer operations](https://webassembly.github.io/spec/core/exec/numerics.html#integer-operations), [Lua 5.4 arithmetic](https://www.lua.org/manual/5.4/manual.html#3.4.1)

### What worked

Unary negation of an integer literal other than zero, arithmetic on bounded bitwise results, and arithmetic on safe literal pairs can stay on the existing integer instructions. Arithmetic involving unconstrained arguments safely lowers to CJI's existing `Number` instructions. The self-hosted frontend's helper specializes according to the same rules as the source copy for the three measured world units and seven probes.

### What didn't work

The first invocation ran from the numeric script directory and returned `realpath: 'ttmp/2026/11/17/*--cji-workspace*/sources/cji': No such file or directory`. Build paths resolve from the repository root.

The first local build called `Number.isSafeInteger` on the compiler's computed endpoint. The exact failure was `cji: error: 5002:43: Number.isSafeInteger is not in the subset`. The recovery uses magnitude checks on expressions with integer endpoints and checks zero signs separately. The compiler-as-input stage0 can compile that implementation without a new primitive.

The inherited `analyzeRanges` function is still present in the candidate SLIR. The change returns from `inferOnce` after structural stabilization and before all proof dispatch. The experiment preserves the old source past that return to keep the isolated change inspectable. Code size therefore includes unreachable analysis and sidecar machinery.

### What I learned

The proof-off variant still emits machine code, even when a value violates the `Int` invariant. Running `(max + 2) - max` through a function gives `2`, where binary64 gives `1`. Negative zero becomes positive zero, integer remainder by zero stops the program, and an unsafe integer reaches an annotated `Int` parameter without rejection. Switching off numerical proofs without defining the operations permits the representation to change program behavior.

### What was tricky to build

A bitwise operation provides fixed bounds even if its inputs are dynamic. Those bounds describe only its final result. A multiplication endpoint test alone cannot rule out negative zero inside an interval. It separately checks whether one operand can be zero and the other negative. For remainder, all divisors must be nonzero. The nonnegative dividend case is safe, and the negative case is accepted only for a literal pair with a nonzero remainder. Direct negation stays integer only for a nonzero literal. These decisions avoid reading a variable, branch, loop or summary.

### What warrants a second pair of eyes

Check that every built-in marked `Int` guarantees a safe integer at its boundary. This matters for lowering on the premise that an unknown Int operand can range anywhere in the inclusive safe interval. Review checked conversions, typed collection helper selection, implicit index projections, and the difference between direct indexing used for arithmetic and an index probe used for logging or equality.

### What should be done in the future

Move the cheap operator rule to a single typed IR construction point when integrating this approach. Delete proof and sidecar machinery from that compiler path. Measure whether checked explicit integer loop cursors or dedicated bounded index operations win back application execution time on the ESP32-P4.

### Code review instructions

Read [local-numbers.js](../scripts/numeric/local-numbers.js), [configure.py](../scripts/numeric/configure.py), then the imported `src/infer.js`, `typecheck.js` and `cast-insert.js`. Build from the repository root with `bash "$ticket/scripts/numeric/build.sh" /tmp/local local` and build the timing probe using `/tmp/proof-off proof-off` as the two arguments.

### Technical details

```text
If all operands are typed Int:
    Read literal or fixed-result bounds from the immediate operand syntax.
    An unknown Int may hold any integer in [-(2^53 - 1), 2^53 - 1].
    If the result stays exact and has no possible negative zero:
        use existing integer lowering.
    Otherwise:
        use the existing Number lowering and infer a Number result.
For mixed, dynamic, and always-Number operators:
    use the ordinary operator rules.
For a value entering an Int position:
    require a finite safe whole number, canonicalize either zero to 0,
    and report "type error: expected an integer" on failure.
```

The exact interval guarantee covers the newly admitted local integer paths. The inherited compiler still has dynamic operations and checked numeric conversions, and the prototype retains those pathways. `Int` is a signed 64-bit representation of safe mathematical integers in this implementation. `Number` is binary64. `/` and `**` already produce `Number`. Typed array index probes can return `undefined` for invalid reads. A fractional write requires an integer coordinate and reports an error. `Map` and `Set` retain canonical zero and numeric equality. [ECMAScript multiplication](https://tc39.es/ecma262/#sec-numeric-types-number-multiply), [ECMAScript remainder](https://tc39.es/ecma262/#sec-numeric-types-number-remainder), [ECMAScript SameValueZero](https://tc39.es/ecma262/#sec-samevaluezero)

## Step 2 — Match source and compiled frontends and exercise real worlds

The source implementation and stage1 compiled on Linux produced identical SLIR and RV32 ELF for Flaky, Agenda and Files using the normal shared prelude. I also compiled the unmodified Agenda and Files through CJI's test prelude with deterministic mocked handles. The guarded control, candidate source frontend and candidate native frontend produced the same observed output.

### Prompt Context

**User prompt.** See Step 1.

**Assistant interpretation.** Verify the real program entry points and produce a separate expected ELF for the board run.

**Inferred user intent.** Distinguish successful compilation from expected application behavior.

### What I did

- Ran [expected-worlds.sh](../scripts/numeric/expected-worlds.sh) separately against the source `cji.js` and native `stage1` from the same experimental source. Compared each world unit SLIR and linked ELF by bytes. The [identity receipt](../various/numeric/expected-worlds.txt) records source, unit and ELF hashes.
- Ran [world-behavior.sh](../scripts/numeric/world-behavior.sh) against both local compilers and the native control. This compiles the real app with CJI's test prelude, injects the checked-in driver and executes generated x86 code. The [output](../various/numeric/world-behavior.out) covers Agenda task loading, reminder field parsing, toggling, navigation and done view. Files covers directory-first sorting, free-size formatting, pagination, folder entry and back-navigation.
- Ran [probes.py](../scripts/numeric/probes.py) against Node, the combined control, the local source and native compilers, and the native proof-off variant. The [probe receipt](../various/numeric/probes.jsonl) includes compile and run status and exact stdout. Compared the native catalog with the capped combined control after linking all accepted programs to RV32. [Catalog receipt](../various/numeric/catalog.json)

### Why

Compilation alone accepts a broken backend that emits the wrong operation. The application workflow and the small numeric probes exercise complementary observations. The independent compiler execution and recorded RV32 digests let the physical qualification detect a toolchain or architecture divergence.

### What worked

| World | RV32 module bytes | Module SHA-256 |
| --- | ---: | --- |
| Flaky | 10,800 | `e74d83cd6c8ebebf9319e5314f8f03818fb74c8954af2f58b23a005530d5f595` |
| Agenda | 330,984 | `19ac388cde229215547764869ca18c15e4c43f600539778c46455cee00d1fca3` |
| Files | 217,176 | `fedf1397b2ee65b57c6d1641c581f89461e4e0670817805467ee498abe8f7a28` |

All 22 manifest compile statuses match the combined control. Twenty linked successfully and 18 changed ELF identity. Power and Flaky matched exactly. Sandbox rejected with `Uncaught Error: 15:13: expected ), found ,` at 8 MiB. Calc exhausted the 10 MiB arena under both compilers. The exact live bytes and requested size in the OOM diagnostic differ. The local probes matched the control for overflow rounding and cancellation, negative zero and NaN, collection keys and iteration, compound assignment operand evaluation, checked Int projection and invalid index writes. The control and local tool rejected an invalid String initializer with the same reason.

### What didn't work

The first expected-ELF command tried `picocalc-os/js/apps/flaky.js`. The source driver reported `cji: internal error: ENOENT: no such file or directory, open 'picocalc-os/js/apps/flaky.js'`. The reproducer now resolves each file through the manifest.

The first Files driver returned a record array from a mock stored in dynamic `hw.fs`. The exact compile diagnostic was `cji: error: a function declared to return Any returns {dir:Any,more:Any,name:Any,size:Any}[]`. Explicit `Any[]` fixture bindings establish a dynamic array at that boundary. The correction is confined to the fixture.

### What I learned

CJI's typed read in a print can be a soft probe, so `print(values[1.5])` can print `undefined`. The corresponding write must reject fractional indexing. Explicitly testing both separates this policy from a blanket claim that all fractional indexing fails. The signed-zero probes through reciprocals detect inappropriate integer lowering even when a printer formats both zeros identically.

### What was tricky to build

The two world runs use the source plus a harness driver and a 16 MiB compiler cap. The catalog uses independent world units at the device caps and the existing prelude. The workload driver runs with a modeled filesystem and the ordinary Linux CJI runtime. Real device I/O, the production loader and firmware timing require the physical harness.

### What warrants a second pair of eyes

Confirm collection type changes preserve values, aliasing, iteration and kernel-bound numeric payloads in deployed cases. The catalog tested linkability for all accepted worlds and observed workflows for two. The selected tests do not cover all handlers, shared mutable state or user-authored worlds.

### What should be done in the future

Use the identity receipt to qualify board output. Add an application-turn measurement for the new native world on the ESP32-P4. Expand behavioral probes to the kernel-facing capability and numeric wire boundaries.

### Code review instructions

Compare [fixtures/arithmetic.js](../scripts/numeric/fixtures/arithmetic.js), [fixtures/collections.js](../scripts/numeric/fixtures/collections.js), and the signed projection and index cases with [probes.jsonl](../various/numeric/probes.jsonl). Regenerate [world-behavior.out](../various/numeric/world-behavior.out) with `bash "$ticket/scripts/numeric/world-behavior.sh" /tmp/local/stage1 /tmp/local-behavior`.

### Technical details

The stage1 SLIR SHA-256 is `a80b9fc3d6c90f6807790d7cf8f84c89530452fc0baf1ffcf0b1c99d02e1784f` for local lowering and `4c8365208660e3233f8d095ffd859aefc3dc0a5f28e5a76615e3820845910af1` for proof-off. Stage0 itself used ordinary CJI semantics to compile both compiler bundles. The world-unit SLIR and final ELF hashes agree independently because the changed rule runs when either experimental compiler reads application source.

## Step 3 — Measure frontend savings and identify the execution trade-off

The bounded compiler spent less time and used less live heap building both world units on Linux. Its generated applications have more floating-point operations and integer projections. Those static counts flag a workload to measure later on the device. Dynamic frequency and turn cost require runtime measurements.

### Prompt Context

**User prompt.** See Step 1.

**Assistant interpretation.** Compare a candidate with explicit, tested arithmetic to the measured combined trie control and a proof-off timing probe under the same arena policy.

**Inferred user intent.** Find the compilation latency available without global numeric proof and account for the application execution cost of removing it.

### What I did

- Ran [benchmark.py](../scripts/numeric/benchmark.py) for one warmup and five measured trials per compiler and world. Rotated compiler order and checked deterministic output within each configuration. Saved all trials and identities in [native.json](../various/numeric/native.json).
- Counted statically emitted conversions and floating-point instructions using [opcode-counts.py](../scripts/numeric/opcode-counts.py). Recorded counts for the corresponding control and candidate SLIR in [opcode-counts.json](../various/numeric/opcode-counts.json).

### Why

A compiler that rarely spends time in range proof can still spend time building typed ASTs, specializing libraries and emitting machine code. Comparing the combined control to the complete local path measures the change a programmer would feel. The proof-off reference helps interpret the cost of the bounded policy under the experiment's tooling.

### What worked

| World | Combined control median | Bounded local median | Proof-off median | Local frontend reduction | Control → local live peak |
| --- | ---: | ---: | ---: | ---: | ---: |
| Agenda | 4.257 s | 1.163 s | 1.155 s | 72.7% | 6,096,360 → 4,357,696 bytes |
| Files | 1.553 s | 0.828 s | 1.139 s | 46.7% | 4,312,224 → 3,737,976 bytes |

Agenda's median compiler collection count fell from 240 to 134, and Files fell from 72 to 58. The native compiler ran with an 8 MiB mark-compact arena. The timer covers the native compiler's entire invocation of `cji_main`, including reading, frontend, backend and output. The x86 timing is separate from RV32 assembly and physical board startup.

### What didn't work

The proof-off candidate fails the numeric contract. The exact remainder-by-zero diagnostic is `x % 0 is NaN, which is outside the integer subset`. Signed zero and safe-integer projection failures also differ from the contract. Its timing provides experimental context. Variation among trials and differences in representations and generated code prevent isolating the cost of one local decision from the local versus proof-off times.

### What I learned

The `Number` fallback increases static `fadd` sites from 60 to 184 and `num_to_int` call sites from 37 to 124 in Agenda. In Files they increase from 22 to 67 and from 22 to 70. Emitted SLIR grows from 620,515 to 632,002 bytes for Agenda and from 353,200 to 358,721 for Files. A low-cost compiler needs a plan for loops and indices if native turns spend significant time in these new instructions on RV32.

### What was tricky to build

Two substantive changes occur together. The experiments bypass global proof and skip the former final inference invocation. The numbers measure that combined policy. An independent schedule experiment would be required to attribute time to either change. The combined control retains trie optimizations and therefore measures against the fastest previously qualified configuration rather than the imported compiler alone.

### What warrants a second pair of eyes

Review the range of trial timings, especially on the shared host. Check app turn and memory budgets before selecting a device default. Changing the target representation of inferred fields, arrays and records can change storage layout and runtime allocation even when output agrees.

### What should be done in the future

Use the measured native frontend as a cost baseline for a simpler compiler architecture. If turns regress, test explicit safe integer cursors or an opt-in fixed-width arithmetic API. Specify width, signedness, overflow, each divide and remainder corner case, exact conversions, key identity, and how errors cross the world boundary before implementation.

### Code review instructions

Read the full [native receipt](../various/numeric/native.json), the [opcode counts](../various/numeric/opcode-counts.json) and the [workflow evidence](../various/numeric/world-behavior.out) together. Run `python3 "$ticket/scripts/numeric/benchmark.py" control=/tmp/cji-trie-ab/both/stage1 local=/tmp/local/stage1 proof_off=/tmp/proof-off/stage1`. The local benchmark identities must also match the separately generated world receipts.

### Technical details

The command per sample is `stage1 -C -g -h 8388608 -H 8388608 -- picocalc-os/js/apps/WORLD.js --world-unit`. The experimental frontend stage1 is 2,873,752 bytes on x86 against 2,898,608 bytes for the combined control. Its SHA-256 is `8987e41ad93b90184725186d627dab7b784a4d8180162958cfabac5b12e3c265`. This binary still contains residual unreachable analysis code. The board has a separately built image derived from the same stage1 SLIR and uses the expected RV32 ELF identity receipt.
