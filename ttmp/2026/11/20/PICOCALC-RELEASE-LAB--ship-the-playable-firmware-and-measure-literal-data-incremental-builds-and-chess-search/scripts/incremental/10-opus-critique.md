# Independent critique: fragment-cache incremental build prototype

## Verdict

- **Narrow claim holds.** For these two apps and these three edit classes, cached builds are byte-identical to the stock compiler, and a body edit is faster when the cache is in RAM. The harness checks the whole ELF against the stock output (`equal`) and against a gold CRC, so each measured case validates itself.
- **General claim does not hold yet.** Nothing here shows that reuse is sound for arbitrary edits. The cache key is incomplete in ways the chosen edits never touch.
- **The diagnostic control never runs with the cache active.**
- **Several host rows are mislabeled or not comparable to the board run.**

## Invalidating flaws vs. testable extensions

| Issue | Class |
|---|---|
| The cache key may miss whole-program dependencies (async color, module-level declarations) | **Invalidating for a production soundness claim.** In the trial it is only a detected failure, because the CRC gate catches it. |
| Persisted state has no compiler/ABI identity | **Invalidating for persisted (FAT) use** across firmware versions. Not exercised in a single-session trial. |
| `bad` diagnostic test runs with the cache disabled | **Invalidates the diagnostic-parity claim** for the reuse path |
| Host `base/ram` row is undefined | **Invalidating for that row only** |
| `reusable` is a single slot; a lookup entry can exist without words | Latent bug, testable |
| Scan overhead, disk restore cost, too few samples | Testable extensions |

## Correctness gaps

1. **Cache-key scope (main counterexample).** The `functions` tuple records `[name, params, paramNames, result]`, but local functions carry no async or awaitable marker. Imports do record one.
   - Edit: in the async Editor, make a sync helper `H` await an awaitable import, changing only `H`'s body.
   - Unless `result` or `lowered.startFields` encodes `H`'s color, the descriptor is unchanged.
   - Every caller of `H` then has an identical body, so it is reused with sync call sequences, while stock would emit an await split.
   - The same reasoning applies to anything `Emitter.function` reads beyond the body text and the descriptor: top-level constants or globals, string or data interning, type aliases, export attributes.
   - The prior LAB2 used an older compiler with no async lowering, so it could not have exposed this.
2. **`lower()` trusts a single global `reusable` slot.** This only works if every `lookup(fn)` is immediately followed by `lower(fn)`. The passing CRCs show the current pipeline interleaves them, but nothing enforces it. A guard such as `reusable === next[fn.name]` costs nothing.
3. **Half-built entries.** `lookup` stores `{body, edges}` before lowering runs. If a function is looked up but never lowered (dead code, a wasm-only path, a throw mid-lowering), the next session reuses that entry and fails on `old.words.slice` with a TypeError.
4. **Aliasing.** The stored `edges` is the compiler's live array. Reconstructed off-table targets are bare `{at}` objects. Both are safe only while downstream code never mutates edges or reads other target fields.
5. **No identity in the state.** `identity.json` hashes the sources on the host, but the state written to FAT has no compiler hash, and the board never checks the identity of the compiler it loaded. "Supplied by the harness" is therefore an unverified obligation.

## Interpreting the results

- **Body edits** (118/119 and 81/82 functions reused):
  - Editor: 24.3 → 16.2 ms, a 33% saving.
  - Chess: 10.8 → 3.8 ms, a 65% saving.
  - The Editor keeps about 16 ms of work that cannot be reused (declarations, async analysis, linking, SHA). That sets an Amdahl ceiling.
- **Signature and layout edits** have zero reuse by design, because any descriptor change invalidates everything. These rows measure pure overhead:
  - +13–17% on three rows.
  - −7% on Editor signature, which is noise.
  - They say nothing about how well incremental builds handle such edits, and they cannot be compared with LAB2's selective invalidation.
- **Measurement noise is larger than some of the effects.**
  - Editor clean times range from 23.1 to 35.2 ms for nearly identical sources; base clean is 45% slower than body clean.
  - That points to order or warm-up effects.
  - Three samples per arm, with medians only, is not enough. Report every sample.
- **`base/ram` is unexplained.** It shows 19.6 ms (Editor) and 5.7 ms (chess) against stats of 0 reused. That is either a null-edit self-hit with the wrong stats attached, or an artifact. Define it or drop it.
- **Disk always loses on the host.**
  - Disk minus RAM is about 16 ms for both apps (a mostly fixed cost).
  - It is 15–24 ms even when the descriptor mismatches and the whole cache is thrown away.
  - Fix: store the descriptor hash in a header and check it before parsing the rest.
- **Host and board numbers are not matched.**
  - Host timings include the ELF SHA; the board CRC runs outside the timer.
  - The host has `disk` and `cold-cache` arms; the board has `empty-cache`, which always runs first in its loop, and a single `restore` sample.
  - Do not carry host speedup ratios over to the board.
- **Comparing with LAB2.** The new Editor has 119 functions plus async, there is no state cap (LAB2 had 40/256 KiB caps), and invalidation is coarse instead of selective. Compare state `bytes` against the old caps, and measure the PSRAM heap delta.

## Diagnostics

- **`bad` changes a declared signature, so the descriptor mismatches and the cache is disabled.** The test only shows that the `skipBody` pre-scan doesn't change the stock message.
- **Body-local error control.** Put an error in one function body only, for example `return (row % 36) * ;`. The descriptor then matches, 118 functions are reused, and the parity check means something.
- **Pre-scan control.** Add an unterminated string or comment, or an unbalanced brace, inside a body. `skipBody` runs before the Emitter and could pre-empt the stock error or misplace the body end.
- **Warnings.** If the compiler emits warnings from the Emitter, reused functions will silently drop them.

## Overhead

- **Every rebuilt function is lexed twice:** once by `skipBody`, then again by the Emitter. Take the body end from the Emitter's lexer position instead.
- **Per-call bookkeeping:** each call does a `targets.indexOf` lookup (O(calls × targets)), and the words are copied twice.
- **State size:** JSON stores the full body text plus decimal-encoded words. Consider a hash of the body text and a binary format for the words.

## Negative controls (recommended)

1. **Poisoned fragment (the main one).**
   - After `before`, flip one word in one reused entry.
   - Expected: CRC mismatch or a `complete ELF differs` error.
   - If the build still passes, the reuse path is not producing the output and the speedups mean nothing.
2. **Out-of-key dependency.** Run the async-color edit (or a module-level constant edit) from counterexample 1.
   - Pre-register it as "must not reuse."
   - A CRC failure here documents the key's boundary. It is not a harness bug.
3. **Stale-identity file.** Write the state with compiler A and load it with B's hash. The load must be rejected, which requires adding identity to the state.

## ESP32-P4 trial: pre-register before results

- Report every sample and rotate arm order, including the `empty-cache` and restore runs.
- Log on-device hashes of the loaded compiler sources and the ELFs.
- Record state bytes and the PSRAM high-water mark against the 40/256 KiB references.
- Treat a CRC failure in controls 1–2 as an expected result, and any failure in the body/signature/layout rows as a fault.
