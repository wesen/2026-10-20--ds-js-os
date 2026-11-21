---
Title: What a checked operation keeps until RV32 lowering
Ticket: PICOCALC-NATIVE-WAVE
Status: active
DocType: analysis
Intent: long-term
Topics: [picocalc, esp32-p4, performance, native]
---

# What a checked operation keeps until RV32 lowering

The Typed frontend usually expands a checked operation into primitive numeric instructions as it emits a function. This study kept two kinds of operation intact into native lowering. The emitted RV32 image shrank on all four operator inputs and on the independent held-out program. On the independent held-out source, the always-late arm produced a native image of 2,396 bytes. Stock produced 2,876 bytes, so the ratio is 0.8331. The RV32 interpreter ran 144,166 steps for always-late and 158,570 for stock, which is 9.08% fewer. The static selected policy kept fewer descriptors and landed between the two, at 2,468 bytes (ratio 0.8581) and 145,024 steps (8.54% fewer).

On the physical board, the median paired elapsed-time reduction for the three directed loops parse, count and label was 4.982%, 15.901% and 21.267% for always-late. For selected it was 4.937%, 15.901% and 16.742%. Always-late beat selected on every size row and on held-out steps. The largest held-out difference was on the label workload. The code images share alignment and occupy distinct flash addresses.

The two descriptors are narrow. One is a checked UTF-16 address. The other is an ordered write of a string literal into a buffer whose bounds have already been checked. The data include exact trap and byte comparisons along with device timing.

## The compiler pieces involved

### Typed checked access

The source language is typed JavaScript. When a program indexes a UTF-16 buffer, the compiler knows the buffer's layout. The header address points at a 32-bit unsigned capacity at offset 0, and the payload of 16-bit code units starts at offset 4. Every indexed read or write is checked. After the position expression is evaluated, a position outside `0 .. capacity-1` traps before the payload read or store. Side effects that already happened while evaluating the position remain visible.

### The numeric streamed tape

The compiler does not build a full program tree for native output. It lowers source into a stream of numeric records, a tape, that the RV32 emitter consumes function by function. The question in this study is where on that path a checked operation turns into instructions. In stock compilation it expands at the point where the source operation appears. A retained address supplies two current function local indices. A retained literal includes a local index and an ordinal into an optional function-local table of strings. The compiler drops the tape and literal table references after lowering the function.

### RV32 emission

The RV32 emitter writes 32-bit RISC-V instructions into an unlinked image. The instruction image sizes are unlinked code extents. The full reactor includes reserved text capacity and supports address binding independently of how much code an arm fills.

## The three arms

**Early** is stock RV32. Its output is byte-identical to the unmodified compiler. The bounds check computes a boolean in a register and then branches on that boolean.

**Late** retains every checked UTF-16 address and every non-empty ordered literal write until native lowering.

**Selected** is a static policy. It retains address descriptors for reads only, and it retains literal write descriptors only when the literal is at least 8 UTF-16 units long. Every other site expands early, exactly as stock does.

The normal Wasm output is the same in all three arms. The source language and the ABI are also unchanged. The arms change where the two operations expand and which machine sequence the compiler can use at that point.

## Worked example 1, a checked read

Take a read of position `i` from buffer `s`, written as `let c = s.charCodeAt(i)`. The frontend evaluates the position once and saves it to a local. The following sketch shows the lowering after loading the index and receiver locals. The registers are illustrative, and the ordinary payload load still goes through the existing operand-stack machinery.

```asm
# a0 = header address of s, a1 = position i (evaluated once)
lw    t0, 0(a0)       # capacity, unsigned 32-bit, at header + 0
bltu  a1, t0, 1f      # in bounds: skip exactly the next instruction
ebreak                # out of bounds: trap
1:
slli  t1, a1, 1       # i * 2 bytes per UTF-16 unit
add   t1, a0, t1      # header-relative element address
lhu   a2, 4(t1)       # payload starts at header + 4
```

On success, `BLTU` skips exactly one instruction, the `EBREAK`. The load uses the same `lhu` access with payload displacement +4 as stock code. A write uses `sh` with the same displacement. The early arm reaches the same `lhu` through its boolean-then-branch check.

