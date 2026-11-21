---
Title: A query language for compiler evidence in JavaScript
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
    - Path: repo://picocalc-os/tools/typed-inspect.mjs
      Note: Source and RV32 inspector for a future Typed provider
    - Path: repo://ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/scripts/09-archive-llvm.py
      Note: Defines the archived digest, ordinal and decompressed byte ranges
    - Path: repo://ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/scripts/10-read-pass.py
      Note: Existing low-level reader for the proposed archive adapter
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T12:28:23.502006668-05:00
WhatFor: ""
WhenToUse: ""
---

# A query language for compiler evidence in JavaScript

## Start with one load

The PicoCalc ray tracer draws a 160 by 160 image. One function visits a horizontal row of pixels and tests each ray against spheres. The program keeps several tables in a common buffer. Its first four bytes give the number of 16-bit elements the program may access. Reading an element requires comparing its index with that capacity. A compiler can sometimes reuse a capacity it has already read. Our question is precise: **which compiler pass first turned eleven direct loads of the capacity into six in the checked C translation of the Typed row?**

A compiler pass transforms a program or computes facts about it. LLVM's **intermediate representation** (IR) describes functions as blocks of instructions. A block can branch to another block. Instructions produce values that subsequent instructions consume. In this particular row, the first argument is the work-buffer pointer. The IR instruction `load i32, ptr %work` reads a 32-bit integer at that address. Counting those instructions in a complete function gives the number of *static load sites*. It does not tell us how often the loop runs. That requires executing the program or obtaining a profile.

Our earlier experiment stored LLVM 18.1.3 outputs after compiler passes. In the checked middle-end trace, entry 73 shows eleven such loads and entry 74 shows six. Entry 74 follows EarlyCSE, an optimization that can reuse an earlier expression or load under suitable conditions. The neighboring snapshots supply the evidence for that boundary. The count alone does not identify the internal proof used for each eliminated load.

This guide designs a host-side JavaScript library with which an intern can reproduce that analysis and construct others. The proposed API appears in code examples. The archive, existing Python reader, measured counts and this ticket's independent Node verifier are available today. Chapter two provides 26 examples, with inputs, evidence and limitations. A small group can implement the library in increments without changing the device firmware.

## Three systems a reader must keep separate

1. **The observed program.** Typed JS, our statically typed JavaScript-like language, and a controlled C translation compute the same row on the tested inputs. LLVM compiles the C control to RISC-V. Typed has its own compiler. ESP32-P4 PIE instructions process several 16-bit values together in selected Typed configurations.
2. **The evidence collector.** Clang, opt and llc produce LLVM modules, per-pass prints, and target-specific machine IR. QEMU and the project's Typed interpreter count executed instructions for separate executables. A physical P4 provides elapsed time in separate trials. Collection has effects and can take seconds or minutes.
3. **The query program.** A JS author selects evidence, defines measurements and asks the library to evaluate them. Its own IR describes an analysis of files. A loop in the observed program can have a backedge even though the dependencies of a query form a directed acyclic graph (DAG).

```text
C source -> LLVM IR -> machine IR -> RV32 executable -> execution
               |            |              |              |
           pass archive  snapshots      identity       profile
               +------------+--------------+--------------+
                                       |
                            immutable artifact catalog
                                       |
                       query plan -> results + witnesses
```

### Read the corpus before designing a parser

The sibling PICOCALC-ROW-IR ticket has three subjects. The firmware translation unit includes many functions, including the real C `trace_row`. The smaller `checked` and `unchecked` units each contain a function named `row`. The checked control has bounds checks matching the Typed access contract on the valid fixtures. The unchecked control assumes a valid index. Their optimized IR shapes legitimately differ.

