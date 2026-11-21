# Experiment design: how long should checked operations keep their identity?

This is a design document only. No measurements exist yet, and nothing below is data. Wherever I name a threshold or constant, it is a decision you should commit to before measuring, not a result. Source-level API names such as `copy16` are placeholders for whatever your typed subset actually spells them as.

---

## 1. Question and hypotheses

Checked u16 operations (read, copy, read-feeding-branch, read-feeding-dispatch) currently expand early, right after validation, into explicit temporaries, a u32-capacity guard, address arithmetic and `lhu`.

**Research question.** At which pipeline stage should each checked operation stop being one unit? And can a cheap static per-site rule pick that stage better than "always early" or "always late"?

The core tension is that early and late expansion each buy something different:

- **Early expansion** exposes guards and loads to frontend redundancy elimination: guard CSE, loop-invariant `cap` and `base`, and reuse of a read value.
- **Late retention** lets the RV32 instruction selector choose between structurally different sequences whose costs depend on the target:
  - copy shape: `lhu/sh` vs `lw/sw` vs immediate stores
  - dispatch shape: jump table vs compare tree
  - addressing with or without Zba `sh1add`
  - compressed-encoding opportunities

**Pre-stated hypotheses.** Each one can come out false.

- **H1.** Plain reads gain little from late retention, because a competent isel recovers `bgeu/slli/add/lhu` from early code. Early wins or ties for plain reads, especially inside loops.
- **H2.** Capped constant-length copies and dense dispatches gain from late retention, because the best lowering is target-dependent and the frontend has no target cost model.
- **H3.** A read whose only use is a branch condition gains from late retention only when no other checked operation on the same buffer shares its loop. Otherwise, losing guard CSE dominates.
- **H4.** A selective rule built on H1–H3 beats both pure arms on held-out code. It also beats a random selection with the same retention fraction.

If H1 is false, so that late wins everywhere, the correct conclusion is "use L" and the rule has failed. Section 9 makes that outcome reachable.

---

## 2. Fixed invariants (identical in every arm)

1. **One parse, one validation.** The validated module is serialized once and hashed. Every arm consumes that same byte image, and the harness asserts the hash matches before compiling each arm. Arms diverge only after validation.
2. **Validation sees source-level checked ops, never private opcodes.** Private opcodes are created by the same post-validation lowering step that would otherwise expand them. That makes them correct by construction from validated input. The backend runs only cheap structural asserts, never a second semantic validation.
3. **Single generic expander.** One function, `expand_generic(op) -> [primitive ops]`, is the only definition of a checked op's semantics in primitives. It is used by:
   - arm E,
   - arm L-null,
   - the Wasm backend,
   - arm L's fallback for any op the RV32 lowering declines.
4. **Private opcodes never escape.** The Wasm backend always expands them. Running a Wasm validator on the emitted output turns any leak into a hard failure.
5. **Trap mechanism is held constant.** Every guard failure branches to an out-of-line, per-site `c.ebreak` stub at the function end. A pc→`site_id` side table maps the stub back to its site. No arm may change this, so trap-path code size is not a confound.
6. **Literal handling is frozen at the prior study's chosen configuration** (immediate stores vs code plus UTF-16 pool) in all arms. It is not re-measured here. See control C4.
7. **Structured control is preserved.** A private branch op may only be the condition of an `if`. A private dispatch op may only be the operand of a `br_table`. Neither may introduce an unstructured edge.

---

## 3. The private opcode set (small, numeric, not a general IR)

All operands are local indices. Those locals are already the explicit temporaries the frontend materializes, so no SSA or new value model is needed.

```
enum PrivOp : u8 {            // internal-only range; never emitted to Wasm
  CHK_LD16       = 0xF0,  // dst ← buf[idx]            ; site
  CHK_BR16       = 0xF1,  // if (buf[idx] <cond> imm)  ; read has single use
  CHK_DISPATCH16 = 0xF2,  // br_table on buf[idx] - lo ; ≤ D cases
  CHK_COPY16     = 0xF3,  // dst[d..d+n) ← src[s..s+n) ; n const, n ≤ K
}

struct PrivRec {               // fixed-size record, one per op
  u32 site_id;                 // stable source site, survives all arms
  u16 buf_base_local, buf_cap_local, idx_local;
  u16 aux0, aux1, aux2;        // dst/res local, imm or cond, copy src fields
  u8  n_units;                 // copy length (const), ≤ K
  u8  flags;                   // ALIGN4_KNOWN, SAME_BUF, ...
}
```

