# Choosing when to analyze repeated bounds checks

Under the frozen admission rules, neither budgeted policy removed a bounds guard from any held-out program. The 640-cell Order policy and the narrower Selected policy produced images byte-identical to Never on Editor, Chess, Painter and the host workload. Always removed one guard in Chess, inside `chessMake`, and saved 32 bytes. That compilation charged 137,531 tape cells to the analysis. On the older Editor engine, Always found exactly one proof and both budgeted arms found none. The release product compiler is unchanged by this work, and these results give no reason to change it. A purpose-built control program confirms that the analysis and both budget arms do remove repeated guards when a function contains them in the recognized form.

## Three terms to know first

A typed checked access is a read such as `s[i]` where `s` has a buffer or string type. The compiler must make sure `i` is in range before it loads, so it emits a guard for every such read. On the native target each guard follows a fixed pattern that compares the index against the length in UTF-16 units and traps when the index is out of range.

The numeric streamed tape is the form the compiler works on while it streams a function. Each instruction is written as a run of numeric cells, and different instructions occupy different numbers of cells. An analysis that walks the tape has to decode each instruction's width to find the next one. A function's tape size is its length in cells. The cost figures in this article count the cells the analysis visited.

RV32 emission is the backend that turns the tape into 32-bit RISC-V machine code. The byte counts below are sizes of unlinked images from full product compiles. They are not device firmware sizes, and they say nothing about editor rendering or gameplay.

## The analysis under test

The analysis walks a function's tape and keeps a set of known guards. When it finds a guard whose index comes from a saved index-copy local or a constant, it records the pair of base and index. Locals are versioned, so every write to a local gives it a new version and an older guard on that local no longer matches. The known set is cleared at control flow, at writes and at calls. When a second guard matches a known one, the analysis removes that second guard. The address recalculation and the second load stay in the emitted code.

The following pseudocode illustrates the rule. It is not the compiler's source syntax.

```text
fn pair(s: string, i: int) -> int {
  let j = i          // saved index copy, version j#1
  let a = s[j]       // guard G1 on (s, j#1) recorded, then load
  let b = s[j]       // guard G2 matches G1, G2 removed, load kept
  return a + b
}
```

The next function keeps every guard.

```text
fn kept(s: string, i: int, k: int) -> int {
  let j = i
  let a = s[j]       // G1 recorded
  j = j + 1          // write, j becomes j#2, known guards cleared
  let b = s[j]       // G2 on (s, j#2) kept
  helper()           // call clears known guards
  let c = s[j]       // G3 kept
  if k > 0 { }       // control clears known guards
  let d = s[j]       // G4 kept
  return a + b + c + d
}
```

The primary pass also ignores inequalities established by conditional control.

```text
if j < len(s) {
  let a = s[j]       // guard kept, the comparison above is not used
}
```

## The four arms

Each arm decides which functions the analysis may visit during one compilation.

- **Never** visits no function.
- **Always** visits every function.
- **Order** has 640 cells per compilation. It walks functions in source order and admits a function when its tape fits the remaining budget. A function that does not fit is rejected and the walk continues with the next one.
- **Selected** uses the same budget and walk. It also requires a tape size from 24 to 192 cells inclusive and at least one buffer or string parameter.

A worked example with invented sizes shows the difference. Take five functions in source order with tapes of 300, 400, 150, 100 and 60 cells. Assume only the 150-cell and 60-cell functions take a string parameter. Order admits 300 and has 340 left. It rejects 400, admits 150 with 190 left, admits 100 with 90 left and admits 60 with 30 left. It charges 610 cells. Selected rejects 300 and 400 for size, admits 150, rejects 100 for lacking a string parameter and admits 60. It charges 210 cells.

These rules were frozen by the operator before the runs. They are narrower than the gate with proportional credit in the archived lead design, which this study did not test.

## What was compared

Three receipts record the runs.

