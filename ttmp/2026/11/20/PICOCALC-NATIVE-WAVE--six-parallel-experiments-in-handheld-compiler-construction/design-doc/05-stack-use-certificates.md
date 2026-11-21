---
Title: "Preregistered Study Design \u2014 Static Stack-Use Certificates for `typedRv32` Functions"
Ticket: PICOCALC-NATIVE-WAVE
Status: active
DocType: design-doc
Topics: [picocalc, compiler]
Intent: long-term
---

# Preregistered Study Design: Static Stack-Use Certificates for `typedRv32` Functions

**Status:** Design only. No measurements exist. Every threshold below is fixed before implementation begins.
**Scope:** This is a defensive, instructional study. It runs only in a ticket-only compiler fork, on synthetic fixtures. It involves no exploits, no offensive workflows and no real deployment targets.

## 1. Question and hypotheses

**Question.** Can the compiler emit per-function frame and call claims that an independent checker validates against final linked RV32 bytes, so that a sound worst-case stack bound can be computed over acyclic direct calls?

- **H1 (soundness).** No certificate is accepted when the metadata or the code is deliberately wrong.
- **H2 (coverage).** Most well-formed functions produced by the current lowering are certifiable without weakening the checker.
- **H3 (cost).** Compile-time, metadata-size and checker-time overheads stay within the budgets in §7.

## 2. System facts taken from the supplied source

The checker must re-derive these facts from bytes. The codegen's word is never sufficient.

| Fact | Source location |
|---|---|
| Frame size is `(4·(locals+spillDepth+1)+15) & -16` and must be ≤ 2032 | `FunctionCode.lower()` |
| Prologue is word 0 `addi sp,sp,-F` and word 1 `sw ra,F-4(sp)` | `lower()` back-patch |
| Parameter homes are `sw a_i, 4i(sp)` | `lower()` |
| Single epilogue at the `exit` label: `lw ra`, `addi sp,sp,F`, `jalr zero,ra,0` | `lower()` |
| Early `return` (0x0f) uses `jal zero` to `exit` | `step()` |
| Spill and local slots are at `4·(locals+depth)` | `slot()`, `spill()` |
| Around a call, live t-registers are spilled and reloaded | `call()` |
| Direct calls are `jal ra`, resolved in `compile()` | `jump(..., RA)` |
| Import calls are `jal ra` into slot trampolines, which then `jal zero` into the SDK | `linkSlot()` relocations |
| Entry stubs are `jal zero` into function code | `linkSlot()` |
| Traps (`unreachable`, divide-by-zero, signed overflow) are `ebreak` | `step()`, `binary()` |

The lowering never moves `sp` by a register amount and never issues an indirect call. Any such instruction in the final image is therefore an anomaly.

## 3. Certificate claims emitted by codegen

The fork adds a side table per function. The table does not change any emitted word. Each entry contains:

- `name`, `entryOffset` (image-relative), `wordCount`
- `frameBytes`, `raSlot`, `locals`, `spillDepth`
- `prologue: [0,1]`, `epilogue: [k,k+1,k+2]`
- `calls: [{wordIndex, kind: direct|import, callee}]`
- `traps: [wordIndex…]`

After `linkSlot()` runs, the fork emits a symbol map with `slotBase`, `codeOffset`, entry-stub addresses and trampoline addresses.

The metadata is a **claim**. If the checker finds a mismatch, the result is *Reject*. The checker never silently substitutes its own derived value.

## 4. Independent checker

### 4.1 Independence

The checker is written from the RV32IM specification and the slot-layout description. It is written by someone other than the codegen author. It must not import `typedRv32`, `instruction`, or any helper from the compiler. Its inputs are the linked bytes, the symbol map and the claims, nothing else.

### 4.2 Supported subset

The checker decodes only the following instructions:
- `lui`, `addi`, `sltiu`, `xori`
- `add`, `sub`, `mul`, `div`, `rem`, `sll`, `sra`, `xor`, `slt`, `sltu`
- `lw`, `lhu`, `sw`, `sh`
- `beq`, `bne`, `jal`
- `jalr zero,ra,0`
- `ebreak`

Any other encoding produces the verdict **Unsupported(instruction)**. This includes compressed instructions, FP, CSR, `ecall`, atomics, any other `jalr` form and any unknown word.

### 4.3 Per-function abstract interpretation

