# Online, budgeted elimination of redundant bounds checks in a streaming RV32 compiler: design and preregistered protocol

This document fixes the design and the protocol before anything is implemented. It contains no results. Every number marked **[DP]** is a design parameter I chose as a reasonable guess, not a measured value. Tables at the end are templates for your actual results.

---

## 1. The question

The compiler already emits a bounds check before every `charCodeAt` and every indexed buffer write. Prior work proved facts per function and chose passes offline. The constraint is now stricter. The compiler must decide, while it handles each completed function in source order, whether to spend analysis effort on that function. It may not re-parse and may not do whole-program analysis.

**Research question:**

> Can a deliberately limited redundant-check eliminator (RCE-L), run under an online policy with a hard budget proportional to IR size, keep most of the byte savings of running it everywhere? The cost must stay provably bounded, and observable behaviour must be unchanged, including traps and partial state.

**Not asked here:**
- loop or range analysis,
- hoisting checks,
- check widening or merging,
- interprocedural facts.

These exclusions are deliberate. Section 6 includes control inputs whose purpose is to show the pass does *not* do these things.

---

## 2. The candidate pass, RCE-L

### 2.1 What a check looks like

The emitter produces this per check:

```
local.get pos ; local.get recv ; load32 [recv+0] ; i32.ge_u ; if void ; unreachable ; end
```

Address calculation follows (`recv + 4 + 2*pos`, then load16u or store16).

- If the check passes, then `pos <u cap(recv)` held at that point.
- The unsigned comparison also rejects negative positions. The pass relies on this.

### 2.2 The only fact the pass uses

Key = (position operand, receiver local).
- The position operand is either `local.get n` or `i32.const k`.
- The two keys must be **syntactically identical**. The pass does no arithmetic reasoning: `i` and `i+0` are different keys, and `b[3]` does not imply `b[2]`.

A later check with the same key is redundant if, since the earlier check, none of these has happened:
- the receiver's capacity may have changed,
- either local may have been reassigned,
- control flow may have joined or entered from elsewhere.

Under those conditions the later check can never fire, so deleting it cannot change behaviour.

### 2.3 Why deleting only never-firing checks preserves trap and partial semantics

The pass never moves, hoists, or merges a check. It only deletes a check that is dominated by an identical check in the same straight-line region with no invalidating operation in between. In every execution, then:
- the same original checks fire,
- they fire in the same order,
- they fire after the same prefix of writes and host calls.

Consequences:
- **Trap identity is preserved.** Measured as source check-id, not PC; PCs shift when code shrinks.
- **Partial state at the trap is preserved.**
- Any optimisation that reorders checks would violate this. That is why reordering is out of scope rather than a later improvement.

### 2.4 Region boundaries: default-deny

A region is a maximal run of IR between boundary operations. The pass uses a **whitelist of transparent ops**. Anything not on the whitelist is a boundary and clears all facts.

**Always boundaries:**
- `block`, `loop`, `if`, `else`, `end`, `br`, `br_if`, `br_table`, `return`, `unreachable` — except the `if/unreachable/end` that belongs to a recognised check idiom.
- `call`, `call_indirect`, every host import. Host calls can change capacity, and any callee might call the host.
- Every lowering of `&&`, `||`, `?:`. These are control flow, even though in source they sit inside a single expression. This is the most likely place for a naive design to go wrong; see counterexample C5.
- Any memory operation not produced by the checked-access emitter.
- Anything the emitter does not tag.

**Not boundaries, but invalidating:** `local.set n` and `local.tee n` delete every fact that mentions local `n`.

**Checked u16 stores: a precondition decision, made in Stage 0 before any run.** A checked u16 store writes to `recv+4+2*pos` with `pos < cap`.
- If the allocator guarantees that buffer objects never overlap, such a store cannot overwrite any capacity header, so it is transparent.
- If that guarantee cannot be confirmed by reading the allocator and host code, checked stores become boundaries. This costs the `b[i] = b[i] + 1` case, which is the most valuable one.
- The decision is recorded before Stage 2 and not revisited.