| Evidence source | Contents | Useful identity or boundary |
|---|---|---|
| Six indexed gzip streams | Each of three inputs produced a middle-end and a backend log. Together they contain 4,133 printed snapshots. | Recorded SHA-256 of uncompressed stream, phase and zero-based ordinal |
| Full `raw.ll` and `opt.ll` modules | Entry and optimized program in LLVM syntax | Module digest, function and module-local definitions |
| Machine IR (MIR) | Virtual or physical registers, instructions and machine blocks | Machine-function identity, stage, target properties |
| Static metrics JSON | Previously counted operations in selected function snapshots | Method, exact scope and pass occurrence |
| Execution summaries | Guest instruction counts and direct stack-relative accesses for matched row inputs | Compiler arm, fixture, region, sample or aggregate, unit |
| Physical summaries | Elapsed time for primary, shade, audit and clean frame | Trial, block, pose, implementation, phase and unit |

The pass stream prints at the natural scope of a pass. A loop excerpt can be only part of a function. A module snapshot can include the whole function. A diagnostic line may sit between two printed programs. Some invocations leave the program unchanged. An analysis can run without creating a new printable state. The archived initial modules have no source-line debug locations. Represent these properties explicitly at ingestion.

## The grammar

A **sort** specifies which inputs and operations a component accepts. A **relation** is a collection of records with named fields; an order exists only if specified. Filtering a relation selects records, projection chooses fields, a join relates records by keys, and reduction computes a summary. A timeline adds an explicit order. It preserves repeated invocations, even if their printed bodies are identical.

| Sort | Constructors and inputs | Result and operations |
|---|---|---|
| Artifact and run | `q.archive(path)`, `a.variant(id)` | Immutable reference. Discover streams, select functions or final artifacts. |
| Subject | `run.function(name)`, `fn.argument(i)` | Symbol within a run and IR level. Resolve operands inside a particular state. |
| Timeline and event | `fn.timeline(phase)`, `at(ordinal)`, `where(...)` | Ordered events with scope, invocation, coverage and references to after-state. Ordinals refer to the original stream. |
| State and selection | `event.after`, `state.instructions()`, `opcode`, `resultType`, `pointer`, `uses` | Relations of blocks, instructions, operands or def-use edges, scoped to that state. |
| Metric and observation | `q.ir.instructions()...count()`, `timeline.measure(metric)` | A reusable expression plus observations with units, subject, coverage, method and witnesses. |
| Comparison | `observations.changes()`, `q.compare(left,right)` | Before/after references, signed delta, units and comparability status. |
| Parameters and views | `q.param.choice`, `q.param.int`, `first()`, `table(...)`, `q.bundle({...})` | Bind choices on execution and present several results from shared plan nodes. |
| Extension and effect | `q.fragment(name).on(sort,methods)`, `q.run(plan,bindings)`, `session.pin(result)` | Extend a receiver, execute a plan or record an explicit user action. |

For standard selections, applying the same pure predicate twice gives the same selected records. Two pure, total filters on the same record type can be interchanged if neither observes position or order. Counting across disjoint, complete partitions is additive. The same instruction appearing in successive snapshots belongs to different observations. Summing those counts answers a different question from counting one function.

The order-sensitive operator is `changes`. Suppose we filter for EarlyCSE, discard the intervening passes, then compute differences. A difference would now include transformations by other passes. In the default grammar, select the subject, measure the full ordered timeline, derive adjacent changes, *then* filter the changes by pass name. A separate endpoint comparison across a gap is useful and must expose that gap.

```js
const a = q.archive(path);
const row = a.variant("checked").function("row");
const header = q.ir.instructions().opcode("load")
  .resultType("i32").pointer(row.argument(0)).count();
const series = row.timeline("middle").measure(header);
const firstDrop = series.changes().where(d => d.delta < 0).first();
const observation = await q.run(firstDrop);
```

The builders in this example describe future work. `q.run` opens the catalog, verifies identities, extracts candidate states and evaluates the metric. The delta convention is **after minus before**. An eleven-to-six change is −5 static sites. A user-facing column called “saved” can explicitly compute the opposite sign.

## Identity, coverage and units

The minimum event address is `(uncompressed stream hash, ordinal)`. Include the case and phase in every rendered citation for readability. Store the event's byte range as a half-open interval `[start,end)`. Text offsets index bytes before UTF-8 decoding. A JavaScript string indexes UTF-16 code units; slicing such a string at raw stream offsets can select the wrong bytes. The final range ends at the exact uncompressed length.

