---
Title: Blind representation design and first experiment diary
Ticket: PICOCALC-RENDER-LAB
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:33:10.882376838-05:00
WhatFor: ""
WhenToUse: ""
---

# Design: Bounded Token Index vs. Full Materialization for Full-Screen Snapshots

**Status:** Blind prediction, written before any measurement. I have not seen the source or run any benchmark. Each prediction below is a hypothesis for the operator's run to confirm or refute. Where I do not know a fact about the system, I mark it **UNKNOWN** and do not fill it in with a guess.

## 1. System as I understand it

- A handheld renderer with a 320×320 RGB565 display. One framebuffer is 320 × 320 × 2 = 204,800 bytes. This is the only memory figure I can derive. Total RAM is **UNKNOWN**.
- Event handling runs on a single core, one event at a time ("the event lane"). While a parse runs, no other event is dispatched.
- Every incoming message goes through a generic JSON parse before ordinary event dispatch. This includes messages that are not screen snapshots, such as button events.
- For each app, the renderer keeps the last accepted full screen so it can redraw that app after a restart.
- Three representative inputs:
  - **Table:** many strings and numbers. Long string values, few structural tokens per byte.
  - **Chess canvas:** many primitive tuples, for example `["rect", x, y, w, h, color]`. Many short numbers, a high token count per byte.
  - **Snake:** a small document sent at a high rate because the game moves continuously.

UNKNOWN items the operator must record before running:

- Implementation language.
- Allocator type.
- CPU clock and whether a cycle counter exists.
- Cache presence and size.
- Maximum message size in current traffic.
- Whether the text-drawing API accepts (pointer, length) or requires NUL-terminated strings.
- Where retained screens live: RAM only, or persisted to flash.
- Whether the transport header carries app id and sequence number outside the JSON.
- Display refresh rate.

## 2. The two representations

**Materializing parser (baseline).**
- Reads bytes and builds a tree of value nodes: objects, arrays, strings, numbers, booleans, null.
- Decodes strings into newly allocated buffers.
- Converts numbers to binary when it parses them.
- Once the tree exists, the input bytes can be freed.

**Bounded token index (candidate).**
- Reads bytes once and validates them.
- Writes one fixed-size record per token into a preallocated array with a fixed maximum capacity.
- Each record holds:
  - type (4 bits);
  - flags (4 bits): `has_escape`, `negative`, `has_fraction_or_exponent`, spare;
  - byte offset of the start;
  - byte length;
  - `subtree_end`, the index of the first token after this value. This lets a reader skip a whole object or array in one step.
- Strings are not decoded and numbers are not converted during the parse. The traversal does that work later.
- The input bytes must stay alive for as long as the index is in use.

**Record width is a decision variable, not a detail.** Test both widths, because the memory result can reverse depending on which one is used (§7):

| Width | Field sizes | Implied limits |
|---|---|---|
| Packed, 8 bytes | 16-bit offset, 16-bit length, 16-bit `subtree_end`, 8-bit type and flags, 8-bit pad | Input ≤ 65,535 bytes; token count ≤ 65,535 |
| Wide, 16 bytes | 32-bit fields | Larger limits |

## 3. Fairness rules for the comparison

The goal is that the measured difference comes only from "build a tree" versus "build an index". To that end:

1. **Same language, same build flags, same binary.** Both backends are compiled into one test executable on the target device. Host (desktop) numbers can be reported, but they are labeled as host numbers and are not used for the decision.
2. **Shared lexer.**
   - Both backends use the same byte-level scanner for tokenization, UTF-8 validation, and escape validation.
   - They differ only in what they emit: tree nodes or index records.
   - This removes "one lexer happens to be better written" as a cause.