### 2.5 Recognising checks robustly

Pattern matching IR alone is fragile. Instead:
- The emitter already knows when it is emitting a check. It records the check's IR offset in a per-function side list.
- The pass treats an offset as a check only if it is in the side list **and** the 7-op pattern matches exactly. In particular the comparison must be `ge_u`, not `ge_s`, and the load must be at offset 0.
- If the two disagree, that is an assertion failure, not a silent fallback.

### 2.6 The algorithm

**Emitter side, always on, O(1) work per emitted op:**
- `region_id` is incremented at each boundary.
- `checks_in_region` is counted.
- When a region closes, two things happen:
  - add `max(0, checks_in_region − 1)` to **U_f**;
  - if the region had ≥2 checks, append `(first_check_off, last_check_off)` to a region index. The index is capped at R_max entries **[DP: 64]**. Regions beyond the cap are simply not optimised, which is safe.

U_f is an exact **upper bound** on how many checks RCE-L can eliminate in function f. Each region's first check can never be eliminated, and the emitter's boundaries are the same set the pass uses or a subset of it. The boundary predicate must be **one shared function** used by both the emitter and the pass, so the two cannot drift apart.

**RCE-L(f, limit):**

```
for each (lo, hi) in region_index:
  facts = {}                                  # ≤ K entries [DP: K = 8], FIFO eviction
  for op at off in IR[lo..hi]:
    charge += 1; if charge > limit: stop      # abort is safe: everything already marked is justified
    if off is a tagged check with key k:
        if k in facts: mark_delete(off, witness = facts[k])   # witness = retained root check
        else: facts[k] = off
    elif op is local.set/tee n: drop facts mentioning n
    elif is_boundary(op): assert false        # by construction, cannot occur inside a region
apply deletions (each idiom is stack-neutral, so removing it is local)
```

**Bounds:**
- Memory: O(K) for the fact table plus O(R_max) for the region index, per function. Both are freed when the function is emitted.
- Time: at most `limit` inspected ops. A linear scan with O(K) lookups is constant work per op when K is fixed.

**Ablation arm, optional:** RCE-L-FULL scans the entire function without the region index. It measures whether the index earns its keep.

---

## 3. Features available up front

All of these are known when a function completes, at O(1) cost per emitted op:

| Feature | Use |
|---|---|
| \|IR_f\| | Budget credit |
| n_checks_f, n_regions_f, n_calls_f | Reporting and diagnostics |
| **U_f** | Gate. U_f = 0 means the pass is provably useless, so skipping costs nothing |
| source index of f | Order (fixed; no reordering in a streaming compiler) |

The gate on U_f = 0 is the main teaching point of the design. A cheap feature that is an exact upper bound gives a skip decision that loses nothing. A heuristic gate would be a guess about where the benefit is.

---

## 4. Policies compared

Credit accumulates in source order: before function f, `C += α·|IR_f|`. Each function also has a per-function cap `limit_f = min(C, β·|IR_f| + c0)` **[DP: β = 2, c0 = 32]**. After the pass runs, `C −= charge_f`. The total charge is therefore bounded by `α·Σ|IR| + c0·n_functions` by construction.

| Policy | Runs RCE-L on f when | Purpose |
|---|---|---|
| NEVER | never | baseline |
| ALWAYS | always, unlimited | byte-savings ceiling for RCE-L, since elimination only removes code |
| PROP(α) | credit allows, no gate | the requested proportional source-order hard-budget baseline |
| GATED(α) | U_f ≥ 1 and credit allows | candidate online policy |

- **α grid [DP]:** {0.05, 0.1, 0.25, 0.5, 1.0}.
- **τ** is fixed at 1 rather than tuned, because U_f is already an exact bound.
- **Reference only, not a policy:** an offline dynamic redundancy oracle (§7.4).

