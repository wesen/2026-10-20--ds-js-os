---
Title: What a bounds check costs in a ray-tracing loop
Ticket: PICOCALC-SCALAR-BREAKDOWN
Status: complete
Topics: [picocalc, compiler, performance]
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "A controlled decomposition of compiler checks, register allocation, empty-row skipping, and a held-out shadow prediction."
LastUpdated: 2026-11-21
WhatFor: Understand and reproduce the scalar cost breakdown.
WhenToUse: Reviewing compiler transformations or designing a matched frame experiment.
---

# What a bounds check costs in a ray-tracing loop

One sphere, one screen row, 160 possible intersections. Each iteration reads a squared distance from a buffer and subtracts it from a value that is constant across the row. A nonnegative result permits another table read to recover depth. Where spheres overlap, two further fields preserve the nearest surface and its identity. Every visible pixel, every depth and every object ID must survive any reorganization of this computation.

An earlier specialized scalar row made several changes simultaneously and reduced the default primary routine from 3,608,697 to 540,274 retired instructions. That result established a working implementation. It left a practical compiler question open. Would an ordinary compiler gain more from removing repeated array checks or from keeping frequently read values in registers? To compare those effects, these new compilers start from the actual stock emitter, give them the same scalar loop, and vary one choice at a time.

## Two factors and a counter for the work

A Typed buffer starts with a capacity and holds unsigned 16-bit payload cells. In the stock RV32 backend, a checked element address reads the capacity, branches over a trap if the index is valid, scales the index by two and adds the buffer address. The trap itself occupies space in the executable but a successful access never executes it. An admitted loop can therefore save three machine words at each static access and two retired instructions each time that site actually runs.

The admission test checks enough facts to justify the claim for the entire function. A valid row index and object center lie in the vertical screen domain. There are at most three objects and each radius is at most 32. Horizontal indices and output indices stay within their allocated tables. An accepted discriminant for the root table is at most 1,024. A scratch capacity of 1,865 cells reaches the last possible output cell. The preflight tests capacity before reading the object count or its descriptors. If a test fails, control transfers to the original, checked code before the first output write. A short buffer that traps after making some progress leaves the same bytes as before.

The register factor independently reserves six caller-saved registers for the work pointer, the clear-loop index, the sphere's constant row term, the horizontal table offset, the inner pixel index and a temporary horizontal index. This row calls no other function. The compiler can let a binary operation consume a local directly from its register when at most one intervening read or literal separates them. The transformation leaves the source order, expression arithmetic and loop bounds intact. It also preserves the ordinary fallback for programs or inputs outside the admitted case.

| Default primary row calls, summed across 160 rows | Retired instructions | Stack loads | Stack stores | Executed element checks | Horizontal reads |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stock | 3,608,697 | 936,328 | 353,778 | 155,812 | 76,800 |
| Common preflight, stack locals | 3,615,257 | 936,328 | 353,778 | 155,812 | 76,800 |
| Hoisted checks, stack locals | 3,303,633 | 936,328 | 353,778 | 0 | 76,800 |
| Repeated checks, register locals | 2,953,176 | 197,447 | 172,818 | 155,812 | 76,800 |
| Hoisted checks, register locals | 2,641,552 | 197,447 | 172,818 | 0 | 76,800 |
| Both factors with empty-row skipping | 1,532,782 | 147,047 | 122,418 | 0 | 26,400 |

The common preflight costs 6,560 instructions over the default frame. It is present in every cell of the four-way comparison, including the version that still checks every access. At fixed register settings, removing 155,812 successful checks saves precisely 311,624 instructions. At fixed guard settings, the register change saves 662,081 instructions. Stack loads fall by 738,881 and stack stores by 180,960. Their sum exceeds the retired saving because some former stack operations become ordinary register moves. Counting real memory operations makes that distinction visible. These counts describe instructions architecturally retired by the interpreter. A load from the stack and a move between registers can have different cycle costs even when both add one to the same counter. [Per-row execution counters](../various/compiler/rows.json)

## A shorter loop answers another question

All four programs above read the horizontal table exactly 76,800 times, once for each of 160 columns, 160 screen rows and three spheres. A vertical distance greater than the sphere radius makes the row term negative. No unsigned horizontal square can revive that intersection within the admitted ranges. The fifth variant tests this condition before the unchanged pixel loop. Only 26,400 horizontal reads remain. It saves a further 1,108,770 instructions relative to both fixed-domain factors together. That is an algorithmic change to iteration coverage. Charging its savings to register allocation or bounds elimination would lead a compiler author to pursue the wrong pass.