**How frontend passes treat a retained op.** They do not need to understand it. They treat it as an opaque effect with one conservative summary:

- may trap,
- reads `buf`,
- writes `dst` (copy only),
- not movable across any other effect,
- not hoistable,
- not CSE-able.

That one summary is the entire "IR extension."

**Why copies are capped at K.** With `n ≤ K`, the target lowering can load all units before storing any of them. That makes overlapping same-buffer copies correct with no direction logic and keeps the lowering within the register budget. K should come from a small dev grid such as {4, 8} u16 units.

---

## 4. Pipeline stages and arms

The stages are:

```
validate → F1 const-fold → F2 guard-elim/CSE → F3 LICM → [backend] B1 isel → B2 regalloc → B3 emit
```

**Retention horizon.** An op's retention horizon is the stage just before which it is expanded.

| Arm | Expansion point | Lowering at expansion | Purpose |
|---|---|---|---|
| **E** | after validate | `expand_generic` | current baseline |
| **L-null** | entry to B1 (opaque through F1–F3) | `expand_generic` | cost of opacity alone |
| **L** | inside B1 | RV32-specific lowering (fallback `expand_generic`) | full late retention |
| **S** | per site: E-point or B1, by rule R | as E or L per site | the proposal |
| **E+peep** (C2) | after validate | `expand_generic`, plus a backend peephole that tries to recover L's sequences from primitives | is identity actually required? |
| **S-rand** (C5) | per site, seeded random at S's retention fraction per op kind | as E or L | does R pick *which* sites, or only *how many*? |
| **S-inv** (C6) | R's decisions flipped | as E or L | sanity: should not beat S |

**Decomposition this gives you:**

- E − L-null: the value of frontend optimizations seeing expanded ops.
- L-null − L: the value of target-specific lowering.
- E+peep vs L: whether identity is needed, or a peephole is enough.

**Interaction to log in S.** A retained op is an opaque may-trap barrier. It can block F2 from merging guards of *early* neighbors across it. Count blocked merges per function so that S's losses can be attributed to this effect.

---

## 5. Concrete code shapes

RV32 sequences are illustrative targets for the lowering, not measurements.

### 5.1 Plain read (H1: expected early)

```ts
const c: u16 = buf[i];          // buf: Uint16Array, i: u32
```

Generic expansion (Wasm-shaped primitives):

```
t0 = local.get i
t1 = local.get buf.cap               ; u32, units of u16
trap_if (i32.ge_u t0 t1) site=17     ; unsigned compare also catches "negative"
t2 = i32.shl t0, 1
t3 = i32.add buf.base, t2
c  = i32.load16_u t3
```

RV32, rv32imc:

```
    bgeu  a1, a2, .Ltrap17   # i >=u cap
    slli  t0, a1, 1
    add   t0, a0, t0
    lhu   a3, 0(t0)
```

RV32 with Zba (`sh1add rd, rs1, rs2` = rs2 + (rs1 << 1)):

```
    bgeu   a1, a2, .Ltrap17
    sh1add t0, a1, a0
    lhu    a3, 0(t0)
```

A target-aware isel can make this choice from early code as well, so the late-only gain here should be close to zero. E+peep tests exactly that.

### 5.2 Offset read: the trap-equivalence hazard

```ts
const b: u16 = buf[i + 3];
```

The guard must be on the index value the language defines.

- If `i + 3` is a non-wrapping integer, the guard needs `i <= cap - 3` *and* `cap >= 3`.
- If u32 addition wraps, the guard must test the wrapped value.

Folding the offset into `lhu a3, 6(t0)` is a legal late optimization. Rewriting `i + 3 <u cap` as `i <u cap - 3` is **not** legal when `cap < 3`. This shape is mandatory in the equivalence vectors (§6).

### 5.3 Read feeding only a branch (H3)

```ts
for (let i: u32 = 0; i < n; i++) {
  if (buf[i] === 0x3C) k++;     // single use: the if-condition
}
```

The late `CHK_BR16` lowering:

```
    bgeu  a1, a2, .Ltrap18
    sh1add t0, a1, a0         # or slli/add without Zba
    lhu   t1, 0(t0)
    li    t2, 0x3C
    bne   t1, t2, .Lskip      # imm==0 → bnez; c < 0x80 → srli t,c,7 ; bnez
```