**What "always is best for bytes" implies.** Deleting a check never adds code, so ALWAYS is byte-optimal among these policies. The real comparison is therefore *bytes kept versus analysis effort and its worst-case bound*. Per-function monotonicity, `bytes(policy) ≤ bytes(NEVER)`, is asserted, not assumed. A violation means the RV32 lowering is not as local as believed, and must be investigated.

---

## 5. Assumptions to audit in Stage 0, before writing the pass

Each item is recorded as confirmed or refuted, with the code location that settles it.

- **A1.** Capacity changes only through host calls. Nothing asynchronous changes it: no interrupt handler, DMA, or callback that runs between instructions, **including on the board**.
- **A2.** Checked u16 accesses cannot overlap any capacity header. This is the allocator disjointness question; it decides the §2.4 choice.
- **A3.** Locals change only through `local.set` and `local.tee`.
- **A4.** No moving garbage collector or relocation of receivers except inside calls. Calls are already boundaries.
- **A5.** Strings and buffers share the header layout, and a receiver local's type is fixed in the typed subset.

If A1 fails, the pass is unsound in general. The fallback is NEVER, and the write-up reports that.

---

## 6. Test inputs

### 6.1 Corpus split, fixed before tuning

- **Dev** and **Holdout** are split by **program family**, not by file. Example families: tokenisers, UTF-16 hashing, base64 and hex codecs, small parsers, buffer builders.
- The holdout file list and its hash are recorded before Stage 3. Holdout is compiled exactly once, with the frozen configuration.
- If practical, add a **late holdout**: a few programs written or collected after the freeze, by someone who has not seen the pass.
- A **synthetic stress** set is reported separately and never mixed into realistic metrics. It includes very long straight-line functions, more than K distinct keys, more than R_max regions, and hundreds of checks.

### 6.2 Real bounded-index control inputs, where RCE-L should eliminate nothing

Choose these from real code, not invented code:
- `for (let i = 0; i < s.length; i++) h = (h*31 + s.charCodeAt(i)) | 0;` and similar hash, compare, and copy loops.
- Two-pointer scans; `while (p < end) { c = s.charCodeAt(p++); ... }`.

**Expected:** about 0 eliminations, because each iteration is its own region. These inputs:
- quantify what a loop or range analysis could gain, labelled as **out-of-scope residual** and not as a result of this work;
- catch over-eager elimination. Any elimination of a loop-carried check here is investigated as a possible bug.

### 6.3 Positive controls, where elimination is expected

- `b[i] = b[i] + 1`, `b[i] ^= k`. A read check and a write check share a key. This depends on the A2 decision.
- `(s.charCodeAt(i) - 48) * 10 + (s.charCodeAt(i) & 15)`. The same key appears twice in one expression with no control in between.
- `b[0]` used twice with constant keys.

### 6.4 Counterexample tests: must keep the check and must match NEVER exactly

| ID | Pattern | Hazard |
|---|---|---|
| C1 | `x=b[i]; host_resize(b,0); y=b[i]` | capacity change; the second check must trap |
| C2 | `x=b[i]; i=i+1; y=b[i]` | position reassigned |
| C3 | `x=a[i]; a=c; y=a[i]` with c smaller than a | receiver reassigned |
| C4 | `x=a[i]; y=c[i]` with c aliasing a, and with c distinct and smaller | different keys; no cross-key inference |
| C5 | `(p ? b[i] : 0) + b[i]`, `p && b[i]` then `b[i]` | control flow hidden inside an expression |
| C6 | `if (p) x=b[i]; y=b[i]` | join point |
| C7 | `b[i] + f() + b[i]`, with f resizing b | call inside an expression |
| C8 | `loop { x=b[i]; i++; br }` | back-edge |
| C9 | `b[i = j]` and other `tee` in the index | position not a plain `local.get` |
| C10 | more than K keys, then a reused early key | eviction must lose the fact, not keep a stale one |
| C11 | budget exhausted between the two checks | abort must leave later checks in place |
| C12 | `b[j]=1; b[k]=2; b[i]=b[i]` with i out of range | partial writes before the trap must match exactly |
| C13 | i = −1, i = 0x7fffffff, cap = 0, cap after a host shrink | edge cases of the unsigned compare |