The abstract state at each instruction is a pair:
- `spOff ∈ {Const c, ⊤}`, the offset relative to `sp` at entry
- `raSaved ∈ {no, at c}`

The analysis is a worklist over a CFG built from decoded branch and `jal zero` targets. Rules:

1. **Merges.** At a branch merge, states must be equal. A conflict produces **Reject(merge)**. The checker does not widen, because the lowering's invariant is a constant `spOff = −F` between the prologue and the epilogue.
2. **Writes to `sp`.** Only `addi sp,sp,imm` is allowed. Any other write to `sp` produces **Unsupported(dynamic-stack)**.
3. **`sp`-relative accesses.** Every `sp`-relative load or store must fall in `[0, F)` relative to the post-prologue `sp`, and must be word-aligned for `sw` and `lw`.
4. **Intra-function targets.** Branch and `jal zero` targets must stay inside `[entry, entry+wordCount)`. They may also land on the function's own `exit`.
5. **Instruction boundaries.** The checker rejects code that falls off the function end. It also rejects code that jumps into the middle of the prologue.

### 4.4 Prologue and epilogue

**Prologue.** The checker requires:
- word 0 is `addi sp,sp,−F`, with `F > 0`, `F % 16 = 0` and `F ≤ 2032`
- word 1 is `sw ra,F−4(sp)`
- `ra` is not written again before the epilogue, except by `jal ra`

**Epilogue.** Every `jalr` must be preceded on all paths by `lw ra,F−4(sp)` and then `addi sp,sp,F`, so that `spOff = 0` at return. The derived `F` must equal the claimed `frameBytes`.

### 4.5 Calls, tail jumps and traps

- **Direct `jal ra`.** The target must equal a symbol-map entry. The edge is recorded. After the call, `ra` is treated as clobbered, and the saved-`ra` slot must be intact (no store to `F−4` anywhere except the prologue).
- **Import `jal ra`.** The target must be a trampoline address. The edge is recorded as `import[i]`.
- **Tail and fixed runtime jumps.** A `jal zero` that leaves the function is **Unsupported(tail-call)**. The lowering does not emit these inside function bodies. Entry stubs and trampolines are not functions. The checker verifies them as fixed shapes: a stub is exactly one `jal zero` to a function entry, and a trampoline is exactly one `jal zero` out of the slot. Each is recorded as zero additional stack.
- **`ebreak`.** Treated as a path terminator. The trap handler's stack use is listed as a boundary (§5).

### 4.6 Composition

The checker builds the call graph from **decoded** edges only. It then diffs this graph against the claimed `calls`:
- a missing claimed edge produces Reject
- a phantom claimed edge produces Reject

If the graph contains a cycle, the result is **Unsupported(recursion)** for every function in the strongly connected component and for all of their callers.

For acyclic graphs:

```
W(f) = F(f) + max(0, max_{g∈direct(f)} W(g), max_{i∈imports(f)} B_import[i])
```

The bound for entry `e` is `W(e)`. It is valid relative to `sp` at the reactor's jump to the entry stub.

## 5. Conditional boundaries

Every accepted certificate states its assumptions explicitly:

1. **Import budgets.** `B_import[i]` comes from an SDK-declared budget table. These values are unverified in this study. An accepted result is reported as "bound + Σ assumptions", never as an absolute figure.
2. **Caller usage.** The reactor's and loader's own stack usage before the entry stub is excluded.
3. **Trap handling.** The `ebreak` handler's stack is excluded.
4. **Memory safety.** Non-`sp` loads and stores (Wasm memory ops 0x28/0x2f/0x36/0x3b) are assumed not to alias the stack. Memory safety is out of scope.
5. **ABI.** The ilp32f ABI requires 16-byte `sp` alignment at entry. The certificate preserves this alignment but does not establish it.
6. **SDK region.** Bytes outside the slot are not analysed.

## 6. Fixtures

### 6.1 Development set

Written by the operator. It covers ordinary well-formed functions:
- straight-line code
- `if`/`else` with and without results
- `loop`, with `br` and `br_if` at several depths
- early `return`
- operand depths of 0–12, so spills past the five t-register homes are exercised
- calls of 0–8 arguments, including calls with live values spilled around them
- `div` and `rem` trap paths
- import calls
- multi-function chains and DAGs with diamonds

### 6.2 Mutation set

Mutations are applied **after** linking, to the claims or to the bytes:

