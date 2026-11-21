---
Title: Physics study operator diary
Ticket: PICOCALC-SIMD-LAB
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
---

# Physics study operator diary

## Step 1: Separate layout effects from the scheduling experiment

I commissioned the physics kernels in a dedicated Opus High workspace and specified the interfaces needed by the host, board and evidence readers. The two controls with the same contact order matter because immediate writes may change the state read by later contacts. The device harness prepares all copies of the initial state outside the timed loop and checks each copy afterward.

### Prompt Context

**User prompt (verbatim excerpt):** “Use fixed-point particle integration as the first physics kernel. Compile the same update with particles stored as records and with positions and velocities stored in separate arrays. Run scalar and PIE on both layouts. Include conversion time when a real application would pay it.”

**User prompt (verbatim excerpt):** “Try independent particles first, then contact constraints where two contacts may write the same body. Supply conflict-free contact batches and compare scalar and PIE over the same batch order. Compare that scalar result separately with the original solver order.”

**Assistant interpretation:** Build physical and executable differential experiments with fixed input and explicit numerical rules.

**Inferred user intent:** Establish whether the P4 can profit from packetization across workloads and how to tell arithmetic improvements from memory or solver-order effects.

### What I did

- Created a scoped Opus sandbox and a single-tool MCP connection to a dedicated session on the corrected evidence REPL. Retained the commission text and bridge under `scripts/physics/`.
- Chose one-component saturated Q8.8 particle integration and widened two-body velocity relaxation. Defined the 2×2 native layout/ISA controls and two independently compiled Typed controls.
- Wrote the board study with 8 cyclic treatment blocks, 12 fresh buffers per timed batch, and single-tick conversion/grouping arms.
- Wrote the host assembler, independent arithmetic oracle, graph legality checks, instruction replay and address-count collector. Reserved the physical port for the ray-study board operator.

### Why

A packet-friendly in-memory layout and the act of carrying values in registers can each affect execution speed. Testing both independently allows the report to assign the effect to the chosen comparison.

### What worked

A strict host C front end compiled the timer harness against a test declaration of the ESP cycle counter. The installed Espressif toolchain provides a vendor assembler and the local Python environment includes Unicorn's RISC-V backend.

### What didn't work

The first Opus invocation returned `API Error: Opus 5.5's safeguards flagged this message ... [reasoning_extraction]`. It produced no kernel files. I issued a narrower software implementation commission confined to observable code and contracts, with an independent empirical test plan.

### What I learned

The repository's existing RV32 interpreter supports a deliberately small subset of scalar machine instructions. The physics hand schedule may use signed halfword loads. The host physics runner uses Unicorn scalar semantics with an allowlist for the vendor extension.

### What was tricky to build

The checked Typed ABI expects the address of a four-byte capacity field; the native ABI expects the address of the first halfword. The board holder places the header at offset 12 in a 16-byte-aligned allocation so that the payload starts at byte 16. The union itself is 16-byte-aligned so all twelve holders obey the requirement.

### What warrants a second pair of eyes

Check the Q-register set against the P4 context-save contract and stack alignment around packet scratch. Verify opposite-signed extreme velocity pairs and the expected source-order divergence separately.

### What should be done in the future

Run all physical trials under an identified firmware and qualify every scalar and PIE output before comparing timing.

### Code review instructions

Start with `04-fixed-point-particle-layout-and-contact-order.md`, `scripts/physics/03-qualify.py`, and `scripts/physics/board/physics_bench.c`. The runner excludes buffer resets, correctness assertions and UART emission from cycle timing.

### Technical details

The native particle APIs accept valid halfword arrays and length. Upper and lower saturation use signed 16-bit endpoints. Reference floor division in the contact oracle is explicit because C integer division rounds toward zero while an arithmetic right shift rounds toward negative infinity.

## Step 2: Assemble the Opus kernels and test the fallback contract

The researcher delivered the six native kernels and three Typed functions in its public answer. I transferred these exact blocks into the ticket and corrected two target restrictions discovered by the real compiler. The same actor then used the explicitly enabled local evidence tool and obtained six opening-scene pairs from its own private session.