3. **Shared conversion routines.** The same string-unescape function and the same number-conversion function are called by the materializer at parse time and by the index traversal at read time.
4. **Same limits for both.** Identical caps (§5) on bytes, tokens, depth, string length, and numeric range. A document rejected by one backend must be rejected by the other with the same error class.
5. **Same allocator conditions.** Run each backend under two configurations:
   - (a) the system's real general-purpose allocator, as it is used today;
   - (b) a bump arena for both.

   If the index only wins under (a), the win comes from avoiding the allocator, not from the representation. Report that explicitly.
6. **Equal output check.**
   - Full traversal produces the same draw-command list in both backends.
   - Its hash must match, and the final framebuffer hash must match.
   - Any mismatch invalidates the speed numbers for that input.
7. **Deferred work is counted.** Index timing always includes the string decoding and number conversion that the traversal performs. "Parse time" for the index alone is reported as an extra column, never as the headline figure.
8. **Cold and warm runs.**
   - Report the first run after a cache flush or a large unrelated memory sweep, if that is possible on the target.
   - Report the repeated-run steady state separately.
   - If a cache flush is not possible, mark cold numbers as **UNKNOWN**. Do not use warm numbers in their place.

## 4. Measured operations

| ID | Operation | What it shows |
|---|---|---|
| P | Parse only (materialize vs. index build) | Up-front cost; not a decision metric alone |
| F1 | Parse + one full traversal producing draw commands | Main comparison for a newly arrived screen |
| FK | Parse + K full traversals, K ∈ {1, 2, 4, 8, 16} | Repaints and redraws: when does deferred decoding stop paying off? |
| S | Parse + sparse lookup | Dispatch-time field access (see list below) |
| D | Discard: receive, validate, then drop because it was coalesced away | Cost of work that is thrown out |
| R | Restart redraw from retained state, sender idle | Restart path |
| E | Non-screen small event (button press) through the generic parse | Fixed per-event overhead |

The sparse lookup (S) is run at three key positions:

- **S1:** a top-level key that appears first, such as `"app"` or `"seq"`.
- **S2:** a top-level key that appears last.
- **S3:** a nested path, such as `rows[17].cells[3]` for the table or `pieces[40][2]` for chess.

S2 and S3 prevent a result that depends on the key happening to come first.

Metrics recorded per run:

- Cycles or µs: median, p99, max.
- Bytes scanned.
- Tokens produced.
- Tokens visited.
- Allocation count, free count.
- Peak heap during the operation.
- Bytes retained per app after acceptance.
- Longest time the event lane was blocked.
- Draw-command hash and framebuffer hash.

Use at least 200 repetitions per cell. If the device is too slow for 200, record the number actually run.

## 5. Explicit lifetime and memory budgets

All caps below are compile-time constants, the same for both backends. Proposed starting values are placeholders until the operator supplies real traffic sizes:

- `B_max`: input bytes per snapshot. Must be ≤ 65,535 for the 8-byte record.
- `T_max`: tokens per snapshot.
- `D_max`: nesting depth. A fixed stack, no recursion.
- `L_max`: decoded string length.
- Numeric range: integers must fit in int32; non-integers must fit the chosen float type.

**Retained state per app (index).** The index records point into the input bytes, so the bytes must be retained together with the index. To accept a new screen without destroying the current one before validation finishes, each app needs a current slot and a candidate slot:

```
per_app_index = 2 × (B_max + T_max × r)            r = 8 or 16
```

Alternatively, keep only the raw bytes and rebuild the index on restart:

```
per_app_index_raw = 2 × B_max                      (+ one shared T_max × r scratch index)
```

**Retained state per app (materialized).** The tree size depends on the content and on per-allocation overhead, which is **UNKNOWN** until measured. The operator reports the measured maximum over the corpus and its shape:

- node count × node size;
- plus allocator header × allocation count;
- plus decoded string bytes.

**Budget for the whole system.**

```
total = apps × per_app + one in-flight candidate + traversal scratch (≤ L_max for string decode)
```

The number of apps is **UNKNOWN**. Compute this formula and report it next to available RAM. If the index design's fixed, preallocated budget exceeds what the materializer uses in practice for small apps such as Snake, that is a real cost and goes in the report.

