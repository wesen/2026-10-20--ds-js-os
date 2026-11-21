---
Title: Choosing a compiler optimization from the cost of a floor shadow
Ticket: PICOCALC-SHADOW-CODEGEN
Status: complete
Topics: [compiler, performance, picocalc]
DocType: analysis
Intent: long-term
---
# Choosing a compiler optimization from the cost of a floor shadow

The Opus High researcher developed the register-home scorer in this chapter, ran the evidence REPL, and wrote the design discussion and host-results section. The compiler coordinator implemented the guarded-return transformation, verified the disassembly and host differentials, and added the physical results below. The director ran the ESP32-P4 trials and independent validation. [Compiler investigation diary](../reference/03-compiler-investigation-diary.md) · [Researcher’s JS session](../various/compile/opus-article-repl.jsonl)

## The Default Ray/Shadow Loop

A raytracer works out the color of each pixel by sending a ray into the scene. Once a ray hits a surface, the renderer has to know whether light reaches that point. To find out, it sends a second ray toward the light, called a shadow ray. If anything blocks that ray, the point is in shadow. Shadow rays run for a large share of the pixels in a frame, so the code that traces them is one of the hottest paths in the program.

For one complete 160×160 frame at the opening pose, the shadow routine runs 19,477 times per frame. Each run steps through a loop. It first compares each coordinate's signed distance from a projected sphere center with a bounding extent. Only passing candidates reach the exact intersection test. The workload is fixed, and the output image's hash must stay the same. That lets us change the compiler and attribute every change in retired instructions to the compiler alone.

## Source Helpers and Stack Registers

The compiler reads Typed source. Its checked frontend emits a numeric sequence of Wasm-like operations and native-specific checked-address operations. The RV32 backend translates this sequence into instructions. A **source helper** is a small function defined by the program author. Here it is the absolute-value function. The shadow loop calls it from two places. In the baseline build, each call costs three instructions at the call site: move the argument into `a0`, `jal` to the helper, and move the result back. In the shadow path the helper averages 9.31 instructions per call, including the return.

WebAssembly computes with an operand stack, a last-in, first-out list of intermediate values. Our compiler keeps the top of that stack in fixed **stack registers**, `t0` through `t4`, with `t5` and `t6` set aside as scratch. In the framed shadow body each named variable, called a local, lives in a memory slot at a fixed offset from the stack pointer `sp`. Every read of a local is a `lw` from that slot, and every write is a `sw` to it.

## The Register-Home Experiment

Those loads looked like the obvious target, because the shadow loop does over 1.28 million of them per frame. I built a prototype that scores each scalar local and gives the best ones a permanent **register home** for the whole function. Call-free functions get homes in `a1`–`a7`. Functions that make calls get homes in `s1`–`s11`, which the function must save and restore. The scorer counted how often each local is read and written, weighting reads and writes inside loops more heavily, and then picked homes.

The ceiling was large. Subtracting one return-address restore per invocation leaves an upper bound of 1,268,781 other stack loads. Identifying which are removable requires classifying spills and caller state. That figure comes from the historical counters. The fresh baseline totals a slightly different frame count, so percentages should only be compared against numbers from the same source. Writing the design showed three costs behind the ceiling:

- Replacing a `lw` with a `mv` saves no instructions. Real savings need forwarding: consumers read the home register directly, and producers write into it.
- Each `s`-register home costs two instructions every time the function is called.
- Correctness needs a complete lowering contract covering block joins, calls, and returns, plus a differential test on held-out code.

I ran the scorer on synthetic operation sequences. The experiment assigned no register homes in the actual shadow function. Its proposed ranking still needs validation on that function's checked tape.

## Why the Group Chose the Pure Helper Rule

The other proposal was far smaller. If the compiler can prove that a helper is pure, it can replace each call with the helper's logic inline. The compiler coordinator integrated this guarded-return lowering, and a fresh run measured it from start to finish. All 74,226 helper calls disappear. The full-frame count falls from 14,879,359 to 14,088,411 retired instructions, and the output hash does not change. Stack loads are untouched, so the rule takes nothing away from a later register-home pass. A future experiment needs to measure whether the savings combine, because eliminating calls changes register pressure. The group preferred a measured, verified, local change over a larger forecast that still depended on forwarding work nobody had built.

## How the Proof and Lowering Work

