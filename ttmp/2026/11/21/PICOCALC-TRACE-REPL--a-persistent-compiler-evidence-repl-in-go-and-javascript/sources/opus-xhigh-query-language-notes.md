# Lead notes — query.js 0.1.0 (PicoCalc compiler-evidence queries)

Author: lead query-language implementer (Opus). Scope: `query.js` and `test-cases.json` in this directory.
I had no shell access, so none of this code has been run. It has not been executed against the real
bridge, and every numeric expectation in `test-cases.json` is a workbook claim, not an output I observed.
The supervisor's first run is the first execution. See `investigator-diary.md` for the risks I know about.

## 1. Design in one page

* **One IIFE, three globals.** `(function (root, bridge) {…})(globalThis, __trace)` installs `q`, `a`
  and `profiles`. There are no other host globals, no paths, no modules and no `await`. Nothing writes
  to stdout. Every call returns a value or throws.
* **Plans are lazy and evaluation is synchronous.** Builders (`a.events()`, `row.timeline()`,
  `q.ir…count().at()`, `profiles.arm()…total()`, `q.compare`, `q.bundle`) return `Plan`s. `q.run(plan, opts)`
  or `plan.run(opts)` evaluates one. `q.run({ k: plan })` is accepted as a bundle. If an unevaluated
  plan is printed, it serialises to `{ plan, kind, note: 'not evaluated yet: q.run(plan) …' }`, so it
  never reads like a result.
* **Row plans stream with early stop.** `Rows.each(ctx, visit)` stops when `visit` returns true, so
  `changes().where(…).first()` only measures the prefix it needs ("lazy changes"). There are no
  generators, because Goja's support for them varies by version.
* **Original ordinals are never renumbered.** A function timeline is a filtered view of one
  `(variant, phase)` stream. `at(n)` addresses the original stream ordinal and then checks
  membership. Each error is specific: `ordinalOutOfRange`, `notInSelection` (it names the event's own
  header) or `ambiguousStream` (`a.events().at(n)` spans six streams).
* **Function membership.** An event is in `row`'s timeline when its header scope is the function
  `row`, a loop in `row`, a CGSCC containing `row`, or `[module]`. llc headers name no IR unit
  (`… (virtregrewriter) ***`). For those, the scope is read from the print (`# Machine code for
  function row:` or the `define` lines) and memoised per event.
* **Snapshots are one function in one print**, with
  `status ∈ available | absent | unavailable | unsupported`:
  * *available*: a `define … @f(…) … {` line through a line that is exactly `}`.
  * *absent*: a complete module print (`; ModuleID`) does not define `f`. This is a finding about
    the program, not a gap in the capture.
  * *unavailable*: the capture is missing the function. Reasons: `loopFragment`, `functionNotInPrint`,
    `noFunctionInPrint`, `functionNotClosed`, `machineCodePrint`, `noEarlierPrint`,
    `irPrintNotMachineCode`, `otherMachineFunction`.
  * *unsupported*: a body line the parser does not recognise. Every IR metric on that snapshot is
    then unsupported and the line comes back as a witness. A partial count is never returned.
* **The IR subset recognised** covers labels, `#dbg_*` records, comments (`;` outside quotes) and
  instructions whose opcode is among LLVM's 66 opcodes. Switch case lists and landingpad clauses are
  read as continuation lines. Only opaque-pointer IR is read; typed pointers (`i32*`) are reported as
  unsupported operands. Result types are derived for load, binary ops, `fneg`, casts, `icmp`/`fcmp`
  (giving `i1` or a vector of `i1`), `phi`, `select`, `freeze`, `alloca`, `getelementptr` and
  `call`/`invoke`. Other forms give `{error}`, which makes a `resultType` selector unsupported.
* **Value identity.** `pointer(row.argument(i))` resolves the i-th parameter from the `define` line
  *of each snapshot* and matches the load or store pointer operand exactly. `pointer('@g')` takes a
  global. `pointer('%work')` is refused with an explanation, because a printed local name is not an
  identity.
