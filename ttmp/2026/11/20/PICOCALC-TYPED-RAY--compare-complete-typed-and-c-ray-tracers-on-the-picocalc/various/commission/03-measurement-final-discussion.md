---
Title: Measurement researcher final discussion before technical editing
Ticket: PICOCALC-TYPED-RAY
DocType: reference
Status: complete
Topics: [compiler, performance]
---

Written by Opus High (claude-opus-5-5) using the aggregate observations in scripts/commission/measurement-final.txt. The project articles incorporate the discussion after technical review.

The figures are only meaningful relative to a stated reference, so each ratio must name its denominator. Against scalar C (9.521 ms), the ordinary guest median of 57.674 ms is 6.06 times slower and the best guest at 29.975 ms is 3.15 times slower. Against packed C (8.350 ms), the same figures become 6.91 and 3.59. Packed C itself is 12.3 percent faster than scalar C, so choosing the weaker baseline flatters the guest. Because each of the 324 observations runs scalar C, packed C and the guest in rotated order on the same pose, the comparisons are paired. Pose-specific scene cost and slow drift in board state affect all three members of an observation, so within-observation differences are more trustworthy than differences between pooled medians. Every timing stops when pixels reach memory, so display transfer is excluded.

The best guest result is a bundled treatment. It combines two traversal changes and a compiler proof, and the measured 48.0 percent reduction (a factor of 1.92) cannot be assigned to any one of them. The checker measurements are a separate comparison. On an identical scene, the mixed renderer takes 28.759 ms and the all-guest renderer takes 71.307 ms, a measured gap of 42.5 ms, or 2.48 times.

The following interpretation is a hypothesis, not a measurement. Guest overhead may be concentrated in per-ray control flow and traversal rather than in arithmetic. A falsifiable follow-up would apply each traversal change and the compiler proof separately and in every combination, using the same paired design. If the traversal changes alone do not produce most of the 27.7 ms reduction, the hypothesis is refuted.

Three repetitions per pose (36 observations per variant) give a weak estimate of run-to-run spread. A single board also cannot separate software effects from that board's particular clock, thermal and memory behaviour.