The numbers work as follows. Suppose the header sits at `0x2000` and the capacity is 8.

| Position `i` | As unsigned | `bltu` taken | `slli` result | Address read by `lhu` | Outcome |
|---|---|---|---|---|---|
| 5 | 5 | yes | 10 | `0x2000 + 10 + 4 = 0x200E` | unit 5 |
| 0 | 0 | yes | 0 | `0x2004` | unit 0 |
| 8 | 8 | no | not reached | not reached | trap |
| -1 | `0xFFFFFFFF` | no | not reached | not reached | trap |
| -2 | `0xFFFFFFFE` | no | not reached | not reached | trap |

The unsigned comparison is what rejects negative positions. The order of the guard and the shift also matters. If `-2` reached the shift, `0xFFFFFFFE << 1` would wrap to `0xFFFFFFFC`. Adding that to the header and then the +4 displacement would land on the header itself, so the read would return half of the capacity field. Because the guard runs first, such a position never reaches the address arithmetic. The fixture states described below cover exactly these negative, extreme and header-adjacent positions.

## Worked example 2, writes and literal writes

For a checked write such as `s.setCharCodeAt(i, f(x))`, the order is fixed. The position is evaluated once, the bounds check runs, then the right-hand side `f(x)` is evaluated, and then the halfword is stored. If `i` is out of range, the trap happens before `f` runs, so none of the memory effects of `f` happen. All three arms keep this order. The fixture checks a right-hand side that reads from another checked location and tests which prior stores remain visible when either check traps.

A literal write copies a string literal into a buffer at a position that has already been checked. The literal frontend leaves the existing bounds guards in place in all three arms, so the late descriptor does not remove any checks. In the late arm, native lowering loads the saved address once and then materializes each code unit in a register and emits a corresponding `sh` in source order, as stock does. The original code units come from instruction immediates, using one immediate operation for small units and a high/low pair for larger ones. Machine instructions carry every literal code unit, so unchanged guard semantics and ordered stores are sufficient to compare the two writers. Earlier literal pooling work used a payload section and an explicit copy loop.

The selected policy measures literals in UTF-16 units. Code points and bytes do not count toward the threshold.

| Literal | Code points | UTF-16 units | Late retains | Selected retains |
|---|---|---|---|---|
| `""` | 0 | 0 | no | no |
| `"Capture"` | 7 | 7 | yes | no |
| `"Captured"` | 8 | 8 | yes | yes |
| `"Captur𝄞"` | 7 | 8 | yes | yes |
| `"♞"` | 1 | 1 | yes | no |

`𝄞` (U+1D11E) lies outside the Basic Multilingual Plane, so it takes a surrogate pair of two units. `"Captur𝄞"` therefore crosses the threshold even though it has seven code points. An empty literal evaluates the position and returns zero without a buffer-range guard or stores, before a retaining arm emits a descriptor.

## What was compared

The host work paired the baseline with both retaining policies under ordinary streaming.

1. **Product compiles.** Four programs (a control, the editor, Chess and the painter) were compiled in each arm. For each compile the study recorded the unlinked image bytes and how many address and literal descriptors were retained.
2. **Independent held-out source.** A program that played no part in designing the policy was compiled in each arm and run against the independent oracle. On early, late, and selected, all 1,603 results including 101 traps matched the expected outcomes and all final buffers matched byte for byte. The Wasm image was identical across arms. The study also recorded image bytes and interpreter steps.
3. **Directed fixtures.** The operator wrote 243 fixture states per arm. All 243 case results and complete buffers matched in every arm, including the same 163 traps. They cover extreme positions, effects of header aliasing, check sequencing, and the 7-unit and 8-unit literal boundary.
4. **Side-effect, stack and limit checks.** Another 66 states per arm apply a right-hand side that writes a marker through a call. With an invalid destination the marker stays unchanged. With a valid destination and an invalid source index, the marker changes before the read traps. A deep expression puts a checked read under six operands. The same tests cover empty literals and lengths through the allowed 1,022 UTF-16 units. Each arm matches all expected return values, 36 traps and complete buffers. [Extended contract receipt](../various/02-semantics/extra-contract.json)