- `various/01-bounds/heldout.json` comes from `scripts/01-bounds/02-heldout.mjs`. It covers a purpose-built control program and the held-out Editor, Chess and Painter programs under all four arms.
- `various/01-bounds/host.json` comes from `scripts/01-bounds/03-host.mjs`. It covers a ten-function host run and records image bytes and an execution step count.
- `various/01-bounds/older-editor.json` comes from `scripts/01-bounds/06-prior-engine.mjs`. It covers the older Editor engine.

For the current compiler each row records functions, accepted functions, charged cells, visited cells, guards seen, guards removed, bailouts, image bytes and changed functions.

## Results on the current compiler

Cells charged and guards removed per arm:

| Program | Functions | Always | Order | Selected |
|---|---|---|---|---|
| control | 9 | 1,153 / 2 | 600 / 2 | 447 / 2 |
| Editor | 119 | 35,883 / 0 | 636 / 0 | 633 / 0 |
| Chess | 82 | 137,531 / 1 | 639 / 0 | 637 / 0 |
| Painter | 24 | 7,332 / 0 | 640 / 0 | 497 / 0 |
| host | 10 | 1,175 / 0 | 460 / 0 | 201 / 0 |

Unlinked image bytes per arm:

| Program | Never | Always | Order | Selected |
|---|---|---|---|---|
| control | 3,268 | 3,204 | 3,204 | 3,204 |
| Editor | 89,168 | 89,168 | 89,168 | 89,168 |
| Chess | 256,400 | 256,368 | 256,400 | 256,400 |
| Painter | 23,848 | 23,848 | 23,848 | 23,848 |
| host | 2,876 | 2,876 | 2,876 | 2,876 |

Charged cells equal visited cells in every row. No row records a bailout. Neither budget arm exceeds 640 cells, and Order on Painter uses exactly 640.

The control program is the positive case for admission. Always visits 1,153 cells, sees 16 guards and removes 2, which shrinks the image from 3,268 to 3,204 bytes. Order admits 3 functions, sees 3 guards and removes the same 2 for 600 cells. Selected admits 6 functions, sees 14 guards and removes the same 2 for 447 cells. That is 38.8 percent of the Always cost. Only the function `repeated` changes in each arm.

On held-out code the picture is different. Editor under Always visits 35,883 cells and sees 204 guards with no removal. Painter visits 7,332 cells and sees 28 guards with no removal. In both programs Always proves nothing, so no admission policy built on this analysis could remove anything there. Chess under Always sees 141 guards and removes one in `chessMake`. Both removals in the control and the one in Chess each account for 32 bytes of image. Order and Selected admit 11 and 9 Chess functions and see 10 and 5 guards. Both miss `chessMake`. The receipt does not record that function's tape size or source position, so this article does not say which rule excluded it. The host run has identical bytes and 158,570 steps in every arm. Always sees 7 guards there and removes none.

Charged cells measure analysis work on the tape. No measured conversion to compile time or run time exists for them, and this article assigns them none.

## The older Editor engine

An older compiler had a two-guard engine that proves a repeated guard by searching earlier edges. This supplement tests the same admission policies against that actual search. During parsing the supplement collects, for each read, an immutable reference to the edge array and the identifiers that were already versioned. It defers each original search to function completion. When a search succeeds it sets the proven bit on the existing compact read operand. The Never and Always images match the original older compiler byte for byte.

The fixed policies gate only the search. Unconditional tracking, snapshots and the inherited loop lexer lookahead run in every arm, and charged cells cover the gated search alone.

| Arm | Accepted | Charged | Attempted | Edges examined | Proven | Bytes |
|---|---|---|---|---|---|---|
| Never | 0 | 0 | 0 | 0 | 0 | 64,856 |
| Always | 120 | 33,195 | 116 | 32 | 1 | 64,840 |
| Order | 11 | 638 | 9 | 3 | 0 | 64,856 |
| Selected | 8 | 619 | 12 | 3 | 0 | 64,856 |

