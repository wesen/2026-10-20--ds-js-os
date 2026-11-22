---
Title: "Trace REPL Query Examples"
Slug: "trace-repl-query-examples"
Short: "Twenty-five runnable scripts, from orientation and pass attribution to compiler sweeps and board statistics, each with its real output."
Topics:
- trace-repl
- compiler-evidence
- examples
Commands:
- eval
- open
Flags:
- session
- arg
- job
IsTopLevel: true
IsTemplate: false
ShowPerDefault: true
SectionType: Example
---

This page walks through the 25 scripts in `cmd/trace-repl/examples/`. Each one answers one concrete question about the ray tracer's compiled code. The page shows the script verbatim, the output it produced against the `PICOCALC-ROW-IR` capture, and what to notice in that output. Read the scripts in order to learn the API by use. Or jump to the part you need, and copy a script as the starting point for your own question.

Every script follows two conventions that make it safe to send repeatedly to the same session:

- **The script is one expression, `(() => { ... })()`.** Its locals vanish when it returns, so sending it a second time does not collide with the bindings of the first.
- **Parameters come from `args`.** Defaults apply when an argument is absent, and the comment at the top shows the `--arg` form. Because `args` is fresh in every cell, a script never sees another script's values.

Open a session and send one script on stdin:

```sh
sid=$(trace-repl open)
trace-repl eval --session "$sid" < cmd/trace-repl/examples/05-static-metric.js
```

`run-all.sh` runs every script in one new session and prints `ok` or `FAIL` per script. It passes its arguments to `open`, `eval` and `close`, and it reads the binary from `TRACE_REPL`:

```sh
TRACE_REPL=~/bin/trace-repl cmd/trace-repl/examples/run-all.sh --addr 127.0.0.1:3791
```

Scripts 01 to 16 need only the archive. Scripts 17 to 25 also read the service's repository, which by default is the checkout the service was started in. Script 24 writes the record `example-opening-frame` into the service's results directory. None of them needs a device or SIMD study.

The outputs below are the real values, abridged in two ways. A 64-character digest is cut to its first 8 characters followed by `…`. A long array keeps its first items, and a final `"… N more"` entry says how many were left out. Numbers are never changed.

| Part | Scripts | Topic |
| --- | --- | --- |
| 1 | 01, 02 | Orientation |
| 2 | 03, 04 | Events and prints |
| 3 | 05, 06, 07 | Static IR metrics |
| 4 | 08 | Machine-function properties |
| 5 | 09, 10, 11 | Dynamic totals |
| 6 | 12, 13, 16 | Plan tools |
| 7 | 14, 15 | What the evidence cannot answer |
| 8 | 17, 18, 19, 20, 21 | The compiler workbench |
| 9 | 22, 23, 24, 25 | Repository evidence, results and statistics |

## Part 1: Orientation

Run these two first against any service you did not start yourself. They say what the service holds and what it cannot answer.

### 01. What the service mounted

Before building on a service, find out which archive it holds, which functions and arms it can answer about, and which questions will come back unavailable.

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/01-orientation.js
```

```js
// What this service mounted, and which questions it can answer.
// trace-repl eval --session "$sid" < 01-orientation.js
(() => ({
  release: q.version,
  variants: a.variants().map(v => ({variant: v.variant, events: v.phases.map(p => p.phase + ":" + p.events).join(" ")})),
  functions: a.variant("checked").functions(),
  arms: profiles.arms().map(x => x.arm),
  // Statuses such as "available (opcode subset for operandIndex)" still count as available.
  limits: q.capabilities().filter(c => !c.status.startsWith("available")).map(c => c.capability + ": " + (c.reason ?? c.status)),
  device: hardware.help().available,
  simd: simd.help().available,
}))()
```

```json
{
  "release": "0.1.0",
  "variants": [
    {"variant": "checked", "events": "backend:116 middle:195"},
    {"variant": "firmware", "events": "backend:1450 middle:2061"},
    {"variant": "unchecked", "events": "backend:116 middle:195"}
  ],
  "functions": ["element", "row"],
  "arms": ["checked-gcc", "checked-gcc-noiv", "checked-llc", "checked-llc-nolsr", "checked-llvm", "unchecked-gcc", "… 7 more"],
  "limits": [
    "IR metrics on loop fragments: loopFragment",
    "machine instruction metrics (spills, copies, MIR opcodes): no MIR body parser in this release",
    "per-row samples: inspect",
    "PC samples and PC joins: missingPCSamples; no final image registered",
    "source locations: missingDebugLocations",
    "optimization remarks: missingRemarksArtifact"
  ],
  "device": false,
  "simd": false
}
```

`limits` lists every capability whose status does not start with `available`. Read it before planning an investigation: in this archive, a question about source locations or optimization remarks comes back `unavailable` however it is written. `device` and `simd` are `false` because the service was started without `--device-study` and `--simd-study`.

### 02. Count every event

How large is the archive? A count is a plan, and `q.run` evaluates it.

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/02-event-counts.js
```

```js
// How many pass prints each stream holds: a lazy count plan, evaluated by q.run.
(() => q.run(a.events().count()))()
```

```json
{
  "kind": "count",
  "value": 4133,
  "unit": "events",
  "of": "a.events()",
  "streams": 6,
  "byStream": [
    {"variant": "checked", "phase": "backend", "streamSHA": "81392967…", "events": 116},
    {"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "events": 195},
    "… 4 more"
  ]
}
```

The result says what it counted (`of`), in which unit (`events`) and over how many streams. `byStream` carries each stream's SHA-256, the identity that every later `ref` cites.

## Part 2: Events and prints

The archive is a set of pass-print streams. These scripts find events by their fields and read the print an event wrote.

### 03. Find where passes ran