**Lifetime rules the harness must test:**

1. The index must never reference the transport receive buffer after that buffer is reused. On acceptance, the bytes are copied into the app's candidate slot, or received directly into it, and then the current and candidate slots are swapped.
2. A rejected snapshot must leave the current slot byte-for-byte unchanged. A partially written index must never become visible.
3. The decode scratch buffer is valid only during one traversal. Test re-entrancy: a dispatch handler that triggers another parse while a traversal holds the scratch buffer must not corrupt it. Because the system is single-core, this can only happen through nested calls, not through concurrency.

## 6. Correctness topics

### 6.1 Nested Unicode

The test corpus contains each of the following inside nested arrays and objects at depths 1, 4, and `D_max`, in both keys and values:

- Raw multi-byte UTF-8: 2-, 3-, and 4-byte sequences.
- `\uXXXX` escapes in the Basic Multilingual Plane.
- Surrogate pairs written as two escapes, such as `\uD83D\uDE00`.
- A lone high surrogate, a lone low surrogate, and a reversed pair.
- Overlong UTF-8 encodings, truncated sequences at end of input, and bytes 0xF5–0xFF.
- `\u0000` inside a string. In C, a NUL-terminated copy would silently truncate here.
- **An escaped key equal to a plain key:** `{"\u0074ype": "board"}` must match a lookup for `"type"`.

The last item is the most likely real defect in an index design. A lookup that compares raw byte spans will miss escaped keys. The lookup must check `has_escape` and, when it is set, compare decoded text. The materializer avoids this because it decodes keys at parse time.

The policy for lone surrogates (reject, or replace with U+FFFD) is **UNKNOWN**. It must be the same in both backends, and the corpus checks that it is.

Text truncation for the 320-pixel width must cut at a code-point boundary. Check that both backends produce the same truncated output.

### 6.2 Overflow rejection

Each of the following has a corpus case at the cap minus one, at the cap, and at the cap plus one:

- Byte length.
- Token count.
- Depth.
- Decoded string length.
- Integer overflow: `2147483648`, a 400-digit integer, `-2147483649`.
- Float overflow: `1e400`.
- `-0`.
- Leading zeros: `01`, which JSON forbids.
- With 16-bit records: input of exactly 65,535 and 65,536 bytes. This checks that offsets do not wrap.
- With 16-bit records: a subtree whose `subtree_end` would exceed 65,535.

Expected result for each case:

- Accept/reject is identical across backends.
- The error class is identical across backends.
- On rejection, the retained screen is unchanged.
- No out-of-bounds write. Run under the target's memory checker if one exists; whether one exists is **UNKNOWN**.

Semantic range errors, such as `x = 100000` on a 320-pixel screen, are a separate question from parse limits. Report them separately, and make sure both backends handle them identically.

## 7. Coalescing, idle-sender restart, skip/discard

### 7.1 Coalescing

When several full screens for the same app are waiting in the queue, only the newest needs to be drawn. How cheaply the older ones can be dropped depends on facts that are **UNKNOWN**:

- **Case A: app id and sequence number are in the transport header.**
  - Older snapshots can be dropped without scanning their JSON.
  - Neither backend does any work for them, so the representations do not differ here.
- **Case B: app id and sequence number are inside the JSON.**
  - Each queued message needs at least a scan to find those keys.
  - Index build is a full scan, so it does not reduce the bytes scanned compared with materialization. It removes allocations and frees.
  - A prefix scan that stops after the key is found would scan fewer bytes. It is valid only if discarded messages do not need full validation.

The acceptance policy is **UNKNOWN**: if the newest snapshot is invalid, does the renderer fall back to the next-newest valid one in the queue, or keep the retained screen? This policy decides whether discarded messages must be validated. The operator records the current behavior. The harness tests both policies and reports bytes scanned per discarded message under each.

Test load:

- Snake bursts of 2, 8, and 32 queued snapshots.
- One chess burst of 8.

