---
Title: Research questions and executable queries for the ray row
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/scripts/01-row.c
      Note: Checked LLVM subject
    - Path: repo://ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/scripts/05-execute.py
      Note: Counter population and symbol boundary
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T14:22:59.140526204-05:00
WhatFor: ""
WhenToUse: ""
---

# Research questions and executable queries for the ray row

## What does a row cost?

A PicoCalc developer wants the Typed compiler to generate a fast sphere-intersection loop. For each sphere, the row kernel visits horizontal sample positions. A negative discriminant rejects the ray. For a hit, the kernel computes a candidate depth and may replace the current nearest sphere. Distinct questions follow from this small amount of source code. Does the compiler perform the same capacity check repeatedly? Does it recompute addresses? Does assigning registers reduce executed memory traffic? Does packed execution of adjacent samples help on the physical board?

The following cells start from the actual checked-row archive and use the REPL's persistent bindings. The corresponding evidence producers are the C row, its pass driver, the guest-instruction counter and the Typed fixture runner in the upstream ROW-IR ticket. The [26-example companion](../reference/05-original-language-specification-and-workbook-concordance.md) develops individual operators in more detail.

```js
const checked = a.variant("checked")
const rayRow = checked.function("row")
const ir = rayRow.timeline("middle")
const cpu = rayRow.timeline("backend")
const countOpcode = op => q.ir.instructions().opcode(op).count()
const capacityLoads = q.ir.instructions().opcode("load")
  .resultType("i32").pointer(rayRow.argument(0)).count()
const openingRow = arm => profiles.arm(arm)
  .region("row").workload("opening-160-rows")
const work = arm => openingRow(arm).total("instructions")
```

### 1. Where did a redundant capacity read first disappear?

```js
const adjacent = ir.measure(capacityLoads).changes()
const decrease = adjacent.where(c => c.status === "known" && c.delta < 0)
q.run(decrease.first())
```

For the archived checked kernel the first observed drop between complete neighboring prints occurs from 73 to 74. The count goes from eleven to six. Open the witnesses to examine each function before proposing a Typed optimization. The count refers to five fewer static sites. The number of repeated executions saved depends on which paths the rays take.

```js
q.run(q.bundle({
  before: capacityLoads.at(ir.at(73).after),
  after: capacityLoads.at(ir.at(74).after),
  excerpt: ir.at(74).after.excerpt({contains: "load i32, ptr %work"})
}))
```

For a port of this transformation, identify every store and call between two candidate loads. An intervening operation that can change the buffer header invalidates reuse. In a checked program the relative order of traps and visible writes can also matter. This query tells the engineer which compiler pass and piece of code to inspect. A sound transformation still requires a rule about memory effects in the Typed language.

### 2. When does an automatic local turn into an SSA value?

```js
const frameSlots = countOpcode("alloca")
const merges = countOpcode("phi")
const at = ordinal => ir.at(ordinal).after
q.run(q.bundle({
  slotsBefore: frameSlots.at(at(5)), slotsAfter: frameSlots.at(at(6)),
  mergesBefore: merges.at(at(5)), mergesAfter: merges.at(at(6))
}))
```

LLVM's first SROA invocation in this pair takes allocations from 16 to zero and phi nodes from zero to three. An SSA value has a single definition. A phi specifies which incoming definition to use for each predecessor of a block. The disappearance of scalar stack objects during this phase suggests a useful question about the Typed frontend's representation of local values. Machine register allocation comes later and can introduce its own spill loads and stores.

### 3. Did register rewriting finish the first time the named pass ran?

```js
q.run(cpu.where(e => e.passId === "virtregrewriter")
         .select("ordinal", "passId", "ref"))
const physical = q.machine.property("NoVRegs")
q.run(q.compare(physical.at(cpu.at(74).after),
                physical.at(cpu.at(78).after)).asEndpoints())
```

The first recorded occurrence leaves the machine property false. The second yields true. `NoVRegs` says that the machine representation at that point has no virtual registers. It does not specify whether there are spill slots. When the same pass occurs twice, a citation needs the phase, ordinal and stream identity. A tool that simply returns the first snapshot with a matching name could lead a student to describe an unfinished register assignment as the final result.

### 4. How much work does induction-variable optimization save?

```js
const ablation = q.compare(work("checked-llc-nolsr"), work("checked-llc"))
  .matchOn("workload", "region", "checkedContract", "unit")
q.run(ablation.percentChange({denominator: "before"}))
```

Disabling then enabling LLVM loop strength reduction gives 1,275,560 and 1,233,611 instructions. The difference is −41,949, or −3.29% relative to the disabled build. Both treatments start with the same optimized input to the LLVM backend. The result includes downstream changes caused by this option. Naming one specific address recurrence as responsible for every saved instruction would require more evidence.

The analogous engineering change in Typed is to recognize that successive horizontal addresses differ by a constant increment, then keep a running address. For a research comparison, capture the relevant machine loop in each treatment, run identical row inputs and retain the two images alongside the counts. The normal-build machine dump alone cannot explain the disabled build's register allocation.

