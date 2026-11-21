"""Assemble Opus's two public chapter parts and the coordinator's verified board addendum."""
from pathlib import Path
ticket=Path(__file__).resolve().parents[2]
evidence=ticket/'various/compile'
intro=(evidence/'opus-introduction-article.txt').read_text().strip()
# Preserve the author's worked cell as actually executed in its trace session.
article=(evidence/'opus-article-article.txt').read_text()
article=article[article.index('I recomputed'):article.index('## 7.')].replace("The entry guard was never implemented.","The earlier scalar-breakdown study separately prototyped a shadow-specific bounds guard and measured it on the board. It is a distinct transformation.")
front="""---
Title: Choosing a compiler optimization from the cost of a floor shadow
Ticket: PICOCALC-SHADOW-CODEGEN
Status: complete
Topics: [compiler, performance, picocalc]
DocType: analysis
Intent: long-term
---
# Choosing a compiler optimization from the cost of a floor shadow

The Opus High researcher developed the register-home scorer in this chapter, ran the evidence REPL, and wrote the design discussion and host-results section. The compiler coordinator implemented the guarded-return transformation, verified the disassembly and host differentials, and added the physical results below. The director ran the ESP32-P4 trials and independent validation. [Compiler investigation diary](../reference/03-compiler-investigation-diary.md) · [Researcher’s JS session](../various/compile/opus-article-repl.jsonl)

"""
if intro.startswith('# '):intro=intro.split('\n',1)[1].strip()
# The researcher's raw outputs remain archived alongside these editorial corrections.
edits = {
    "In our default workload, `opening-160-rows`": "For one complete 160×160 frame at the opening pose",
    "The loop checks positions against the scene's bounds and repeatedly takes the absolute value of a signed quantity.": "It first compares each coordinate's signed distance from a projected sphere center with a bounding extent. Only passing candidates reach the exact intersection test.",
    "The program reaches our compiler as WebAssembly, and the compiler turns it into RV32 machine code. A **source helper** is a small function written in the original program, not one the compiler made up.": "The compiler reads Typed source. Its checked frontend emits a numeric sequence of Wasm-like operations and native-specific checked-address operations. The RV32 backend translates this sequence into instructions. A **source helper** is a small function defined by the program author.",
    "The helper body then runs about nine more instructions before `jalr` returns.": "In the shadow path the helper averages 9.31 instructions per call, including the return.",
    "Named variables, called locals, are not kept in registers. Each one lives in a memory slot": "In the framed shadow body each named variable, called a local, lives in a memory slot",
    "Nearly every stack load in the shadow routine could in principle be removed.": "Subtracting one return-address restore per invocation leaves an upper bound of 1,268,781 other stack loads. Identifying which are removable requires classifying spills and caller state.",
    "That pass remains available, and its gains would add to this one.": "A future experiment needs to measure whether the savings combine, because eliminating calls changes register pressure.",
    "The proof checks the helper's body.": "For this example the proof checks the absolute-value helper's complete body. More generally the same matcher admits all six signed/equality relations against a literal and can either negate the argument or return a literal on its taken path.",
}
for before,after in edits.items():
    if before not in intro: raise ValueError(before)
    intro=intro.replace(before,after)
mechanism="""
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

"""
board="""
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
"""
(ticket/'analysis/03-choosing-a-compiler-optimization-from-the-cost-of-a-floor-shadow.md').write_text(front+intro+'\n'+mechanism+article.rstrip()+'\n'+board)