### 7.2 Idle-sender restart

Procedure:

1. Send a screen.
2. Stop the sender completely.
3. Trigger an app restart, and separately a renderer restart if retention survives a renderer restart. Whether it does is **UNKNOWN**.
4. Redraw from retained state.

Pass conditions:

- The framebuffer hash equals the hash before the restart.
- After a sequence of "accept screen X, reject overflow screen Y, restart", the redraw shows X.

Costs differ by retained form:

- Retained materialized tree: redraw walks already-decoded values.
- Retained index: redraw decodes strings and converts numbers again.
- Retained raw bytes only: redraw rebuilds the index and then decodes.

If retention is persisted to flash, raw bytes can be written as-is. A tree must be serialized again or re-parsed. Flash write cost is **UNKNOWN** and is reported only if flash is used.

### 7.3 Skip and discard work

Record these as separate counters:

- Tokens skipped via `subtree_end` during sparse lookups, compared with tokens visited.
- Bytes scanned for messages that are later discarded.
- Free calls and time spent in free for a discarded materialized tree. A discarded index costs a count reset.
- Index initialization: whether it is O(1) (reset the count) or O(`T_max`) (clear the array). If the implementation clears the whole array, every small event pays `T_max × r` bytes of writes, which affects E.

## 8. Blind predictions

These are directional, with stated confidence. The ratio is index ÷ materializer, so below 1 means the index is better. They assume a general-purpose allocator; I expect the arena configuration to shrink every gap.

| # | Workload / op | Prediction | Confidence | Main uncertainty |
|---|---|---|---|---|
| 1 | Table, F1 time | 0.6–0.9 | Medium | Allocator cost per string; whether text API needs NUL-terminated copies |
| 2 | Table, retained bytes | 0.4–0.8 | Medium | Allocator header size; average string length |
| 3 | Chess, F1 time | 0.8–1.1 (near parity) | Low | Number conversion moved, not removed; tokens per byte |
| 4 | Chess, FK time | Index loses at some K; crossover K between 2 and 8 | Low | Cost of number conversion relative to node read |
| 5 | Chess, retained bytes, 8-byte records | ≤ 1.0 | Low | Node size of materializer |
| 6 | Chess, retained bytes, 16-byte records | ≥ 1.0 | Low | Same |
| 7 | Snake, F1 time | Inside noise threshold (§9) | Medium | Fixed setup cost dominates |
| 8 | Snake, retained bytes with preallocated `T_max` | > 1.0, possibly by a large factor | High | `T_max` chosen for the largest app |
| 9 | S1 sparse lookup (table, chess) | 0.1–0.5 | Medium | Index build is still a full scan |
| 10 | S2/S3 sparse lookup | Smaller win than S1, still < 1.0 | Medium | `subtree_end` skipping working as designed |
| 11 | D discard, Case B | Fewer allocations, same bytes scanned | High | — |
| 12 | R restart redraw | Materialized retained tree is faster; index pays decoding again | Medium | Fraction of escaped strings |
| 13 | E small event | Within noise if init is O(1); index worse if init is O(`T_max`) | Medium | Init implementation |
| 14 | Max event-lane block (largest table) | Index lower | Low | Peak cost may be dominated by bytes scanned, which is equal for both |

**Costs I expect to reverse between workloads, and the conditions that cause the reversal:**

1. **Retained memory:**
   - The index is smaller for long-string content such as the table.
   - The index can be larger for short-number content such as chess with 16-byte records, and for small documents such as Snake when the capacity is preallocated.
   - Causes: record width, tokens per byte, preallocation.
2. **Repeated traversal:**
   - The index wins at K = 1 and loses as K grows for number-dense content, because number conversion repeats on every traversal.
   - For the table, string spans can be used directly when `has_escape` is clear and the text API takes (pointer, length), so the crossover may never occur. If the API needs NUL termination, a copy is needed each time and a crossover can appear.