Write these **first**. They must pass under NEVER and under a stub pass before RCE-L exists.

### 6.5 Differential fuzzing

- A generator produces straight-line and lightly branched functions. Ingredients: random interleavings of checked reads and writes over a small set of index and receiver locals, `local.set`, calls, host resizes, ternaries, and short-circuit operators.
- Run under NEVER and under ALWAYS with a random budget.
- Seeds and the number of cases **[DP: 10⁵ cases]** are fixed in advance.
- Everything is compared under the observability definition in §7.1.

---

## 7. Measurements

### 7.1 Observable behaviour, the correctness definition

For every program, input, and policy:
- return value;
- trap or no trap, and the **source check-id** of the trap, using an emitter-side table from PC to check-id;
- the ordered log of host calls with their arguments;
- a dump of all host-visible buffers at exit or at the trap.

All of these must be identical to NEVER.

### 7.2 Independent witness checker

- Every deletion records `(deleted_off, witness_off)`, where the witness is the retained **root** check.
- A separate checker of about 50 lines, sharing only `is_boundary`, verifies four things:
  - the keys are equal;
  - the witness is retained;
  - no boundary occurs in `(witness, deleted)`;
  - no `local.set` or `local.tee` of either key local occurs in that range.
- It runs on every compiled function in every suite.

### 7.3 Static and compile-time metrics

- **Exact native .text bytes**, per function and total, for each policy. Builds must be deterministic: compiling twice must give identical bytes. If RVC compression is used, report bytes and instruction count separately.
- Static checks remaining in native code.
- **Analysis charge** in inspected IR ops. This is the primary cost metric because it is deterministic.
- Emitter counter overhead, measured as wall time with counters on versus off.
- Pass wall time: median of N runs **[DP: N = 20]**, on a named host machine. Secondary to charge.
- Peak memory of the pass. The bound follows from K and R_max; report observed maxima as well.
- Counts of R_max overflows, K evictions, and budget aborts.

### 7.4 Dynamic metrics, from an emulator

- Executed checks per program and input. This is the primary runtime metric because it is deterministic.
- **Dynamic redundancy oracle.** Count executed checks whose `(pos value, receiver, cap)` was already checked and passed, with no intervening host call. This is an upper bound on what *any* check elimination could save dynamically, not what static analysis can achieve. It is used only to say what fraction of that bound RCE-L captures.

### 7.5 Board measurement, secondary and conservative

- Fixed clock; interrupts masked during measured regions where the platform allows.
- Read `mcycle` and `minstret` around the kernel.
- Warm-up runs, then M interleaved A/B repetitions **[DP: M = 31]**, alternating the order of NEVER and the selected policy.
- **Alignment control.** Smaller code shifts alignment, which on small cores with instruction caches can change cycles by more than the optimisation itself. Add a NEVER+pad build that inserts NOPs to reproduce the selected policy's layout shift. Its cycle delta from NEVER is the alignment noise floor.
- Report the median and the 95% bootstrap CI of the cycle delta per kernel.
- Name the board, core, cache configuration, and clock. The claim covers that board only.

---

## 8. Preregistered decisions

Thresholds marked [DP] are guesses chosen before seeing data. They are not changed after the data is seen. Any deviation is reported as a deviation.

**D0 — Soundness gate (hard; not a design parameter).** All of the following must hold:
- zero differential mismatches across the corpus, the counterexample tests, and the fuzz cases;
- zero witness-checker failures;
- zero eliminations in C1–C13 where the table says the check must stay;
- per-function byte monotonicity;
- U_f = 0 implies zero eliminations.

*If any fails:* stop, report the failure with a minimal reproducer, fix it, and rerun **all** stages, including a fresh fuzz seed set. The holdout result from a failed run is not reused.

