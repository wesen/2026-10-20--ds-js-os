---
Title: "Trace REPL JavaScript API Reference"
Slug: "trace-repl-js-api"
Short: "Every session global, method, result shape, status and error code of the trace REPL's JavaScript API."
Topics:
- trace-repl
- compiler-evidence
- javascript
- api-reference
Commands:
- eval
Flags:
- arg
- args-file
IsTopLevel: true
IsTemplate: false
ShowPerDefault: true
SectionType: GeneralTopic
---

This page lists what a trace REPL session offers to JavaScript, global by global. It is a reference: it states each member's arguments, what it returns and what it refuses. It does not argue for the design. For the concepts behind the archive API (plans, states, timelines, statuses and units), read `trace-repl help trace-repl-user-guide`. For complete scripts, read `trace-repl help trace-repl-query-examples`. The running service is the final authority: every global and most objects answer `.help()`, and `q.help(topic)` expands each concept.

## How to read this reference

The archive half of the API separates plans from eager values, and the tables mark every member with one of three kinds:

| Kind | Meaning |
| --- | --- |
| **plan** | Returns a description. Evaluate it with `q.run(x)` or `x.run()`. Reading a result field such as `.value` on a plan throws `[notEvaluated]`. |
| **eager** | Returns a plain value immediately. |
| **handle** | Returns an object that builds plans or values, such as a variant, a function or a selector. It is neither a plan nor a result. |

The workbench half (`compiler`, `rv32`, `repo`, `results`, `stats`) is ordinary eager JavaScript. Signatures use `?` for optional arguments, and `{a, b}` for an options object. Names in `code` are literal.

## Session environment

A session is one goja VM with standard ECMAScript built-ins. It has no `require`, no `import` and no host module loader. Besides the globals below it provides:

| Name | Description |
| --- | --- |
| `args` | The parameters of the current cell or job: a fresh object per cell, `{}` when none were sent. It cannot be shadowed by a top-level declaration or deleted; `globalThis.args = {...}` replaces it for the rest of the cell. |
| `console.log`, `info`, `debug`, `warn`, `error` | Captured into the response's `console` array as `{kind, message}`, up to a limited size. |
| `performance.now()` | Milliseconds with sub-millisecond resolution, for timing work inside a cell. |

| Global | Present when | Section |
| --- | --- | --- |
| `q` | always (`--archive` is required) | q: the query engine |
| `a` | always | a: the archive |
| `profiles` | always | profiles |
| `hardware` | always; data calls need `--device-study` | hardware |
| `simd` | always; data calls need `--simd-study` | simd |
| `compiler` | always; reads the repository | compiler |
| `rv32` | always | rv32 |
| `repo`, `mounts` | always | repo and mounts |
| `results` | always | results |
| `stats` | always | stats |

## q: the query engine

