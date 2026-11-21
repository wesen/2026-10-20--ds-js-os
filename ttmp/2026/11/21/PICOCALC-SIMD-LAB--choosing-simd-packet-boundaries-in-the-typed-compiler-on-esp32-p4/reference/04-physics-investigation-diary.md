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
