---
Title: "Preregistered Design \u2014 Precise Dependency Invalidation for the Typed RV32 Fragment Cache"
Ticket: PICOCALC-NATIVE-WAVE
Status: active
DocType: design-doc
Topics: [picocalc, compiler]
Intent: long-term
---

# Preregistered Design: Precise Dependency Invalidation for the Typed RV32 Fragment Cache

**Status:** design only. No results exist yet, and none are reported here. Every expectation below is a prediction to be tested.

## 1. Baseline under study

The enclosed `fragmentSession` caches each function's pre-patch `words` and its `calls`, gated by two checks:

- **A whole-program descriptor.** This covers imports (with `awaitable`), all function signatures including `paramNames`, records, enums, distinct types, and `lowered.prefix/startFields`. Any mismatch nulls `priorRoot`. As a result, every signature or layout edit rebuilds every function.
- **Body-text identity.** `source.startsWith(old.body, fn.bodyAt)`.

Inside the cache, calls are stored as indices into `targets`, or as `{at}` for local targets. Call-graph `edges` are replayed from the cache. Final J offsets are patched in `compile`, and import calls become relocations that `linkSlot` resolves.

Within one descriptor, the index encoding is stable. Once cross-descriptor reuse is allowed, index-keyed storage becomes unsound. The study must fix this.

## 2. Arms

| Arm | Definition |
|---|---|
| **Clean** (new control) | Fresh session for every compile, with no prior. This is the ground truth. |
| **Conservative** (previous control) | The enclosed candidate, unmodified. |
| **Precise** (treatment) | Per-function keys with recorded read-sets (§3). |

The backend-version/ABI identity is supplied by the harness and is part of every key in every arm. A change to it invalidates everything.

## 3. Precise key

`key(f) = H(ABI-id, body text, f's own signature incl. paramNames and awaitable, readset(f))`

`readset(f)` is captured by instrumenting the compiler's query points while `f` is checked and lowered. Each entry is `(query, answer-digest)`:

1. **Global name lookup.** This covers both hits and misses. The digest records the binding kind (function, import, record, enum, distinct, absent) plus that binding's interface digest. Misses must be recorded so that a new global capturing a formerly local or absent resolution is detected.
2. **Function interface.** Covers params, result, awaitable, and import-vs-local. It does *not* cover target position.
3. **Type layout.** For every record whose size, alignment, or field offset is queried, the digest is the full `recordLayouts` entry. The closure is transitive: if an outer record embeds an inner record, the inner layout enters the read-set through the outer offset query.
4. **Enum value and width queries, and distinct-type underlying-type queries.**
5. **Async.** Any read of `asyncLayout`, `asyncSource`, `lowered.prefix`, or `startFields` is recorded by slice. If the prototype cannot attribute a slice to a function, the whole async digest enters the read-set of every async function.

**Storage change (required).** Call targets are stored by symbol (`fn:name`, `import:name`, or `local:offset`), never by index. On reuse they are re-resolved by name. `edges` are likewise stored symbolically and are revalidated against the current symbol table.

**Conservative fallback (time-bounded prototype).** Any query site the operator cannot instrument within budget must be listed. A function that touches an uninstrumented site falls back to the whole descriptor. Fallbacks are reported per kind and are never silently omitted.

**Commit rule.** Commit happens only after `compile` *and* `linkSlot` succeed. A failed step leaves the prior cache untouched.

## 4. Ground-truth oracle (independent of the treatment)

For consecutive versions *v → v′*, clean-compile both. A function is **unchanged** iff its pre-patch `words` and symbolic `calls` are identical across the two versions. This is captured at `lower` time, before J patching.

- **Soundness (function level):** `retained(Precise) ⊆ unchanged`.
- **Soundness (program level):** Precise output equals Clean output byte for byte in `image`, `entries`, `records`, `enums`, `distinct`, `relocations`, `importCount`, `signatures`, `asyncLayout`, `asyncSource`, and the linked ELF.
- **Precision:** `|retained| / |unchanged|`.

The oracle sets are computed and hashed before any Precise run.

## 5. Primary fixtures: current Editor and Chess

Use the existing `incrementalEdits` chain `base → body → bad → signature → layout`, plus a reverse chain `layout → base` to test reverting to a cached state.

- **body:** all other bodies retained, in both Precise and Conservative.
- **bad:** the parameter is added without updating callers. Must produce the same diagnostic as Clean and must not commit. The next step must start from the pre-`bad` cache.
- **signature:** Editor (`editorPreviewSlot`, 3 call sites) and Chess (`chessFrom`, 7 + 3 call sites). The callers' text changes, so they rebuild. Precise should retain every function the oracle marks unchanged. Conservative retains none.
- **layout:** Editor swaps `file`/`opening` and Chess swaps `cursor`/`selected`. Only functions whose read-set contains that record's layout should rebuild. Functions that merely pass the record by reference should be retained.