* **Caches** belong to the session, are bounded LRUs, and use only declarative keys:
  * `texts`: 96 entries or 24 MB, holding raw prints.
  * `snapshots`: 512 entries or 32 MB.
  * `values`: 8192 entries, keyed `snapshotKey#metricDefinitionKey`.

  Lambdas never enter a key, so a mutated closure cannot return a stale cached answer. The `where()`
  predicates are re-run on each evaluation. `q.cache()` shows hits, misses and evictions;
  `q.cache({ clear: true })` empties all caches.
* **Units are kept apart in every result:**
  * `events`: header records.
  * `rows`: rows of a result table.
  * `static instruction sites`: IR counts.
  * `executed guest instructions`, `executed direct stack loads|stores|accesses`, `executed packets`:
    dynamic work.
  * `machine-function property`: a boolean.

  `q.add` refuses mixed dimensions, double counting and different arms, regions or workloads.
  `percentChange` needs `{ denominator: 'before' | 'after' }`, and on a boolean it throws `typeError`.
* **Gaps are results, not errors.** Missing debug info, remarks, PC samples, the final image and loop
  fragments all come back as `status: 'unavailable'` with a `reason`, the evidence that was checked
  (digest, counts) and a `why`. Errors are kept for misuse (unknown names, a bad shape), in the form
  `[code] message\n  fix: …`. For unknown names the message adds a "Did you mean" suggestion and the
  list of valid names.
* **Strict records.** Lambdas receive Proxies that throw `unknownField` with the valid field list.
  Change rows always carry every key, `null` when it does not apply, so `c.skipped` is never a trap.

## 2. Public surface and exact return shapes (this release)

### Archive and events
| Call | Returns |
|---|---|
| `a.variants()` | `[{ variant, phases: [{ phase, events, streamSHA }] }]` |
| `a.streams()` | `[{ variant, phase, events, streamSHA }]` |
| `a.events(phase?)`, `run.events(phase?)` | `EventSelection` plan |
| `a.variant(name)` | `Run` (unknown → `unknownVariant` + suggestion) |
| `run.function(name)` | `FunctionHandle` (`unknownFunction` lists the names found in headers; it also reads llc prints if needed) |
| `row.timeline(phase)` | `EventSelection` restricted to `row`; phase aliases: `middle-end/opt/ir → middle`, `codegen/llc/machine → backend` |
| `sel.where(fn, { dependsOn })`, `.limit(n)` | same kind of selection; original ordinals kept |
| `sel.count()` → `q.run` | `{ kind:'count', value, unit:'events', of, streams, byStream:[{ variant, phase, streamSHA, events }] }` |
| `q.run(sel)` | `{ kind:'rows', of, unit, count, rows:[event…], truncated?, note? }` (200 rows by default; `{ maxRows }`) |
| `sel.select(f…)` / `.table(f…)` | rows of projected objects (unknown field → `unknownField`) |
| `sel.at(n)`, `.first()`, `.last()`, `.one()` | `EventPick`; `q.run` → event record, or `{ kind:'pick', status:'none'|'ambiguous', count, matches }` |
| `pick.select(f…)`, `pick.text()` | projected event; `{ kind:'text', ordinal, variant, phase, header, print, ref }` |
| `sel.ordinals()` | `{ kind:'ordinals', of, count, ordinals }` |

Event record: `{ variant, phase, ordinal, header, pass, passId (= pass), passName, when, scope, function, ref, …host fields }`.
`scope` is one of `{kind:'function', function}`, `{kind:'module'}`, `{kind:'cgscc', functions}`,
`{kind:'loop', loop, function}`, `{kind:'machineFunction', function, resolvedFrom:'print'}`, or
`{kind:'unresolved', note}`. The unresolved form appears only in bulk listings, which do not read
every print; selecting `scope`, picking one event or using a function timeline resolves it.