| Class | Examples |
|---|---|
| Claim mutations | `frameBytes` ±16; wrong `raSlot`; dropped call; phantom call; wrong callee; stale offsets shifted by one word; cycle hidden by omitted edge |
| Byte mutations | extra `addi sp`; `sp` set from a register; unbalanced epilogue on one path; mismatched `spOff` at a merge; `sp` store at offset ≥ `F`; indirect `jalr`; an unsupported opcode; `jal zero` to another function; corrupted entry stub |

Every mutant has a preregistered expected verdict: Reject or Unsupported(class).

### 6.3 Held-out set

An independent author writes 60 or more sources and 200 or more mutants against the specification in §4, without seeing the checker. The set's SHA-256 is committed before checker freeze. It is opened once, at evaluation time.

### 6.4 Dynamic cross-check

An instruction-level emulator records the minimum `sp` observed on every fixture execution. This is a falsification check only: the observed depth must never exceed the certified bound.

## 7. Metrics and cost/coverage

| Metric | Definition |
|---|---|
| False-accept rate | Accepted mutants ÷ mutants that should be rejected (primary metric) |
| Coverage | Accepted well-formed functions ÷ all well-formed functions, broken down by Unsupported class |
| Tightness | (certified − max observed) ÷ certified, on executed paths |
| Soundness violations | Number of executions with observed depth > certified bound |
| Cost | Compile-time overhead (%); metadata bytes per function; checker milliseconds per KiB of image |

Budgets: compile-time overhead ≤ 10%, metadata ≤ 64 B per function plus 8 B per call, checker time ≤ 50 ms per KiB on the reference host.

## 8. Preregistered decision policy

- **Freeze.** The checker rules (§4), expected verdicts and thresholds are frozen and hashed before the held-out set is opened. After that, any rule change invalidates the run and requires a new held-out set.
- **Hard gate (soundness).** Zero false accepts on development and held-out mutants, and zero soundness violations. Failing this gate is a *Stop*, whatever the other metrics show.
- **Coverage gate.** Held-out coverage must be ≥ 95% of non-recursive, import-budgeted functions. The checker may not reach this by relaxing merge or prologue rules.
- **Cost gate.** All §7 budgets must be met.
- **Recommendation.**
  - *Adopt* if all gates pass.
  - *Iterate* if soundness passes but coverage or cost fails. The report must name the Unsupported class responsible.
  - *Stop* if soundness fails.
- **Reporting.** Every Unsupported or Reject verdict on well-formed held-out code is listed individually. Results are reported exactly as observed, including failures. Ambiguous expected verdicts are reported as ambiguous, not re-scored.

## 9. Threats to validity

- **Shared misreading.** The codegen author and the checker author may misread the specification in the same way. Mitigations are the independent held-out author and a decoder that is checked against the ISA tables.
- **Unverified budgets.** The SDK budgets are unverified. The conditional bounds may therefore be misread as absolute, which is why §5 assumptions are printed with every result.
- **Fixture bias.** The fixtures reflect the current lowering. Future optimisations, such as register allocation, shrink-wrapping or tail calls, would require re-preregistration.
- **Coverage limits.** The emulator cross-check only covers paths that are actually executed.

## Operator implementation and coverage note

The lead-authored design above records the original criteria. The implementation and scope are documented in [the investigation diary](../reference/15-stack-certificates-diary.md). The operator locked the policy and implementation before the director released their fixture. The candidate actually emits function name, start, size, frame, RA slot and direct-call records. Declaration scratch and trap indices proposed above were never included in its certificate. The checker is a separate decoder written by the study operator who also staged the emitter. The director independently authored the held-out source and execution oracle. Symbol ownership and import names come from the pinned compiler/SDK tables. Public entries, import trampolines, byte-derived calls and complete frame shape are verified independently.

The checker requires one fixed frame throughout every ordinary body and a single canonical epilogue. A control transfer can only target a body instruction or the start of that epilogue. This establishes equal stack displacement at merges by construction rather than by worklist. The checker refuses an entire program with an unsupported form or cycle. It has two documented allowlist discrepancies relative to the lead's draft. Research controls that substituted two valid RV32 operations outside the explicit list were accepted. Fourteen separate malformed-metadata and unsupported-instruction controls were rejected. The independent held-out set comprised one program and five dynamically exercised entries, considerably smaller than the proposed 60 programs and 200 mutants. The final report evaluates the decision gates using these observed limits.
