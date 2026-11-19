# Direct bounds proofs integration diary

## Step 1 · Put the direct proof in the shared function emitter

The numeric operand change was already in production at `4452064`. The bounds study had established that direct relations had a small repeatable yield on the unchanged world sources. The longer relational search found no additional sites in those sources. I integrated the direct rule where the shared parser emits object checks. It sees both operand formats before Wasm serialization or RV32 lowering.

### Prompt Context

**User prompt (verbatim):** [Supervisor diary, Step 1](01-compiler-integration-diary.md#step-1-trace-the-requested-merges-to-the-normal-compiler-entry-points).

**Supervisor assignment:** Integrate direct text bounds checks into the real compiler. Keep the earlier research sources untouched. Produce a host regression gate, differential evidence and per-world counts.

**Assistant interpretation:** Implement one small intraprocedural rule in the existing emitter for both targets. Discard the original check only if it is provably redundant at its own execution point.

**Inferred user intent:** Apply the useful compiler change without importing an experimental compiler or compromising correctness in native and Wasm worlds.

**Commit (code):** `e082ec3` — “Elide text bounds checks proven by direct signed guards”.

### What I did

- Added direct facts to `picocalc-os/compiler/typed-wasm.js`. They describe a signed nonnegative local or a signed strict upper bound by the current length of a specific receiver local.
- Made the Pratt parser preserve a narrow term identity for plain locals, length loads and literals. Comparisons produce separate fact sets for true and false. Arithmetic or opaque expressions discard term identity.
- Passed the appropriate outcome facts into short-circuit operands and intersected facts at merges. For an early return, only its false branch can fall through.
- Cleared facts after calls and potentially aliasing stores. Assignments invalidate any facts that depend on the old index or receiver local.
- Reset incoming bounds at repeated loop conditions. Used a tentative nonnegative-loop proof for a counter that starts known nonnegative and has a direct strict guard on body entry. A candidate stays valid only when the loop never assigns the counter or assigns it once, at body level, as `i = i + 1`.
- Buffered only the original check intervals whose removal depends on that tentative loop proof. After parsing the entire function, the emitter compacts intervals with confirmed proofs, preserving all other emitted operations.

### Why

The full solver and its metadata tree were appropriate for the host study. Direct proofs on the requested real source need only local identity, immediate path implication and loop treatment. Recording those facts while parsing avoids a second source pass and a graph search. The parser already knows the index evaluation order, the binding identity and the target code interval.

### What worked

The first Wasm gate validated the linked output for all three exact app sources. Files went from 49,089 to 49,065 bytes and Agenda from 67,429 to 67,417. Editor remained at 88,255 bytes and later matched byte for byte.

### What didn't work

An initial Node comparison tried to read the previous compiler through `execFileSync('git', ['show', '4452064:picocalc-os/compiler/typed-wasm.js'])` and got `Error: spawnSync git EPERM` in the sandbox. The comparison now receives a pinned compiler file made by shell redirection, which also prevents a timed or tested VM from invoking Git.

### What I learned

A direct signed comparison alone cannot establish the unsigned check. The proof also needs a separate nonnegative result for the same scalar. The useful Files loop requires that result at each backedge. An initial literal outside the loop only supplies the first iteration, so the implementation has to validate the update discipline.

### What was tricky to build

Two facts can have different lifetimes in one loop. The nonnegative counter proof survives a later header-aliasing store if the accepted increment still executes. The upper fact cannot survive that store. The emitter therefore keeps neither incoming upper facts nor ordinary facts about the first test at the repeated condition, and uses only the current condition's direct upper fact on body entry. It invalidates it as soon as an effect can mutate the header.

### What warrants a second pair of eyes

Check that calls and memory writes invalidate facts at the point their effects execute. Read the record field, arithmetic and nested-boolean parser cases for term leakage. An old term must not reach a new check through a syntactically different expression.

### What should be done in the future

Measure the cold cost of the production parser, especially on Editor, whose output is byte-identical. Keep that cost distinct from the cost of scanning a hot Files prefix and from the earlier numeric-only measurement.

### Code review instructions

Read `signedBound` and `FunctionEmitter.expr` first. Follow `beginLoop`, `assignBounds` and `codeUnitAddress`. Locate the final compaction before `finish` and verify that both the variable-width Wasm stream and the numeric operation array use positions in their own representation.

### Technical details

- The original unsigned object check can be omitted when `0 <= i < receiver.length` follows in signed order at the check point with an unchanged receiver header. Under those propositions the length is positive, so signed and unsigned comparisons agree.
- The loop update proof uses the fact that a true signed `i < receiver.length` implies `i <= INT32_MAX - 1`. An increment by one cannot wrap under that precondition. A mutating alias can change the value of the bound later, but cannot change that conclusion about the already tested local.
- The live fact cap is eight. The per-function deferred-check cap is sixteen. Cap exhaustion preserves the original check. A run of earlier literal declarations can fill the live set and prevent a later proof.
- Proofs apply to plain local indices passed to `charCodeAt` and `setCharCodeAt`. Both endpoint checks for nonempty `writeLiteral` remain present. Local-endpoint chains, affine arithmetic, effect summaries and interprocedural contracts are outside this pass.

## Step 2 · Qualify the unfused production entry points and failure cases

I added a reproducible comparison between the numeric-only baseline and the checked-in direct implementation. It links the unchanged app sources into their normal targets, decodes the typed numeric operation stream to count actual trap sites, and evaluates targeted fixture programs under both available host execution environments.

### Prompt Context

**User prompt (verbatim):** [Supervisor diary, Step 1](01-compiler-integration-diary.md#step-1-trace-the-requested-merges-to-the-normal-compiler-entry-points).

**Assistant interpretation:** Validate byte generation and semantics with effects and deliberate faults, and preserve the new ticket's evidence.

**Inferred user intent:** Give maintainers a compact, independent gate for compiler correctness and an honest measurement of what it changes in their apps.

**Commit (code):** `e082ec3` — “Elide text bounds checks proven by direct signed guards”.

### What I did

- Added `scripts/check-bounds.mjs` and `scripts/bounds-fixtures.typed`. The runner compiles both production frontends in separate VM realms. It uses Node's Wasm engine and the repository's RV32IM instruction model.
- Wrote exact independent oracles for signed-negative indices, wrapped indices, non-strict guards, pointer and scalar replacement, fields and Math position expressions, nested branches, boolean equality, short-circuit routes, aliasing stores, calls, loop assignment and early returns. Exercised the 16-range cap and a loop with rejected and accepted deferred ranges in the same function.
- Checked setter ordering with a call in the value expression that mutates the receiver header. An invalid index must still trap before the call and a previously valid index stores using the same address as baseline.
- Ran 545 inputs per configuration, comparing the return or original explicit trap and the full 16 KiB test application memory byte for byte. Of those inputs, 20 deliberately trap and 512 derive from a fixed seed.
- Counted the exact whole-world output from both typed emitters. Linked Wasm and RV32 ELF against identical reactors and recorded SHA-256s and sizes in `various/direct-bounds-parity.json`.
- Reran the optional-ELF and no-ELF forms. The repeated full JSON result matched the committed receipt with `cmp`. Ran `make -C picocalc-os test-apps`, which passed 62 tests.

### Why

A return-only comparison can miss invalid mutations. The chosen addresses keep the attempted loads inside linear memory in the most important cases, so Wasm's engine trap cannot replace a missing object check. A second source with revision-pinned code is a stronger oracle than rerunning a modified compiler in an invented compatibility mode.

### What worked

| World | Explicit bounds checks | Typed RV32 image bytes | Linked Wasm bytes | Linked ELF bytes |
|---|---:|---:|---:|---:|
| Files | 8 → 6 | 3,216 → 3,152 | 49,089 → 49,065 | 24,424 |
| Agenda | 35 → 34 | 16,232 → 16,200 | 67,429 → 67,417 | 66,364 |
| Editor | 376 → 376 | 87,544 → 87,544 | 88,255 → 88,255 | 240,452 |

Files removes its two `filesCompare` reads and Agenda its `entryPut` write. Both unchanged and candidate linked Wasm modules validate in Node. The linked ELF length stays constant because the reactor reserves a fixed slot. Editor's full linked images for both targets were byte-identical. The independent examiner also compared 1,200 host inputs, including 246 traps, and found no production correctness defect.

### What didn't work

No failures in the final qualification commands. Chained proofs intentionally fall outside the production rule. Device compilation, runtime and peak allocation require the supervisor's hardware experiment.

### What I learned

Selected reads and writes removed 96 bytes of typed RV32 instructions in total. Counting every native `ebreak` separately from object checks matters because division and remainder lowering emits additional traps. The static count is worth more than a total artifact size comparison for a padded native reactor.

### What was tricky to build

I included an overflow witness that makes the first read land on an addressable word rather than fault on a huge index. A loop guard compares an index of `2147483646` against a synthetic length of `2147483647`. Two increments then wrap to `INT32_MIN`, and the next access must still trap via the explicit unsigned check. The exact check counts also catch unsound elimination when an untested overflow would otherwise require billions of iterations.

### What warrants a second pair of eyes

The native model validates the emitted instructions and application memory. It does not model target exception handling and neither engine executes a full reactor replay in this fixture. Review the linked byte changes and the board qualification separately.

### What should be done in the future

If additional omissions justify work, start from a trace of hot checked sites. A change to span contracts or to alias and effect knowledge can expose bounds in Editor. A larger search or a larger fact cap should earn its own measured benefit.

### Code review instructions

Run from the repository root using Bash. The reactor directory is optional. The same reactors used for the saved receipt are in the qualification build's `build/esp-idf/main`.

```bash
ticket=(ttmp/2026/11/19/PICOCALC-COMPILER-INTEGRATION*)
snapshots=$(mktemp -d)
for revision in 4452064 e082ec3; do
  for module in typed-wasm typed-rv32; do
    git show "${revision}:picocalc-os/compiler/${module}.js" > "$snapshots/$revision-$module.js"
  done
done
node "$ticket/scripts/check-bounds.mjs" "$snapshots"
node "$ticket/scripts/check-bounds.mjs" "$snapshots" "$reactors" > "$snapshots/linked.json"
cmp "$snapshots/linked.json" "$ticket/various/direct-bounds-parity.json"
```

### Technical details

The fixture uses the production compilers directly, so there are no counters or source rewrites in its runtime comparisons. It counts typed checks by walking numeric opcodes rather than scanning arbitrary bytes for `0x00`. The RV32 trap count includes all typed `ebreak` instructions. The memory comparison covers application bytes and excludes the native ABI's stack. The fixture tests local object-bound behavior under the typed runtime contract and provides no isolation claim for native code.

## Step 3 · Preserve the reviewed candidate after the user clarified merge scope

The user clarified to the supervisor that the requested merge covered numeric operands and streaming. The direct proof already had host qualification, so its original commit and receipts remain useful as historical evidence for a future decision.

### Prompt Context

**User prompt:** See the scope correction in the [supervisor diary](01-compiler-integration-diary.md).

**Supervisor assignment:** Stop work on the production bounds change. Preserve evidence and make it independent of the upcoming revert.

**Assistant interpretation:** Keep the direct proof as a reviewable candidate revision and deliver a self-contained reproduction procedure.

### What I did

Changed the test runner to load both frontend and backend from pinned revisions `4452064` and `e082ec3`. Recorded their digests alongside the qualification results. Left the supervisor to handle the revert.

### Why

The live tree can move to the selected streaming implementation. The evidence needs to compare the same compiler versions after that change.

### What worked

The pinned mode reran the same regression cases and reproduced the same per-app output and behavioral totals.

### What didn't work

The first conversion command for the runner failed with Python's `SyntaxError: unterminated string literal`. The unrevised script then treated the new directory argument as a source file and reported `Error: EISDIR: illegal operation on a directory, read`. I applied the changes directly and reran both test modes.

### What I learned

Pinning only the frontend would still leave the tests exposed to the live native compiler's interface changes. The runner now uses both compiler modules from each review revision.

### What was tricky to build

Both compiler versions still use the same world adapters and reactor inputs. The evidence records the actual resulting modules and their input digests so changes in those inputs are visible during reproduction.

### What warrants a second pair of eyes

Keep conclusions about the reviewed direct proof distinct from conclusions about the selected integration.

### What should be done in the future

Re-evaluate the direct proof only under an explicit merge request and the relevant hardware measurements.

### Code review instructions

Use the same pinned-snapshot command in Step 2. The compiler files in the live tree can differ from either of the test inputs.

### Technical details

`various/direct-bounds-parity.json` describes the reviewed comparison and remains independent of whether `e082ec3` is present in the live compiler.