**Early-arm opportunity.** No buffer store happens inside this loop, and the trap reports the same `site_id`. That makes it observationally legal for F2/F3 to replace the per-iteration guard with a preheader check, `n >u cap → trap site 18`. A retained `CHK_BR16` forbids that hoist. This is exactly the trade-off H3 predicts.

**Requirement on any hoisted or merged guard.** It must report the original site id of the access that would have trapped first.

### 5.4 Read with two uses (ineligible for `CHK_BR16`)

```ts
const c: u16 = buf[i];
if (c === 0x5C) { escaped = true; }
out[j] = c;
```

The rule only allows `CHK_LD16` here, or early expansion. Fusing the read into the branch would force a reload. A reload is legal only if nothing can write `buf` in between, which an opaque summary cannot prove. So this case is excluded by construction.

### 5.5 Dispatch (H2)

```ts
switch (buf[i]) {               // cases 0x30..0x39 dense, plus default
  case 0x30: ... case 0x39: ...
  default: ...
}
```

Late `CHK_DISPATCH16`, jump-table form:

```
    bgeu  a1, a2, .Ltrap19
    sh1add t0, a1, a0
    lhu   t1, 0(t0)
    addi  t1, t1, -0x30
    li    t2, 10
    bgeu  t1, t2, .Ldefault
    slli  t1, t1, 2
    la    t2, .Ltab19         # per-function table (function-at-a-time)
    add   t1, t1, t2
    lw    t1, 0(t1)
    jr    t1
```

The alternative is a compare tree, chosen by a per-target cost model. Table bytes count toward code size (rodata included). The structured `br_table` maps onto the table; neither form adds an unstructured edge.

### 5.6 Capped copy (H2)

```ts
copy16(dst, d, src, s, 4);      // constant n=4 u16 units (8 bytes)
```

The guards come first, for *both* ranges, before any write. They are written so they cannot overflow:

```
    li    t0, 4
    bltu  a3, t0, .Ltrap20    # dcap < n
    sub   t1, a3, t0
    bltu  t1, a1, .Ltrap20    # d > dcap - n
    bltu  a5, t0, .Ltrap20    # scap < n
    sub   t1, a5, t0
    bltu  t1, a4, .Ltrap20    # s > scap - n
```

The body, when `ALIGN4_KNOWN` holds (bases 4-aligned by allocator guarantee *and* d, s even and compile-time known):

```
    sh1add t2, a4, a6 ; sh1add t3, a1, a2
    lw  t4, 0(t2) ; lw t5, 4(t2)       # all loads before any store (overlap-safe)
    sw  t4, 0(t3) ; sw t5, 4(t3)
```

Otherwise the body is four `lhu`, then four `sh`.

**Where the reference semantics come from.** "All guards before any write" must be checked against the language's actual copy semantics, as implemented by `expand_generic` and confirmed on the Wasm reference. If the language specifies element-wise partial writes before the trap, the late lowering must reproduce that partial state exactly.

---

## 6. Equivalence: whole-buffer and trap timing (hard gate)

**Observation, per run.** Each run records:

- the return value, or the trap `(kind, site_id)`,
- the ordered sequence of host-call events,
- a SHA-256 of **every** buffer in the run's memory, not just declared outputs,
- on mismatch, the first differing byte offset, for local debugging only.

**Oracles.**

1. Arm E on an instruction-accurate RV32 simulator.
2. The same validated module through the Wasm backend on a reference Wasm interpreter.
3. Before any arm is compared: E must agree with the Wasm reference. If it does not, the baseline has a bug, and that is reported as such.

**Input vectors per site.** These are generated by a seeded generator; record the seed.

- `idx ∈ {0, 1, cap−1, cap, cap+1, 0x7FFFFFFF, 0x80000000, 0xFFFFFFFE, 0xFFFFFFFF}`
- `cap ∈ {0, 1, n−1, n, n+1}`, for copies
- offset forms `i + k` near wrap
- overlapping same-buffer copies, both directions
- a trap on iteration *m* of a loop that stores to an output buffer (catches illegal guard hoisting)
- the first vs. second of two adjacent reads trapping (catches wrong `site_id` after a merge)

**Target configuration for equivalence.** Misaligned loads and stores must *trap* in this configuration, so that an unproven `lw` cannot be silently emulated.

**Small generated functions.** A grammar-based generator builds functions that nest checked ops in loops, ifs and switches. These are used for equivalence only, never for performance.

**Rule.** Any divergence invalidates that arm for that op kind. No performance number is reported for an arm and op kind that failed equivalence, and divergences are never averaged away.

---

## 7. The selection rule (frozen before held-out)

