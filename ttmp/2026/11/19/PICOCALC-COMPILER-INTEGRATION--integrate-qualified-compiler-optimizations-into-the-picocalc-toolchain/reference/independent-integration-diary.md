---
Title: Independent integration examiner diary
Ticket: PICOCALC-COMPILER-INTEGRATION
DocType: reference
Status: complete
Topics: [picocalc, compilers]
---

# Independent integration examiner diary

## Step 1. Compare the numeric and direct-check integrations against their predecessors

I traced both integrations through the production parsers and emitters before constructing a new four-lane differential. I separated the questions about encoding, source effects, and execution privileges. This prevents a successful byte or value comparison from implying a property about the native board loader.

The numeric predecessor and candidate produced identical complete images for my fixture. The direct candidate matched its predecessor on 1,200 inputs, including 246 object traps, for both Wasm and RV32. The corpus exposed a conservative precision limit I had initially mispredicted.

### Prompt context

The authored user request is preserved in [the integration supervisor diary](01-compiler-integration-diary.md). The delegated scope was independent review of the two integrated production changes, recording findings in this ticket. I interpreted that as checking the actual pinned emitter code, measuring the semantics of new cases, and identifying conditions the public guide should communicate.

### What I did

- Compared `e202e94`, `4452064`, and `e082ec3`, including `FunctionEmitter.expr`, `beginLoop`, `assignBounds`, `codeUnitAddress`, function compaction, and the RV32 cell decoder.
- Constructed `scripts/examiner-compare.mjs` with the real frontend and two engines. Decoded emitted operations independently in Wasm and numeric formats.
- Inspected native runtime execution in `native_elf_p4.c`, the compiler's staging/activation path in `compiler/install.c`, and the SDK length mutation in `sdk/typed/world.c`.
- Communicated the effect, precision, encoding and runtime-boundary findings to the supervisor and bounds author.

### Why

A changing offset can be computed correctly in the numeric stream but misapplied to a variable-width Wasm stream. A correct-looking conditional can retain a stale proof on only one path. A descriptor claiming safety might refer either to a counted-object semantic check or to isolation provided by the loader. These require different evidence.

### What worked

The source comparisons can be reproduced from Git snapshots. Numeric predecessor parity held for generated images, public native metadata and complete standalone Wasm. Accepted and rejected intervals could interleave within one function, and 16 deferred intervals were removed when 17 were available. Wide locals preserved operation parity. Early returns, optional side effects, negative positions, equality at length and inclusive signed wrap preserved results and memory.

### What did not work

My first static expectation for the wide-local fixture failed when running `node "$ticket/scripts/examiner-compare.mjs" /tmp/pico-integration-examiner`: `AssertionError [ERR_ASSERTION]: wide removed checks`, followed by `0 !== 1`. I had initialized 133 preceding locals to nonnegative constants, filling the eight-entry fact table before the induction variable was declared. This was a real precision effect. I kept that fixture with a retained-check expectation and introduced a second one with high-index locals initialized from a signed parameter. The latter exercised an actually removed wide-index check.

An initial source search used `picocalc-os/main`, which does not exist (`IO error ... No such file or directory`). The P4 optional loader lives under `picocalc-os/port/esp32p4/optional/native_elf/`.

### What I learned

A bounded optimizer can lose a valid current proof because earlier unrelated facts consumed its storage. The fallback preserved the check and application behavior. Plain counts of locals or removals conceal this dependence on declaration order. The lowering and effects review found no blocker for the supported input domain.

### What was tricky to build

The mixed-range fixture must place an invalidated induction before and after a valid one without preventing every execution from reaching the middle loop. Its optional guard skips the first loop for some inputs. Compiler array compaction can then be inspected statically and the middle loop can also run dynamically. For the emitter comparison I decoded LEB immediates rather than scanning for isolated opcode bytes, which can occur inside a multi-byte immediate.

### What warrants a second pair of eyes

The RV32 engine used here is the focused ticket interpreter. It compares the initialized application storage at offsets below 1,024 and classifies the EBREAK corresponding to a Wasm object trap. It does not characterize a hardware fault. Board qualification should report the actual hardware workflow separately. The trusted development activation path supersedes part of an old loader comment about module origin.

### What should be done in the future

A future change that adds side-effectful syntactic forms, user-accessible address-taking of scalar locals, or broader forms of loop induction would need new transfer rules. The eight-fact limit could be reconsidered only if a frequently executed application check is demonstrably crowded out.

### Code review instructions

Follow the reproduced commands and source pointers in [the independent review](independent-integration-review.md). Inspect the cap control beside the wide-index control. Check the native run against its Wasm counterpart after a trapping RHS and an aliasing header update. Read the runtime-boundary note before interpreting the production qualification.

### Technical details

Twenty fixture functions ran for length 0, 1 and 3, indices −1, 0, 1, 3 and INT32_MAX, a separate or aliased header word, and two branch values. Each input was executed in the old and candidate variants on both engines. The experiment compares the 1,024-byte fixture storage and returned word or trap, and independently counts actual object-check instructions. The raw receipt is `various/examiner-comparison.json`.
