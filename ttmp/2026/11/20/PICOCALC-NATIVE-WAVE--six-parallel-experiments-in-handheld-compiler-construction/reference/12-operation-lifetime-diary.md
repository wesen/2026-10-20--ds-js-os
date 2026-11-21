---
Title: Investigation diary for checked operation lifetime
Ticket: PICOCALC-NATIVE-WAVE
Status: active
DocType: reference
Intent: long-term
Topics: [picocalc, esp32-p4, performance, native]
---

# Checked operation lifetime investigation diary

## 2026-11-20 — Step 1. Freeze the operations and static rule

### Prompt Context

The operator was asked to compare early primitive expansion to retention into RV32 lowering, along with a static selection rule on real and unseen inputs. The user asked for independent Claude Opus High research, a qualified prototype, a detailed diary, and an educational article.

### What I did

I sent a separate scoped design request using `claude -p --model opus --effort high --tools '' --setting-sources ''`, under the user's explicit Anthropic approval. The design lead received checked-compiler material only. The prompt and output are recorded in this ticket. Before disclosure I froze a two-operation native prototype. The selection treats reads and writes differently and chooses an ordered literal writer at eight UTF-16 units.

### Why

The numeric representation is private to the RV32 path, and the checker already evaluates and saves the index before lowering an access. The operation should preserve the guard and the point when it may fail. The choice can be made by the same emitter looking at the method kind and validated literal length.

### What worked

The director recorded SHA-256 `7723f008a33da17e92994fadc21ae22ffd5d7075a4086957eb7f2c0e99714b15` before sending the independent source. The Opus design arrived and identified trap timing, aliases, exact UTF-16 production, and operand stack lifetime as central controls.

### What didn’t work

The design's proposed read-and-user-branch fusion, dispatch table, generalized load/store copy, and additional lowering controls require a wider experiment. The frozen prototype tests the access guard branch and checked constant write only. It retains baseline Wasm and the native early comparator.

### What I learned

An address operation can represent the potentially failing part without absorbing the load or store. In a checked write, the saved address can remain live while the right-hand side itself performs a checked access.

### What was tricky to build

Independently patch both span-indexed and ordinary emission callbacks. Active options must never leak into Wasm. The temporary literal table belongs to the current function and is cleared on streaming consume.

### What warrants a second pair of eyes

Verify scratch-register liveness across integer operands and the existing result placement rules. Compare trap ordering on invalid destination and invalid RHS, including the preceding observable write.

### What should be done in the future

A separate study can isolate preservation from lower-level instruction matching using a late generic expander and an early peephole. A compound user branch or a general buffer copy requires its own eligibility, aliasing and testing contract.

### Code review instructions

Read `scripts/02-semantics/01-stage.mjs` with `typed-wasm.js` and `typed-rv32.js`. Trace both retained operations and the literal table cleanup. Compare the emitted EBREAK with the unsigned BLTU success branch.

### Technical details

The literal writer keeps its original two guards and immediate halfword stores. Native code contains no new data section, helper call, or changed source ABI. The address descriptor passes receiver and saved-position local IDs. Literal descriptors carry a validated destination address slot and one function-local literal ordinal.

## 2026-11-20 — Step 2. Confirm language equivalence and compare native extent

### Prompt Context

The independent source tests short and long strings, partitions, bounded position loops, label writes and invalid ranges. The operator also had to include an exact eight-unit crossover and alias/side-effect controls.

### What I did

I ran the unchanged director cases and expected-outcome logic on all arms, with the existing independent PIE-study RV32 interpreter. I added a directed fixture with a surrogate pair represented through a valid Typed string literal, short and long UTF-16 cases, index extrema, record-header aliasing, and checked RHS sequencing. I compiled actual sources from a separately qualified smooth release build.

### Why

Code may shrink at a site that is rarely visited. Check static extent, expected side effects and modeled executed instruction counts separately. Use normal app source and an independent held-out program to avoid treating the directed cases as a general benchmark.

### What worked

All 1,603 original held-out states, including 101 traps, matched expected returns and full buffers. All Wasm bytes matched stock. The early native arm also matched stock exactly. The late arm emitted 2,396 bytes versus 2,876, and completed the same cases in 144,166 steps versus 158,570. The selected arm emitted 2,468 bytes with 145,024 steps.

### What didn’t work

The old branch interpreter rejected the candidate's RV32 SLLI. I switched all paired comparisons to the reviewed PIE-study interpreter, which already implemented SLLI with the correct immediate decode. The original baseline step total was 158,570 in both tools.

### What I learned

At the held-out sites, the small static rule gives up code and modeled execution reductions relative to always-late. The mechanism removes instruction formation overhead from the current compiler. It does not establish superiority over a sufficiently capable primitive peephole.

### What was tricky to build

A projected change to RV32 machine code needs both a correctness test and an attribution boundary. The renderer and both full native apps compile under all arms. Their static code extent is measured. That is narrower than end-to-end gameplay parity for altered compilers.

### What warrants a second pair of eyes

Check that position bit patterns go through an unsigned compare. For literals, verify the test source contains eight UTF-16 code units even though its supplementary-plane character is one Unicode scalar value.

### What should be done in the future

Repeat the comparison against a native backend that can rediscover the guard branch and invariant literal address from expanded operations. Preserve the same source and output contracts when assigning causality.

### Code review instructions

Run `scripts/01-bounds/02-heldout.mjs` and `03-host.mjs`. Their combined receipts include the semantic arms. The native placement and cold compile trials share the board runner in the bounds lane.

### Technical details

The late arm retained seven addresses and three ordered literal writers on the director program. Selected retained four addresses and the same three writers. The stock and literal bytes are instructions in this experiment. Separate literal-data lowering is a different study.