Facts are computed in **one linear pass** over each validated function, using only structured-nesting and use-count data the frontend already has.

- `kind`: read, branch-read, dispatch-read, copy
- `in_loop`: the site is nested inside a Wasm `loop`
- `shared_buf_in_loop`: another checked op in the same innermost loop names the same buffer local
- `single_use`: the read result has exactly one use, and it is the enclosing `if` or `br_table` operand
- `n_const ≤ K` (copy); `align4_known` (copy)
- dispatch: `cases ≥ D`, and `span ≤ 4 × cases`

**Primary rule R** (decision list, first match wins):

1. copy with constant `n ≤ K` → **LATE**
2. dispatch-read with `single_use` and `cases ≥ D` and dense → **LATE**
3. branch-read with `single_use` and not `shared_buf_in_loop` → **LATE**
4. everything else → **EARLY**

**Anchor rule R0, cheaper.** Copy and dispatch go LATE by rule 1 and rule 2 only; everything else is EARLY. R must beat R0 to justify using the loop facts.

**Tuning on dev.** The only tuning allowed is K ∈ {4, 8} and D ∈ {4, 8, 16}, on dev, and the full grid is reported.

**Cost.** Measure the rule pass's time as a fraction of frontend time. Count the lines added to the backend for the private lowerings. Both go into the article as costs.

---

## 8. Held-out protocol

1. **Split by program family, not by function.** Examples of families: tokenizer, UTF-16→UTF-8 encoder, hash, string compare, state-machine parser. Functions inside a family share idioms and would leak across a function-level split.
   - Aim for at least 8 families in held-out. Fewer clusters make cluster-bootstrap intervals too wide to support any conclusion, and that should be stated in advance.
   - If possible, write or collect the held-out families *after* freezing the rule.
2. **Freeze before compiling held-out.** Commit the rule file (R, R0, K, D), the analysis script, the thresholds from §9 and the primary metric. Record the hash with a timestamp *before* the held-out set is compiled. Do not inspect held-out site statistics before the freeze.
3. **One shot.** Held-out is measured once. Any change to the rule after that requires a new held-out set; the old one becomes dev.
4. **Target generalization.** Dev uses one ISA string, e.g. `rv32imc`. Held-out is measured on that string *and* on a second, pre-declared one, e.g. `rv32imc_zba`. Either:
   - R references target features explicitly, or
   - the claim "R is target-agnostic" is tested by this second configuration.

---

## 9. Metrics, analysis, and how the rule can fail

**Primary endpoint.** Commit to one of these before starting.

- **Option (a), if hardware is available.** Per-function cycles on one fixed in-order RV32 core:
  - code and data in SRAM/TCM,
  - interrupts disabled,
  - `mcycle`/`mcycleh` read with the hi-lo-hi retry,
  - calibrated against an empty-function harness,
  - median of repeated runs.

  Co-primary: static code bytes, including rodata, the trap stubs and the pc→site table.
- **Option (b), if no hardware.** Dynamic instruction count from an instruction-accurate simulator is primary. In that case the article will not claim speedups.

**Secondary endpoints.**

- dynamic instructions (mechanism),
- code bytes with and without C,
- compile time,
- per-op-kind breakdowns, labelled exploratory.

**Statistics.**

- Paired per-function log ratios against E.
- Geometric means with 95% **family-cluster bootstrap** CIs.
- Holm correction across the pre-registered comparisons: S vs E, S vs L, R vs R0, S vs S-rand.

**Noise floor τ.** τ comes from control C0 (§10). Any difference smaller than τ counts as a tie.

**Success.** R succeeds only if **all** of the following hold on held-out:

| # | Criterion |
|---|---|
| G | Zero equivalence divergences for S, on both ISA strings |
| 1 | S beats E on the primary endpoint (CI excludes 1), and S is not worse than E by more than τ on code size |
| 2 | S beats L on at least one co-primary endpoint and is not worse than L beyond τ on the other |
| 3 | S beats S-rand (selection matters, not only the retention fraction) |
| 4 | S with R beats S with R0, otherwise R0 is the recommended rule |
| 5 | Oracle capture `(E − S)/(E − O)` ≥ 0.5, where O is the per-function best of {E, L} |
| 6 | Held-out capture ≥ half of dev capture (overfit check) |
| 7 | No held-out family regresses against E by more than 2τ on the primary endpoint |

**Pre-registered outcomes other than success:**