Within an event, a subject includes its level (LLVM IR or machine IR), function and any narrower scope. An SSA name can be reused after a pass or disappear on inlining. A local label such as `%17` is an identity only within its state. A cross-state match returns its rule and confidence. A source location can represent multiple instructions, and an instruction may originate in an inlined call. There is no universal one-to-one lineage key.

Proposed minimal result contract:

```ts
type Ref = { streamSHA: string; ordinal: number; start: number; end: number };
type Observation<T> =
  | { status: "known"; value: T; unit: string; subject: string;
      coverage: "function" | "loop" | "module" | "fixture-set"; refs: Ref[] }
  | { status: "unavailable" | "incomparable" | "ambiguous";
      reason: string; refs: Ref[] };
```

For scalar summaries from JSON, generalize `Ref` to a tagged union with a file digest and JSON pointer. An execution count should cite the fixture set and the artifact that defines the region. A derived result retains both inputs and the metric's versioned definition. Detailed lists of witnesses can be paginated; availability of a scalar count must never depend on how many rows a UI displays.

- **Zero** is an observed count from an adequate scope. Zero matching loads is valuable evidence.
- **Unavailable** means a required capability is missing, such as source locations or a complete function at this event.
- **Incomparable** means both inputs exist but differ in a required key, unit or contract. A microsecond duration cannot be subtracted from an instruction count.
- **Ambiguous** means multiple matches remain, such as two occurrences of the virtual-register rewriter when exactly one was requested.

Sequences normally preserve holes. A partial state between two complete states interrupts single-invocation attribution. In a first conservative implementation, require consecutive stream ordinals and complete evidence for the same subject before publishing an attributable change. A future implementation could cross events proven unable to modify that subject, provided it records its proof. Endpoint difference is still available through explicit `q.compare` with the intervening ordinal range displayed.

## Build-time and runtime JavaScript

A builder returns an immutable value on every call. This makes it safe to branch a plan into two questions. Built-in selections, projections and metrics use typed expression nodes; they can be validated and shared. JS is the host language and supplies ordinary callbacks.

- A fragment method receives a builder during **plan construction** and returns another builder. For example, `capacityLoads(fn)` can expand to an instruction selector for argument zero.
- A parameter is a symbolic input with a name, type, domain and default. A choice of variant changes which archive stream is read. A minimum-delta slider changes a downstream filter. Bind values using `q.run(plan,{bindings:{...}})`.
- A row predicate such as `.where(change => change.delta < 0)` executes **during evaluation** on a record. A symbolic parameter used by such a callback is read through `ctx.param(p)`, with its dependency declared to the plan. The engine can offer named pure strategies or a trusted arbitrary lambda.
- A callback that captures mutable JS state is opaque. Persistent caching requires a registered strategy ID, version, declared dependencies and deterministic behavior. A developer's declaration is a contract, not a sandbox. Inline callbacks can execute in the current session.
- A session cursor or a pin is mutable UI state. `session.selectPass(ref)` and `session.pin(result)` perform the requested effect directly. Repeatable analyses use explicit parameters and artifacts.

Register fragments into an explicit catalog. A fragment has a namespace, version, receiver sort, input types and expansion function. Refuse collisions on the same fully qualified method. An optional proxy can suggest legal members when the user asks for physical registers on an LLVM IR state. Real validation belongs in the builder/type checker too, so batch scripts and a proxy-free implementation get the same diagnostics. Typing a missing member must never create a new query method as a side effect.

## From a fluent expression to an answer

```text
                     Archive + variant
                            |
                      event directory
                            |
                     function timeline
                            |
                       header loads
                         /      \
              adjacent changes   values by ordinal
                    |                  |
               first decrease        table
```

The **logical plan** records operations, dependencies, units, declared capabilities and callback stages. The **execution plan** chooses readers and extraction strategies. Return `q.explain(plan)` as plain structured data for both humans and the inspector UI. For example, it should show that finding rewriter invocations needs the index only, while reading `NoVRegs` requires machine snapshot text. An explanation of a historical optimization must identify whether it comes from a diff, a recorded remark, upstream code or a pass-off experiment.