Stock uses the current frontend and emitter in every comparison. A separate run confirms its output matches the early arm byte for byte.

## Results

### Product compiles, unlinked image bytes

| Program | Early | Late | Late / early | Selected | Selected / early | Late addr / lit | Selected addr / lit |
|---|---|---|---|---|---|---|---|
| control | 3,268 | 2,832 | 0.8666 | 2,952 | 0.9033 | 16 / 2 | 12 / 1 |
| editor | 89,168 | 75,932 | 0.8516 | 80,444 | 0.9022 | 268 / 107 | 109 / 52 |
| Chess | 256,400 | 181,184 | 0.7066 | 185,820 | 0.7247 | 256 / 80 | 84 / 52 |
| painter | 23,848 | 21,644 | 0.9076 | 22,644 | 0.9495 | 52 / 12 | 11 / 11 |

### Held-out source

| Arm | Image bytes | Ratio to early | Interpreter steps | Change in steps | Addr / lit |
|---|---|---|---|---|---|
| early | 2,876 | 1.0000 | 158,570 | 0 | 0 / 0 |
| late | 2,396 | 0.8331 | 144,166 | -9.08% | 7 / 3 |
| selected | 2,468 | 0.8581 | 145,024 | -8.54% | 4 / 3 |

On the held-out source, both retaining arms kept all three literals. The arms differ only in the three address descriptors that selected declined, which by its rule are sites other than reads. Those three sites account for 72 bytes (2,468 minus 2,396) and 858 interpreter steps (145,024 minus 144,166).

## Reading the Chess row

The Chess source reconstructs the painter program (16,316 source bytes) through a series of literal writes. Stock reloads the destination for each code unit. Late loads that address once per chunk and emits the same ordered halfword stores. This is a large opportunity specific to Chess. The other three emitted programs shrank by 9.24% to 14.84% under late and 5.05% to 9.78% under selected.

## Scope and failed hypotheses

The frozen study is narrower than the original design. It has no generalized copy descriptor, no fusion or dispatch on user-written branches, and no early-peephole or late-generic control arms. That missing control matters for interpretation. The late arm changes operation lifetime and machine instruction selection together. The guard becomes a direct branch and literal stores reuse the destination address. An early peephole that searches primitive sequences for these shapes would help isolate the contribution of preserved identity.

Selected was larger than late on every code-size row, ran more interpreter steps on the held-out input, and gave up 4.525 percentage points of measured label improvement. In that program both policies retain all three literal writers. Their compiled images differ in which address sites are retained. The timed wrappers and images also occupy different addresses in flash, so the end-to-end measurements cannot assign their full difference to those three sites. Both policies have the same median time reduction on the count workload.

## Reproducing the method

1. Build three compilers from the same revision. Leave early unmodified and confirm that its RV32 output is byte-identical to stock. Enable full retention for late, and enable the static read-only, 8-unit rule for selected.
2. Confirm that Wasm output is byte-identical across all three arms.
3. Compile control, editor, Chess and painter in each arm. Record the unlinked image bytes and the number of retained address and literal descriptors. Divide each retaining arm's bytes by early's bytes.
4. Compile the held-out source in each arm and run it on the host RV32 interpreter. Keep all 1,603 outcomes, including the 101 traps. Require identical trap outcomes and byte-identical final memory against early. Record interpreter steps.
5. Run the 243 fixture states in each arm. Include negative positions, positions near `0x7FFFFFFF` and `0xFFFFFFFF`, header-adjacent positions, writes whose right-hand side may trap, and literals of exactly 7 and 8 UTF-16 units.
6. On the device, flash the single harness app embedding the exact image the host exported for each arm and time the parse, count and label loops. For each row, pair the arm's recorded time with the early time in the same block, compute the percentage reduction, and take the median across blocks for each workload. Restore normal firmware afterward.

## Follow-up

A future comparison could record the maximum per-function descriptor and literal-table sizes separately from the total QuickJS allocation. An otherwise-identical primitive peephole would test whether operation identity is needed to obtain the same machine sequence.

## Physical board