| Member | Kind | Description |
| --- | --- | --- |
| `q.version` | value | API release string, `"0.1.0"`. |
| `q.help(topic?)` | eager | Overview, or one topic: `plans`, `events`, `timeline`, `states`, `metrics`, `changes`, `machine`, `profiles`, `compare`, `capabilities`, `params`, `results`, `errors`, `cache`. An unknown topic throws `[unknownTopic]`. |
| `q.run(x, {bindings?, maxRows?})` | evaluates | `x` is a plan, or an object whose every value is a plan (which yields a bundle result). An already evaluated result or a `describe()` descriptor is returned unchanged, but options with it throw `[alreadyMaterialized]`. Anything else throws `[notAPlan]` with `err.got` and `err.fix`. Bad options throw `[unknownOption]` or `[badArgument]`. |
| `q.bundle({name: plan, ...})` | plan | Evaluates several plans and keeps them apart: `{kind: "bundle", outputs, keys}`. |
| `q.add(t1, t2, ...)` | plan | Sums disjoint categories of one dimension and scope: `{kind: "sum", label, status, value, unit, parts, formula}`. `.label(text)` names it. Different units throw `[incompatibleUnits]`; the same quantity twice throws `[doubleCount]`. |
| `q.compare(before, after)` | plan | Compares two results of one kind (see "Comparisons"). |
| `q.joinPCs(profileSelection, imageRef)` | plan | Joins dynamic PC samples to an image. `.requireMatch(...keys)` names the identities that must agree, such as `"imageSHA"` and `"addressSpace"`. In the ROW-IR archive it is `unavailable` with `reasons` `missingPCSamples` and `missingInput`. |
| `q.explain(plan)` | eager | `{kind: "explain", root, nodes: [{id, kind, label, inputs, consumers}], shared, sources, evaluation}`. Evaluates nothing. |
| `q.param.int(name, {min, max, default})` | handle | Declares an integer parameter. Read it in a predicate through `ctx.param(p)` and list it in `dependsOn`; bind it with `q.run(plan, {bindings: {name: value}})`. |
| `q.param.choice(name, values)` | handle | Declares a parameter limited to `values`. It can stand in for an arm name: `profiles.arm(p)`. |
| `q.fragment(name).on("irFunction", {member: fn => metric, ...})` | handle | A named, versioned bundle of metric definitions (`"picocalc.row.v1"`). `fn.with(fragment)` returns an object whose members build each metric once per function handle. The only target is `"irFunction"`. |
| `q.session.pin(result, note)` | eager | Records a result in the session's pin list. `q.session.pins()` returns `[{id, note, result}]`, and `q.session.clear()` empties the list. Pins never change plans. |
| `q.capabilities()` | eager | `[{capability, status, reason?, use?}]` for the mounted archive. |
| `q.status()` | eager | `{version, bridge, archive: {variants, streams, ...}, ...}`: what the engine has loaded. |
| `q.cache({clear?})` | eager | The bounded caches `texts`, `snapshots` and `values`, each with `entries`, `maxEntries`, `approxBytes`, `maxBytes`, `hits`, `misses` and `evictions`. `{clear: true}` empties them. |
| `q.ir.instructions()` | handle | An unbound instruction selector (see "Instruction selectors and metrics"). |
| `q.machine` | handle | Machine-function properties (see "Machine-function properties"). |

## a: the archive

| Member | Kind | Description |
| --- | --- | --- |
| `a.variants()` | eager | `[{variant, phases: [{phase, events, streamSHA}]}]`. |
| `a.streams()` | eager | `[{variant, phase, events, streamSHA}]`, one entry per stream. |
| `a.events()` | plan | Every event of every stream (see "Event selections"). |
| `a.variant(name)` | handle | A run (see below). An unknown name throws `[unknownVariant]` and lists the valid ones. |
| `a.stats()` | eager | Counters of the engine's archive bridge: `inflatedBytes`, `moduleLoads`, `profileLoads`, `profileReads`, `streamInflations`, `textReads`. |
| `a.help()` | eager | Event fields and scope kinds. |

### Runs

`a.variant(name)` returns a run: one variant with its streams and initial module.