### States, excerpts, metrics
| Call | Returns |
|---|---|
| `pick.after` / `pick.before` | `StatePlan`. `before` is the after-state of the previous print of the same function (`derivedFrom`, `of`); with no earlier print it is `unavailable/noEarlierPrint` and the `fix` names `initialModule()` |
| `q.run(state)` | `{ kind:'state', status, reason, why?, state:<witness>, instructions, blocks, arguments:[{ index, type, name }], unsupportedLines? }` |
| `state.excerpt({ contains \| matches, context?, max?, scope?:'print' })` | `{ kind:'excerpt', status, query, scope, searchedLines, hitCount, hits:[{ line, column, text, offsetInPrint, streamOffset, context? }], truncated, source, offsetBasis, note }` |
| `state.text({ maxLines })` | `{ kind:'text', scope:'function'\|'print', function, source, lineRange, truncated, text }` |
| `q.ir.instructions().opcode(…).resultType(t).pointer(v).count()` | `Metric` (static instruction sites) |
| `….sites()` | `Metric` whose value is the list of matching lines |
| `metric.at(state)` (or `metric.at(pick)` = `.after`) | `MetricAt` plan; `.requireCoverage('function'\|'module')` |
| `q.run(metricAt)` | `{ kind:'measurement', status, metric, definition, unit, valueType, value, count, witnesses:[{ line, block, text }], witnessesTruncated, resolved:{ 'row.argument(0)':'%work' }, coverageRequired, state:<witness>, reason?, why?, unsupported? }` |
| `state.instructions()….uses()` | rows `{ def, defValue, user, userOpcode, operandIndex, operandIndexNote?, ref:{ …source, line } }` |

State witness: `{ variant, phase, ordinal, pass, header, ref, function, side, coverage, lineRange?, derivedFrom?, of? }`.
`streamOffset` is filled in only when `ref.end − ref.start` equals the UTF-8 length of the print, or
of header + newline + print. Otherwise it is `null` and `offsetBasis` says why.

### Timelines over metrics
| Call | Returns |
|---|---|
| `timeline.measure(metric)` | rows `{ variant, phase, ordinal, pass, header, function, status, value, reason, coverage, unit, ref }` |
| `….changes()` | rows `{ ordinal, pass, header, from, fromPass, before, after, delta, changed, transition, status, reason, skipped, endpointDelta, unit, ref }` |

`status` values for a change row:
* `known`: two full prints that are adjacent in the function timeline.
* `first`.
* `absent`, `unavailable` or `unsupported`: this print.
* `unknown`: the previous print was not available, so the predecessor is reset.
* `gap`: the two rows are not adjacent in the *unfiltered* function timeline. `skipped` lists the
  ordinals between them, `endpointDelta` holds the difference, and `delta` stays `null`.

### Machine
`q.machine.property(name)` is a boolean `Metric`; `q.machine.properties()` is the list of set
properties; `q.machine.names()` lists the 12 LLVM property names. The value is read from the token
list in `# Machine code for function f: …`. LLVM prints only the properties that are set, so a
missing token means false. `coverage` is `machineFunction` when `# End machine code for function f.`
is present, otherwise `machineHeader`. An IR print in the backend stream gives
`unavailable/irPrintNotMachineCode`.

### Profiles
| Call | Returns |
|---|---|
| `profiles.arms()` | `[{ arm, source:'execution'\|'typed', entry, digest, totals:[names], rowsVerified, contract }]` |
| `profiles.arm(name \| param)` | `ProfileSelection` (`typed-stock` → `typed["stock"]`; `arm('stock')` explains the prefix) |
| `.region('row')`, `.workload('opening-160-rows')`, `.total(m)` | `TotalPlan` |
| `q.run(total)` | `{ kind:'total', status, reason, arm, metric, value, recordedValue?, unit, dimension, category, scope:'dynamic …', region:{ name, requested, evidence }, workload:{ label, rowsVerified, verified, evidence }, contract:{ value, evidence }, source:{ profile, entry, digest, path } }` |
| `.describe()`, `.totals()`, `.samples()` | entry facts (totals, rowsVerified, rowBytes, sampleKeys, contract, otherFields) |
| `profiles.sources()`, `profiles.source(name)` | `[{ name, digest, status, error, entries }]`; `{ name, digest, data }` (a copy) |