The director ran eleven blocks of three endpoints across seven arms, for 231 physical rows on the held-out source. These include arms for other studies. The standalone benchmark reached its correctness marker. Each arm ran from the exact image the host exported, and normal firmware was restored afterward. Median paired elapsed-time reductions relative to early were 4.982% for parse, 15.901% for count and 21.267% for label with always-late. With selected they were 4.937%, 15.901% and 16.742%. These figures describe directed calls into the held-out program on the board and are separate from the interpreter step counts and image byte ratios above.

The paired medians and per-block ranges are preserved in [the director benchmark receipt](../various/director/paired-results.json), and the source, commands and verification gates are in [the reproduction guide](../reference/16-reproduce-bounds-and-operation-lifetime.md).


### Positive native calls

In the completed short confirmation, three semantic and two bounds arms were embedded in flash at aligned addresses and extracted after linking to verify byte identity. The task ran at 360 MHz on core 1, stored outputs on its PSRAM stack, and rotated the arm order for eleven blocks. Each recorded row measures 256 positive-path calls, including the loop. The device reported that the sums of returned values and complete output buffers matched. Native trap coverage comes from the host oracle. These purpose-built controls separately exercise a repeated read, an eight-unit literal, and a scalar write whose value reads another checked location.

| Workload | Stock median cycles/call | Late median cycles/call | Selected median cycles/call | Late paired reduction | Selected paired reduction |
|---|---:|---:|---:|---:|---:|
| Repeated read | 86.18 | 65.09 | 65.07 | 24.49% | 24.49% |
| Eight-unit literal | 83.11 | 69.09 | 76.07 | 16.86% | 8.49% |
| Checked write with read | 80.10 | 59.06 | 73.11 | 26.25% | 8.72% |

Early and late execute the same observable source operations. For the literal, the write part retains the address across stores in both late and selected. Selected still expands the initial checked address as ordinary tape instructions, which helps explain the difference in runtime.

### Fresh device compilation

A second timing boundary measures cold wall time for the whole fresh QuickJS invocation through the application's world compiler, with the normal source bundle and same reactor in every arm. It includes sandbox setup, loading the compiler JavaScript, validation, lowering, link, native output copy and teardown. All arms load the same staged JavaScript, and stock keeps both experiments disabled. The host matrices qualify its generated byte identity. The stated peak is the compile sandbox allocator reading in bytes. It excludes other device allocations. Each line summarizes the first four complete paired blocks.

| App | Compiler | Median seconds | Range seconds | Median paired reduction | Peak JS bytes, median |
|---|---|---:|---:|---:|---:|
| Chess | Stock | 5.342 | 5.289–5.418 | 0.00% | 3,185,084 |
| Chess | Late | 3.038 | 3.037–3.050 | 43.02% | 1,948,022 |
| Chess | Selected | 3.186 | 3.175–3.193 | 40.41% | 1,983,680 |
| Editor | Stock | 4.545 | 4.514–4.597 | 0.00% | 2,574,214 |
| Editor | Late | 4.164 | 4.119–4.182 | 8.68% | 2,496,368 |
| Editor | Selected | 4.310 | 4.256–4.329 | 5.53% | 2,528,662 |

Chess's fixed reactor stayed at 274,892 bytes and Editor's at 242,124. The host instruction extent changed substantially within those reservations. The largest physical compile-time improvement is in Chess, where the source includes the long painter writer. The Editor run measures a different mix of accesses and literals.

The first host deadline expired late in the fifth block, leaving 59 successes of 60 planned. Editor Selected for the bounds-admission study was the absent record. The table uses four complete blocks in both apps. It excludes the complete fifth Chess block to keep the paired observations balanced. The first run printed all 165 native timings before it stopped and never reached the combined correctness marker. The separate confirmation supplied the native table above, all 165 timing rows, and 12 fresh compile rows. It used the same native code hashes at addresses shifted by 128 bytes. Its cold observations remain separate from the main table. [Separate confirmation](../various/01-bounds/physical-confirmation.json) · [First supervised capture](../various/01-bounds/physical-first.json) · [Balanced timing summary](../various/01-bounds/physical-first-summary.json)
