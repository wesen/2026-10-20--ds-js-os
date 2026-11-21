# Review: material corrections

1. **The native timings have no observed correctness evidence.** The article says the first run "did not reach the combined device correctness marker." Even so, the 20.98% reduction, the ~68.1-cycle medians and all 165 native rows appear without that caveat. None of the correctness evidence covers an actual removal:
   - The held-out program removes nothing.
   - The targeted corpus has no per-state results in the cited receipts.
   - "Wasm output unchanged" does not exercise the RV32 code where guards are removed.

   The positive endpoint should be labeled timing-only and unvalidated on device. The same-hash, different-address confirmation should be marked pending. Nothing here should read as release qualification.

2. **The bounded-policy overhead is overstated as uniform.** "Cost 0.60% to 1.75% more in these four placements" describes the four arm×app medians. The individual paired values range from −2.13% to +1.71%. Three cells include at least one pairing faster than stock:
   - Chess Order max +1.71
   - Chess Selected max +0.89
   - Editor Order max +0.60

   Only Editor Selected is slower in all four pairings (max −0.65%). With n=4, say that bounded overhead is unresolved from noise except for Editor Selected.

3. **Cold wall time is not analysis time.** The sentence "It measures … time for choosing and running the analysis" is wrong. Each row includes QuickJS start, compiler load, full lowering, reactor link and output copy. There is no warm measurement, so the percentages are shares of cold end-to-end time. The admission scan cannot be separated from startup. The bounded arms' median deltas (~15–77 ms) are also several times what a per-cell rate from Always would predict for ≤640 cells:
   - Chess: ~11 µs/cell
   - Editor: ~19 µs/cell

   So either uncharged work (such as sizing every function for admission) or noise dominates. Cells do not predict time, and the article should say so here as well as in the host section.

4. **The linked reactor did not shrink in any arm.** `reactorBytes` is 274,892 for every Chess arm and 242,124 for every Editor arm, including Always. Two fixes follow:
   - "Their compiled bytes were the same as stock" cannot rest on this receipt, since it would be equally true of Always. Cite the host unlinked sizes instead.
   - "1.54 seconds … for the 32-byte reduction" should state that the reduction exists only in unlinked instruction bytes. The delivered reactor is unchanged.

5. **The exact counts do not reconcile with the stated design.** With two apps and four arms, five blocks give 40 compile rows, not 60. Likewise, 165 native timings is 11×15, which does not factor as 11 rows × 4 arms × the three named kernels. The article should state the planned composition (apps × arms × blocks; rows × arms × kernels), including any arm or app not shown. If "stock" (cold receipt) and "Never" (host) are distinct arms, say so; if they are the same, say that instead. It should also say that Chess block five was complete but excluded to keep the blocks balanced.

6. **The second failed hypothesis mislabels workloads and misreads its own evidence.** "On held-out code" introduces Chess, Painter and Editor, which are current product sources, not the held-out program. The control (14 vs 3 guards) and Editor (3 vs 2) *support* the steering hypothesis, so the result is mixed rather than failed. The Painter and Editor guard counts for the budget arms also appear nowhere else, so either tabulate them or cite them.

7. **The definition of cost figures is wrong for the older engine.** "The cost figures in this article count the cells the analysis visited" is false there. The older-engine section itself says the debit is the full tape length of each accepted function, even when a search inspects a few edges. Restrict that definition to the current-compiler matrix.

8. **The byte-identity claim is impossible as written.** "The Never and Always images match the original older compiler byte for byte" cannot hold against one build, because the two images differ by 16 bytes. State which original configuration each one reproduces (for example, original with the search disabled versus enabled).

9. **The Chess miss for Selected is eligibility, not budget.** `chessMake` is 1,139 cells, above Selected's 192-cell ceiling. Selected's 447 remaining cells are therefore irrelevant. Say so, as the older-Editor paragraph does for `editorPreviewAppend`. In the follow-up, "a whole-function budget excludes `chessMake`" should read "a 640-cell whole-function budget or the 192-cell ceiling".

10. **Two element-width claims are unsupported.**
    - "Compares the index against the length in UTF-16 units" cannot hold for buffer-typed bases. State the length unit per base type, or drop it.
    - "Both removals in the control … each account for 32 bytes" is inferred from a 64-byte total. Cite a per-function diff, or say "64 bytes for two guards".

11. **The board's positive endpoint omits Always.** Host control code under Always is also 3,204 bytes. Either report Always's cycles or state that it was not run on the board and why. Also state the number of arms rotated across the eleven rows (this ties to item 5).

12. **The reproduction section claims too much.** "Verifies the one proof" should say it reproduces the receipt's counts (one proof, five edges, the two SHA-256 values). It establishes reproducibility of the counts, not correctness of the proof.

**Checked and consistent:**
- The cold table's medians and ranges match the receipt.
- The paired figures (−28.54%, −14.59%) and the 1.54 s Chess delta are correct.
- The 38.8% figure, the worked admission example (610 and 210 cells), and the byte deltas (32, 64, 16) are correct.
- The older-Editor arrival budgets (2 and 21 cells) are consistent with the final charges.