A workload is *verified* only when `rowsVerified === 160`. If the entry contradicts the requested
workload, the result is `status:'unavailable', reason:'workloadMismatch'` and the number moves to
`recordedValue`. An entry with no `rowsVerified` is returned with `verified:false`, and
`matchOn('workload')` then refuses it. The contract comes from `entry.contract` if present, else
from the arm-name prefix `checked-`/`unchecked-`; `evidence` says which.

### Composition
| Call | Returns |
|---|---|
| `q.bundle({ k: plan })` | `{ kind:'bundle', outputs:{ k: result }, keys }` |
| `q.add(p…).label(s)` | `{ kind:'sum', label, status, value, unit, parts, formula, note? }` |
| `q.compare(b, a)` | `{ kind:'comparison', status:'available'\|'unavailable'\|'incomparable', before, after, valueType, unit, delta, matchedOn:{ key:{ before, after, equal } }, note?, reason? }` |
| `.matchOn(keys…)` | keys: `workload region checkedContract unit metric function phase variant stream` |
| `.percentChange({ denominator })` | adds `percent`, `denominator:{ side, value }` (zero denominator → `percent:null`) |
| `.asEndpoints()` | `kind:'endpoints'`, plus `interval:{ status, from, to, intervening:[{ ordinal, pass }], note }` |
| booleans | `equal`, `transition:'false→true'` |
| `q.explain(plan)` | `{ kind:'explain', root, nodes:[{ id, kind, label, inputs, consumers }], shared, sources, evaluation }` |

### Explicit capability gaps
| Call | Returns |
|---|---|
| `run.initialModule().sourceLocations({ function })` | `unavailable/missingDebugLocations` with `checked:{ variant, function, moduleDigest, functionDefined, dbgAttachmentsInFunction, compileUnits, diLocations, debugRecords }`. If debug info *is* present: `unsupported/debugLocationDecodingNotImplemented` |
| `run.initialModule().describe()` / `.state('row')` | digest, bytes, functions, debug facts / a `StatePlan` over the input module (metrics only) |
| `run.remarks().forEvent(e)` / `.forFunction(f)` / `.all()` | `unavailable/missingRemarksArtifact` (*no artifact*, which is different from *zero remarks*), plus the event witness |
| `q.joinPCs(profiles.arm(x), run.finalImage()).requireMatch(…)` | `{ kind:'join', status:'unavailable', reasons:[{ reason:'missingPCSamples', … }, { reason:'missingInput', input:'finalImage' }], required, note }` |
| `q.capabilities()` | table of capabilities, each with status and the call to use |

Others: `q.param.int/choice`; `q.run(plan, { bindings })`; reading an undeclared parameter in a
lambda → `undeclaredParam`; `q.fragment(name).on('irFunction', {m: fn => metric})` with
`row.with(fragment).m()` (the callback runs once and the label records the fragment);
`q.session.pin/pins/clear`; `q.status()`; `q.help(topic)`, with `.help()` on every facade and plan.

## 3. Workbook coverage

