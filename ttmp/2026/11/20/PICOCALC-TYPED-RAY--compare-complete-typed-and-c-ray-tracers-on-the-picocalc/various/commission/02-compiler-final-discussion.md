---
Title: Compiler researcher final discussion before technical editing
Ticket: PICOCALC-TYPED-RAY
DocType: reference
Status: complete
Topics: [compiler, performance]
---

Written by Opus High (claude-opus-5-5) using the aggregate observations in scripts/commission/compiler-final.txt. The project articles incorporate the discussion after technical review.

Moving the primary path from ordinary generated scalar code to a hand-scheduled scalar row lowered its median from 17.811 ms to 7.037 ms, a reduction of 10.774 ms. Packing the same row into eight lanes lowered it by only a further 0.376 ms, to 6.661 ms. Of the total 11.150 ms improvement, about 97% therefore occurs without any SIMD. The full-frame times show the same split: 10.756 ms from scheduling and 0.383 ms from packing. Subtracting primary-only time from full-frame time leaves a residual of about 39.87 ms in every variant. This is consistent with all of the changes being confined to the primary path.

The explicit and inferred packed rows lowered to identical machine bytes. Their differences of 0.025 ms (full frame) and 0.029 ms (primary) therefore cannot come from the code itself. These differences give a rough indication of measurement noise, although no dispersion statistics were supplied.

Our interpretation is a hypothesis, not a measured result. We propose that a general-purpose baseline compiler loses most of its performance here through scalar scheduling and register use rather than through missing vectorization, so it should improve scalar code quality first. Inference matched explicit packing in this case, but it is safe only with sound legality checks. Consider a naive rule that narrows arithmetic to signed 16-bit lanes because pixels are 8-bit. It fails on the blend (a·w + b·(256 − w)) divided by 256. With a = b = 255 and w = 128, the intermediate value 65,280 exceeds the signed 16-bit range and wraps to −256, so the result is −1 instead of 255.

A falsifiable follow-up is to run many interleaved repetitions of all four variants and report confidence intervals. The attribution predicts that the gap between hand-scheduled and packed persists, while the interval for explicit versus inferred includes zero. If the hand-scheduled and packed intervals overlap, the claimed packing benefit is refuted.
