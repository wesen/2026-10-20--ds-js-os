# Investigator diary — query.js 0.1.0

Lead implementer (Opus). Environment: file Read/Write/Edit only. **No shell, no Node, no Goja, no
access to the archive.** I could not list the directory. Every claim below about behaviour is from
reading code, not from running it.

## Session 1 — reading (no code landed)

* Read `workbook.md` (26 examples), `homolog-playbook.md`, `persona-sessions.md` and `brief.md`
  (identical to the task prompt).
* Probed for an earlier design document and for an existing `query.js` (`README.md`, `design.md`,
  `examples.md`, `design-doc.md`, `worked-examples.md`, `AGENTS.md`, `manifest.json`,
  `test-cases.json`, `lead-notes.md`). None exist. The workbook is the only source for the earlier
  design's worked examples.
* **Fault:** I spent the whole turn planning and hit the output-token limit before writing a file.
  The lesson I took into session 2 was to write a runnable skeleton first and grow it by Edit.

## Session 2 — implementation, in increments

1. **Skeleton (Write).** Errors with code/fix and edit-distance suggestions, the bridge wrapper,
   bounded LRU caches, `Plan` with a synchronous `q.run`, and `q.run({k: plan})` as a bundle.
2. **Events.** Header parsing for new-PM (`… on row ***`, `[module]`, `(scc)`,
   `loop %x in function f`, `omitted because no change`) and for legacy llc (`Name (id) ***`, scope
   unresolved). Loaded the index with one `events('', '')` call. Added strict Proxies for lambdas, and
   `Rows` with early-stopping `each` instead of generators, because Goja's generator support varies
   by version.
3. **Selections.** `EventSelection` with `at()` on original ordinals, the membership check and three
   distinct lookup errors. Backend scopes are resolved lazily from the print. Added the archive, run,
   function handles and phase aliases.
4. **IR subset parser.** Function extraction (`define … {` through `}`), body lines (labels, `#dbg_`,
   instructions, switch/landingpad continuations), and type reading (primitive, `ptr addrspace`,
   vector, array, struct, named, typed-pointer detection). Wrote `memoryAccess` (load, store,
   atomicrmw, cmpxchg) and `resultTypeOf`.
5. **Snapshots and metrics.** Four statuses. Argument refs resolved per snapshot. Instruction
   metrics with witnesses and a `resolved` map. `MetricAt.requireCoverage`. `measure` and lazy
   `changes` with adjacency checked against the unfiltered function timeline.
6. **Machine properties and profiles.** Exact token-list parsing. Execution and typed adapters with
   the `typed-` prefix. Workload verification from `rowsVerified`. Region and contract carry
   evidence strings. Wrote `q.add` and `q.compare`: dimension, category and scope checks,
   `matchOn`, an explicit denominator, Boolean transitions and endpoints.
7. **Capabilities.** Params with an undeclared-read diagnostic. `initialModule()`: digest,
   debug-info facts, `sourceLocations` → `missingDebugLocations`, and `state(fn)` for metrics.
   Remarks (`missingRemarksArtifact`). `joinPCs` → `missingPCSamples` and the missing final image.
   Def-use `uses()`, fragments, `q.explain` and session pins.
8. **Help.** Topics with live variant and arm lists, aliases, plan-kind topics,
   `q.capabilities()`, `q.status()` and `q.cache()`. Then installed `q`, `a` and `profiles`.