A deterministic node key includes the operator and version, normalized arguments, input node keys, relevant parameter values, source digest and parser version. To serve two plots sharing a timeline, load the index once and cache one decompressed Buffer per active stream under a byte budget. Ordinary gzip offsets seek in decompressed content. An index lookup is cheap; a cold random read can still require decompressing earlier bytes. Evict by bytes and discard failed or incomplete cache writes.

```text
observe(event, function, metric):
    scope = locate_function(event, function)
    if scope is partial or absent: return unavailable(reason, event.ref)
    if metric requires features missing here: return unavailable(reason, event.ref)
    selection = evaluate(metric.expression, scope)
    return known(reduce(selection), metric.unit, scope.identity, witnesses)

changes(observations):
    for each pair of neighbors in stream order:
        if either observation is missing: emit gap with its reason
        else if units or subjects differ: emit incomparable with both references
        else if stream ordinals are consecutive:
            emit signed difference with both references and pass invocation
        else: emit gap; offer explicit endpoint comparison
```

A function selector on a timeline is a projection over the original directory. It must keep original ordinal identities and explicit gaps. Some module prints contain many functions and can supply a full function; a module header alone proves no such coverage. A loop dump can include a preheader that also appears elsewhere. Counting both excerpts as a disjoint partition would double-count operations.

## Implementation plan and file references

The suggested module names below describe new host code. The existing material is under the sibling ticket `PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes` in `ttmp/2026/11/21/`.

| Increment | Implementation and boundary | Acceptance test |
|---|---|---|
| 1. Archive reader | `archive.mjs` reads the manifest/index, verifies digests and bounds, and returns bytes. Model it on the existing `scripts/09-archive-llvm.py` writer and `scripts/10-read-pass.py` reader. | Six streams total 4,133 headers. Reject a digest mismatch or decreasing offset. Preserve repeated headers and the last complete range. |
| 2. Typed builders | `plan.mjs` implements immutable operators and validates receiver sorts; `execute.mjs` implements parameters, filters and memoization. | Two branches from a shared plan leave the original intact. Selecting backend ordinal 74 differs from selecting middle ordinal 74. |
| 3. Coverage and metrics | `llvm-state.mjs` exposes scope-aware structural facts. Use LLVM tooling on complete modules; use explicitly narrow versioned matchers for known printed subsets. | Row states 73 and 74 produce 11 and 6 capacity loads. A partial function produces unavailable. A new or malformed print format yields a diagnostic. |
| 4. Diffs and evidence | `compare.mjs` implements stable units, adjacency and source references. Include byte slices on demand. | A gap cannot become an attributed change. Index-only queries avoid decoding bodies. Lack of debug locations remains visible. |
| 5. Machine and execution adapters | `machine-state.mjs` reads MIR properties; `profiles.mjs` imports arm/fixture totals, optionally symbol and PC data. | Entries 74 and 78 differ on `NoVRegs`. Stock Typed executes 1,290,106 direct stack loads plus stores on 160 rows. Reject mismatched images for PC-level joins. |
| 6. Fragments and presentation | `fragments/picocalc.mjs` describes the buffer convention; `session.mjs` handles sliders and pins. | A fragment expands to the same core plan as the long form. Changing a threshold reuses the measured series. Check invalid receiver and fragment-version diagnostics. |

Avoid implementing LLVM's language grammar in JS. Pass text is a diagnostic presentation; use the archive reader for search and excerpts. For full structural analysis, have a version-matched LLVM helper emit functions, blocks, typed operands, use-list edges and coverage as JSON. Some intermediate dumps lack type declarations and cannot be fed directly back into LLVM. Replay or instrument the pass when a structural answer requires a complete module. For a first release, implementing the small checked-capacity metric for validated full prints is a defensible subset; document exactly what it matches. A matcher for a load directly from argument zero does not cover arbitrary equivalent pointer expressions.

The existing `various/passes/pass-metrics.json` describes static metrics. `execution.json` and `typed-counts.json` describe dynamic measurements. `scripts/05-execute.py` in the source study counts only PCs inside the C row symbol; `07-typed-counts.mjs` runs the Typed image on the same inputs. These aggregate JSON files are sufficient for comparing instruction totals. A PC-to-source query additionally needs a matching executable, address map and appropriate line or operation mapping. The Typed compiler's existing `picocalc-os/tools/typed-inspect.mjs` is a useful second provider. It uses frontend tape offsets and final native code ranges, which remain distinct from LLVM ordinals.

