# Changelog

## 2026-11-23

- Initial workspace created

## 2026-11-23

Step 1: Typed kernel regenerated with value records, record results, continue, ?:, u32 and local arrays (1c72244); inliner budget for a caller's locals and f32 results inline (416e220). Images bit-identical to the old generator; host B-01 10,279 -> 11,464 instructions per sample before compiler work.

## 2026-11-23

Step 2: profile of B-01/R-01: frame copies of value-record leaves and getF32 address/check overhead dominate; f32 arithmetic under 7%.

## 2026-11-23

Step 3: RV32 kernel passes rows and coalesce (1fc5528), call-free f32 homes, open inlining of record results and set-get forwarding (e096e70), record-result leaves into their locals (0cb1e3e), affine rows with buffer fields and dead index stores (6b1f2e3). Integer programs IDENTICAL 84 of 84.

## 2026-11-23

Final host counts (16 rows of frame 0): kernel-bound geometric mean 1.885 -> 1.410 of the C++ arm, 18 scenes 1.290 -> 1.034; B-01 1.790 -> 1.426. Gates: make test, make test-host (stock and kernel) 25/25, ray 430f0d501659, Chess 6,981 words. Typed reference digests unchanged. Board study (step 4) not run: paused.