### Prompt Context

**User prompt:** See Step 1 for the physics experiment request.

**Assistant interpretation:** A manually selected plan needs an unchanged generic implementation for inputs outside its admission proof. A board comparison needs controls with the same entry contract.

**Inferred user intent:** Explain whether SIMD and data layout improve the complete checked operation on the handheld.

**Commit (code):** `c9c7fbf` — Specify physics factorial controls and implement the paired board harness.

### What I did

- Compiled the real Typed source, emitted its raw unchanged words and entry labels for inclusion in the board image, assembled the native scalar and packed arms with Espressif's toolchain, and added four guarded dispatchers.
- Extended the Unicorn harness to report a full per-address execution histogram and capture post-trap memory. It checks 280 valid outcomes against an independent scalar oracle and 192 guarded results against the stock checked implementation.
- Separated a scalar original order, scalar grouped order and packed grouped order in the contact workload. Their intended comparison is apparent even on the conflict-heavy star fixture which admits no packet.
- Passed all four build inputs to the independent board operator. Exported three identified images, thirteen manually selected arms and seventy complete address histograms to the lab's workbench schema.

### Why

Raw register operations do not automatically inherit the Typed bounds contract. On a buffer that becomes invalid halfway through an update, prior stores must remain visible. A single capacity guard can fast-path complete valid buffers with exactly the original source reserved for all other cases.

### What worked

On 128 aligned planar particle pairs, the checked scalar arm executes 1,403 guest words and the checked PIE arm 126. Interleaved checked arms execute 1,272 and 938. In the same-order contact mesh the scalar arm executes 2,060 instructions and the packed one 3,107. These counts are host execution counts; physical cycle evidence is collected independently.

### What didn't work

- The Typed parser rejected `<<` at `5:39: expected identifier`. Replaced halfword sign extension with explicit subtraction for codes above 32,767; wrote floor division as widened difference, adjustment for negatives, then truncating division. Each replacement is checked against the oracle at signed extremes.
- The vendor assembler rejected `esp.vst.128.ip q2,a6,0`. The general address register used for staging was outside the valid encoding subset. Moved the staging address into `a4` before the store.
- The vendor disassembler printed `a4` for PIE operands even when numeric register output was requested. A first harness run decoded it as `x4` and faulted. The corrected execution hook distinguishes both register forms. `objdump -D` was needed to decode `.4byte`-emitted Typed instructions and recognize its EBREAK trap.
- The first scoped invocation provided no MCP server because Claude's `--safe-mode` disables explicit MCP configuration. A separate invocation with no built-in tools and one explicit local MCP server returned the six requested physical baseline observations. The kernel-writing invocation refused its file write in don't-ask mode but returned the complete kernel files in two public code blocks.

### What I learned

In the high-contention star schedule every batch has one contact and hits the scalar tail. A count of contacts alone cannot predict the number of packed operations executed. The checked wrapper's fifteen extra instructions on a complete planar run can be measured independently of the packed loop body.

### What was tricky to build

A valid scalar run might terminate with an EBREAK in the middle of the buffer. The host hook captures the semantic trap independently of its absolute PC. Normal returns must also restore the original stack and report the same integer as the stock Typed function.

### What warrants a second pair of eyes

The extrapolation from emulator instructions to device cycles remains open. The physics plan records are experimental assignments. They must never be described as predictions by the selector.

### What should be done in the future

Use the verified physical comparison to determine whether the same-order packed contact arm compensates for address gathering and writeback on the P4.

### Code review instructions

Run `node 02-build-typed.mjs`, `python3 03-qualify.py` and `python3 04-export-evidence.py` with the arguments in their headers. Compare its output SHA with the P4 operator's staged files.

### Technical details

The host-native complete image is 1,652 bytes, stock Typed 1,476 bytes, and the combined checked experiment 3,400 bytes. Only exact PC/image joins can relate the 70 traces to static instruction ranges.
