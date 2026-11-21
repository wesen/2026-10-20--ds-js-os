---
Title: Opus physics researcher activity diary
Ticket: PICOCALC-SIMD-LAB
Status: complete
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
---

# Opus physics researcher activity diary

## Step 1: Build the two exact update laws and inspect the execution evidence

The Opus High physics lane wrote the initial `physics.S` and `physics.typed` in its seven-turn, 246.5-second kernel commission. The operator corrected the Typed syntax, cross-assembled the kernels, ran the host qualification and coordinated board execution. In a separate public REPL session the researcher validated packed arithmetic and worked examples. The standalone chapter was delivered in its own 173.9-second Opus High session. The researcher later converted the public receipts and notes into this diary; the operator corrected session attribution and reconfirmed the alignment finding against the full trace.

### Prompt Context

The input asked for a first physics workload:

> "Use fixed-point particle integration as the first physics kernel."

The values are Q8.8 halfwords. The measured design question is where SIMD packet boundaries pay off in the Typed compiler on ESP32-P4.

### What I did

- **Particle kernels.** The lane wrote AoS and SoA kernels in scalar and PIE forms, each computing `x = sat16(x+v)`.
  - The PIE forms process 8 lanes with `esp.vadd.s16`.
  - Groups are staged through 16-byte-aligned stack slots. SoA skips staging when both planes are aligned.
  - The `n & 7` remainder falls back to the scalar loop.
- **Contact kernels.**
  - `contact_scalar` uses `d = (B−A) >> 1` (arithmetic, i32) and applies pairs in order.
  - `contact_pie` requires pair lists with no repeated body. It writes results back in pair order.
- **Typed versions.** `particleAoS`, `particleSoA` and `contacts` were written in Typed.

### Why

- Aligned stack slots permit the vector load/store instructions to address suitably aligned memory even when application arrays are unaligned.
- The scalar tails keep every `n` correct.
- The no-repeated-body precondition is needed because the batched form cannot reproduce the scalar form's read-after-write ordering.

### What worked

- **`guarded_soa_pie`, particle-n128** (image `79809bfa…`):
  - 16 packed executions, all at PC 740, matching 128/8 = 16 trips.
  - The second packed range (PC 924) executed zero times in this trace.
- **`contact_pie`, mesh128-scheduled-pie** (image `48f9254b…`, `physics.S:317`):
  - 30 executions: 15 at PC 1288 (vadd) and 15 at PC 1292 (vsub).
  - Batches of 57/41/30 give 7+5+3 = 15 trips and 1+1+6 = 8 tail pairs. This matches the trace.
- **Saturation.** x = 32000 (125.0) plus v = 1000 (3.90625) gives a raw sum of 33000. It saturates to 32767 (127.99609375).
- **Contact arithmetic.**
  - Extreme pair (32767, −32768) → (−1, 0).
  - Small pair (−3, 4) → (0, 1).

### What didn't work

The first trace query failed. It used the workload label as the trace suffix:

- **Failed:** `simd.executions('physics-contact_pie','physics-contact_pie-mesh128:scheduled-pie','packed-arithmetic')` returned `TypeError: unknownTrace`.
- **Corrected:** `simd.executions('physics-contact_pie','physics-contact_pie-mesh128-scheduled-pie','packed-arithmetic')` returned ok.
- **Cause:** workload labels use `:`, but trace names use `-`.

### What I learned

- **Provisional assumptions superseded.** The original public log listed provisional assumptions:
  - sign extension via `(c<<16)>>16`
  - masked 16-bit writes
  - an assumed `setCharCodeAt(index, value)` write form

  The adopted, checked Typed number operations instead use **explicit sign extension and saturation**.
- **Fixed-cost break-even.** The fixed cost of 2076.33 breaks even at:
  - ≈1.52 ticks against AoS scalar (2076.33 / (1516.79 − 150.375))
  - ≈2.44 ticks against AoS PIE (2076.33 / (1002.46 − 150.375))
- **Wrapper overhead** is 28.75 cycles (179.125 − 150.375).
- **Result table size** is 818 rows (5·12·12 + 7·14).

### What was tricky to build

- Preserving scalar semantics in `contact_pie` when d is computed in scalar code but applied in vector lanes.
- Restoring `sp` on every early-return and tail path.
- Keeping `.option norvc` so that packed-arithmetic PCs land on 4-byte ranges.
- Telling a missed alignment guard apart from a correct fallback path. The unexecuted PC 924 only means "not taken in this trace".

### What warrants a second pair of eyes

- **127/128 alignment cutoff.** The operator subsequently verified that the native aligned-copy packed add at PC 652 executed 15 times for 127 particles while the direct packed add at PC 468 executed 16 times for 128. The respective host step totals were 973 and 111.
- **Lane saturation.** Check whether `esp.vadd.s16`/`esp.vsub.s16` saturate per lane exactly like `sat16`.
- **Precondition enforcement.** Confirm that `contact_pie`'s no-repeated-body rule holds for the chain16 and star16 schedules, or that those schedules route to scalar.
- **Trace scope.** Zero-execution PCs say nothing about other traces, workloads or images.

### Code review instructions

1. **Diff `physics.S` against `physics_checked.S`:**
   - guard logic at line 35
   - the packed range at line 317
2. **Check the ABI:** only q0–q2 and caller-saved `a*`/`t*` registers may be touched, and no `s*` registers may be modified.
3. **Check zero-length input:** `n = 0` and `m = 0` must return immediately.
4. **Verify the Typed rewrite** uses the checked sign-extension and saturation operations, not shift/mask idioms.
5. **Replay the boundary workloads** n7, n8, n64, n127 and n128 for each kernel against the scalar reference.

### Technical details

| Item | Value |
|---|---|
| `physics.S` sha256 | `8203fcf7518c7446dd5f1b579ab42f426d2510136c8780ad87d21e9b9c1a6892` |
| `physics_checked.S` sha256 | `939ed0076fafbc60fa394db2ff841696f68a8d291233e986f416ba6cf29cf0f2` |
| guarded_soa_pie n128 | 126 trace steps; ranges 740–744, 924–928 |
| contact_pie mesh128 | 3107 trace steps; ranges 1288–1296 |
| Counting unit | host-replayed RV32 instructions in role byte ranges, from complete per-PC histograms |
| Typed contract | `particleAoS(b,n)`/`particleSoA(b,n)` return n; `contacts(b,pairs,m)` returns m |