**D1 — Is RCE-L worth having?** On dev, ALWAYS must remove at least **3% of static checks [DP]** or at least **0.5% of total .text [DP]**.
- *If not:* adopt NEVER and report a negative result. Include the bounded-index residual (§6.2) and the oracle gap (§7.4) as evidence of where the opportunity actually is.

**D2 — Policy selection, on dev only.** Choose the **smallest α** in the grid such that GATED(α) keeps at least **90% [DP]** of ALWAYS's .text savings.
- Report PROP at the same α for comparison.
- *If no α reaches 90%:* use α = 1.0 if its compile-time overhead is within D3; otherwise report the best retention reached and fall back to NEVER.

**D3 — Cost acceptance.** For the selected configuration, the total compile-time increase over NEVER must be at most **2% [DP]**, counting the emitter counters too, and the charge must stay within the analytic bound.
- *If violated:* report it, then try the next smaller α from the grid. This is the only post-hoc step allowed, and it is reported as such.

**D4 — Holdout confirmation, run once.** Run the frozen configuration on the holdout. Report retention and cost whatever the outcome.
- Holdout retention may fall below the D2 threshold. In that case, report the gap and do not retune on the holdout.
- "Generalises" may be claimed only if holdout retention is at least **80% [DP]**.

**D5 — Runtime claims.**
- A dynamic check reduction is reported as an emulator fact.
- A board speedup is claimed for a kernel only if the CI of its cycle delta excludes 0 **and** its magnitude exceeds the alignment-control delta.
- Otherwise report: "no runtime change detectable on this board beyond layout noise."

---

## 9. Staging plan

| Stage | Deliverable | Exit criterion |
|---|---|---|
| 0 | Assumption audit (A1–A5); the A2 decision; C1–C13 written; corpus split hashed | Tests pass under NEVER |
| 1 | Emitter counters, U_f, region index, check side-list; no transformation | U_f matches an offline count on dev; counter overhead measured |
| 2 | RCE-L, witness log, independent checker | D0 on unit tests, counterexamples, and fuzz |
| 3 | Policy harness; dev sweep over the α grid | D1, D2, D3 decided; configuration frozen and hashed |
| 4 | Holdout run | D4 |
| 5 | Emulator dynamic metrics; board runs with the alignment control | D5 |
| 6 | Report | — |

**Size target [DP]:** about 300 lines in total for the counters, the pass, the policy, and the checker, plus tests. If the pass grows well beyond that, the scope has drifted toward a general optimiser, and the drift itself should be reported.

---

## 10. Results templates (to be filled with actual data only)

**T1 — Correctness:** suite × policy → mismatches, witness failures, monotonicity violations.

**T2 — Static results (dev / holdout):**

| Policy | α | .text bytes | Δ vs NEVER | % of ALWAYS savings | Checks removed | Charge | Charge bound | Aborts |
|---|---|---|---|---|---|---|---|---|

**T3 — Compile cost:** counters on/off; pass wall time (median and IQR); peak table and index occupancy; evictions; R_max overflows.

**T4 — Dynamic:** per program, executed checks under NEVER and under the selected policy, and the oracle bound.

**T5 — Board:** per kernel, median Δcycles, 95% CI, and the alignment-control Δ.

**T6 — Controls:** eliminations on bounded-index inputs (expected about 0) and the out-of-scope residual check count.

---

## 11. Claims this design cannot support

- It finds nothing about loop-bounded indices. §6.2 exists to show that it does not.
- All savings are relative to this emitter's check idiom, this RV32 lowering, this corpus, and the named board.
- Soundness holds only under A1–A5 as confirmed in Stage 0. In particular, an asynchronous host resize anywhere invalidates the pass.
- "Online" here means source-order, single-pass, and no lookahead beyond the current function. It does not mean the policy is optimal among online policies.

When you send the actual results, I will fill in T1–T6, apply D0–D5 exactly as written, mark every deviation from this protocol, and write the final report.
