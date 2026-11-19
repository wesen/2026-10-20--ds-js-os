---
Title: "Supervisor research notes"
Ticket: PICOCALC-COMPILER-THESIS
Status: active
DocType: reference
Topics: [picocalc, native, performance]
Intent: long-term
---

# Supervisor's research notes

## Questions, evidence and decisions

| Question | Observable evidence | Decision |
| --- | --- | --- |
| Where should a shallow expression result live? | Static RV32 counts and whole-driver guest execution at f0846ba, plus original and candidate replays. | Integrate fixed homes for the first five operand slots. Keep call-boundary tests with the change. |
| Can the native compiler release checked function operations earlier? | 88263e0 emits the same native bytes and relocation metadata. Comparing four cold treatments verifies ELF identity with either backend. | Pursue a native streaming interface. Qualify error order, peak heap and cold compile on the device before promoting it. |
| Does a longer inequality search justify its cost here? | c1e3777 removes three of 419 corpus sites by direct reasoning. Chained search inspects more edges and removes the same three sites. | Investigate the frequently executed surviving checks and the missing preconditions before widening the analysis. |

## Interpreting the receipts

- A machine-code byte belongs to the occupied portion of the reserved reactor slot. The ELF contains the entire reserved region at both backend revisions.
- The emulator counts instructions in a full driver process with the loaded module. Guest instruction counts are deterministic for these inputs and require a separate physical timing experiment.
- QuickJS allocator high-water in the cold harness measures all live allocations in its tracked allocator, from runtime creation. The representation experiment resets the high-water point after forced collection and subtracts the retained starting point. Both use Linux allocation here. Neither measures all host process memory.
- The actual P4 measurement predates the three experiments. Reproduce it on the same board alongside the candidates to compare chip time, target memory, ELF identity and rendered behavior.

## Artifact provenance

Use the scripts under this ticket to trace the host measurements. Three implementation leads and two independent examiners own separate notes and diaries. The supervisor diary records when the hardware was probed, how the four compiler treatments were assembled and how the reviewed reports reached the vault.

## Dispositions after independent examination

- The call ABI retained the caller's live prefix across all tested combinations of zero through eight arguments and zero through eight live operands. Both backends matched the Wasm oracle when native imports overwrote every scratch register.
- The bounded proof preserved observable results, traps and the full memory page in 760 examiner invocations. On event 50,001 the pass discarded an earlier accepted elimination and emitted the original Wasm bytes. Chained inference still has no additional winner in the unchanged application corpus.
- The cold five-treatment ablation separates code pruning and framing from packing and early release. Packed buffering was fastest in the reviewer trial. Streaming lowered the peak further. A large function arriving late can raise the streamed peak even with the same input size, largest function size and output length.
- The most recent supervisor series builds its engine freshly with the checked-in Makefile. Earlier workspace object inputs and their receipts remain named historical controls.

## Physical decision

On the ESP32-P4, moving from the integrated register compiler to buffered native operands reduced median full Editor compile time from 2.863 s to 2.318 s. A separate four-block experiment held framing and buffering fixed: passing operands directly gave 2.303 s versus 2.725 s with variable-length integers. The 422 ms reduction is specific to operand representation. Most of the compile-heap saving in that second experiment was already present after omitting framing and unused Wasm writer code. Streamed execution of the compiler saved more heap but increased compile time. Implement buffered numeric operations first and retain the public Wasm compiler path. Preserve object bounds checks in the production compiler until application-level timing identifies a worthwhile, proven removal.