3. **Restart:** the representation that is cheaper to accept (index) is more expensive to redraw from (index), especially for chess.
4. **Allocator dependence:** under a bump arena, predictions 1 and 2 may move to parity. That would show the advantage is mostly allocator cost.

Rough reasoning behind predictions 5 and 6. These are assumptions to be replaced by measurement:

- Chess: if one token appears per about 3.5 input bytes, the index costs about N + (N / 3.5) × r bytes:
  - ≈ 3.3N with r = 8;
  - ≈ 5.6N with r = 16.
- A materializer using 16-byte tagged values costs about 4.6N, plus array headers.
- Table: one token per about 15 bytes gives an index of ≈ 1.5N. The materializer pays node, allocation header, and copied text per string.

## 9. What counts as a negative result

Before the run, fix the noise threshold as the larger of:

- 5% of the baseline median;
- twice the interquartile range of the baseline.

A difference smaller than this is "no difference". Do not change this rule after seeing data.

The result is **negative for adopting the index** if any one of the following holds:

1. **Correctness divergence:**
   - any draw-command or framebuffer hash mismatch;
   - any accept/reject disagreement;
   - any escaped-key lookup failure;
   - any rejected snapshot that alters retained state.

   This is negative regardless of speed.
2. F1 is not better than the noise threshold on at least two of the three workloads, with deferred decoding included.
3. The F1 advantage disappears under the arena configuration and the production allocator cannot be changed. That second condition is **UNKNOWN**; record it.
4. The total retained budget (§5) under the index exceeds the materializer's measured retained total, or exceeds available RAM.
5. p99 or max event-lane block time increases on any workload.
6. E, the small-event path, gets slower beyond noise, because every event pays that cost.
7. The sparse-lookup win appears only at S1 and not at S2 or S3.

A **partial result** is still reportable:

- **Index for dispatch and sparse access only:** S wins, F/R do not, and everything stays correct. The design is then: index for dispatch-time field access, followed by materialization of the accepted screen.
- **Per-app policy:** the reversal pattern above is confirmed. The design is then: index retained form for string-dense apps, materialized retained form for number-dense apps.

Either option should be described as what it is and not as a general win.

## 10. Claims that must not appear in the final article

1. "Zero-copy means zero parse cost." The index still scans and validates every byte.
2. "The index is smaller." This is false for some content and some record widths unless shown per workload.
3. Index parse time compared against materializer parse time with traversal decoding excluded.
4. Any comparison against a materializer in another language or from another library.
5. Host-machine results presented as handheld results.
6. Median-only reporting when p99 or max goes the other way.
7. "Correct" without the escaped-key, surrogate, NUL, and boundary-overflow cases passing in both backends.
8. Sparse-lookup speedups measured only for a key at the front of the document.
9. Memory figures that leave out the retained input bytes, the candidate slot, or allocator headers.
10. Any figure for an **UNKNOWN** item, such as RAM, clock, or app count, that was estimated rather than measured.

## 11. Deliverable

The operator returns the following. I then write the article from it without changing the predictions in §8.

1. **Harness source**, in one directory:
   - `lexer.*`: shared scanner and validator.
   - `materialize.*`
   - `index.*`: both record widths, chosen at compile time.
   - `traverse.*`: draw-command visitor for both backends, and sparse lookup.
   - `bench.*`: operations P, F1, FK, S1–S3, D, R, E.
   - `limits.h`: all caps, in one place.
2. **Corpus**, one file per case, generated by a script with a fixed seed:
   - three realistic workloads at three sizes each;
   - all Unicode cases from §6.1;
   - all boundary cases from §6.2;
   - the coalescing bursts from §7.1.
3. **`results.csv`**, one row per (backend, record width, allocator, workload, size, operation, cold/warm) with columns:
   `backend, record_bytes, allocator, workload, size_bytes, op, k, cache_state, reps, median_cycles, p99_cycles, max_cycles, bytes_scanned, tokens_built, tokens_visited, tokens_skipped, allocs, frees, peak_heap, retained_bytes, max_lane_block_cycles, cmd_hash, fb_hash, hash_match, accept, error_class`