### API reference for the first implementation

| Proposed call | Contract |
|---|---|
| `q.archive(path).variant(id)` | Construct a run reference. Unknown variants produce a diagnostic at catalog resolution with the available IDs. |
| `run.events(phase?).at(n)` | Address an absolute ordinal within one phase. Omitting phase produces an unordered union suitable for counting. Indexing that union requires specifying a phase. |
| `run.function(symbol).timeline(phase)` | Project snapshots onto a function, retaining event identities and coverage. Use a symbol resolver when linkage or duplicate names prevent an exact choice. |
| `event.after`, `state.excerpt(opts)` | Resolve a state or retrieve a bounded slice. An excerpt search uses printed text. Structural facts have separate operators. |
| `q.ir.instructions().opcode(op).resultType(t).pointer(value)` | Construct an instruction selection; selectors on one chain intersect. The pointer predicate requires a memory operation with an address operand. |
| `selection.uses()` | Produce one record per use edge with user and operand index. Traversing a cyclic control-flow or def-use relation requires a visited set and a declared traversal limit. |
| `metric.at(state)`, `timeline.measure(metric)` | Produce one observation or a stream of observations. `changes()` consumes the latter in stream order. |
| `q.compare(before, after)` | Compare observations under an appropriate key. For numeric results, delta is after minus before; percentage change requires a nonzero declared denominator. |
| `profiles.arm(id).region(name).workload(id).total(metric)` | Resolve a registered aggregate and emit its scope and evidence pointer. Each provider declares arm aliases, workload keys, units and available dimensions. |
| `q.fragment(name).on(sort, methods)`, `subject.with(fragment)` | Install methods on a derived builder. Record expansion/version in the query explanation. |
| `q.run(plan, {bindings})`, `q.explain(plan)` | Evaluate immutable nodes with supplied parameter bindings or inspect the dependency graph and its data requirements. |

**How to implement a metric without painting the library into a corner.** Give each metric a name, applicable level, expected scope, unit, evaluation strategy and witness collector. Define the direct-header-load metric as a restriction plus count over an instruction relation. A custom metric can be registered as a pure versioned function or supplied as a session-local callback. Keep a capability such as “can resolve operand identity” separate from “can search text.” A result obtained by matching text should say exactly that.

**How to implement comparisons across runs.** Define the grain of each record before the join. A per-pose hardware summary has one value per pose and treatment; raw hardware measurements additionally have a block key. To compute a paired effect, join raw rows on pose, block and phase, assert exactly one measurement per arm, and compute each difference before taking its median. A duplicate on either side would multiply rows and bias the answer. In contrast, the row-execution study counted one complete set of 160 calls per compiler arm. Comparing its totals requires matching that set, the region boundary and the unit. Its aggregate cannot be expanded into 160 independent measurements. Report a zero denominator, a missing arm or a duplicate match as a diagnostic with both input keys.

### The first end-to-end demonstration

Have a new contributor reproduce the header-load change, open both witnesses, switch to the rewriter example and finally compare the checked C and Typed stack counts. They should be able to explain why the first is a static comparison, the second is a machine-state property and the third counts executed instructions. Measure cold/warm query time, bytes decompressed and peak resident bytes using the largest firmware stream. No query latency or memory target has been measured for this proposed library.

The [worked query workbook](02-a-worked-query-workbook-for-the-picocalc-llvm-row-archive.md) develops the API through examples. For a real measurement before implementing anything, run `node scripts/01-check-evidence.mjs` from this ticket. The [existing research chapter](../../PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/analysis/01-from-checked-halfwords-to-a-native-row-loop-in-gcc-and-llvm.md) supplies the renderer and compiler background. The [LLVM source reader](../../PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/analysis/02-reading-llvm-18-source-alongside-the-ray-row-pass-dumps.md) connects the pass names to the implementation.
