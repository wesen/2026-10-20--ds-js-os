---
Title: Blind System template design and predictions
Ticket: PICOCALC-RENDER-SYSTEM
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:38.385923576-05:00
WhatFor: ""
WhenToUse: ""
---

# Template Extraction for Declarative Screens: Experiment Design and Predictions

*Blind design. Nothing below has been measured. All numbers are predictions or thresholds.*

## 1. Question

Does sending a **resident, versioned template plus dynamic data** beat a **generic retained snapshot** for complete JSON screens? If it does, can a conservative extractor that was frozen after seeing only System capture most of the manual template's gain on a second program, JS Keys, without changing semantics?

## 2. Candidates (all costed on equal terms)

- **S0, full snapshot:** `JSON.stringify(tree)` on every frame. This is the reference oracle.
- **S1, generic retained snapshot:** the receiver keeps the last screen and the sender emits a keyed path diff. S1 gets the same string interning and dedup as the template candidates. Otherwise the templates would win on dedup that S1 could also do.
- **T-man:** a hand-written keyed template for Worlds, Handles and Buses.
- **T-ext:** a build-time source-to-source extractor. It is developed only on System and is hash-frozen before JS Keys source is opened.

Template cost includes:

- install bytes;
- version header;
- per-frame dynamic payload;
- **re-install after every invalidation**, amortized over the actual frame count.

Template costs are never reported per steady-state frame alone.

## 3. Extraction rule (conservative)

The extractor replaces a constructor argument only when the argument is a **maximal subtree that is a pure JSON literal**. The literal goes into the template, and the call site gets a slot reference.

**Guards (all must hold, otherwise leave the call unchanged):**

1. The callee is a static import from the UI module, is never reassigned, and is not shadowed in scope.
2. The constructor is allowlisted as "does not mutate or retain identity of its argument." Hoisting creates one shared object, so a constructor that does `props.sel = …` would leak state across calls.
3. The literal contains only:
   - finite numbers other than `-0`;
   - strings;
   - booleans;
   - `null`;
   - arrays;
   - plain objects with non-computed, unique keys.
4. It contains none of the following: identifiers, calls, spreads, getters or setters, a `__proto__` key, symbols, BigInt, `undefined`, holes, or template literals with substitutions.
5. Canonical serialization equals `JSON.stringify` of the literal evaluated at build time. This preserves key order, including the reordering of integer-like keys.

**Effects:** literals are effect-free, so evaluation order is preserved. The extracted subtree is deep-frozen in debug builds to detect mutation.

**Counterexamples the guards must reject:**

| Source | Why it must be rejected |
|---|---|
| `{__proto__: base}` | Sets the prototype; it does not create a key |
| `{w: -0}` | Serializes as `0` |
| `{w: 1e400}` | Becomes `null` |
| `{a:1, a:2}` | Duplicate keys; the last one wins |
| `{[k]: 1}` | Computed key |
| `{...cols}` | Spread |
| `const Text = wrap(Text0)` | Shadowed or reassigned callee |
| `{x: undefined}` | Key is dropped by `JSON.stringify` |

Constants reached through `const` identifiers are deliberately **not** extracted. The precision cost of that choice is measured below.

**Fallback:**

- If any guard fails, the call stays an ordinary constructor and the subtree travels as data.
- If the receiver's template hash does not match, it sends a NACK, the sender sends S0, and the template is re-installed.

## 4. Workload

The same scripted trace runs for each program (System, then JS Keys). It covers:

- every tab;
- an empty window (0 rows) and a maximum window (bounded N rows) for each tab;
- 50 refresh frames that change values, color, sparkline and status;
- 10 selection-only frames;
- 10 frames that change unrelated state, which should produce near-empty diffs;
- 5 title changes;
- 5 tab switches.

**Valid → invalid → replay:** templates are installed (valid). At a fixed frame the compositor drops its resident templates (invalid). The sender must detect this and replay. Every reconstructed screen must equal S0 byte-for-byte after canonicalization.

