---
Title: Choosing the scalar boundary of a packed loop on a handheld
Ticket: PICOCALC-SIMD-LAB
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Experiment design, architecture, hardware controls and code navigation for the packet boundary study."
LastUpdated: 2026-11-21T16:32:44.736667205-05:00
WhatFor: ""
WhenToUse: ""
---

# Choosing the scalar boundary of a packed loop on a handheld

## A row, a packet, and a decision

The PicoCalc has an ESP32-P4 processor. Its ordinary integer instructions operate on one or two scalar operands and produce a scalar result. Its vendor-specific processor instruction extensions (PIE) operate on 128-bit vector registers. One register can hold eight 16-bit distances. The useful choice for an application is how far the program should keep those eight values together. Loading a vector, computing one difference and writing eight intermediate values to the stack can save arithmetic while introducing substantial scalar work at the boundary.

Open `picocalc-os/worlds/raytrace/raytrace.typed` at `typedRayComputeRow`. It scans pixels for a sphere. The row term is the squared radius minus a vertical squared distance. Each horizontal entry is a previously computed squared distance. The difference is nonnegative precisely when this ray reaches the projected sphere. A hit performs a square-root table lookup, computes depth and updates the depth and material index only if the new sphere is closer. The original source order determines the winner when depths tie. It also determines the writes visible if a checked access traps. An optimizer must preserve both properties.

Three measurements answer three different questions. Counting scalar instructions in a disassembly gives program size. Counting each executed instruction through an emulator gives work on a specified input. Timing a run on the P4 includes the device's instruction and data memory behavior. A claim about one belongs to that layer until it is tested independently on another.

## Candidate plans and the small representation

The frontend emits a structured operation tape for one function. It preserves local slots, the i32 operations, structured branches, and checked buffer access operations. The RV32 compiler streams that function to its backend. The existing PIE analyzer inspects a candidate counted loop and recovers the induction variable, invariant threshold, input buffer and affine base, the range of continuation operations, and each possibly written buffer stream. Those are the fields in the research representation. It does not need a program-wide graph. Our selection hook receives a small copy of the subset that influences its estimate. Rejected loops never invoke the hook.

```text
unchanged Typed source
    -> typed emitter -> one function's operation tape
                        -> check address, use and control dependencies
                        -> legal region plus failed obligations
                             -> optional policy -> chosen recipe
                             -> RV32 / PIE words -> image digest
host interpreter: image + fixture -> exact PC counts -> join to byte ranges
board harness:    identified image + same fixture -> correctly paired cycle records
```

An aligned packed input load also advances its pointer. It stays legal only while the next eight inputs are readable and reordering these reads ahead of eight scalar consumers preserves effects. The analyzer restricts the producer and continuation; runtime bounds and alias checks discharge conditions the compiler cannot prove. A short tail or a failed guard executes ordinary operations with their original checks. The array is a Typed buffer with a capacity header and unsigned halfwords. The subtraction is an i32 source operation. Its signed saturating lane implementation is admitted only within a proven or guarded interval. For a row term of 32,766, a mistakenly positive result from interpreting a high unsigned input as signed is still larger than the threshold and gets rejected. At 32,767, saturation can return the threshold itself. The same acceptance test would produce a false hit. The fallback at that boundary is observable behavior.

The experiment adds two optional recipes for the same proved loop. Classifying the input before subtracting is important. The original unsigned distances fit in each lane without a change of interpretation.

```text
packet = load_eight_unsigned_distances(input)
if min_unsigned(packet) > row_term:
    advance all eight indices and continue
differences = signed_saturating_subtract(broadcast(row_term), packet)
if full_hit_recipe and max_unsigned(packet) <= row_term:
    for each of the eight constant lane numbers:
        extract that lane from the vector register
        execute its checked scalar hit continuation in source order
else:
    store the differences to scratch
    visit eight lanes in order with their original hit predicate
```

The minimum and maximum instructions reduce all eight lanes to one scalar. A full packet with maximum at most the row term has eight exact nonnegative differences in the admitted range. The full-hit recipe emits eight continuation copies because the lane selector is an immediate in the extraction instruction. This trades image bytes and instruction fetches for fewer scratch operations. The partial packet path and the invalid-input fallback remain available in both candidate builds. The trial patch and vendor assembly live under `scripts/director/`. The optional backend accepts `pieLoops: "pie-empty"` and the per-loop callback can return `{plan:"pie-empty"}`. Both emit the complete image measured on the board. The full-hit experiment remains reproducible from the trial patch. Default application compilation retains its original behavior.

## Six controls