4. **`conformance.txt`:** pass/fail per corpus case per backend, and agreement between backends.
5. **`environment.txt`:** every **UNKNOWN** item from §1, filled in by the operator, or still marked unknown.
6. **`budget.txt`:** the §5 formulas evaluated with the real values.

The final article will contain:

- the predictions next to the outcomes;
- which predictions failed;
- one of three recommendations: adopt, adopt partially (as described in §9), or reject.

---

# Step 1 Diary

## Prompt Context

I was asked, as the representation researcher, to write a blind prediction and experimental design about replacing full JSON materialization with a bounded token index for full-screen snapshots on a single-core 320×320 RGB565 handheld. The renderer keeps the last accepted screen per app for restart. The workloads are a string/number table, a chess canvas made of many primitive tuples, and a small moving Snake game. A generic parse runs before every event dispatch. I have no access to source code or the benchmark device. An operator will run the study and return data, and I will write the article afterwards.

## What I did

- Wrote down what I know about the system and listed what I do not know as explicit **UNKNOWN** items for the operator to fill in.
- Defined the two representations, including a concrete index record layout in two widths.
- Wrote fairness rules: shared lexer, shared conversion routines, same caps, two allocator configurations, output hash equality, deferred work counted.
- Defined seven operations, covering full traversal, repeated traversal, sparse lookup at three key positions, discard, restart, and small events.
- Wrote memory budget formulas and lifetime rules.
- Listed Unicode and overflow corpus cases.
- Described how coalescing and idle-sender restart affect each representation.
- Made 14 directional predictions with confidence levels and identified four cost reversals.
- Defined a negative result before any data exists.
- Listed claims that must not be made.
- Specified the files the operator returns.

## Why

- A prediction written after seeing data cannot be checked. Fixing the predictions, the noise threshold, and the negative criteria now makes the article falsifiable.
- The most common error in parser comparisons is counting the index's parse time while ignoring the decoding it moves into the traversal. Several rules exist only to prevent that.
- The three workloads differ in tokens per byte and in document size. I expect those two properties to decide the result, so the design keeps them separate instead of averaging them together.

## What worked

- Separating "bytes scanned" from "allocations" made it clear where the index can and cannot help. It cannot reduce bytes scanned during validation. It can reduce allocations, frees, and visited tokens.
- Writing the retained-memory formula showed that the index requires retaining input bytes plus a candidate slot. That cost is easy to leave out.
- Treating record width as a variable exposed a likely reversal in the chess memory result.

## What didn't work

- I could not produce numeric predictions with high confidence. I do not know the allocator, the node size, the token density, or the CPU. The ranges in §8 are wide, and several are marked low confidence.
- I could not settle the coalescing design. It depends on whether app id and sequence number are in the transport header and on the current acceptance policy, and both are unknown. The design tests both cases instead.
- I could not estimate the total memory budget, because RAM size and app count are unknown.

## What I learned

- The sparse-lookup advantage of the index is smaller than it first appears. The index is built by a full scan, so a lookup still costs a full scan; it only avoids allocation. Real early exit requires that the document is not fully validated, which is a policy choice, not a property of the representation.
- The restart path reverses the acceptance-time advantage. The index is cheaper to accept and more expensive to redraw from.
- Escaped keys are a correctness problem specific to index designs. A materializer decodes keys up front; an index that compares raw spans does not.

## What was tricky to build

- **Defining fairness.** If the two backends use different lexers, a speed difference may come from lexer quality rather than representation. A shared lexer fixes this but requires the harness author to restructure the existing parser. That is extra work and a possible source of new bugs in the baseline.
- **Defining "negative".** The index can lose on full traversal and still be the correct choice for dispatch. I added partial-result categories so that a mixed outcome is reported accurately and not reduced to win or lose.
- **Choosing a noise threshold** without any variance data. I used the larger of 5% and twice the interquartile range. That is a judgment call, written down before data so it cannot be adjusted afterwards.