For this example the proof checks the absolute-value helper's complete body. More generally the same matcher admits all six signed/equality relations against a literal and can either negate the argument or return a literal on its taken path. It reads only its single parameter. It makes no memory accesses and no calls, and it cannot trap. It has exactly two return paths: if the value is negative, return zero minus the value; otherwise return the value unchanged. When those checks pass, the compiler replaces the three-word call sequence with two words that act on the operand already in `t0`: `bge t0, zero, +8` skips ahead when the value is non-negative, and `sub t0, zero, t0` negates it otherwise. The subtraction wraps the same way the original helper does. So even the most negative 32-bit integer gives the same result as the original call.

## The two call sites in the generated image

Here is the concrete first call in the unmodified source. Register x5 contains the caller's current integer operand and x10 carries the argument and result through the ordinary call convention. The opcode range corresponds to cell 113 of the frontend tape.

```text
baseline at byte 5140                candidate at byte 5140
addi x10,x5,0                        bge x5,x0,after
jal  x1,magnitude                    sub x5,x0,x5
addi x5,x10,0                        after:
```

The opening pose executes this first comparison 52,917 times. Exactly 35,366 require negation. Only 21,309 inputs reach the second coordinate comparison because the source uses a short-circuit condition. Of those, 13,322 require negation. Loading either coordinate early would change the order of Typed buffer traps. The compiler emits the conditional result only at the existing call site, after its argument has been evaluated. [Exact tape offsets and machine words](../various/compile/call-sites.json) · [Instruction execution counts](../various/compile/shadow.json)

## Accounting for the host instruction reduction

I recomputed the effects in a fresh trace REPL from the bound object `opening`. Its three entries match the archived fixtures `various/compile/baseline.json`, `various/compile/shadow.json` and `various/compile/general.json` (images `9a4a2356`, `e2fa128b`, `c31e75ee`). This is the exact cell I ran:

```js
(() => {
  const {baseline: b, shadow: s, general: g} = opening;
  const pct = (n, d) => +(100 * n / d).toFixed(2);
  const other = x => x.fullFrameSteps - x.shadow.steps - x.absTotalSteps;
  return {
    images: [b, s, g].map(x => x.imageSHA.slice(0, 8)),
    sameOutput: new Set([b, s, g].map(x => x.outputSHA)).size === 1,
    saved: {shadow: b.fullFrameSteps - s.fullFrameSteps, general: b.fullFrameSteps - g.fullFrameSteps},
    percentOfCurrentControl: {shadow: pct(b.fullFrameSteps - s.fullFrameSteps, b.fullFrameSteps),
                              general: pct(b.fullFrameSteps - g.fullFrameSteps, b.fullFrameSteps)},
    attribution: {callerBody: b.shadow.steps - s.shadow.steps, helper: b.absTotalSteps - s.absTotalSteps,
                  rest: other(b) - other(s), generalExtra: s.fullFrameSteps - g.fullFrameSteps},
    stackAndChecksUnchanged: ["directStackLoads", "directStackStores", "boundsTests"]
      .every(k => b.shadow[k] === s.shadow[k] && s.shadow[k] === g.shadow[k]),
    bytes: {image: [b, s, g].map(x => x.imageBytes), shadowFn: [b, s, g].map(x => x.shadowBytes)},
    priorForecast: {historicalPct: +measured.hypothetical.predictedFullFrameReductionPercent.toFixed(2),
                    historicalDenom: measured.observed.frameRetired, currentDenom: b.fullFrameSteps,
                    sameShadowBody: measured.observed.retired === b.shadow.steps},
  };
})()
```

**Instruction reduction.** The shadow-only arm retires 790,948 fewer dynamic instructions than the control, and the all-callers arm retires 791,050 fewer. Both are 5.32% of the current control.

**Attribution.**

- 99,764 instructions come from the shadow body: the call sequences were replaced by inline arithmetic, a net 1.34 instructions per former call.
- 691,184 come from helper instructions that no longer run.
- None come from the rest of the frame.
- The 60 helper instructions still executed in the shadow arm belong to another caller. The general arm removes those 60 plus 42 more elsewhere, which is the 102-instruction difference between the two arms.

**Unchanged.** Stack loads (1,288,258), stack stores (647,710) and the 264,928 bounds tests are identical in all three images, and the output hashes match.

**Code size.** The image shrinks from 10,332 to 10,324 bytes (shadow-only arm) and to 10,268 bytes (all-callers arm). The shadow function shrinks from 1,068 to 1,060 bytes.