### 5. Which experiments distinguish a closed performance gap from a cheaper measurement?

```js
q.run(q.bundle({
  checkedC: work("checked-gcc"),
  llvmC: work("checked-llvm"),
  baselineTyped: work("typed-stock"),
  scalarTyped: work("typed-scalar"),
  packedTyped: work("typed-pie"),
  packets: openingRow("typed-pie").total("packets")
}))
```

The opening-row populations yield 1,136,142 instructions for checked GCC, 1,233,611 for checked LLVM, 3,608,697 for stock Typed, 3,199,910 for the scalar alternative and 3,131,435 for packed Typed. The latter executes 3,135 packets under the Typed counter's convention. Use scalar-to-packed for the incremental change from the packet kernel; stock-to-packed includes other code-generation differences. Instructions executed by the emulator do not supply frame milliseconds on the P4. Verify compiler contract and source identity separately when designing a new experimental pair.

### 6. Is register allocation worth an experiment, and which slots should get two registers?

```js
const directTraffic = arm => {
  const r = openingRow(arm)
  return q.add(r.total("stackLoads"), r.total("stackStores"))
    .label("direct stack accesses")
}
q.run(q.bundle({
  stock: directTraffic("typed-stock"),
  scalar: directTraffic("typed-scalar"),
  packed: directTraffic("typed-pie")
}))
```

Stock Typed executes 936,328 direct stack loads and 353,778 stores. Their sum is 1,290,106 accesses. The compiler engineer now has a reason to investigate register management. This total loses slot identity. To choose two slots, retain machine PC, stack offset, access kind, dynamic count and function. Then determine where each value is live and which calls clobber the proposed registers. Two independently hot values that are live simultaneously compete for registers. Subtracting two ranked frequencies from total instructions without modeling spills would overstate the benefit.

### 7. Can we attribute time to misses, accepted hits, packet lanes or shadow work?

```js
q.run(q.joinPCs(profiles.arm("checked-llvm"), checked.finalImage())
       .requireMatch("imageSHA", "addressSpace"))
```

The saved execution summaries retain counts per arm and selected row samples. Recovering a per-PC histogram from that aggregate is mathematically underdetermined. The ray fixture can produce the same totals with different distributions of dynamic work. Record per-attempt ray outcomes to distinguish misses, rejected depths and winning writes. For packets, also record the active-lane mask, selected path, fallback reason and an ID shared with the scalar attempts. For shadow arithmetic, capture a separate function or phase region. A primary-intersection symbol cannot establish how much time a shadow ray costs.

A useful next experiment is to compare a count-weighted improvement with the distribution of work. A path that saves two instructions on most rays may matter more than a path that saves thirty instructions on rare hits. Keep the unit (attempt, lane, packet, row, or frame) on every intermediate table.

### 8. What would establish a physical speed improvement?

The ROW-IR service serves emulator counts. Paired trials live in the distinct PIE-LOOPS hardware study. The physical experiment compares elapsed microseconds on the same P4 using matching poses and strides. Its raw trials and the treatment-to-kernel mapping belong together. A dense array of timing columns has no meaningful label until the capture protocol identifies which kernel ran.

```text
for each (fixture, pose, stride, block, phase):
    require exactly one baseline and one candidate measurement
    verify the intended input, output checksum and treatment labels
    saved_us = baseline_us - candidate_us
group the paired savings by pose
report the median and number of pairs, including adverse poses
```

Supply the PIE-LOOPS ticket root to the optional `--device-study` argument when starting the service. The `hardware` binding exposes paired rows. Each records the two source-row indices, scene coordinates, checksums, measurement order, source identity and signed saving. The adapter compares stock to scalar, scalar to PIE, and stock to PIE. The saved percentage in each paired row uses its own baseline as denominator.

```js
const median = xs => {
  const a = [...xs].sort((l, r) => l - r)
  const i = Math.floor(a.length / 2)
  if (!a.length) throw Error("empty sample")
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2
}
const packedFrames = hardware.pairs("scalar", "pie", "clean")
const defaultFrames = packedFrames.filter(r => r.pose === "default")
;({
  blocks: defaultFrames.length,
  medianSavedUs: median(defaultFrames.map(r => r.savedUs)),
  medianSavedPct: median(defaultFrames.map(r => r.savedPct)),
  firstWitness: defaultFrames[0],
  inputDigests: hardware.metadata().artifactSHA
})
```

For six default-scene blocks the matched scalar-to-PIE change saves a median 242 microseconds per clean frame (0.43%). Repeating the same calculation with stock as the baseline gives 1,616 microseconds (2.80%). Using the second number as the incremental effect of packed instructions would include the scalar compiler changes in the attribution. Inspect other poses by retaining `packedFrames` in the same session. This leaves the original 160-row emulator experiment untouched.