- **Late is simply best.** 2 fails because L ≥ S. Recommend L and report that the rule adds nothing.
- **Early is simply best.** L and S fail 1. Recommend E, and report whether the reason was guard CSE (via E − L-null) or a weak target lowering (via L-null − L).
- **Identity is unnecessary.** E+peep comes within τ of L. Recommend keeping early expansion plus the peephole, and drop the private opcodes.
- **Overfit.** 6 fails.
- **Inconclusive.** CIs straddle 1 everywhere. This is reported as "underpowered," which is distinct from "no effect."

---

## 10. Anchored controls

- **C0 (A/A).** Build E twice with perturbed function order and link layout.
  - Dynamic instruction counts must be identical; if not, there is a harness bug, so stop.
  - The cycle spread defines τ.
- **C1 (refactor anchor).** After introducing `expand_generic`, E must be **byte-identical** to the pre-experiment compiler on the whole corpus.
- **C1′ (plumbing anchor).** With F1–F3 disabled in both, L-null must be byte-identical to E. This proves the private-op plumbing changes nothing except what optimization passes can see.
- **C2.** The E+peep arm.
- **C3.** The Wasm reference oracle (§6).
- **C4 (prior-study anchor).** Reproduce the prior literal-pooling study's own reported aggregate on its own anchor programs. If the result falls outside that study's stated noise, the harness differs; stop and reconcile before continuing.
- **C5 / C6.** The random-rule and inverse-rule arms.

---

## 11. Source/target interactions to record per site

**Source side:**

- index form: constant, induction variable, `i + k`, or loaded from another buffer,
- number of uses of the read value,
- loop nesting depth,
- same-buffer neighbors in the loop,
- whether the copy source is a literal (a pool interaction, held fixed),
- dispatch density.

**Target side:**

- **Zba.** Changes the address cost, which narrows L's advantage on reads.
- **C extension.** Compressed forms reach only x8–x15 and small offsets. Register pressure changes between arms therefore change code size; this is a real arm effect, so report bytes with C on and off.
- **B-type branch range (±4 KiB) to trap stubs.** Large functions may need trampolines; count them.
- **Misaligned access policy.** This decides whether `lw/sw` copies are legal at all.
- **Jump-table vs compare-tree cost.** This depends on the core's branch handling.

---

## 12. Physical limitations (state these in the article)

- **One core is not "RV32."** In-order vs. predicted-branch cores, and load-use latency, change the branch and dispatch results. Results generalize only to the measured core class.
- **Memory placement.** Flash wait states and prefetch buffers can make code size dominate cycles, so run from SRAM/TCM and report the placement.
- **Simulator limits.** QEMU is not cycle-accurate. Instruction-accurate simulators give dynamic counts, not time.
- **Trap paths are cold.** Their cost shows up only as code size and correctness.
- **Function-at-a-time compilation.** There is no cross-function sharing of tables or stubs, and no interprocedural guard elimination. A whole-module backend might change these conclusions.
- **Small corpus, few families.** Treat this as a feasibility-scale study, not a general benchmark.
- **The Wasm backend's performance is out of scope.** Only its correctness is gated.

---

## 13. Feasible implementation order

1. Equivalence harness and both oracles, then C0.
2. The `expand_generic` refactor, then C1 (byte-identical).
3. Private op records, opaque effect summary, L-null, then C1′ (byte-identical with opts off).
4. RV32 lowerings for copy, then dispatch, then branch, then read. Pass the equivalence gate after each.
5. E+peep, the rule pass, S, S-rand, S-inv.
6. Dev tuning of K and D only. **Freeze and hash.**
7. Single held-out run on both ISA strings.

---

## 14. What to send me later (aggregates only)

For each arm (E, L-null, L, S/R, S/R0, E+peep, S-rand, S-inv), each ISA string, and each split (dev, held-out), please send:

- number of functions, families and sites by kind, and retention fraction by kind,
- equivalence results: runs, divergences, and the op kinds that diverged,
- geomean ratio against E with the 95% cluster-bootstrap CI, for the primary endpoint, code bytes (C on and off) and dynamic instructions,
- the per-op-kind breakdown and oracle capture,
- the worst-family ratio,
- τ from C0, and the C1, C1′ and C4 pass/fail results,
- guard merges blocked in S, and trampolines inserted,
- rule-pass time fraction, and backend lines added,
- the freeze hash and timestamp.

Please do not include raw logs, traces, machine identifiers or credentials. I will write the article against whichever outcome in §9 the numbers support, including "early wins" or "inconclusive."
