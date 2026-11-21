---
Title: A worked query workbook for the PicoCalc LLVM row archive
Ticket: PICOCALC-TRACE-QUERY
Status: active
Topics:
    - compiler
    - picocalc
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-QUERY--design-a-composable-javascript-query-api-for-compiler-traces/scripts/01-check-evidence.mjs
      Note: Executable assertions for the measured examples
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-QUERY--design-a-composable-javascript-query-api-for-compiler-traces/scripts/02-workbook-modules.py
      Note: Synchronizes and syntax-checks all 26 example modules
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T12:28:24.017848843-05:00
WhatFor: ""
WhenToUse: ""
---

# A worked query workbook for the PicoCalc LLVM row archive

The examples are proposed client programs for the design in chapter one. Each snippet is the body of an example function. The companion `scripts/examples/` directory contains one syntax-checkable JS module for each example. Numerical results identified as **verified** can be reproduced by `node scripts/01-check-evidence.mjs`. Examples described as **contract tests** specify behavior for the future implementation. An ordinary Node installation can run the evidence verifier without the proposed library.

### Common bindings

Each example receives a small context. To see how to use the proposed library in a standalone application, supply these bindings once. The archive path names the sibling study's `various/llvm-pipeline` directory. Summary adapters are configured separately with the `various/passes` directory. The context is a convenience for these examples; a query can also be passed directly as an argument to another function.

```js
const a = q.archive(archivePath);
const run = a.variant("checked");
const row = run.function("row");
const middle = row.timeline("middle");
const header = q.ir.instructions().opcode("load")
  .resultType("i32").pointer(row.argument(0)).count();
const profiles = q.profiles(summaryPath);  // existing aggregate JSON
const ctx = { q, a, run, row, middle, header, profiles, session };
```

Most example functions return a plan. Evaluate that plan with `await q.run(plan)`. Examples that bind a parameter or perform an explicit interaction show the call themselves. In the API, `where` retains records satisfying a predicate, `select` projects named fields, `count` reduces a selection, and `at` means an absolute ordinal in its original stream. `metric.at(state)` evaluates a metric on one state. `q.bundle` names several outputs; each output keeps its own unit and witnesses.

## 01. Count observations before interpreting them

```js
return a.events().count();
```

**Verified:** 4,133 header records across six streams. A repeated pass contributes another event; the count includes events that leave the observed program unchanged. This establishes the population before we ask what changed.

## 02. Select a run and phase

```js
return run.events("middle").count();
```

**Verified from the manifest:** 195 middle-end records in the checked run. Its backend has 116. Both numbers use events as their unit. The backend's ordinals start at zero independently of the middle-end.

## 03. Retrieve one observation with its byte range

```js
return run.events("middle").at(74)
  .select("ordinal", "header", "ref");
```

**Verified header:** EarlyCSEPass on `row`. The reference contains the stream digest and byte interval. `at(74)` addresses the original stream even if a UI currently displays only a few matching entries. Out-of-range ordinals produce an explicit lookup error.

## 04. Inspect evidence before counting

```js
return middle.at(74).after.excerpt({ contains: "load i32, ptr %work" });
```

This text query helps a student recognize a capacity load. A hit returns source bytes, an excerpt and offsets. An excerpt is a search result; a compiler-level query later needs a resolved operand identity. Changing LLVM's spelling of a local can change this search result.

## 05. Count a precise instruction pattern

```js
return header.at(middle.at(74).after);
```

**Verified:** six static direct i32 loads from the capacity address. The pointer selector resolves argument zero *in this function*. An unrelated local called `%work` in another function cannot match. A load of a payload halfword has a different type and address.

## 06. Reuse a metric at two boundaries

```js
return q.bundle({
  earlier: header.at(middle.at(73).after),
  later:   header.at(middle.at(74).after)
});
```

**Verified:** eleven and six. A bundle preserves the inputs separately. It is useful when a result table must allow the reader to inspect both counts before deriving a percentage.

## 07. Find the first observed reduction

```js
return middle.measure(header).changes()
  .where(c => c.status === "known" && c.delta < 0).first();
```

**Verified:** the first observed decrease between consecutive full row prints is 73 → 74, SROA to the following EarlyCSE invocation. The difference is −5. The verifier scans earlier consecutive prints and resets its predecessor when coverage is missing. A full absence claim through an unknown gap would need stronger evidence.

## 08. Demonstrate an unsafe query rewrite

```js
const onlyCSE = middle.where(e => e.pass === "EarlyCSEPass");
return onlyCSE.measure(header).changes();
```

**Contract test:** disjoint EarlyCSE ordinals yield gaps where original adjacency is broken. Subtracting successive appearances of this pass could include the work of intervening passes. Compare this plan with example 07; the order of filter and difference has changed the question.