The earlier hand-scheduled scalar row still executes 992,508 fewer instructions than this fifth variant on the default scene. It uses different pointer-induction and address-generation code, clears output using dedicated pointers, keeps more loop state in registers and organizes groups and tails around a packet-shaped temporary. The trial has no separate factor for each of those remaining differences. The residual is a measured difference between two whole schedules.

For 12 sphere and light fixtures, six native images executed both the clean entry and the audit entry, producing 144 complete calls. The clean path matched the independent C RGB565 plane. The audit calls also matched C depth and object IDs byte for byte. The comparisons cover padding at strides 165 and 320, headers and canaries. On the default clean entry, which explicitly sets stride 160, the stock image retired 15,532,634 instructions. Both factors together retired 14,565,489. Skipping reduced that to 13,456,719. Direct shadow retirement was identical in these full-frame comparisons. [C differential and full-frame counts](../various/compiler/frames.json)

## Make the next prediction before compiling it

The shadow function supplies a separate test of the explanation. A default frame calls it 19,477 times and executes 264,928 bounds tests. The largest possible shadow descriptor index is 32 when the count is at most three. A six-instruction entry preflight can establish capacity of at least 33 and a count of at most three, then run the original computation with its element checks removed. An inadmissible call jumps to the original body. The existing helper that computes an absolute value cannot write to the buffer. This experiment pins the complete closed source, including that helper.

Before building the replacement, I recorded a prediction. The saving should equal two times 264,928, less six times 19,477, or **412,994 instructions**. The predicted full clean frame was 15,119,640. After building the new compiler, the stock C-based machine interpreter measured **15,119,640**. The shadow routine alone measured the predicted 5,115,403. All twelve poses passed the complete C differentials again, and fifteen direct calls checked accepted and rejected input shapes, traps, extreme coordinates and large object counts. Editing the helper body caused the specialization to decline. Duplicating the fallback added 948 bytes to this closed image. Those bytes remain a cost even when all application calls take the fast path. [Preregistered prediction](../various/compiler/shadow-forecast.json) · [Held-out full-frame observations](../various/compiler/shadow-frames.json) · [Direct boundary cases](../various/compiler/shadow-edges.json)

## Read the emitted bytes

The compiler inspector makes the difference between static and dynamic evidence concrete. In every variant the selected row begins 3,056 bytes into the machine image. Its first 100 bytes are the shared preflight. The checked/stack fast body then occupies 944 bytes including its prologue and epilogue. The hoisted/stack body occupies 812. The 132-byte difference is eleven sites times three four-byte instructions. All eleven trap words still appear in each completed image's fallback path. Searching the whole image for traps would miss the central measurement: on an admitted scene the hoisted body reaches none of them. The trace identifies fast/fallback segments separately and links both sets of machine ranges to the same original numeric IR. For the skip variant it exposes the inserted test as five synthetic operations, distinct from the input source. [Final-byte inspector receipt](../various/compiler/inspection.json)

## The same two changes on the handheld

On the 360 MHz P4 the investigators timed seven programs at twelve fixed fixtures, with each program rotating through all seven positions. The 588 observations checked the actual native output against C. The physical primary entry prepares geometry and writes full diagnostic depth and ID planes, so it includes work outside the row routine counted above. Median elapsed primary time at the default scene was 17.807 ms stock, 17.818 ms with the common checked/stack control, 16.511 ms hoisted/stack, 14.699 ms checked/register, 14.052 ms hoisted/register and 10.542 ms with the additional row skip. The earlier hand-scheduled control took 7.035 ms.

For the default pose, pair observations within each of the seven repetitions before computing the median saving. Hoisting saved 1.311 ms with stack locals and 0.654 ms with register homes. Register retention saved 3.121 ms with repeated checks and 2.463 ms once checks were hoisted. Their joint saving was 3.766 ms. The paired interaction, computed on each repetition, was −0.657 ms; across all twelve pose-specific medians it ranged from −0.670 to −0.631 ms. The instruction counts were exactly additive, yet the elapsed savings overlapped. The unchanged shade-phase code and repeated C controls help delimit the comparison. These measurements alone do not distinguish pipeline dependencies from memory or code-layout costs.

Skipping empty rows saved a further 3.513 ms in the default primary phase. Another 3.505 ms separated that variant from the hand-scheduled control. On complete clean frames, the joint effect of hoisting and register retention was 3.781 ms, skipping saved 3.518 ms more, and the remaining distance was 3.521 ms. Treating the residual as a measured opportunity leaves the next experiment a concrete target without assigning credit to an untested mechanism. [Physical phase timings and paired effects](../various/device/summary.json)