| # | Status in 0.1.0 | Notes |
|---|---|---|
| 01 | supported | count + `byStream` (streams and their digests) |
| 02 | supported | `run.events('middle'|'backend').count()`; backend ordinals start at 0 |
| 03 | supported | `at()` = original ordinal; `ordinalOutOfRange`; `ambiguousStream` across streams |
| 04 | supported | line, column, print offset; stream offset only when the ref span proves it |
| 05 | supported | argument resolved per snapshot; witnesses + `resolved` map |
| 06 | supported | bundle keeps both measurements |
| 07 | supported | lazy; predecessor reset after an unavailable print |
| 08 | supported | `gap` rows with `skipped`; `delta` null |
| 09 | supported | |
| 10 | supported | compare with default match on unit + metric |
| 11 | partly supported | def-use within one snapshot; `operandIndex` for binops, cmp, load, store, select, casts, gep, ret, br, switch, phi. Other users (notably **call**) get `operandIndex:null` + a note |
| 12 | supported | digest from `__trace.initialModule` |
| 13 | supported | loop fragment → `loopFragment`; a module print satisfies function coverage |
| 14 | supported | backend scope read from prints; `.one()` → ambiguous |
| 15 | supported | the token list is read exactly (no substring match) |
| 16 | supported | Boolean transition + interval; `percentChange` → `typeError` |
| 17 | supported | the excerpt plus `missingRemarksArtifact`; GCC remarks are never attached |
| 18 | supported | workload verified by `rowsVerified`; region `row` is an adapter convention, and `evidence` says so |
| 19 | supported | typed prefix; `q.add` checks dimension, categories and scope |
| 20 | supported | `matchOn` all four keys; contract from the arm prefix (stated) |
| 21 | supported | explicit denominator |
| 22 | supported | `missingPCSamples` and the missing final image are both reported |
| 23 | supported (simple) | the fragment expands once; no "caller contract" check on non-buffer first arguments |
| 24 | supported | `undeclaredParam` diagnostic; cached metric values are reused across bindings |
| 25 | supported (basic) | `q.explain` shows shared nodes; there is no pagination API (`maxRows` caps output, not scope) |
| 26 | supported | `profiles.arm(param)`; the machine observation stays tied to the normal build |

**Not supported in this release:**
* MIR instruction metrics (spills, copies, opcodes after isel).
* Decoding `DILocation`.
* Remarks import.
* PC samples and image registration.
* Per-row (y = 61) totals. `samples()` exposes the raw object, but there is no typed accessor,
  because I do not know its shape.
* Typed-pointer IR.
* `operandIndex` for calls.
* Excerpt and text on `initialModule().state()`.

## 4. Assumptions the supervisor should check first (most likely failures)

1. **The `__trace.text()` shape.** I accept a string, `{print}` or `{text}`. The header comes from
   `{header}` or the event row.
2. **Header formats.** New PM: `IR Dump After X on <unit> ***`. Legacy llc:
   `IR Dump After Name (id) ***`. If backend headers *do* name the function, my parser still treats
   them as legacy (`unresolved`) when the `(id)` form is present, which is harmless but costs one
   print read per backend event, once per session.
3. **Loop prints.** I detect `; Preheader:` and `; Loop:` lines and the header form
   `loop %x in function f`. Older LLVM headers (`on for.body`) would be treated as function names;
   their snapshot still comes out `unavailable`, but the loop would not be in `row`'s timeline.
4. **Execution and typed entries** must have a `totals` object to count as arms. Other top-level
   keys are ignored as metadata.
5. **`rowsVerified` on typed entries** is unknown to me. If it is absent, example 19 still works,
   but `matchOn('workload')` on typed arms will report them `incomparable`. That is deliberate.
6. **Goja features I relied on:** classes with getters, `Map`, `Proxy`, arrow functions, regex
   `m`/`g` flags, a class method named `function` and a prototype property named `with`. I avoided
   generators, lookbehind, named groups, `?.`, `??`, `Object.entries` and `Array.prototype.flat`.

## 5. Optimization challenges for the persona runs (no answer key)

These are written as tasks a compiler engineer would set. Each one names the population, the unit
and the comparator the persona must state, and none gives an expected number. The supervisor should
judge the reasoning (units, scope, coverage, provenance) from the transcripts, against facts the
supervisor computes separately.

1. **Who removed the capacity reloads?** In the checked build, find the pass invocation(s) after
   which the direct i32 loads from `row`'s first argument went down, and by how much. Then argue
   whether a pass that ran between two prints could have done it instead. Expect the persona to
   distinguish `known` from `gap` rows.