## What warrants a second pair of eyes

1. The token-density assumptions behind predictions 5 and 6 (about 3.5 bytes per token for chess, about 15 for the table). These are not measured. If they are wrong, the memory reversal may not occur.
2. The proposal to retain raw bytes only and rebuild the index on restart. This trades restart time for memory. Someone who knows the restart frequency should judge whether that trade is acceptable.
3. Whether a shared lexer changes the materializing baseline enough that it no longer represents production behavior. If it does, also run the unmodified production parser as a third reference row.
4. The 16-bit record limits. Someone should confirm that current maximum message sizes fit within 65,535 bytes and 65,535 tokens.
5. The re-entrancy test for the decode scratch buffer. I do not know whether a dispatch handler can trigger a nested parse in this system.

## What should be done in the future

- The operator fills in `environment.txt` before running anything. Several predictions depend on those values.
- After the data returns, write the article with predictions and outcomes side by side, including every failed prediction.
- If the result is a partial adoption (index for dispatch only, or a per-app retained form), design a follow-up study for that specific configuration. This study does not measure the combined pipeline.
- If retention is persisted to flash, run a separate study on flash write cost and wear. That is outside this study.

## Code review instructions

Review the operator's harness with these checks:

1. **Shared code.** Both backends call the same lexer, the same unescape function, and the same number-conversion function. Search for duplicate implementations.
2. **Limits.** All caps come from `limits.h`. No backend has a hard-coded limit of its own.
3. **Deferred work in timing.** In the timed region for the index, traversal decoding happens inside the measured interval. Verify the timer start and stop positions for every operation.
4. **Equal output.** Hash comparison runs for every measured cell. A mismatch marks the row invalid in the CSV; the row is kept, not dropped.
5. **Rejection.** After a rejection, the retained slot is compared byte-for-byte with its prior contents.
6. **Index initialization.** Confirm whether it clears the full array, and report which.
7. **Offset width.** With 16-bit records, bounds checks occur before narrowing offsets, not after.
8. **Escaped keys.** Lookup code checks `has_escape` before comparing a key.
9. **Arena configuration.** The arena resets between repetitions, so peak-heap figures do not accumulate.
10. **Corpus.** Generated with a fixed seed and checked into the deliverable, so the run can be repeated exactly.

## Technical details

**Index record, 8-byte variant:**
```
struct tok8 {
  uint8_t  type_flags;   // low 4 bits: type; high 4 bits: has_escape, negative, frac_or_exp, spare
  uint8_t  pad;
  uint16_t start;        // byte offset into retained input
  uint16_t len;          // byte length of token text
  uint16_t subtree_end;  // index of first token after this value
};                       // requires B_max <= 65535 and T_max <= 65535
```
The 16-byte variant uses `uint32_t` for `start`, `len`, and `subtree_end`.

**Framebuffer:** 320 × 320 × 2 bytes = 204,800 bytes.

**Retained budget per app:**
- Index: `2 × (B_max + T_max × r)`.
- Raw bytes only: `2 × B_max` plus one shared scratch index.
- Materialized: measured.

**Noise threshold:** `max(0.05 × baseline_median, 2 × baseline_IQR)`. It is fixed before data.

**Operations:** P, F1, FK (K ∈ {1, 2, 4, 8, 16}), S1/S2/S3, D (Case A and Case B, both acceptance policies), R (app restart, renderer restart if applicable), E.

**Configuration matrix:**

```
backend {materialize, index8, index16} × allocator {system, arena} × workload {table, chess, snake}
× size {small, typical, max} × op × cache {cold, warm}
```
Cold cells are marked UNKNOWN if cache flush is not possible on the target.

**Repetitions:** ≥ 200 per cell, or the number actually run, recorded.

**Output files:** `results.csv` (schema in §11), `conformance.txt`, `environment.txt`, `budget.txt`, harness source, generated corpus.