## 6. Closed-world adversarial suite

Each item is a minimal edit in which the body text of the hazard function is unchanged. Each item is applied to both Editor and Chess where it fits, written in real syntax by the operator.

| # | Hazard | Expected Precise behaviour |
|---|---|---|
| S1 | Rename a parameter so a body identifier now resolves to an existing global | Rebuild (own signature, lookup miss → hit) |
| S2 | Add a global with the same name as a local used in an unaffected body | Retain, because the local still wins (verified by oracle) |
| S3 | Turn a record name into a distinct or enum of the same name | Rebuild every function that resolves that name |
| L1 | Widen a field (e.g. bool → i32) without reordering, shifting later offsets and padding | Rebuild readers of later fields |
| L2 | Change the size of an inner record, with a reader of an outer field placed after it | Rebuild (transitive layout) |
| I1 | Reorder imports | Callers retained, but relocation indices must re-resolve by name |
| I2 | Flip `awaitable` on an import | Rebuild callers |
| E1 | Reorder enum members | Rebuild users |
| E2 | Append an enum member without changing width | Retain allowed only if the oracle confirms it |
| D1 | Change a distinct type's underlying type | Rebuild users |
| A1 | Edit the body of one async function | Every other async function's cached words must still match Clean. This also tests the **Conservative** arm, which does not key on `asyncLayout`. |
| A2 | Make a callee awaitable | Rebuild callers |
| K1 | Insert or delete a function, shifting `targets` | Retain others; calls re-resolve by symbol |
| K2 | Grow the first function | All addresses shift; retained words must contain no absolute or PC-relative references outside `calls` |
| K3 | Push a jump past ±1 MiB, or overflow slot capacity | Same `SyntaxError` as Clean |

**Literal pools.** First audit the emitter for any data that code reaches PC-relatively (`auipc` plus a load into the image).

- If such data exists, add fixture P1: change a pooled constant in one function while keeping the other functions' text unchanged. Pool entries must then be keyed and relocated.
- If none exists, record "no pools emitted" with the audit evidence and drop P1. Do not test a mechanism that is absent.

## 7. Worked fixture (illustrative pseudo-syntax)

```
record S { a: bool; b: i32; }
fn get(s: &S): i32 { return s.b; }   // readset: layout(S)
fn fwd(s: &S): i32 { return get(s); } // readset: fn:get iface
fn k(): i32 { return 7; }             // readset: ∅
```

The edit swaps `a` and `b`.

- `layout(S)` digest changes, so `get` rebuilds.
- `fwd` depends only on `get`'s interface `(&S) → i32`, which is unchanged, so it is retained. Its call is stored as `fn:get` and is re-patched by `compile`.
- `k` is retained.
- Oracle prediction: `unchanged = {fwd, k}`.
- Conservative retains ∅. Precise should retain `{fwd, k}` and produce bytes equal to Clean.

If Precise retained `get`, both the §4 subset check and the image comparison would fail.

## 8. Predictions and falsifiers

- **P1 (soundness):** zero Precise–Clean byte differences across all steps and fixtures.
  - **Falsified by** any single difference. No partial credit.
- **P2 (precision):** on every signature and layout step, Precise retains all oracle-unchanged functions except listed fallbacks.
  - **Falsified if** Precise retains ≤ Conservative on any signature or layout step.
- **P3 (adequacy):** knockout mutants, each disabling one read-set kind (lookup-miss, transitive layout, enum, distinct, async, symbolic targets, symbolic edges), must each fail at least one fixture.
  - **If a mutant survives,** the kind is reported as "unverified," not as sound.
- **P4 (timing):**
  - On signature and layout steps, Precise median compile time is below Conservative, with the 95% bootstrap CI of the difference excluding 0.
  - On body steps, Precise is no more than 10% slower than Conservative.
  - **Falsified if** either condition fails, or if Precise is slower than Clean on any step.
  - **Method:** 30 warm runs per arm per step, interleaved in rotating order on one machine, with `compile` and `linkSlot` timed separately and key and read-set overhead reported separately. Only aggregates are reported.

## 9. Policy lock

Before the first Precise run, commit hashes of:

- this document,
- the fixture sources and edit scripts,
- the oracle sets,
- the thresholds,
- the harness and ABI id,
- the analysis script,
- the list of fallback sites.

Any later change is logged as a dated deviation alongside the original. No threshold may be changed after any data has been seen.

## 10. Held-out fixture (delegated director)

After the lock, a delegate who has not read the Precise implementation authors a third program and a five-step edit chain. The delegate works only from the hazard list in §6.

- The sealed source hash is committed before unsealing.
- The oracle is computed from the sealed source, and the study is run once.
- Results are reported whether they pass or fail, with no tuning afterward.
- A held-out P1 failure overrides any primary-fixture pass.