## 5. Metrics

**Bytes (deterministic):**

- wire bytes per frame;
- install bytes;
- total bytes including re-install.

Each is reported raw and after the shared dedup.

**Host time:**

- sender build and encode time;
- receiver decode and apply time.

Use `process.hrtime.bigint`, 30 runs, and report the median and p95 with a bootstrap 95% CI on ratios.

**Receiver work:** nodes materialized and nodes touched per frame.

**Code:** minified and gzipped runtime, plus the generator's output size on host.

**Source precision:**

- **Recall:** the share of truly constant bytes (constant across the whole trace) that T-ext captured.
- **False extractions:** this must be **0**.

Host JS bytes and time are **not** board cycles or flash. No board claim is made without a separate port.

## 6. Predictions (falsifiable)

| # | Prediction | Falsified if |
|---|---|---|
| P1 | On max-window refresh, S1 sends ≤25% of S0 bytes and T-man sends ≤15% of S0 bytes | Either bound is exceeded |
| P2 | On selection-only and unrelated-state frames, T-man saves <1.3× over S1 | Ratio ≥1.3× |
| P3 | With install included, T-man breaks even against S1 within ≤20 frames per tab | It takes >20 frames |
| P4 | T-ext recall is ≥70% of T-man's constant bytes on System and ≤50% on JS Keys | System <70%, or JS Keys >50% |
| P5 | There are 0 semantic divergences across valid → invalid → replay | Any diff from S0 |
| P6 | On refresh, T-man materializes ≥2× fewer receiver nodes than S1 | Ratio <2× |

The reasoning behind P2 is that tiny deltas make the two approaches converge. The reasoning behind the JS Keys bound in P4 is that JS Keys likely relies on `const` helpers, which the conservative rule skips.

## 7. Promotion thresholds and stopping rule

**Promote templates over S1** only if all of these hold over the full trace:

- total bytes, including re-install, fall by ≥30%;
- the p95 receiver time CI upper bound is ≤1.10× S1;
- runtime code grows by ≤2 KB gzipped (host).

**Promote T-ext** only if, on JS Keys:

- it delivers ≥60% of T-man's byte saving over S1;
- it has zero divergences;
- it has zero false extractions.

**Stop:**

- One frozen T-ext version is run once on JS Keys. There is no tuning after looking at the held-out program.
- Any divergence rejects that rule version.
- An inconclusive time CI means "no promotion," not "rerun until it is significant."

## 8. Minimal executable experiment

Build one Node file, `exp.mjs`, around the Buses tab only:

1. Build the ordinary constructor tree.
2. Implement S0, S1 and T-man encoders and decoders.
3. Run the trace: 0 and N rows, 20 refresh frames, 5 selection frames, 5 unrelated-state frames, and invalidation at frame 15.
4. Assert `decode(enc(f)) === S0(f)` on every frame.
5. Log `Buffer.byteLength` and timings to CSV.

T-ext is added only after this harness and its oracle pass.

## 9. Worked example

Source:

```js
Table({ columns: [{key:"id",w:4},{key:"name",w:12}, /*…7*/],
        rows: win.map(r => Row(r.id, r.name, r.rate, color(r))),
        selected: sel })
```

- `columns` is a maximal pure literal, and `Table` is an allowlisted import, so `columns` becomes template slot `@C0`.
- `rows` contains calls and is not a literal, so it stays dynamic.
- `selected` is an identifier and also stays dynamic.

The template is installed once with version 3:

```
{"t":"Table","columns":@C0,"rows":$0,"selected":$1}
```

A frame then carries only the version and the dynamic data:

```
{"v":3,"d":[[…rows…],2]}
```

If `columns` had been written as `COLS` (a `const`), the rule would skip it. That skip is the recall loss P4 is designed to expose.

The cost comparison is installed `@C0` plus re-install against S1, which also omits unchanged columns after the first frame. The measurements decide whether that difference is significant.