## 09. Measure two different operations from one snapshot

```js
const sites = op => q.ir.instructions().opcode(op).count();
const state = middle.at(6).after;
return q.bundle({ allocations: sites("alloca").at(state),
                  merges: sites("phi").at(state) });
```

**Verified:** zero allocations and three phi instructions in `row`. A phi selects an incoming value by predecessor block. It permits an index to be a value with a definition even when control reaches the loop from either entry or the backedge.

## 10. Compare adjacent program representations

```js
const allocas = q.ir.instructions().opcode("alloca").count();
return q.compare(allocas.at(middle.at(5).after),
                 allocas.at(middle.at(6).after));
```

**Verified:** sixteen allocation sites become zero across the first SROA pass on the checked row. The observed metric is allocation instructions in LLVM IR. The machine can still save registers on its runtime stack later. Example 19 asks the latter question at the appropriate level.

## 11. Follow definitions instead of matching printed names

```js
const state = middle.at(74).after;
return state.instructions().opcode("load").resultType("i32")
  .pointer(row.argument(0)).uses().select("userOpcode", "operandIndex", "ref");
```

This is a structural-adapter contract test. Starting with the six loads, follow uses to see how their values participate in comparisons. Each row in the result is a use edge; the same instruction can consume a value more than once. The adapter must resolve names within the current state. A line containing the same printed register in a different snapshot provides no def-use edge.

## 12. Ask what is missing

```js
return run.initialModule().sourceLocations({ function: "row" });
```

**Verified prerequisite:** the archived raw modules lack debug locations and compile units. Expected response: unavailable with reason `missingDebugLocations` and the digest of the module checked. Returning an empty set of executable source lines would imply a conclusion the capture cannot support.

## 13. Request whole-function coverage explicitly

```js
const loopPrint = run.events("middle")
  .where(e => e.scope.kind === "loop").first();
return header.at(loopPrint.after).requireCoverage("function");
```

**Contract test:** if only a loop fragment was printed, report unavailable for the requested whole function. This test should also include a complete module print containing the row; that print *can* satisfy function coverage. Selection depends on what the artifact actually contains.

## 14. Make repeated machine passes visible

```js
return row.timeline("backend")
  .where(e => e.passId === "virtregrewriter")
  .select("ordinal", "passId", "scope", "ref");
```

**Verified:** the checked backend has matching entries 74 and 78. A select-one convenience should return ambiguous for these two matches. The phase matters: middle-end ordinal 74 in example 03 describes a different event.

## 15. Compare the two register-rewriter occurrences

```js
const machine = row.timeline("backend");
const noVRegs = q.machine.property("NoVRegs");
return q.bundle({
  first: noVRegs.at(machine.at(74).after),
  last:  noVRegs.at(machine.at(78).after)
});
```

**Verified:** false, then true in the checked machine function's property list. A virtual register is a temporary compiler name; a physical register is a specific processor location. This query detects why using the first rewriter snapshot as the final allocation would have been an error.

## 16. Compare endpoints across a gap deliberately

```js
const states = row.timeline("backend");
const metric = q.machine.property("NoVRegs");
return q.compare(metric.at(states.at(74).after),
                 metric.at(states.at(78).after))
  .asEndpoints();
```

The result records a Boolean transition, both witnesses and the intervening interval. It cannot assign the entire difference to the final invocation. Boolean metrics support equality and transitions; requesting a numeric percentage reduction should report a type error.

## 17. Ask for a decision and its explanation separately

```js
const vector = middle.where(e => e.pass === "LoopVectorizePass").first();
return q.bundle({
  state: vector.after.excerpt({ contains: "define" }),
  reasons: run.remarks().forEvent(vector)
});
```

The final scalar row and the pass dump are available. This LLVM experiment did not supply an actionable missed-vectorization reason. An implementation should distinguish a missing remarks artifact from an imported artifact containing zero matching remarks. It can show GCC's separate remarks in a cross-compiler comparison with their own provenance. It must not assign them to LLVM.

## 18. Import an execution summary

```js
return profiles.arm("checked-gcc").region("row")
  .workload("opening-160-rows").total("instructions");
```

**Verified:** 1,136,142 guest instructions inside the measured row symbol across 160 calls. `workload` is a documented adapter label for the fixture population. Reading the mean per call would answer a different question. A single row like y=61 is available only when the input file contains a per-row sample.

## 19. Compose metrics with compatible units

```js
const stock = profiles.arm("typed-stock").region("row")
  .workload("opening-160-rows");
return q.add(stock.total("stackLoads"), stock.total("stackStores"))
  .label("direct stack accesses");
```

**Verified:** 936,328 + 353,778 = 1,290,106 executed direct stack accesses. The Typed adapter maps `typed-stock` to the stock entry in `typed-counts.json`. Loads and stores here are disjoint categories of executed access; adding primary time to this count would be invalid. Indirect accesses through other base registers are outside the definition.