| Member | Kind | Description |
| --- | --- | --- |
| `run.name` | value | The variant name. |
| `run.phases()` | eager | `[{phase, events, streamSHA}]`. Phases are `middle` (opt) and `backend` (llc). |
| `run.events(phase)` | plan | Every event of one stream. An unknown phase throws `[unknownPhase]`. |
| `run.functions()` | eager | Function names defined by the initial module. |
| `run.function(name)`, `run.functionNamed(name)` | handle | A function handle; the two are the same call. An unknown name throws `[unknownFunction]`. |
| `run.initialModule()` | handle | The module before any pass (see below). |
| `run.renames()` | eager | `[{from, to, ordinal, method}]`. `method` is `"alias"` (GlobalOpt resolved an alias of a vanished function) or `"body"` (a new name carries exactly the vanished function's last body). |
| `run.finalImage()` | handle | An image reference, an input to `q.joinPCs`. It is not a plan. |
| `run.remarks()` | handle | `.forEvent(event)` is a plan for optimization remarks. It is `unavailable` (`missingRemarksArtifact`) without a remarks file. |

The initial module, `run.initialModule()`:

| Member | Kind | Description |
| --- | --- | --- |
| `describe()` | eager | `{kind: "initialModule", variant, digest, bytes, functions, debug: {functionDefined, compileUnits, diLocations, debugRecords, ...}}`. |
| `digest()` | eager | SHA-256 of the module text. |
| `functions()` | eager | Defined function names. |
| `state(function)` | plan | The function's state before any pass. |
| `sourceLocations({function})` | plan | Debug locations. It is `unavailable` with `missingDebugLocations` and the module digest when the module has no debug info. |

### Functions

`run.function(name)` returns a function handle.

| Member | Kind | Description |
| --- | --- | --- |
| `fn.name`, `fn.variant` | value | Identity. |
| `fn.argument(i)` | handle | Argument `i`, resolved separately in every snapshot from that print's `define` line. Use it with `pointer()`. A snapshot with fewer parameters makes evaluation throw `[noSuchArgument]`, naming the parameters it has. |
| `fn.timeline(phase, {follow?})` | plan | The function's timeline in one stream: its function and CGSCC events, loops it is shown to own, loops whose owner is not shown, and module prints. With `follow: true`, earlier names are used before each rename, and measurement rows carry `function`, `followedAs` and `rename`. |
| `fn.events(phase)` | plan | The same as `fn.timeline(phase)`. |
| `fn.initialState()` | plan | The function in the initial module. |
| `fn.aliases()` | eager | Earlier names, newest first: `[{name, ordinal, method}]`. |
| `fn.with(fragment)` | eager | The fragment's members bound to this function. |

### Event selections

`a.events()`, `run.events(phase)` and `fn.timeline(phase)` return event selections. Every method below returns a new plan or an eager value, and never renumbers ordinals.

| Member | Kind | Description |
| --- | --- | --- |
| `.at(ordinal)` | plan | One event at its original ordinal. Out of range throws `[ordinalOutOfRange]`, naming the valid range; an ordinal outside the selection throws `[notInSelection]`. |
| `.where(pred, {dependsOn?})` | plan | Keeps events for which `pred(event, ctx)` is truthy. `ctx.param(p)` reads a declared parameter. |
| `.select(...fields)` | plan | Rows with only these fields. An unknown field throws `[unknownField]`. |
| `.table(...fields)` | plan | The same as `select`, as a table of rows. |
| `.limit(n)` | plan | The first `n` events. |
| `.first()`, `.last()` | plan | `{kind: "pick", status, of, count, ...}` with the event; `status: "none"` and `count: 0` when the selection is empty. |
| `.one()` | plan | The only event; with several, `status: "ambiguous"` and `matches` lists them. |
| `.count()` | plan | `{kind: "count", value, unit: "events", of, streams, byStream}`. |
| `.ordinals()` | plan | `{kind: "ordinals", of, count, ordinals}`. |
| `.list()` | eager | The matching events as an array, immediately. |
| `.measure(metric)` | plan | One measurement row per event (see "Timelines"). |
| `.describe()` | eager | The plan's label, for example `a.variant("checked").function("row").timeline("middle")`. |
| `.run()` | evaluates | `q.run(this)`. |

Event fields, available to `where` and `select`:

| Field | Description |
| --- | --- |
| `variant`, `phase`, `ordinal` | Identity. `ordinal` counts from 0 in the original stream. |
| `header` | The header line, for example `IR Dump After EarlyCSEPass on row`. |
| `pass`, `passId`, `passName` | `pass` is the new-PM class (`EarlyCSEPass`) or the llc pass ID (`virtregrewriter`); `passId` equals `pass`. |
| `when`, `function` | Header details and the function the header names, when it names one. |
| `scope` | `{kind, function, ownerHint?}`. `kind` is `function`, `module`, `cgscc`, `loop`, `machineFunction` or `unresolved`. For a loop whose owner is not shown, `function` is `null` and `ownerHint` is a tentative proximity hint. |
| `ref` | `{variant, phase, streamSHA, ordinal, start, end}`: the print's byte range in the verified, inflated stream. |

An event, `selection.at(n)`, adds:

| Member | Kind | Description |
| --- | --- | --- |
| `.after`, `.before` | handle | The state after this event (its print), or before it (the previous print of the same function, marked `derivedFrom`). |
| `.text()` | plan | `{kind: "text", ordinal, variant, phase, header, print}`. |

### States

| Member | Kind | Description |
| --- | --- | --- |
| `q.run(state)` | evaluates | `{kind: "state", status, reason, state: witness, instructions, blocks, arguments: [{index, type, name}]}`. |
| `state.excerpt({contains, context?})` | plan | Text hits: `{kind: "excerpt", hitCount, hits: [{line, column, text, offsetInPrint, streamOffset, context}], searchedLines, truncated, note, ...}`. It is a text search over printed IR, not an operand query. |
| `state.text({maxLines?})` | plan | The print's text. |
| `state.instructions()` | handle | An instruction selector bound to this snapshot. |

A state witness, which appears in results as `state`, is `{variant, phase, ordinal, pass, header, ref, function, side, coverage, lineRange, derivedFrom?}`. `coverage` is `function` or `module` for prints that permit metrics, `loop` for a loop fragment, and `machineFunction` for MIR.

### Instruction selectors and metrics

`q.ir.instructions()` starts an unbound selector, and `state.instructions()` starts one bound to a snapshot. Filters chain:

| Member | Description |
| --- | --- |
| `.opcode(...names)` | Any of these LLVM opcodes. An unknown name throws `[unknownOpcode]`. `q.help("metrics")` lists the recognised opcodes. |
| `.resultType(type)` | Derived for load, binary ops, casts, `cmp` (`i1`), `phi`, `select`, `freeze`, `alloca`, `getelementptr` and `call`. Other forms are `unsupported`. |
| `.pointer(v)` | Pointer operand `v`: `fn.argument(i)` or a global `"@g"`. Printed local names such as `"%x"` are refused. |
| `.count()` | A metric whose value is the number of matching static instruction sites. |
| `.sites()` | A metric whose value is the matching lines themselves. |
| `.uses()` | Def-use edges of the matches inside one snapshot. On a bound selector it is a rows plan with `userOpcode`, `operandIndex` and `ref`. `operandIndex` is known for a subset of opcodes. |
| `.at(state)` | Binds an unbound selector's metric to a state. |

A metric (from `count()`, `sites()` or `q.machine`):

| Member | Kind | Description |
| --- | --- | --- |
| `metric.at(state)` | plan | A measurement. `.requireCoverage(kind)` refuses a state with weaker coverage, for example `"function"`. |
| `metric.label(text)` | handle | The same metric with a display label. |
| `metric.describe()` | eager | Its definition. |

A measurement is `{kind: "measurement", status, metric, definition, unit, valueType, value, count, witnesses: [{line, block?, text}], resolved, state, reason?, why?}`. An IR line the parser does not recognise makes the snapshot `unsupported`. The parser accepts opaque-pointer IR only.

### Timelines: measure and changes

`selection.measure(metric)` is a plan of one row per event: `{ordinal, pass, status, value, reason, coverage, unit, ref}`. `.changes()` on it is a plan of differences between consecutive rows:

| Field | Description |
| --- | --- |
| `ordinal`, `pass`, `header` | The event that produced the `after` print. |
| `from`, `fromPass` | The previous row's ordinal and pass. |
| `before`, `after`, `delta`, `changed` | Values and their difference (`delta` is `null` for booleans and sets). |
| `transition` | For booleans, for example `"false→true"`. |
| `status` | `known`, `first`, `unavailable`, `unknown` or `gap` (see `q.help("changes")`). |
| `skipped`, `skippedOrdinals`, `endpointDelta` | For `gap` rows: the timeline rows between, every original ordinal between, and the difference across the gap. |
| `unit`, `ref`, `reason` | As in measurements. |

The change plan supports the selection methods `where`, `select`, `table`, `first`, `last`, `one`, `limit` and `count`.

### Machine-function properties

| Member | Kind | Description |
| --- | --- | --- |
| `q.machine.property(name)` | handle | A boolean metric read from `# Machine code for function f: ...`. Names: `IsSSA`, `NoPHIs`, `TracksLiveness`, `NoVRegs`, `FailedISel`, `Legalized`, `RegBankSelected`, `Selected`, `TiedOpsRewritten`, `FailsVerification`, `FailedRegAlloc`, `TracksDebugUserValues`. An unknown name throws `[unknownProperty]`. |
| `q.machine.properties()` | handle | A set metric of every property that is set. |
| `q.machine.names()` | eager | The names above. |

On an IR print in the backend stream these metrics are `unavailable` (`irPrintNotMachineCode`). MIR instruction metrics, such as spills, copies and opcodes, are `unsupported` in this release.

## profiles: dynamic totals

| Member | Kind | Description |
| --- | --- | --- |
| `profiles.arms()` | eager | `[{arm, source, entry, digest, totals, rowsVerified, contract}]`. Typed arms carry the prefix `typed-`. |
| `profiles.arm(name)` | handle | An arm selection. An unknown arm throws `[unknownArm]`. |
| `profiles.sources()` | eager | `[{name, digest, status, error, entries}]` for the `execution`, `typed` and `metrics` sources. |
| `profiles.source(name)` | eager | `{name, digest, data}`. An unknown name throws `[unknownProfile]`; a source that could not be read throws `[unavailable]`. |
| `profiles.workloads()`, `profiles.regions()` | eager | `[{workload, description}]` and `[{region, description}]`. |

An arm selection narrows with `.region(name)` and `.workload(name)` (`[unknownRegion]`, `[unknownWorkload]`), and then offers:

| Member | Kind | Description |
| --- | --- | --- |
| `.total(metric)` | plan | `{kind: "total", status, arm, metric, value, unit, dimension, category, scope, region, workload, contract, pipeline: {status: "notLinked"}, source: {profile, entry, digest, path}}`. An unknown total throws `[unknownTotal]`. |
| `.totals()` | eager | `[{metric, value, unit}]`. |
| `.samples()` | eager | Every per-row sample of the arm. |
| `.describe()` | eager | `{arm, source, totals, units, rowsVerified, rowBytes, sampleKeys, sampleCount, sampleKeysTruncated, contract, treatment, countsCover, fields, comparisons, cannotAttribute, timing, ...}`. `treatment` describes what the arm is (`role`, `design`, `build`, `notA`, `provenance`); its labels are metadata, not measurements. |
| `.name` | value | The arm name. |

C arms count QEMU guest instructions inside the row symbol, and Typed arms count RV32 interpreter steps. `rowBytes` is the static `nm -S` size of the C row symbol. Stack totals are direct `sp`-based accesses, and they cannot be attributed to one slot, spill or optimization.

### Comparisons

`q.compare(before, after)` returns a plan with these modifiers:

| Member | Description |
| --- | --- |
| `.matchOn(...keys)` | Keys that must agree: `workload`, `region`, `checkedContract`, `unit`, `metric`, `function`, `phase`, `variant`, `stream`. A mismatch gives status `incomparable` and `delta: null`. |
| `.percentChange({denominator: "before" \| "after"})` | Adds `percent` and `denominator: {side, value}`. On booleans it throws `[typeError]`. |
| `.asEndpoints()` | For two states, reports the interval and the events between them. |

The result is `{kind: "comparison", status, before, after, valueType, unit, delta, percent?, denominator?, equal?, transition?, matchedOn, interval?}`.

## hardware: device timings

Device timings exist only when the service was started with `--device-study`. Otherwise `hardware.help().available` is `false`, and every data call fails with `missingDeviceStudy`.

| Member | Description |
| --- | --- |
| `hardware.help()` | `{available, unit, design, comparisons, phases, methods, pairFields, loadFields, provenance, example}`. |
| `hardware.metadata()` | Study metadata, including the images. |
| `hardware.pairs(baseline, candidate, phase)` | Within-block paired rows: `{pose, coordinates, stride, block, phase, baseline, candidate, baselineUs, candidateUs, savedUs, savedPct, baselinePosition, candidatePosition, baselineRotation, candidateRotation, outputCRC, sourceSHA, baselineRow, candidateRow}`. Comparisons are `stock -> scalar`, `scalar -> pie` and `stock -> pie`; phases are `clean`, `audit`, `primary` and `shade`. |
| `hardware.loads(treatment?)` | On-device cold-compile rows: `{treatment, program, block, position, compilerUs, elapsedUs, peakJSBytes, sourceBytes, elfBytes, segmentBytes, elfCRC}`. |

The unit is ESP32-P4 microseconds; `savedUs = baselineUs - candidateUs`, and `savedPct` is relative to `baselineUs`. Device rows are not linked to `profiles`: the typed counts record no image identity.

## simd: decisions and per-PC counts

SIMD attribution exists only with `--simd-study FILE`. Otherwise every data call fails with `missingSIMDStudy`, or with `emptySIMDStudy` for a file that records nothing.

| Member | Description |
| --- | --- |
| `simd.decisions()` | `[{id, function, source, imageSHA, plan, alternatives, ranges}]`. |
| `simd.traces()` | `[{id, imageSHA, imageBytes, workload, steps, listedPCs, unit, complete, omittedPCsMean}]`. |
| `simd.counts(traceID)` | The trace's complete per-PC histogram. |
| `simd.packets(workload)` | `[{pose, row, group, lanes, hitMask}]`. |
| `simd.executions(decisionID, traceID, role)` | `{decision, function, source, trace, workload, imageSHA, role, ranges, staticInstructions, executedPCs, executions, unit, traceSteps, witnesses, omittedPCsMean}`. |

`executions` joins a decision and a trace only when both name the same `imageSHA`, and only for a role that decision defines. Ranges are half-open, 4-byte-aligned byte offsets `[start, end)` into that image. A PC inside the image that the histogram does not list executed zero times in that trace. The unit is retired guest instructions, not P4 time.

## compiler: the Typed compiler at a revision

| Member | Description |
| --- | --- |
| `compiler.at(rev)` | The compiler files at a git revision (any name `git` resolves), or `"worktree"` for the files on disk. A commit is evaluated once per session and the same object is returned again; `"worktree"` is re-read on every call. |
| `compiler.loaded()` | Every set of files this session loaded: `[{requested, revision, files, ...}]`, with digests. `results.save` records it. |
| `compiler.modules()` | `[{binding, alias, path, required}]`: the files that `at` loads. `typed-async.js`, `typed-pie-loops.js` and the two tools are optional. |
| `compiler.help()` | Usage summary. |

A revision object, `const c = compiler.at(rev)`:

| Member | Description |
| --- | --- |
| `c.revision`, `c.requested`, `c.key` | The full commit SHA (or `"worktree"`), the name you passed, and the cache key. |
| `c.files` | `[{path, sha256, bytes, line}]`. `line` is the file's first line in the evaluated source, which `where` uses. |
| `c.missing` | Optional files absent at that revision. |
| `c.typedWasm`, `c.typedAsync`, `c.typedWorld`, `c.typedRv32`, `c.typedPieLoops` | The front end and backends, as each file publishes them. |
| `c.interp`, `c.rayBench` | `tools/rv32-interp.js` and `tools/typed-ray-bench.js`, running the JavaScript reference interpreter. |
| `c.native.interp`, `c.native.rayBench` | `native.interp` is `rv32`. `native.rayBench` is the revision's benchmark bound to `rv32`: same layout, arguments and checks, about 50 ms per opening frame. |
| `c.globals` | Every name the files published, such as `compileTypedWorldRv32`. |
| `c.ray` | The text of `raytrace.typed` at that revision. |
| `c.world(name)` | `{name, layout, text, files}`: `worlds/NAME/source.list` assembled, or the built-in layouts of `files` and `agenda` (`layout: "builtin"`). |
| `c.read(path)` | A file at that revision: `{path, revision, sha256, bytes, gzip, text}`. |
| `c.typedSources()` | The `.typed` source paths at that revision. |
| `c.where(line)` | Maps a `compiler@REV:LINE` stack position to `{path, line}`, or `null`. |

`c.typedRv32` is the RV32 backend:

| Member | Description |
| --- | --- |
| `compile(source, imports, memoryBytes, options?)` | Compiles Typed source. Returns `{image: Uint8Array, entries: {name: byteOffset}, records, enums, distinct, relocations, importCount, signatures}`. |
| `options.policy` | A named policy: `stock`, `interactive`, `balanced`, `default` or `kernel`. Other top-level option keys replace the policy's key wholesale. |
| `options.operandLocations`, `options.select` | Individual backend switches; the module table in `compiler/typed/rv32/README.md` names the pass behind each one. |
| `options.observeTape(name, phase, code, nlocals)` | Called with a copy of each function's tape after each transform. |
| `options.observePlan(name, plan)` | Called with each function's operand-location plan: `homes`, `scores` and, under pointer-only sources, `skips`. |
| `policies` | The named policies as frozen objects. |
| `linkSlot(program, runtime, entries)` | Links an image into the SDK reactor ELF. |

`c.rayBench` and `c.native.rayBench`:

| Member | Description |
| --- | --- |
| `openingFrame(program, options?)` | Runs `typedRayFrame` on the opening fixture and returns the interpreter result. It throws if the frame traps or returns anything but 1. |
| `frameProfile(program, options?)` | `{imageBytes, steps, digest, total, rows, bytes, counts}`. `rows` holds one profile row per function, sorted by steps, and `digest` is the FNV-1a hash of the output bytes. |
| `openingMemory()`, `OPENING`, `fnv1a(bytes)` | The fixture's memory size, its arguments, and the hash. |

## rv32: the native interpreter

`rv32` is `bench/host/rv32-interp.js` implemented in Go. It produces the same results, bytes, registers, trap flags, fault messages and per-PC counts as the reference.

| Member | Description |
| --- | --- |
| `rv32.run(program, entry, args, memoryBytes, {stackBytes?, limit?, imports?, handlers?, counts?})` | Runs function `entry` of a compiled program. It returns `{trap: false, result, steps, counts, bytes, registers}` or `{trap: true, at, steps, counts, bytes, registers}`. `counts` is a `Uint32Array` with one count per word, `bytes` a `Uint8Array` view without the stack, and `registers` an `Int32Array`. A run still stops at the cell or job deadline, even with `limit: Infinity`. |
| `rv32.profile(program, counts)` | Per-function rows: `{name, steps, spLoad, spStore, load, store, branch, boundsTest, capacityLoad, call, mul, div}`. |
| `rv32.classify(word, nextWord, afterWord)` | The kinds of one instruction word, from `spLoad`, `load`, `spStore`, `store`, `branch`, `boundsTest`, `call`, `mul`, `div` and `capacityLoad`. `boundsTest` and `capacityLoad` need the following words. |
| `rv32.Rv32Fault` | The error class of faults. It carries the reference's message, plus `err.at` and `err.steps`. |

## repo and mounts

| Member | Description |
| --- | --- |
| `repo.root()`, `repo.head()` | The repository root, and the commit checked out when the service started. |
| `repo.read(path)` | A working-tree file: `{path, revision: "worktree", sha256, bytes, gzip, text}` and `.json()`. Working-tree reads are not cached. |
| `repo.show(rev, path)` | The same file at a revision. `revision` is the full commit SHA, and content is cached for all sessions. |
| `repo.list(path?, rev?)` | `[{name, type, bytes}]` in the working tree, or at `rev`. |
| `repo.resolve(rev)` | The full commit SHA of a revision name. |
| `mounts.list()` | `[{name, path, sha256, bytes, gzip}]` for files given to `serve` with `--mount NAME=PATH`. |
| `mounts.NAME` | `{name, path, revision: "mount", sha256, bytes, gzip, text}` and `.json()`. |

Paths are relative to the repository root and may not leave it, even through a symlink, and `.git` is not readable. Files are capped at 32 MiB. A `.gz` file is inflated, while its `sha256` and `bytes` describe the compressed file.

## results

| Member | Description |
| --- | --- |
| `results.save(name, value)` | Writes `NAME.json` atomically in the results directory and replaces an earlier record of that name. Returns `{name, path, sha256, bytes, saved}`. |
| `results.load(name)` | `{name, saved, session, unit, job, script: {sha256, bytes}, args, repo: {root, head}, compilers, value}`. `unit` is `"cell"` or `"job"`. `compilers` is `compiler.loaded()` at save time. |
| `results.list()` | `[{name, path, sha256, bytes, saved}]`. |
| `results.dir()` | The directory: `serve --results DIR`, or by default the user cache directory's `picocalc-trace-repl/results`. |

Names are 1 to 128 letters, digits, `.`, `_` or `-`, starting with a letter or a digit.

## stats

| Member | Description |
| --- | --- |
| `stats.median(xs)`, `stats.mean(xs)` | The middle value (the mean of the two middle values for an even count), and the mean. |
| `stats.quantile(xs, p)` | Linear interpolation (R type 7). |
| `stats.summary(xs)` | `{n, min, q1, median, q3, max, mean}`. |
| `stats.percentSaved(control, candidate)` | `100 * (1 - candidate / control)`. |
| `stats.paired(rows, {key, control, candidate, value, better?})` | Pairs one control row with one candidate row per key. `key` and `value` are field names or functions of a row; `control` and `candidate` are predicates; `better` is `"lower"` (the default) or `"higher"`. Returns `{pairs, controlMedian, candidateMedian, medianPercentSaved, percentSavedOfMedians, wins, losses, ties, better, method, spread, blocks, perPair}`. |

`blocks` is `[{key, control, candidate, savedPct, outcome}]` sorted by key, and `spread` is `stats.summary` of the blocks' `savedPct`. `medianPercentSaved` (the median of per-pair savings) and `percentSavedOfMedians` (the change between the arm medians) are different numbers. Errors carry `err.code`: `notAnArray`, `empty`, `notFinite`, `badArgument`, `badKey`, `ambiguousRow`, `duplicatePair`, `unmatchedKey` and `zeroControl`.

## Result shapes

Every archive result has a `kind`. These are the shapes `q.run` returns:

| Kind | Fields |
| --- | --- |
| `count` | `value, unit, of, streams?, byStream?` |
| `rows` | `of, unit, count, rows, truncated?` |
| `ordinals` | `of, count, ordinals` |
| `pick` | `status` (`none`, `ambiguous` or the event's), `of, count, matches?` and the picked event |
| `state` | `status, reason, state, instructions, blocks, arguments` |
| `excerpt` | `status, query, scope, searchedLines, hitCount, hits, truncated, source, note` |
| `text` | `ordinal, variant, phase, header, print` |
| `measurement` | `status, metric, definition, unit, valueType, value, count, witnesses, resolved, state, reason?, why?` |
| `total` | `status, arm, metric, value, unit, dimension, category, scope, region, workload, contract, pipeline, source` |
| `comparison` | `status, before, after, valueType, unit, delta, percent?, denominator?, equal?, transition?, matchedOn, interval?` |
| `sum` | `label, status, value, unit, parts, formula` |
| `bundle` | `outputs, keys` |
| `join` | `status, reasons, required, note` |

Units are kept apart. `events` counts header records, `rows` counts result rows, and `static instruction sites` counts IR lines. `executed guest instructions` and `executed direct stack loads` are dynamic work, and `P4 microseconds` is device time.

## Statuses

| Status | Meaning |
| --- | --- |
| `available` | Measured; `value` holds the answer. |
| `absent` | The print exists but does not contain the function. |
| `unavailable` | The capture lacks what the question needs; `reason` says what, for example `loopFragment`, `missingDebugLocations`, `missingRemarksArtifact`, `missingPCSamples` or `irPrintNotMachineCode`. |
| `unsupported` | The parser or this release cannot answer, for example an unrecognised IR line or a MIR instruction metric. |
| `incomparable` | A comparison whose sides differ in a `matchOn` key. |

None of these is an error, and none comes with a zero `value`.

## Error codes

Refusals are thrown as `QueryError` with the message `[code] message\n  fix: ...` and the code in `err.code`. `q.run` refusals also carry `err.got` and `err.fix`.

| Group | Codes |
| --- | --- |
| Unknown names | `unknownVariant`, `unknownPhase`, `unknownFunction`, `unknownOpcode`, `unknownProperty`, `unknownArm`, `unknownRegion`, `unknownWorkload`, `unknownTotal`, `unknownMatchKey`, `unknownField`, `unknownTopic`, `unknownCoverage`, `unknownProfile`, `unknownTarget`, `unknownOption` |
| Selection | `ordinalOutOfRange`, `notInSelection`, `ambiguousStream`, `ambiguous`, `noEvent`, `needFunction`, `functionMismatch`, `noSuchArgument`, `needState`, `noPaths` |
| Plans | `notAPlan`, `notEvaluated`, `alreadyMaterialized`, `badArgument`, `badType`, `typeError` |
| Arithmetic | `incompatibleUnits`, `incompatibleScope`, `doubleCount`, `percentBaselineRequired` |
| Parameters | `undeclaredParam`, `unboundParam`, `badBinding` |
| Sources | `unavailable` (`profiles.source(name)` could not read the source), `unsupported`, `noBridge`, `bridge` |
| Studies | `missingDeviceStudy`, `missingSIMDStudy`, `emptySIMDStudy` |

## Troubleshooting

| Problem | Cause | Solution |
| --- | --- | --- |
| `[notAPlan] ... got an array of N values` | An eager value such as `.list()` or `profiles.arms()` was passed to `q.run`. | Use the value directly. |
| `[notEvaluated]` | A result field was read on a plan. | `q.run(plan).value`. |
| `[unknownOpcode]`, `[unknownArm]` and similar | A misspelt name. | The message lists the valid names; `q.help("metrics")` lists the opcodes. |
| `pointer("%work")` is refused | Printed local names are not identities. | Use `fn.argument(i)` or a global `"@g"`. |
| A measurement is `unsupported` | The snapshot contains a line the IR parser does not know. | Use `state.excerpt` or `state.text` to read it; report the line. |
| `typedRv32.compile` throws a `SyntaxError` | The Typed source does not compile at that revision. | Check `c.where(line)` for the stack position; compare with `compiler.at("worktree")`. |
| `counts` or `bytes` comes back as an object keyed by index | Typed arrays have no JSON form. | Return `Array.from(x)` or a summary, such as `rv32.profile(program, counts)`. |
| `Rv32Fault` from `rv32.run` | The program faulted. | `err.at` is the PC and `err.steps` the step count; profile with `counts` to locate it. |

## See Also

- `trace-repl help trace-repl-user-guide`: plans, states, timelines, units and statuses explained.
- `trace-repl help trace-repl-query-examples`: these members in 25 complete scripts.
- `trace-repl help trace-repl-cli-and-http`: commands, flags, limits and HTTP routes.
- `compiler/typed/rv32/README.md`: the RV32 backend's modules, policies and option switches.