The prior entry-guard forecast predicted 2.66% of the **historical** frame. The guarded return removes 5.32% of the **current** frame. These are different mechanisms measured against different denominators, so this is not a test of the forecast's accuracy. The earlier scalar-breakdown study separately prototyped a shadow-specific bounds guard and measured it on the board. It is a distinct transformation. Host compile time on Node (`host-cost.json`, 30 rotated triplets) changed by a paired median of +0.25 ms for the shadow-only arm and −0.03 ms for the all-callers arm. Those timings come from V8 on the host, not from the P4.

## Measuring the compiled program on the ESP32-P4

A retired instruction count gives each instruction a weight of one. The physical processor spends different amounts of time on branches, multiplications, memory access and instruction fetch. We therefore measured the complete compiled programs separately on the device. The shadow-only arm enables the transformation only inside the floor predicate. The general arm permits all callers to use a proved summary.

| Measurement, opening pose | Typed control | Shadow-only | General |
|---|---:|---:|---:|
| Natural floor predicate, cycles per call | 435.38 | 382.28 | 382.22 |
| Complete frame ready in memory, ms | 55.6635 | 53.0360 | 53.0440 |
| Actual native module, bytes | 10,332 | 10,324 | 10,268 |

The natural predicate trial includes the shared call loop. The shadow-only arm reduced its time by a median paired 12.21%; the general arm saved 12.19%. Across the whole frame the paired savings were 4.68% and 4.73%. Those percentages use the within-block pairs; dividing the rounded absolute medians can yield a slightly different percentage. The isolated shading stage fell from 48.479 to 45.8245 ms in the shadow-only arm. The primary-intersection control stage moved from 15.7715 to 15.7575 ms. Its 0.09% change measures a stage that precedes execution of the transformed predicate.

The C complete frame took 7.7235 ms in these opening blocks. The general Typed frame therefore still takes about 6.87 times as long. A separate earlier control visit recorded a hierarchy for the default natural predicate: 70.15 cycles/call for production C, 82.46 for C using a halfword workspace and 129.36 for C with explicit checked accesses in that halfword layout. Its baseline Typed arm measured 430.01. These controls quantify the importance of representation, checking and code generation. Because changing one of those can change register pressure and instruction scheduling, the differences between them cannot be assigned uniquely to individual instructions.

All twelve scene medians favored general lowering, with whole-frame savings between 4.20% and 5.19%. The candidate won each of the 72 within-scene frame pairs. The held-out Chess test exercises other source code with the same normalized helper behavior. On advanced evaluation the opening position improved from 11,016.06 to 9,887.72 cycles, or 10.22% paired. A played position improved 10.18% and a late position improved 4.85%. All six pairs improved in each advanced case. Basic evaluation, which rarely needs the affected helper, changed by at most 0.05%.

There is a cost on the compiler side. The P4's cold ray compile rose from 283.4775 to 286.1130 ms, a 0.93% paired slowdown, with all six candidate compiles taking longer. Cold Chess compilation grew 1.14%. The observed peak across the fresh QuickJS runtime, including bundle setup, was 826,356 bytes in each arm. That meter reports the high-water mark of the whole measured process; it cannot resolve an allocation made below an earlier peak. The ray module shrank by 64 bytes and Chess by 24 bytes. The resulting time trade is concrete: a roughly 2.6 ms cold-build cost buys roughly 2.6 ms per complete opening frame. [Board measurement and executable workbook](01-from-a-shadow-ray-to-an-esp32-p4-instruction-budget.md) · [Host compile triplets](../various/compile/host-cost.json)

## Where the next experiment starts

The treated shadow still performs 1,288,258 direct stack loads and 647,710 direct stack stores per opening frame. Some of these are semantic locals, others preserve call state or hold temporary values. The tally of 1,268,781 remaining loads after subtracting one return-address restore per shadow invocation is only an upper bound on what register placement could eliminate. First classify load and store sites using the exact stack slot and its role. Then choose a few homes statically and measure the resulting moves, saves and restores. Freeze the rule before testing a separate loop workload. The present pass and the scorer are independent mechanisms, so a future experiment can measure their interaction in a four-arm comparison. [Promotion scorer prototype](../various/compile/opus-design-code.txt) · [Executable session transcript](../various/compile/opus-design-repl.jsonl) · [Implementation guide](../design-doc/03-recognizing-pure-guarded-numeric-returns-in-a-streaming-compiler.md)