| Question | Comparison | Deciding evidence |
|---|---|---|
| Attainable row speed | Scalar code retaining values in registers, hand-scheduled packet rows, generated Typed rows | Same board run, same input and output object, order-balanced cycles |
| Packet boundary | Existing producer, unsigned minimum with skip, minimum plus full-hit continuation | Exact image PC counts at scratch reads, writes, extracts; per-scene device times |
| Sound narrowing | Scalar, proved narrow, dynamically guarded narrow | Boundaries, signed and unsigned inputs, tails, aliases, trapping versus return, writes preceding a trap |
| Physics layout | Record and column layouts, each executed by scalar and PIE | Same arithmetic and initial state, explicit conversion and amortization counts |
| Independence | Original scalar order, batch-order scalar, same-batch PIE | Exact bytes within the batch-order pair; report order-induced changes and costs separately |
| Profitability | Frozen per-loop selector and each forced legal option | Correct result, identical chosen image, held-out regret relative to fastest measured candidate and cold compilation on P4 |

The research groups use different inputs for different questions. Report each reduction with its input population and denominator. A row-kernel cycle saving does not establish a clean-frame saving. The previous complete-frame experiment used an independent set of image identities. A proposed cross-study comparison must show that the changed images were included before assigning them a frame gain.

## Querying the experiment

The existing Go service exposes a loopback HTTP API. Open a session, post JavaScript to its evaluation endpoint and reuse its bindings. The SIMD provider adds a versioned capture containing image bytes, source and image identity, per-loop decisions, half-open machine address ranges, per-PC counts and packet evidence. The loader verifies the evidence before serving it. Match addresses against the same image. A PC can name completely different operations after a compiler change.

```js
const scalarReads = simd.executions("pie-row", "pie-opening", "scalar-lane-load")
const observedPackets = simd.packets("opening-160-rows")
scalarReads.executions
```

Inspect the scripts/evidence workbook for the complete runnable research sequence and diagnostics. `hardware.pairs("scalar","pie","clean")` on the prior REPL names the earlier matched-scalar and packed-producer arms. It does not name either new packet-boundary candidate. The new device assay records its own treatments.

## Reproduction and review

- `picocalc-os/compiler/typed-rv32.js`: native compile entry point. `pieLoops` accepts an explicit mode or a per-loop selection function. Stock compilation omits the option.
- `picocalc-os/compiler/typed-pie-loops.js`: recognition, legality, scalar versus packed lowering and existing source/target inspection hooks. The optional callback cannot admit an unproven loop.
- `scripts/director/selector.js`: frozen selection weights and assumption for an unknown trip count. `design-doc/05-frozen-held-out-protocol.md` specifies the prediction and outcome measure before collection.
- `scripts/director/02-build-heldout.mjs`: compile each held-out source, check the selected bytes against a forced treatment, create machine-code symbols and fix the expected return values with Wasm plus scalar arithmetic.
- `scripts/director/04-packet-images.mjs`, `packet-emitter.patch`, `05-differential.mjs`: compile extended Typed recipes, independently decode actual vendor opcodes and test against Wasm-visible state.
- `scripts/ray/` contains the board operator’s staged build, hand kernels and serial evidence collection. `scripts/physics/` contains particle and contact sources and their independent host oracle. `scripts/evidence/` contains the capture, provider launch and workbook.
- `various/` separates kernel identity, host differential evidence, physical observations and independent review. Each article identifies which measurements support its conclusion.

LLVM's VPlan describes planning and costing the operations that will be emitted. The small experiment here borrows that separation while retaining the single-function lifecycle. Espressif documents instruction and data layout constraints. Catto explains why a conflict-free batch lets several contacts update disjoint bodies concurrently and why gathering those bodies can dominate the arithmetic. [LLVM VPlan](https://llvm.org/docs/VectorizationPlan.html) · [Espressif PIE](https://developer.espressif.com/blog/2024/12/pie-introduction/) · [Box2D SIMD Matters](https://box2d.org/posts/2024/08/simd-matters/)

## Implemented interface and verified outcome

```js
// Load typed-wasm.js, typed-rv32.js and typed-pie-loops.js into the same realm.
const rc = typedRv32.compile(source, [], undefined, {
    pieLoops(region) {
        if (region.constantTrips !== null && region.constantTrips < 16) {
            return {plan: "stock"};
        }
        return {plan: "pie-empty"};
    }
});
```

The snippet demonstrates the interface. The policy measured in the blind experiment lives in `scripts/director/selector.js` and is separately identified by its Git revision. The optional lowerer first recognizes a region and verifies its source operations. If it cannot do so, it emits the stock function. A recognized region receives its number of output streams, packet width and either a constant iteration count or null. A forced `pie-empty` or a callback selection emits a guarded eight-input load, a horizontal unsigned minimum and the ordinary scalar hit continuation. The test verifies the SHA-256 of the entire image from the unchanged raytracer in both frontend streaming modes. The negative all-hit result and its original bytes remain in the research ticket.

Use `scripts/director/09-open-lab-session.py --keep` against the merged service on port 3794 to open a private session with all trial rows. `lab.frame("default","clean","baseline","empty")` compares device microseconds. `lab.packetPrediction()` compares the predicted number of avoided scratch loads to dynamically executed loads from this same image pair. The complete-frame and primary-only comparisons on twelve poses and the costs of the collision selection policy are analyzed in the director's report.