## 20. Compare two compilers on equivalent inputs

```js
const total = arm => profiles.arm(arm).region("row")
  .workload("opening-160-rows").total("instructions");
return q.compare(total("checked-gcc"), total("checked-llvm"))
  .matchOn("workload", "region", "checkedContract", "unit");
```

**Verified levels:** GCC 1,136,142 and LLVM 1,233,611. These are checked C builds using the same controlled source. Across compilers they have different image identities by design. Matching the logical workload is appropriate for comparing their totals; joining instruction samples from one image to addresses in the other would be invalid.

## 21. Isolate a pass with an ablation

```js
const total = arm => profiles.arm(arm).region("row")
  .workload("opening-160-rows").total("instructions");
return q.compare(total("checked-llc-nolsr"), total("checked-llc"))
  .matchOn("workload", "region", "checkedContract", "unit")
  .percentChange({ denominator: "before" });
```

**Verified:** disabling and enabling LLVM loop strength reduction gives 1,275,560 and 1,233,611 instructions. The delta is −41,949, about −3.29% relative to disabled. This compares two `llc` arms starting from the same optimized module. Later passes can respond to the change, so the result measures its net pipeline contribution.

## 22. Ask for a PC join the input cannot answer

```js
const summary = profiles.arm("checked-llvm");
return q.joinPCs(summary, run.finalImage())
  .requireMatch("imageSHA", "addressSpace");
```

**Contract test:** a table containing only totals cannot fill a PC column. Report `missingPCSamples` if an aggregate is supplied, or the missing-input diagnostic if the final image was never registered. With full samples, require a known image identity, address normalization and a symbol boundary; a matching function name alone cannot establish a correct join.

## 23. Extend a component with a scoped fragment

```js
const layout = q.fragment("picocalc.row.v1").on("irFunction", {
  capacityMetric: fn => q.ir.instructions().opcode("load")
    .resultType("i32").pointer(fn.argument(0)).count()
});
return row.with(layout).capacityMetric().at(middle.at(74).after);
```

Expected: the same six sites and normalized core expression as example 05. The fragment records the buffer-layout convention and its version. The expansion callback runs once when constructing the plan. Installing the fragment on an arbitrary function with a non-buffer first argument requires a caller-supplied contract or a diagnostic.

## 24. Bind a slider without reading the archive again

```js
const minimum = q.param.int("minimum", { min: 1, max: 16, default: 1 });
const drops = middle.measure(header).changes()
  .where((r, ctx) => r.status === "known" && -r.delta >= ctx.param(minimum),
         { dependsOn: [minimum] });
return q.run(drops, { bindings: { minimum: 5 } });
```

The 73 → 74 drop qualifies at five and fails at six. Those bindings change the filter and its result. The underlying load counts can be reused. An undeclared mutable closure would invalidate that inference; a runtime diagnostic should identify a symbolic parameter read that was never declared.

## 25. Branch a shared query into an interactive result

```js
const changes = middle.measure(header).changes();
const plan = q.bundle({
  timeline: changes.table("ordinal", "before", "after", "delta"),
  first: changes.where(r => r.status === "known" && r.delta < 0).first()
});
return q.explain(plan);
```

**Contract test:** the plan explanation identifies one archive and one measured timeline feeding two consumers. A table request may paginate its display without changing the scope of `first`. To pin evidence in an interactive agent, evaluate the plan, then call `session.pin(result.first)`. Pinning is an effect on the session. It does not change the shared plan.

## 26. Design a research comparison with a falsifiable prediction

```js
const arm = q.param.choice("arm", ["checked-llc", "checked-llc-nolsr"]);
const rowWork = profiles.arm(arm).region("row")
  .workload("opening-160-rows").total("instructions");
const state = row.timeline("backend").at(78).after;
return q.bundle({
  normalBuildHasPhysicalRegisters: q.machine.property("NoVRegs").at(state),
  executedRowWork: rowWork
});
```

Evaluate the plan for both arms. Predict fewer executed instructions with strength reduction enabled and check the numbers from example 21. The machine-state observation belongs to the **normal build for both bindings**. Its identical appearance in both results cannot establish what happened inside the disabled arm. To study that arm's register assignments, capture its own machine pipeline and bind both the event source and the profile. This last example illustrates the value of producing an evidence reference for *every* cell of a research table.

### Suggested lab exercise

Start with 05, 07, 14 and 21. For each, write down the population, unit, scope, comparator and available evidence before looking at the expected result. Then replace the checked arm with the unchecked arm. A principled answer will sometimes be an absent subject, a different ordinal or an unavailable observation. Hard-coding an ordinal from a different build can yield a well-formed but scientifically meaningless answer.