### Faults found in self-review and fixed before handing over
| # | Fault | Fix |
|---|---|---|
| F1 | `select()` on an `EventSelection` went through `_derive` and produced an `EventSelection` holding *projected* records, so `plainEvent` would have read `scope.kind` of `undefined` | a projection is now a plain `Rows` |
| F2 | `basePositions` stored its adjacency map in `ctx.memo`, the same map that memoises plan results, so it could corrupt a shared timeline's result inside a bundle | separate `ctx.aux` |
| F3 | Listing `a.events()` would have read the print of every llc event to resolve its scope | bulk listings no longer resolve; picks, `select('scope')` and function timelines still do |
| F4 | `valueToken('%work')` (an untyped operand) parsed `%work` as a named *type* and returned `''` | fall back to the raw part |
| F5 | The store operand extraction filtered out `volatile i32 %v` and took the pointer as the value | strip the keywords instead |
| F6 | Change rows lacked `skipped`/`endpointDelta`/`transition` on non-gap rows, so the strict Proxy would throw on `c.skipped` | every key is always present |
| F7 | Change status flattened `absent` into `unavailable` | the snapshot status is kept |
| F8 | `limit()` had an inverted stop flag | rewritten |
| F9 | The earlier `paramReader`/`readParam` duplicated the later ones and ignored `dependsOn` | removed |
| F10 | `Plan.help()` on kinds missing from the topic map would *throw* `unknownTopic` | falls back to the index; `event` kind mapped |
| F11 | `intervalBetween` could call `stream(v, 'initialModule')` | guarded |
| F12 | A total for a requested workload contradicted by `rowsVerified` came back `available` | now `unavailable/workloadMismatch`, with the number moved to `recordedValue` |
| F13 | `q.add` over static counts of different states was accepted | `incompatibleScope` |
| F14 | Reading `.value`/`.rows`/`.status` on an unevaluated plan or metric was a silent `undefined` | non-enumerable prototype getters throw `notEvaluated` with the `q.run` fix |
| F15 | Cached metric values were returned by reference, so a caller mutating `r.witnesses` would change later answers | `computeMetric` returns a JSON copy |
| F16 | The class method named `function` and the property `.with` depend on Goja accepting keyword property names in class bodies | `Run.prototype['function']` (delegates to `functionNamed`) and `FunctionHandle.prototype['with']` |

## Evidence and commands

None were run. I could not execute anything, so I have no outputs, timings or failures to report.
`test-cases.json` lists expressions with `expect` values taken from the workbook (each case names
its source) and structural `check` predicates. Treat every one as **unverified against the real
archive**.

## Known risks (review in this order)

1. **Goja syntax.** Keyword property names: `function:` keys in result objects, `.function` reads,
   and the user-facing `run.function(…)` / `row.with(…)` (now assigned by bracket key). Also getters
   in classes, `Proxy`, and `Object.defineProperty` getters on `Plan.prototype`. If the REPL's
   display walks prototype getters, printing a plan would throw `notEvaluated`. In that case, delete
   the `RESULT_FIELDS` block near `newContext`.
2. **Bridge shapes.**
   * Whether `text()` returns `{header, print}`. I accept a string, `.print` or `.text`.
   * Whether `events()` rows carry `ordinal` as a number.
   * Whether `profileSHA` / `initialModule` exist. Absent methods give `noBridge`;
     `profileSHA` failures become `digest: null`.
3. **Header forms in the real streams.** Check a few `a.streams()` rows and one llc header. If llc
   headers carry `on row`, the legacy branch is skipped automatically, unless the `(id)` form also
   appears.
4. **The IR parser on real prints.** One unrecognised body line makes a snapshot `unsupported`.
   Check that `q.run(middle.at(74).after)` has no `unsupportedLines`, and if it has some, they show
   what to add. Likely candidates:
   * attribute groups on call lines (fine: they are inside instruction text);
   * `uselistorder` directives;
   * new opcodes from a newer LLVM, which would mean adding names to `OPCODES`.
5. **Workbook-claim mismatches.** If test 05 returns something other than 6, check:
   * `resolved['row.argument(0)']`, which should be `%work`;
   * the witnesses (are they `load i32, ptr %work`?);
   * whether a load prints a pointer with attributes (`ptr noundef`? Not expected for loads).

   If 07 differs, inspect `middle.measure(hdr).table('ordinal','pass','status','value','reason')`
   around 70–75, looking for an unexpected `unknown`/`gap` caused by a loop event that sits between
   73 and 74 in `row`'s timeline.
6. **Typed entries.** Example 19 needs `typed.stock.totals.stackLoads` and `stackStores`. If the
   adapter's region or workload assertions are wrong for typed runs, the evidence strings say so,
   and they are the place to correct it.

## Review guidance for the supervisor

* Run `test-cases.json` in order. Its `setup` defines `run`, `row`, `middle`, `machine` and `hdr`.
* For each failure, send back: the exact error string (code + fix), or the result object with
  `status`/`reason`/`state`. Include `q.status()` once.
* Ask these questions in code review:
  * Does any path return `0` or `[]` where the capture is missing? (It should not; search for
    `value: 0`. There are none by construction.)
  * Does any cache key include a function body? (None should; keys are strings built from stream,
    ordinal, function and metric `key`.)
  * Is every unknown name answered with a valid list and a suggestion? (`unknownName`.)
* **Not done** (listed in `lead-notes.md` §3):
  * MIR body metrics;
  * DILocation decoding;
  * remarks import;
  * PC join;
  * per-row sample accessor;
  * call `operandIndex`;
  * pagination beyond `maxRows`.
