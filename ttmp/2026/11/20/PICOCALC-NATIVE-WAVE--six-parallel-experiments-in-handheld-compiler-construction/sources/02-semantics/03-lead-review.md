## Review: up to 12 corrections, most serious first

1. **Positive native table rests on rows with no correctness marker.** The closing paragraph says the first run "printed all 165 native timings … and never reached the combined correctness marker." That count matches 5 arms × 3 workloads × 11 blocks, so the "Positive native calls" table appears to come from those unconfirmed rows. Yet it says "Every row represents the cycle count for 256 *successful* calls," and the summary says "the data include exact trap and byte comparisons along with device timing." Neither is supported for these rows. Label the table as timing-only, with return values and memory not confirmed on device. Drop "successful," or state that it means "did not trap" if a per-call trap would have stopped the run. Do not let the summary's correctness claim cover device data.

2. **The correctness checks have no written results.** "What was compared" describes the held-out comparison (1,603 outcomes, 101 traps, byte-for-byte memory) and the 243 fixture states, but Results never says they passed. Only item 4 gives an outcome (66 states, 36 traps). Add explicit results with exact counts for each arm against early:
   - held-out outcomes matched, n/1,603;
   - traps matched, n/101;
   - final memory identical, yes or no;
   - fixtures passed, n/243, including the expected trap count.

   Without these, the summary's "exact trap and byte comparisons" is an unsupported claim.

3. **Arm counts contradict the three-arm design.** The article defines three arms. The board section says "231 physical rows across seven arms," and the native section says "five native comparison arms," but each table reports only stock, late and selected. Say what the other arms were, or that they belong to other studies. State that 231 = 7 × 3 workloads × 11 blocks, if true. Also say whether the 231-row run reached a correctness marker. Otherwise readers will assume the unreported arms were dropped selectively.

4. **RV32 has no "immediate halfword store."** "Emits the same immediate halfword stores as stock" and "the characters are encoded as instruction immediates" are imprecise. RISC-V `sh` stores a register. Each code unit must first be put in a register:
   - with `addi`/`li` for values up to 0x7FF;
   - with `lui`+`addi` for 0x800–0xFFFF, such as `♞` (U+265E) or surrogate halves.

   Rewrite this as register materialization plus `sh`, one per unit. Keep the claim that no word-wide stores are merged, so the article makes no word-level assumption.

5. **The fresh compile table needs to say "cold, first capture."** The receipt is a first-capture cold receipt, but the section only says "fresh." Label the medians as cold wall time, and say that warm, repeated-invocation wall time was not measured. Also state that these 59 records come from the same supervised run that ended without the correctness marker (see item 1), with no confirmation of device output identity. The four-block balancing is described correctly. Optionally note that the fifth-block Chess records were excluded.

6. **The "largest measured difference" claim is overstated.** "The largest measured difference between the two policies was the label workload" (4.525 points) is only true among the three held-out loops. The positive native rows differ more: 17.53 points on checked write with read and 8.37 on the literal. Scope the sentence to the held-out loops. Also put the flash-address caveat from "Scope" next to the summary's "Always-late beat selected" claim. The planned same-hash, different-address confirmation has not been run, so the label gap cannot yet be attributed to policy.

7. **The size range applies to late only.** "The other three measured sources shrank by 9.24% to 14.84%" fits late (painter 9.24%, control 13.34%, editor 14.84%). Selected shrank 5.05% to 9.78%. Say "under late," and give selected's range if useful.

8. **Positive workloads should not be read like held-out ones.** The native workloads were built to exercise the descriptors: a repeated read, a literal exactly at the 8-unit threshold, and a write whose value is a read. Say explicitly that these are positive workloads, not held-out ones, and that only the parse, count and label loops come from the held-out program. Chess and Editor compile timings are also product inputs, not held-out.

9. **The late arm's definition contradicts the empty-literal row.** "Late retains every … ordered literal write descriptor" conflicts with the table's `""` → late "no." Say "every non-empty literal write." Change "before either arm emits a descriptor" to "before either retaining arm …".

10. **The reproduction method is incomplete and misworded.**
    - Step 6 says "take the median across rows." It should say "across blocks, per workload."
    - It describes only the single held-out harness app. It leaves out the private full-firmware native bench and the fresh-compile harness.
    - Neither step 5 nor step 6 states expected pass, trap or marker counts.

11. **Unit ambiguity in the Chess explanation.** The text calls painter "the 16,316-byte painter program," but painter's image is 23,848 bytes. State whether 16,316 is source bytes, UTF-16 units, or something else.

12. **Status should stay non-release.** "Status: active" is appropriate. Avoid wording that presents the device results as final until the correctness marker (item 1) and the address-relocation confirmation (item 6) are in.

**Checked and correct:** all image ratios, step reductions, the 72-byte and 858-step deltas, and the 4.525-point gap. The worked-example addresses are right, including that −2 aliases to the header at 0x2000. The UTF-16 unit counts are right. The fresh-compile figures match the receipt's medians, ranges, paired reductions, peak bytes and reactor sizes.