Where did the loop vectorizer first run in the checked variant's middle end, and which events have a loop scope?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/03-find-passes.js
```

```js
// Where loop passes ran in the checked variant's middle-end stream, with stable references.
(() => {
  const middle = a.variant("checked").events("middle");
  return {
    firstVectorize: q.run(middle.where(e => e.pass === "LoopVectorizePass").select("ordinal", "pass", "scope", "ref").first()),
    loopScoped: q.run(middle.where(e => e.scope.kind === "loop").select("ordinal", "pass", "ref").limit(5)),
  };
})()
```

```json
{
  "firstVectorize": {
    "ordinal": 166,
    "pass": "LoopVectorizePass",
    "scope": {"kind": "function", "function": "row"},
    "ref": {"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "ordinal": 166, "start": 806352, "end": 814146}
  },
  "loopScoped": {
    "kind": "rows",
    "of": "a.variant(\"checked\").events(\"middle\").where(e => e.scope.kind === \"loop\").select(ordinal, pass, ref).limit(5)",
    "unit": "events",
    "count": 5,
    "rows": [
      {
        "ordinal": 88,
        "pass": "LoopInstSimplifyPass",
        "ref": {"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "ordinal": 88, "start": 346976, "end": 348729}
      },
      {
        "ordinal": 89,
        "pass": "LoopSimplifyCFGPass",
        "ref": {"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "ordinal": 89, "start": 348729, "end": 350470}
      },
      {
        "ordinal": 90,
        "pass": "LICMPass",
        "ref": {"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "ordinal": 90, "start": 350470, "end": 352206}
      },
      "… 2 more"
    ]
  }
}
```

`where` filters with an ordinary JavaScript predicate over event fields, and `select` keeps only the fields you need. Ordinals 88, 89 and 90 are positions in the original stream: filtering did not renumber them. `ref.start` and `ref.end` locate each print inside the inflated stream.

### 04. Read one print

What does `row` look like after EarlyCSE at ordinal 74, and where does it load from `%work`?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/04-read-a-print.js
```

```js
// The text of row() after middle-end event 74, and a search inside it.
(() => {
  const middle = a.variant("checked").function("row").timeline("middle");
  const after = middle.at(74).after;
  return {
    state: q.run(after),
    hits: q.run(after.excerpt({contains: "load i32, ptr %work", context: 1})),
  };
})()
```

```json
{
  "state": {
    "kind": "state",
    "status": "available",
    "reason": null,
    "state": {
      "variant": "checked",
      "phase": "middle",
      "ordinal": 74,
      "pass": "EarlyCSEPass",
      "header": "IR Dump After EarlyCSEPass on row",
      "ref": {"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "ordinal": 74, "start": 240363, "end": 248127},
      "function": "row",
      "side": "after",
      "coverage": "function",
      "lineRange": [3, 199]
    },
    "instructions": 126,
    "blocks": 35,
    "arguments": [{"index": 0, "type": "ptr", "name": "%work"}, {"index": 1, "type": "i32", "name": "%y"}]
  },
  "hits": {
    "kind": "excerpt",
    "status": "available",
    "query": {"contains": "load i32, ptr %work"},
    "scope": "function row",
    "searchedLines": [3, 199],
    "hitCount": 6,
    "hits": [
      {
        "line": 13,
        "column": 8,
        "text": "  %0 = load i32, ptr %work, align 4",
        "offsetInPrint": 502,
        "streamOffset": 240865,
        "context": [
          "for.cond.cleanup:                                 ; preds = %for.cond",
          "  %0 = load i32, ptr %work, align 4",
          "  %cmp.not.i = icmp ugt i32 %0, 16"
        ]
      },
      {
        "line": 30,
        "column": 8,
        "text": "  %2 = load i32, ptr %work, align 4",
        "offsetInPrint": 1156,
        "streamOffset": 241519,
        "context": ["  %add = add nuw nsw i32 %x.0, 1545", "  %2 = load i32, ptr %work, align 4", "  %cmp.not.i33 = icmp ugt i32 %2, %add"]
      },
      "… 4 more"
    ],
    "truncated": false,
    "offsetBasis": "ref span equals the bytes read (the print keeps their prefix)",
    "excluded": null,
    "note": "a text search over printed IR; printed local names are not operand identities"
  }
}
```

Evaluating a state reports its coverage (`function`), its line range inside the print, its size and its arguments. The excerpt is a text search for reading. Its six hits agree with the metric in the next example only because the search string happens to be that specific. Count with selectors, not with text.

## Part 3: Static IR metrics

A metric counts instructions in one snapshot. Bound to a whole timeline, it shows which pass changed the count.

### 05. Count static loads at one state

How many `i32` loads through `row`'s first argument exist after event 74?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/05-static-metric.js
```

```js
// Count static i32 loads through row()'s first argument at one state, with witnesses.
(() => {
  const row = a.variant("checked").function("row");
  const loads = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count();
  const r = q.run(loads.at(row.timeline("middle").at(74).after));
  return {status: r.status, value: r.value, unit: r.unit, firstWitnesses: r.witnesses.slice(0, 2)};
})()
```

```json
{
  "status": "available",
  "value": 6,
  "unit": "static instruction sites",
  "firstWitnesses": [
    {"line": 13, "block": "for.cond.cleanup", "text": "%0 = load i32, ptr %work, align 4"},
    {"line": 30, "block": "for.body", "text": "%2 = load i32, ptr %work, align 4"}
  ]
}
```

The value is 6 static instruction sites, and each witness is a counted line with its basic block. `row.argument(0)` is resolved again in every snapshot from that print's `define` line, so the metric keeps its meaning when passes rename `%work`.

### 06. Which pass changed the count

Across `row`'s whole middle-end timeline of 144 events, which passes changed the number of those loads?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/06-pass-effects.js
```

```js
// Which middle-end passes changed that count, as a table of known deltas.
(() => {
  const row = a.variant("checked").function("row");
  const loads = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count();
  return q.run(row.timeline("middle").measure(loads).changes()
    .where(c => c.status === "known" && c.delta !== 0)
    .table("ordinal", "pass", "before", "after", "delta"));
})()
```

```json
{
  "kind": "rows",
  "of": "a.variant(\"checked\").function(\"row\").timeline(\"middle\").measure(q.ir.instructions().opcode(\"load\").resultType(\"i32\").pointer(row.argument(0)).count()).changes().where(c => c.status === \"known\" && c.delta !== 0).select(ordinal, pass, before, after, delta)",
  "unit": "static instruction sites",
  "count": 1,
  "rows": [{"ordinal": 74, "pass": "EarlyCSEPass", "before": 11, "after": 6, "delta": -5}]
}
```

Exactly one: EarlyCSE at ordinal 74 took the count from 11 to 6. The script keeps only `known` changes, the ones that compare consecutive full prints and can therefore be credited to one pass. `of` spells out the whole plan, so the result documents its own question.

### 07. Follow def-use edges

Which instructions use the loads through argument 0?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/07-def-use.js
```

```js
// Who uses the loads through argument 0: def-use edges inside one snapshot.
(() => {
  const row = a.variant("checked").function("row");
  const state = row.timeline("middle").at(74).after;
  const uses = state.instructions().opcode("load").pointer(row.argument(0)).uses();
  return q.run(uses.select("userOpcode", "operandIndex", "ref").limit(8));
})()
```

```json
{
  "kind": "rows",
  "of": "a.variant(\"checked\").function(\"row\").timeline(\"middle\").at(74).after.instructions().opcode(\"load\").pointer(row.argument(0)).uses().select(us…",
  "unit": "use edges",
  "count": 8,
  "rows": [
    {
      "userOpcode": "icmp",
      "operandIndex": 0,
      "ref": {
        "variant": "checked",
        "phase": "middle",
        "ordinal": 74,
        "pass": "EarlyCSEPass",
        "header": "IR Dump After EarlyCSEPass on row",
        "ref": {"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "ordinal": 74, "start": 240363, "end": 248127},
        "line": 14
      }
    },
    {
      "userOpcode": "icmp",
      "operandIndex": 0,
      "ref": {
        "variant": "checked",
        "phase": "middle",
        "ordinal": 74,
        "pass": "EarlyCSEPass",
        "header": "IR Dump After EarlyCSEPass on row",
        "ref": {"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "ordinal": 74, "start": 240363, "end": 248127},
        "line": 31
      }
    },
    "… 6 more"
  ]
}
```

Each edge names the user's opcode, the operand position and a `ref` to the user's line. The loads feed `icmp` comparisons as operand 0: they are the row's bounds checks. `q.capabilities()` lists def-use edges as available, with `operandIndex` known for a subset of opcodes.

## Part 4: Machine-function properties

Backend prints after instruction selection are machine functions. Their property line is a set of boolean metrics.

### 08. Machine-function properties

Which machine-function properties does `row` have after the virtual register rewriter, and when did `NoVRegs` become true?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/08-machine-properties.js
```

```js
// Machine-function properties in the backend stream, and when NoVRegs became true.
(() => {
  const backend = a.variant("checked").function("row").timeline("backend");
  const noVRegs = q.machine.property("NoVRegs");
  const firstTrue = q.run(backend.measure(noVRegs).changes().where(c => c.status === "known" && c.after === true).first());
  return {
    propertiesAt78: q.run(q.machine.properties().at(backend.at(78).after)),
    becameTrue: firstTrue,
  };
})()
```

```json
{
  "propertiesAt78": {
    "kind": "measurement",
    "metric": "q.machine.properties()",
    "definition": "machine.properties",
    "unit": "machine-function property set",
    "valueType": "set",
    "state": {
      "variant": "checked",
      "phase": "backend",
      "ordinal": 78,
      "pass": "virtregrewriter",
      "header": "IR Dump After Virtual Register Rewriter (virtregrewriter) ***:",
      "function": "row",
      "side": "after",
      "coverage": "machineFunction"
    },
    "status": "available",
    "value": ["NoPHIs", "TracksLiveness", "NoVRegs", "TiedOpsRewritten", "TracksDebugUserValues"],
    "witnesses": [
      {
        "line": 2,
        "text": "# Machine code for function row: NoPHIs, TracksLiveness, NoVRegs, TiedOpsRewritten, TracksDebugUserValues"
      }
    ],
    "coverageRequired": "machine property line"
  },
  "becameTrue": {
    "ordinal": 78,
    "pass": "virtregrewriter",
    "header": "IR Dump After Virtual Register Rewriter (virtregrewriter) ***:",
    "from": 77,
    "fromPass": "greedy",
    "before": false,
    "after": true,
    "delta": null,
    "changed": true,
    "transition": "false→true",
    "status": "known",
    "reason": null,
    "skipped": null,
    "skippedOrdinals": null,
    "endpointDelta": null,
    "unit": "machine-function property"
  }
}
```

Properties come from the `# Machine code for function row:` line, which is the witness. A boolean metric's change carries a `transition` (`false→true`) and no numeric delta. The flip happens at `virtregrewriter` (78), directly after `greedy` (77), where register allocation ends.

## Part 5: Dynamic totals

Profiles hold executed work per compiled arm, in their own units, kept apart from static sites.

### 09. Totals per arm

How much work does each compiled program execute on the opening workload?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/09-profile-totals.js
```

```js
// Dynamic totals per arm on the verified opening workload: one row per arm.
// totals() is eager: an array of {metric, value, unit}, read here into one object per arm.
(() => profiles.arms().map(({arm}) => {
  const row = {arm};
  for (const t of profiles.arm(arm).region("row").workload("opening-160-rows").totals()) row[t.metric] = t.value;
  return row;
}))()
```

```json
[
  {"arm": "checked-gcc", "instructions": 1136142, "stackLoads": 1120, "stackStores": 1120},
  {"arm": "checked-gcc-noiv", "instructions": 1308071, "stackLoads": 0, "stackStores": 0},
  {"arm": "checked-llc", "instructions": 1233611, "stackLoads": 320, "stackStores": 320},
  {"arm": "checked-llc-nolsr", "instructions": 1275560, "stackLoads": 0, "stackStores": 0},
  {"arm": "checked-llvm", "instructions": 1233611, "stackLoads": 320, "stackStores": 320},
  {"arm": "unchecked-gcc", "instructions": 768238, "stackLoads": 160, "stackStores": 160},
  {"arm": "unchecked-gcc-noiv", "instructions": 1407598, "stackLoads": 0, "stackStores": 0},
  {"arm": "unchecked-llc", "instructions": 632124, "stackLoads": 640, "stackStores": 640},
  {"arm": "unchecked-llc-nolsr", "instructions": 798350, "stackLoads": 960, "stackStores": 960},
  {"arm": "unchecked-llvm", "instructions": 632124, "stackLoads": 640, "stackStores": 640},
  {"arm": "typed-pie", "instructions": 3131435, "packets": 3135, "stackLoads": 729553, "stackStores": 309776},
  {"arm": "typed-scalar", "instructions": 3199910, "packets": 0, "stackLoads": 729553, "stackStores": 309611},
  {"arm": "typed-stock", "instructions": 3608697, "packets": 0, "stackLoads": 936328, "stackStores": 353778}
]
```

`totals()` is eager and returns `[{metric, value, unit}]`. The script folds it into one row per arm. C arms count QEMU guest instructions inside the row symbol, and Typed arms count RV32 interpreter steps (plus `packets` for the SIMD arms). Neither is cycles.

### 10. Compare two arms

What is loop strength reduction worth to the checked row under `llc`?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/10-compare-arms.js
```

```js
// What loop strength reduction is worth in GCC-free LLVM codegen: llc with and without LSR.
(() => {
  const t = arm => profiles.arm(arm).region("row").workload("opening-160-rows").total("instructions");
  return q.run(q.compare(t("checked-llc-nolsr"), t("checked-llc"))
    .matchOn("workload", "region", "checkedContract", "unit")
    .percentChange({denominator: "before"}));
})()
```

```json
{
  "kind": "comparison",
  "status": "available",
  "unit": "executed guest instructions",
  "delta": -41949,
  "percent": -3.288673210197874,
  "denominator": {"side": "before", "value": 1275560},
  "matchedOn": {
    "workload": {"before": "opening-160-rows", "after": "opening-160-rows", "equal": true},
    "region": {"before": "row", "after": "row", "equal": true},
    "checkedContract": {"before": "checked", "after": "checked", "equal": true},
    "unit": {"before": "executed guest instructions", "after": "executed guest instructions", "equal": true}
  },
  "before": {"arm": "checked-llc-nolsr", "metric": "instructions", "value": 1275560},
  "after": {"arm": "checked-llc", "metric": "instructions", "value": 1233611}
}
```

LSR removes 41,949 executed instructions, 3.29% of the count without it. `matchedOn` shows that both sides share workload, region, checked contract and unit. If any of them differed, the comparison would be `incomparable` with a `null` delta.

### 11. Sum disjoint totals

How many direct stack accesses does the stock Typed compile execute?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/11-sum-totals.js
```

```js
// Direct stack accesses of the stock Typed compile: two disjoint totals summed with a label.
(() => {
  const stock = profiles.arm("typed-stock").region("row").workload("opening-160-rows");
  return q.run(q.add(stock.total("stackLoads"), stock.total("stackStores")).label("direct stack accesses"));
})()
```

```json
{
  "kind": "sum",
  "label": "direct stack accesses",
  "status": "available",
  "value": 1290106,
  "unit": "executed direct stack accesses",
  "formula": "stackLoads=936328 + stackStores=353778 = 1290106",
  "parts": [
    {"arm": "typed-stock", "metric": "stackLoads", "value": 936328, "unit": "executed direct stack loads"},
    {"arm": "typed-stock", "metric": "stackStores", "value": 353778, "unit": "executed direct stack stores"}
  ]
}
```

`q.add` keeps the parts and the formula. It sums only disjoint categories of one dimension: `q.add(s.total("instructions"), s.total("stackLoads"))` is refused with `[incompatibleUnits]` and a suggestion to use `q.compare` or `q.bundle`.

## Part 6: Plan tools

Parameters, bundles and explanations work on any plan.

### 12. One plan, several bindings

Which passes removed at least `minimum` loads, for `minimum` 1 and 4?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/12-parameters.js
```

```js
// One plan, several bindings: passes that removed at least `minimum` loads.
(() => {
  const row = a.variant("checked").function("row");
  const loads = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count();
  const minimum = q.param.int("minimum", {min: 1, max: 16, default: 1});
  const drops = row.timeline("middle").measure(loads).changes()
    .where((r, ctx) => r.status === "known" && -r.delta >= ctx.param(minimum), {dependsOn: [minimum]})
    .select("ordinal", "pass", "delta");
  return {atLeast1: q.run(drops, {bindings: {minimum: 1}}).count, atLeast4: q.run(drops, {bindings: {minimum: 4}}).rows};
})()
```

```json
{"atLeast1": 1, "atLeast4": [{"ordinal": 74, "pass": "EarlyCSEPass", "delta": -5}]}
```

The predicate reads the parameter through `ctx.param` and declares it in `dependsOn`. Metric values are cached by definition, so the second `q.run` reuses the measurements of the first and only the predicate runs again.

### 13. Several questions at once

Evaluate three unrelated plans in one call and keep the answers apart.

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/13-bundle.js
```

```js
// Several questions in one evaluation, kept apart by name.
(() => {
  const run = a.variant("checked"), middle = run.function("row").timeline("middle");
  return q.run(q.bundle({
    middleEvents: run.events("middle").count(),
    rowTimeline: middle.count(),
    gccInstructions: profiles.arm("checked-gcc").region("row").workload("opening-160-rows").total("instructions"),
  }));
})()
```

```json
{
  "kind": "bundle",
  "outputs": {
    "middleEvents": {
      "kind": "count",
      "value": 195,
      "unit": "events",
      "of": "a.variant(\"checked\").events(\"middle\")",
      "streams": 1,
      "byStream": [{"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "events": 195}]
    },
    "rowTimeline": {
      "kind": "count",
      "value": 144,
      "unit": "events",
      "of": "a.variant(\"checked\").function(\"row\").timeline(\"middle\")",
      "streams": 1,
      "byStream": [{"variant": "checked", "phase": "middle", "streamSHA": "bbd3b983…", "events": 144}]
    },
    "gccInstructions": {
      "kind": "total",
      "status": "available",
      "reason": null,
      "arm": "checked-gcc",
      "metric": "instructions",
      "value": 1136142,
      "unit": "executed guest instructions",
      "dimension": "executed guest instructions",
      "category": null,
      "scope": "dynamic (executed work, summed over the workload)",
      "region": {"name": "row", "requested": true, "evidence": "the measured row symbol (summary totals are collected inside it)"},
      "workload": {"label": "opening-160-rows", "rowsVerified": 160, "verified": true, "evidence": "rowsVerified=160"},
      "contract": {"value": "checked", "evidence": "arm name prefix \"checked-\""},
      "source": {
        "profile": "execution",
        "entry": "checked-gcc",
        "digest": "42a8a43d…",
        "path": "execution[\"checked-gcc\"].totals.instructions"
      }
    }
  },
  "keys": ["middleEvents", "… 2 more"]
}
```

A bundle result is `{kind: "bundle", outputs, keys}`, and every output is a complete result with its own unit. The 144 events of `row`'s timeline are a subset of the stream's 195 events.

### 16. Explain a plan and inspect the caches

What does a plan consist of, and what has this session cached?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/16-explain-and-cache.js
```

```js
// What a plan is made of, and what the session caches hold.
(() => {
  const row = a.variant("checked").function("row");
  const plan = row.timeline("middle").measure(q.ir.instructions().opcode("load").count()).changes();
  return {explain: q.explain(plan), cache: q.cache()};
})()
```

```json
{
  "explain": {
    "kind": "explain",
    "root": 1,
    "nodes": [
      {
        "id": 1,
        "kind": "changes",
        "label": "a.variant(\"checked\").function(\"row\").timeline(\"middle\").measure(q.ir.instructions().opcode(\"load\").count()).changes()",
        "inputs": [2],
        "consumers": 0
      },
      {
        "id": 2,
        "kind": "measurements",
        "label": "a.variant(\"checked\").function(\"row\").timeline(\"middle\").measure(q.ir.instructions().opcode(\"load\").count())",
        "inputs": [3],
        "consumers": 1
      },
      {
        "id": 3,
        "kind": "events",
        "label": "a.variant(\"checked\").function(\"row\").timeline(\"middle\")",
        "inputs": [],
        "consumers": 1
      }
    ],
    "shared": [],
    "sources": ["a.variant(\"checked\").function(\"row\").timeline(\"middle\")"],
    "evaluation": "synchronous; a shared terminal plan is evaluated once per q.run; shared row sources may be re-iterated, but prints, snapshots and metric val…"
  },
  "cache": [
    {
      "name": "texts",
      "entries": 96,
      "maxEntries": 96,
      "approxBytes": 1611326,
      "maxBytes": 25165824,
      "hits": 11,
      "misses": 333,
      "evictions": 237
    },
    {
      "name": "snapshots",
      "entries": 217,
      "maxEntries": 512,
      "approxBytes": 5263828,
      "maxBytes": 33554432,
      "hits": 293,
      "misses": 217,
      "evictions": 0
    },
    {
      "name": "values",
      "entries": 147,
      "maxEntries": 8192,
      "approxBytes": 0,
      "maxBytes": null,
      "hits": 205,
      "misses": 147,
      "evictions": 0
    },
    "… 1 more"
  ]
}
```

`q.explain` lists the nodes, their inputs and how many consumers each has, without evaluating anything. `q.cache()` reports the bounded session caches with hits, misses and evictions. Cache keys use only declarative plan parts and never lambdas. `q.cache({clear: true})` empties them.

## Part 7: What the evidence cannot answer

Two kinds of no: a gap in the capture comes back as a result with a reason; a malformed question is refused.

### 14. A question the capture cannot answer

Where in the source is `row`, and which other capabilities are unavailable?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/14-unavailable.js
```

```js
// What the capture cannot answer comes back as a status with a reason, never as zero.
(() => {
  const run = a.variant("checked");
  const loc = q.run(run.initialModule().sourceLocations({function: "row"}));
  return {status: loc.status, reason: loc.reason, capabilities: q.capabilities().filter(c => c.status === "unavailable").map(c => c.reason)};
})()
```

```json
{
  "status": "unavailable",
  "reason": "missingDebugLocations",
  "capabilities": ["loopFragment", "missingPCSamples; no final image registered", "missingRemarksArtifact"]
}
```

The answer is a result, not an error: status `unavailable`, reason `missingDebugLocations`. An empty list of locations would have looked like a real answer. The capability reasons say what each gap would need.

### 15. Refusals

What happens when the question itself is wrong?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/15-errors.js
```

```js
// Refusals throw "[code] message" with err.code, and q.run refusals add err.got and err.fix.
(() => {
  const attempt = f => { try { f(); return null } catch (e) { return {code: e.code, got: e.got, fix: e.fix, message: String(e.message).split("\n")[0]} } };
  return {
    notAPlan: attempt(() => q.run(42)),
    unknownVariant: attempt(() => a.variant("release")),
    outOfRange: attempt(() => q.run(a.variant("checked").events("middle").at(10000))),
  };
})()
```

```json
{
  "notAPlan": {
    "code": "notAPlan",
    "got": "number",
    "fix": "use the number directly, or ask for the total with unit, workload, contract and source: q.run(profiles.arm(\"checked-gcc\").total(\"instructions\"))",
    "message": "[notAPlan] q.run expects a plan or an object of named plans; got the number 42. it is already a plain value without unit, scope or provenance; q.run has nothing to evaluate and does not echo it"
  },
  "unknownVariant": {"code": "unknownVariant", "message": "[unknownVariant] variant \"release\" is unknown. Valid: checked, firmware, unchecked"},
  "outOfRange": {
    "code": "ordinalOutOfRange",
    "message": "[ordinalOutOfRange] no event with ordinal 10000 in checked/middle (ordinals 0..194, 195 events)"
  }
}
```

Refusals throw. `err.code` is stable for programs to branch on. `q.run` refusals add `err.got` (what arrived) and `err.fix` (the call you probably meant). An out-of-range ordinal names the valid range, and an unknown name lists the valid ones.

## Part 8: The compiler workbench

The same session loads the Typed compiler at any revision and runs its output on the native RV32 interpreter.

### 17. The compiler at two revisions

How do the Step 19 compiler (`04b0854`) and the working tree differ on the ray tracer?

```sh
trace-repl eval --session "$sid" --arg base='"04b0854"' < cmd/trace-repl/examples/17-compile-at-revisions.js
```

```js
// The ray tracer compiled by two revisions of the Typed compiler, side by side in one cell.
// 04b0854 is the Step 19 compiler; the working tree adds induction variables and argument-register reuse.
// trace-repl eval --session "$sid" --arg base='"04b0854"' < 17-compile-at-revisions.js
(() => {
  const revisions = [args.base ?? "04b0854", "worktree"];
  return revisions.map(rev => {
    const c = compiler.at(rev);
    const program = c.typedRv32.compile(c.ray, [], 65536, {policy: "kernel"});
    const frame = c.native.rayBench.frameProfile(program);
    return {rev, revision: c.revision, imageBytes: program.image.length, functions: Object.keys(program.entries).length,
            frameSteps: frame.steps, digest: frame.digest};
  });
})()
```

```json
[
  {"rev": "04b0854", "revision": "04b08540…", "imageBytes": 11600, "functions": 21, "frameSteps": 3399939, "digest": "b3c26cc8"},
  {"rev": "worktree", "revision": "worktree", "imageBytes": 11544, "functions": 21, "frameSteps": 3239635, "digest": "b3c26cc8"}
]
```

The digests are equal, so both images render the same opening frame. The working tree's image is 56 bytes smaller and executes 160,304 fewer instructions (4.7%). A commit is evaluated once per session and then reused, while `"worktree"` is re-read on every call, so an edit shows up in the next cell.

### 18. Profile the opening frame

Where does the kernel-policy ray tracer spend its executed instructions?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/18-opening-frame.js
```

```js
// Run the opening frame on the native RV32 interpreter: steps, output digest, hottest functions.
(() => {
  const c = compiler.at("worktree");
  const program = c.typedRv32.compile(c.ray, [], 65536, {policy: args.policy ?? "kernel"});
  const f = c.native.rayBench.frameProfile(program);
  return {policy: args.policy ?? "kernel", steps: f.steps, digest: f.digest,
          hottest: f.rows.slice().sort((x, y) => y.steps - x.steps).slice(0, 3).map(r => ({name: r.name, steps: r.steps}))};
})()
```

```json
{
  "policy": "kernel",
  "steps": 3239635,
  "digest": "b3c26cc8",
  "hottest": [
    {"name": "typedRayLitRow", "steps": 2299371},
    {"name": "typedRayComputeRow", "steps": 925448},
    {"name": "typedRayBuildGeometry", "steps": 12282}
  ]
}
```

`frameProfile` runs the frame on the native interpreter and returns per-function rows. Shading (`typedRayLitRow`) takes 2,299,371 of 3,239,635 steps and tracing (`typedRayComputeRow`) 925,448. `--arg policy='"default"'` profiles another policy.

### 19. Sweep the policies as a job

What do the five named policies cost in compile time, and what do they buy in executed instructions?

```sh
trace-repl eval --session "$sid" --job --job-timeout 300 < cmd/trace-repl/examples/19-policy-sweep.js
```

```js
// Every named policy on the same frame, sent as a background job: this sweep takes about a second,
// but the same script over more revisions or workloads outgrows a cell's 15-second deadline.
// trace-repl eval --session "$sid" --job --job-timeout 300 < 19-policy-sweep.js
(() => {
  const c = compiler.at(args.rev ?? "worktree");
  const names = args.policies ?? Object.keys(c.typedRv32.policies);
  return names.map(policy => {
    const t0 = performance.now();
    const program = c.typedRv32.compile(c.ray, [], 65536, {policy});
    const compileMs = performance.now() - t0;
    const f = c.native.rayBench.frameProfile(program);
    return {policy, steps: f.steps, imageBytes: program.image.length, hostCompileMs: Math.round(compileMs), digest: f.digest};
  });
})()
```

```json
[
  {"policy": "interactive", "steps": 8997126, "imageBytes": 6792, "hostCompileMs": 32, "digest": "b3c26cc8"},
  {"policy": "balanced", "steps": 5578770, "imageBytes": 8048, "hostCompileMs": 63, "digest": "b3c26cc8"},
  {"policy": "default", "steps": 4888369, "imageBytes": 11964, "hostCompileMs": 149, "digest": "b3c26cc8"},
  {"policy": "kernel", "steps": 3239635, "imageBytes": 11544, "hostCompileMs": 167, "digest": "b3c26cc8"},
  {"policy": "stock", "steps": 15532634, "imageBytes": 9564, "hostCompileMs": 28, "digest": "b3c26cc8"}
]
```

All five render the same frame (`b3c26cc8`). Host compile time grows several-fold from `stock` to `kernel` (the milliseconds vary from run to run), while frame steps fall from 15.5 million to 3.2 million. The sweep takes about a second, so it would also fit in a cell. It runs as a job to show the pattern: the same script over more revisions or workloads outgrows the 15-second cell deadline, and `--detach` returns a job ID at once.

### 20. The hottest instructions of one function

Which instructions of `typedRayLitRow` run most often in the opening frame?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/20-hot-pcs.js
```

```js
// The ten most executed instructions of one function, from per-PC counts of the opening frame.
(() => {
  const c = compiler.at("worktree");
  const program = c.typedRv32.compile(c.ray, [], 65536, {policy: "kernel"});
  const frame = c.native.rayBench.openingFrame(program);
  const fn = args.fn ?? "typedRayLitRow";
  const entries = Object.entries(program.entries).sort((x, y) => x[1] - y[1]);
  const owner = pc => entries.filter(([, start]) => start <= pc).at(-1)?.[0];
  const words = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
  const word = i => 4 * i + 4 <= program.image.length ? words.getUint32(4 * i, true) : 0;
  const hot = [];
  // classify(word, next, after) needs the two following words to recognize bounds tests and capacity loads.
  for (let i = 0; i < frame.counts.length; i++)
    if (frame.counts[i] && owner(4 * i) === fn) hot.push({pc: (4 * i).toString(16), count: frame.counts[i],
      word: word(i).toString(16).padStart(8, "0"), kinds: rv32.classify(word(i), word(i + 1), word(i + 2))});
  return {fn, steps: frame.steps, top: hot.sort((x, y) => y.count - x.count).slice(0, 10)};
})()
```

```json
{
  "fn": "typedRayLitRow",
  "steps": 3239635,
  "top": [
    {"pc": "190c", "count": 52917, "word": "ffe4d383", "kinds": ["load"]},
    {"pc": "1910", "count": 52917, "word": "40790333", "kinds": []},
    {"pc": "1914", "count": 52917, "word": "00035463", "kinds": ["branch"]},
    {"pc": "191c", "count": 52917, "word": "0024d383", "kinds": ["load"]},
    {"pc": "1920", "count": 52917, "word": "0a63c263", "kinds": ["branch"]},
    "… 5 more"
  ]
}
```

`frame.counts` is a `Uint32Array` with one count per 4-byte word of the image, and `program.entries` maps function names to byte offsets. `rv32.classify(word, next, after)` labels a word, and it needs the two following words to recognise bounds tests and capacity loads. The five hottest instructions run 52,917 times each and lie between `0x190c` and `0x1920`, inside one loop body.

### 21. Watch the compiler's passes

How does one function's tape change through the backend's transforms, and how many register homes does the planner assign?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/21-watch-the-passes.js
```

```js
// Watch the tape of one function after every compiler pass (observeTape), and the planner's homes (observePlan).
(() => {
  const c = compiler.at("worktree"), fn = args.fn ?? "typedRayInShadow";
  const phases = [], plan = {};
  c.typedRv32.compile(c.ray, [], 65536, {policy: "kernel",
    observeTape: (name, phase, code) => { if (name === fn) phases.push({phase, cells: code.length}); },
    observePlan: (name, p) => { if (name === fn) Object.assign(plan, {homes: p.homes.size, scored: p.scores.size, skips: p.skips?.size ?? 0}); }});
  return {fn, phases, plan};
})()
```

```json
{
  "fn": "typedRayInShadow",
  "phases": [
    {"phase": "inline", "cells": 332},
    {"phase": "commute", "cells": 332},
    {"phase": "conjunctions", "cells": 326},
    {"phase": "sets", "cells": 326},
    {"phase": "rotate", "cells": 331},
    {"phase": "version", "cells": 605},
    {"phase": "split", "cells": 605}
  ],
  "plan": {"homes": 21, "scored": 41, "skips": 1}
}
```

`observeTape(name, phase, code)` receives a copy of each function's tape after each phase, and `observePlan(name, plan)` receives the operand-location plan. `version` nearly doubles `typedRayInShadow` (331 to 605 cells), because it adds a guarded fast copy of the loop. The planner scores 41 locations and gives 21 of them a register home. The callbacks are read-only views and do not change the image.

## Part 9: Repository evidence, results and statistics

Sessions read their own inputs from the repository, keep results with provenance and share one statistics implementation.

### 22. Score a board run from the repository

Did the candidate image beat the control on the ESP32-P4, block by block?

```sh
trace-repl eval --session "$sid" --arg board='"ttmp/2026/11/21/PICOCALC-RAY-PARITY--make-typed-compiler-optimizations-cumulative-and-close-the-ray-tracer-s-gap-to-c/various/92-board-reuse"' < cmd/trace-repl/examples/22-board-evidence.js
```

```js
// Score a recorded board run from the repository: paired by block, the median per-block saving.
// trace-repl eval --session "$sid" --arg board='"ttmp/2026/11/21/PICOCALC-RAY-PARITY--.../various/92-board-reuse"' < 22-board-evidence.js
(() => {
  const board = args.board ?? repo.list("ttmp/2026/11/21").map(e => e.name).filter(n => n.startsWith("PICOCALC-RAY-PARITY--"))
    .map(n => "ttmp/2026/11/21/" + n + "/various/92-board-reuse")[0];
  const rows = repo.read(board + "/rows.json").json();
  // Frame rows: arm 0 is the C renderer, arm 1 the control image (mode 0), arm 2 the candidate (mode 1); phase 0 is the whole frame.
  const frame = rows.filter(r => r.kind === "frame" && r.fixture === "default" && r.phase === 0);
  const p = stats.paired(frame, {key: "block", value: "value", control: r => r.arm === 1, candidate: r => r.arm === 2});
  return {board, cFrameUs: stats.median(frame.filter(r => r.arm === 0).map(r => r.value)),
          controlUs: p.controlMedian, candidateUs: p.candidateMedian, savedPct: +p.medianPercentSaved.toFixed(2), wins: p.wins, pairs: p.pairs};
})()
```

```json
{
  "board": "ttmp/2026/11/21/PICOCALC-RAY-PARITY--make-typed-compiler-optimizations-cumulative-and-close-the-ray-tracer-s-gap-to-c/various/92-board-reuse",
  "cFrameUs": 7733,
  "controlUs": 11164.5,
  "candidateUs": 10986,
  "savedPct": 1.59,
  "wins": 6,
  "pairs": 6
}
```

The rows come from `repo.read`, so nothing is pasted into the cell, and the record of the run is the file in the repository. `stats.paired` pairs control and candidate by `block` and refuses unmatched or duplicate blocks. In RAY-PARITY run 15, the candidate saved a median 1.59% per block and won all six blocks. The C renderer took 7,733 µs.

### 23. Files now and at a commit

Has the policy table changed since the RV32 backend was split into modules?

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/23-files-at-revisions.js
```

```js
// Repository files now and at a commit: digests, sizes and a directory listing, without leaving the session.
(() => {
  const path = "picocalc-os/compiler/rv32/60-policies.js";
  const now = repo.read(path), then = repo.show("2a5be8f", path);
  return {path, worktree: {sha256: now.sha256, bytes: now.bytes}, at2a5be8f: {revision: then.revision, sha256: then.sha256, bytes: then.bytes},
          same: now.sha256 === then.sha256, sources: repo.list("picocalc-os/compiler/rv32").map(e => e.name)};
})()
```

```json
{
  "path": "picocalc-os/compiler/rv32/60-policies.js",
  "worktree": {"sha256": "313c0c4a…", "bytes": 3893},
  "at2a5be8f": {"revision": "2a5be8f7…", "sha256": "313c0c4a…", "bytes": 3893},
  "same": true,
  "sources": [
    "00-encoding.js",
    "10-function-code.js",
    "11-leaf-code.js",
    "20-inline-and-commute.js",
    "30-version-loops.js",
    "31-split-locals.js",
    "40-ranges.js",
    "41-value-sets.js",
    "42-conjunctions-and-rotation.js",
    "43-inline-candidate.js",
    "50-planner.js",
    "60-policies.js",
    "70-compile.js",
    "README.md",
    "build.mjs"
  ]
}
```

The SHA-256 is the same at `2a5be8f` and in the working tree. `repo.show` resolves the revision to a full commit SHA, and `repo.list` reads a directory. Paths may not leave the repository, even through a symlink.

### 24. Save a result with its provenance

Keep a frame measurement beyond this session, and see what the record says about how it was made.

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/24-save-a-result.js
```

```js
// Keep a result beyond the session: save it with its provenance, then read the record back.
(() => {
  const c = compiler.at("worktree");
  const f = c.native.rayBench.frameProfile(c.typedRv32.compile(c.ray, [], 65536, {policy: "kernel"}));
  const saved = results.save("example-opening-frame", {steps: f.steps, digest: f.digest});
  const record = results.load("example-opening-frame");
  return {saved: {name: saved.name, bytes: saved.bytes}, provenance: {session: record.session, unit: record.unit, repoHead: record.repo.head,
          compilers: record.compilers.map(x => x.requested)}, value: record.value};
})()
```

```json
{
  "saved": {"name": "example-opening-frame", "bytes": 3197},
  "provenance": {
    "session": "session-d85a8a93-e7b2-4d0c-a88e-2fea65600761",
    "unit": "cell",
    "repoHead": "aedd285e…",
    "compilers": ["04b0854", "worktree"]
  },
  "value": {"steps": 3239635, "digest": "b3c26cc8"}
}
```

The record names the session, whether a cell or a job saved it (`unit`), the repository's HEAD commit and every compiler revision the session had loaded. Here that includes `04b0854`, loaded by example 17 in the same session. `trace-repl results --name example-opening-frame` prints the record from the shell.

### 25. Summary statistics

Summarize six control timings, and compare control with candidate block by block.

```sh
trace-repl eval --session "$sid" < cmd/trace-repl/examples/25-summary-statistics.js
```

```js
// The shared statistics: a summary, a quantile, and a paired comparison with its per-block detail.
(() => {
  const rows = [];
  [[100, 95], [102, 96], [98, 94], [101, 97], [99, 95], [103, 96]].forEach(([control, candidate], block) =>
    rows.push({block, arm: "control", us: control}, {block, arm: "candidate", us: candidate}));
  const control = rows.filter(r => r.arm === "control").map(r => r.us);
  return {summary: stats.summary(control), p90: stats.quantile(control, 0.9),
          paired: stats.paired(rows, {key: "block", value: "us", control: r => r.arm === "control", candidate: r => r.arm === "candidate"})};
})()
```

```json
{
  "summary": {"n": 6, "min": 98, "q1": 99.25, "median": 100.5, "q3": 101.75, "max": 103, "mean": 100.5},
  "p90": 102.5,
  "paired": {
    "pairs": 6,
    "controlMedian": 100.5,
    "candidateMedian": 95.5,
    "medianPercentSaved": 4.540816326530617,
    "percentSavedOfMedians": 4.975124378109452,
    "wins": 6,
    "losses": 0,
    "ties": 0,
    "better": "lower",
    "method": "median of per-pair percentage saved, 100 * (1 - candidate / control); wins count pairs where the candidate is lower",
    "spread": {
      "n": 6,
      "min": 3.960396039603964,
      "q1": 4.050711193568341,
      "median": 4.540816326530617,
      "q3": 5.661764705882355,
      "max": 6.796116504854366,
      "mean": 4.960150363183346
    },
    "blocks": [
      {"key": 0, "control": 100, "candidate": 95, "savedPct": 5.000000000000004, "outcome": "win"},
      {"key": 1, "control": 102, "candidate": 96, "savedPct": 5.882352941176472, "outcome": "win"},
      "… 4 more"
    ]
  }
}
```

`medianPercentSaved` (4.54%) is the median of the per-block savings. `percentSavedOfMedians` (4.98%) compares the two arm medians. They answer different questions, so `stats.paired` reports both. `spread` summarizes the per-block savings, which shows how far the blocks disagree.

## Writing your own

Most new questions are an edit of one of these scripts. A few habits keep a new script as reusable as the originals:

- **Return a small, named object.** `({steps: f.steps, digest: f.digest})` survives the 512 KiB result limit and reads well in a diff. Return `undefined` after binding something large that later cells will use.
- **Keep the plan, not only its value.** `q.run(plan)` returns `of`, `unit` and `ref`, and those are what make a number citable. Strip them only at the end, when you build the summary object.
- **Check statuses before arithmetic.** A change row with status `gap` or `unknown` has no attributable delta, and a measurement with status `unavailable` has no value.
- **Save what you will cite.** `results.save(name, value)` records the script's digest, its `args`, the commit and the compiler revisions next to the value.

## Troubleshooting

| Problem | Cause | Solution |
| --- | --- | --- |
| `FAIL 17-...` with `unknown revision` | The service's repository does not contain `04b0854`. | Pass another base, `--arg base='"HEAD~3"'`, or start `serve` with `--repo` pointing at this checkout. |
| `FAIL 22-...` with a missing `rows.json` | The RAY-PARITY ticket is not in the service's repository. | Pass `--arg board='"PATH/TO/BOARD/DIR"'` for a board directory that has `rows.json`. |
| A script fails with `Identifier ... has already been declared` | It was edited to declare top-level names. | Keep the body inside `(() => { ... })()`. |
| `run-all.sh` prints `FAIL` for every script | The binary or the address is wrong. | Set `TRACE_REPL` to the built binary and pass the service's `--addr`. |
| 19 fails with `deadline` | The sweep was given more work than its timeout allows. | Raise `--job-timeout`, up to the service's `--max-job`. |

## See Also

- `trace-repl help trace-repl-user-guide`: the concepts behind these scripts (plans, states, timelines, units, statuses).
- `trace-repl help trace-repl-js-api`: every method these scripts call, with arguments and result shapes.
- `trace-repl help trace-repl-cli-and-http`: `eval`, `--arg`, `--job` and the HTTP protocol.