2. **SROA's footprint.** Show what the first SROA invocation on `row` did to allocation sites and to
   phi merges. Explain why "zero allocas" does not mean "no stack traffic at run time", and back the
   explanation with a dynamic total.
3. **Register allocation, done or half-done?** Find every register-rewriter invocation on `row`'s
   machine code and say which one may be called final allocation, citing the machine-function
   properties as evidence.
4. **LSR ablation write-up.** Report the effect of loop strength reduction on executed row work as a
   percent with an explicitly chosen baseline. State what else in the pipeline could have responded
   to the change.
5. **GCC vs LLVM fairness audit.** Before comparing the two compilers' row work, list every
   condition that makes the comparison meaningful. Show the tool's matching evidence, and say which
   conditions are only asserted by an adapter convention.
6. **Stack traffic budget.** For the typed-stock arm, give the total number of direct stack
   accesses and explain why adding instruction counts or packets to it would be invalid.
7. **Unchecked rerun (lab exercise).** Repeat challenges 1 and 3 on the unchecked variant without
   reusing any checked-build ordinal. Report absences, different ordinals and unavailable
   observations as such.
8. **What can't this archive tell you?** A manager asks which source lines of `row` are hot and why
   the loop was not vectorised. Answer with what the archive can and cannot support, with the
   evidence that was checked (digests, missing artifacts).
9. **Coverage trap.** Pick a loop-pass event and try to measure a whole-function metric there.
   Explain the response and find the nearest print that *can* answer.
10. **Filter-order trap.** Compute load-count changes over only the EarlyCSE invocations, then over
    the full timeline. Explain why the answers differ and which one answers "what did EarlyCSE do?".

What to count in each run:
* Failed steps by error code.
* `unknownTopic` names, which are the wishlist for new help topics.
* Plans returned without `q.run`, visible as the `not evaluated yet` note.
* Claims stated without a witness.
* Uses of the same unit across a percentage.

## 6. Findings for the living persona playbook (from building this, before any runs)

* **Separate scientific gaps from API errors, in the type.** Write `unavailable`, `absent` and
  `unsupported` as result statuses with a `reason`, the evidence checked and a `why`, and do not
  throw them. A thrown error tells the agent "you used the API wrongly", and it will permute the
  call. A status tells it "the archive cannot say", which is what it should report. Tests should
  assert that an unavailable result never reads `value: 0`.
* **Make "not evaluated" loud.** A lazy plan printed at the REPL serialises to a note with the
  evaluation call. This is the plan-builder analogue of the homolog-bench missing-`await` Proxy.
* **Original ordinals with a membership check.** `at(n)` on a filtered view either returns the
  original event or names the event and why it is excluded (`notInSelection` + the header). Never
  renumber silently.
* **Refuse printed names as identities, and say why in the error.** `pointer('%work')` is the
  natural guess. Accepting it would make answers depend on LLVM's spelling of a local.
* **Adjacency belongs to the result, not the reader.** Change rows carry `status: gap`, `skipped`
  and `endpointDelta`, with `delta: null`, so a persona who filters before differencing gets a visibly
  different answer instead of a plausible wrong one.
* **Every row has every key.** Strict Proxies are only safe if optional fields exist with `null`;
  otherwise strictness turns legitimate checks (`c.skipped`) into errors.
* **Name the source of each assertion.** Workload verification, region and contract each carry
  `evidence` (`rowsVerified=160`, "adapter convention", "arm name prefix"). Personas should be scored
  on whether they repeat the evidence class, not just the number.
* **Watch in the first batch:**
  * Calling `.after` on a non-event pick, such as a change row.
  * `profiles.arm('stock')`.
  * `q.archive(path)` copied from the workbook (now an error that says "no paths").
  * Reading `.value` on a plan without `q.run`.
  * Expecting `percentChange()` without a baseline.