The receipt lists 116 candidates across 120 functions. Always attempts a search for all of them, examines 32 edges and proves one read, which saves 16 bytes. No search in any arm reaches exhaustion. The Never, Order and Selected images share the SHA-256 `b54bf4d2a445a0144202239acbd05a5d307f5509203e8f31942f14b29c599dec`. Always has `31c735244aab03adc01165475232d2439aad5dfa5b3924016fe1ef099b9e0a8d`.

The sole proof is in `editorPreviewAppend`, a 263-cell function with two reads. That search examines 5 edges. Selected cannot admit the function under any budget because 263 exceeds its 192-cell ceiling. Order did not admit it either, and the receipt does not record how much budget remained when Order reached it. This proof comes from edge search, which the current primary pass does not have, and the current held-out Editor shows no removal even under Always.

## Correctness evidence

The held-out behavior check produces 1,603 exact independent outcomes on each arm, 101 of them traps, and the Wasm output is unchanged across arms. A targeted corpus runs 243 test states on each arm. Each state compares whether a trap occurred and the whole buffer contents. The states cover a mutable index, a branch that bypasses a guard, aliases, calls and stores between reads, and short and long literals. The summary receipts named above do not carry per-state results for the targeted corpus, so this article reports its design and size only.

## Physical board

The director heldout ran on the physical board as paired generated-workload trials, summarized by the median of each pairing. The bounds image was identical across arms, and the point estimate of the median effect was zero for every arm.

## Proof classes kept apart

Three proof classes appear in this study and none substitutes for another. The current streaming pass proves a repeat from a matching guard on the same versioned local or constant with no intervening control, write or call. The older engine proves a repeat by searching earlier edges. Inequalities from conditional control form a third class that the primary pass does not exploit, and this study makes no claim about it.

The evidence classes are separate as well. Image bytes show code size. Cell counts show analysis work. Behavior outcomes show that the arms agree on results and traps. The physical medians show run-time effect on one workload. A finding in one class says nothing about the others.

## Failed hypotheses

The first hypothesis held that a 640-cell budget would capture the held-out repeats that Always finds. Both budget arms missed `chessMake` in current Chess and `editorPreviewAppend` in the older Editor.

The second held that Selected's filters would steer the budget toward functions with guards. On the control program Selected saw 14 guards for 447 cells against Order's 3 guards for 600. On held-out code it saw 5 guards to Order's 10 in Chess, 0 to 1 in Painter and 3 to 2 in Editor, and neither arm removed anything.

The third held that the removed guards would show a physical effect on the director heldout. The image was identical and the median effect estimate was zero.

## Scope

The study covers one guard pattern on the RV32 path, four arms with frozen rules, three current programs plus a host run, a control program and one older Editor build. It removes second guards only. It does not remove address recalculation or repeated loads, and it does not use conditional inequalities. It reports no compile timing and no cycle cost. The release product is unchanged.

## Reproducing the method

1. Run `scripts/01-bounds/02-heldout.mjs` and compare its output with `various/01-bounds/heldout.json`.
2. Confirm that charged equals visited in every row and that Order and Selected never exceed 640 cells.
3. Confirm the byte counts in the tables above and that only `repeated` and `chessMake` appear as changed functions.
4. Run `scripts/01-bounds/03-host.mjs` and confirm 2,876 bytes and 158,570 steps in every arm of `various/01-bounds/host.json`.
5. Run `scripts/01-bounds/06-prior-engine.mjs` and compare with `various/01-bounds/older-editor.json`. Check both SHA-256 values, the single proof with five examined edges in `editorPreviewAppend`, and zero exhausted searches.

## Follow-up

Extend the held-out receipt with each function's tape size, source position, admission decision and rejection reason. That would show directly why both budget arms skipped `chessMake`, without changing any policy or the release compiler.
