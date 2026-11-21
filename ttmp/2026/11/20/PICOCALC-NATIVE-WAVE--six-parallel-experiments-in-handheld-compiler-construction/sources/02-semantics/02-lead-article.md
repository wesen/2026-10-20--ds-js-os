# Keeping two checked operations as descriptors until RV32 lowering

The compiler can turn a checked source operation into RV32 instructions as soon as it meets the operation, or it can keep a short descriptor and expand it later during native lowering. This study kept two kinds of descriptor until native lowering, and that made the output smaller and faster on every program measured. On the independent held-out source, the always-late arm produced a native image of 2,396 bytes. Stock produced 2,876 bytes, so the ratio is 0.8331. The RV32 interpreter ran 144,166 steps for always-late and 158,570 for stock, which is 9.08% fewer. The static selected policy kept fewer descriptors and landed between the two, at 2,468 bytes (ratio 0.8581) and 145,024 steps (8.54% fewer).

On the physical board, the median paired cycle reduction for the three directed loops parse, count and label was 4.982%, 15.901% and 21.267% for always-late. For selected it was 4.937%, 15.901% and 16.742%. Always-late beat selected on every size row and on held-out steps. On the board it was clearly ahead on label, very slightly ahead on parse, and tied on count.

The two descriptors are narrow. One is a checked UTF-16 address. The other is an ordered write of a string literal into a buffer whose bounds have already been checked. The rest of this article explains the code each arm emits, how the arms were compared, and what the result does and does not show.

## The compiler pieces involved

### Typed checked access

The source language is typed JavaScript. When a program indexes a UTF-16 buffer, the compiler knows the buffer's layout. The header address points at a 32-bit unsigned capacity at offset 0, and the payload of 16-bit code units starts at offset 4. Every indexed read or write is checked. A position outside `0 .. capacity-1` traps, and a trap happens before any memory changes that the operation would have made.

### The numeric streamed tape

The compiler does not build a full program tree for native output. It lowers source into a stream of numeric records, a tape, that the RV32 emitter consumes function by function. The question in this study is where on that path a checked operation turns into instructions. In stock compilation it expands at the point where the source operation appears. With a retained descriptor, the tape carries an ordinal that refers to an entry in an optional per-function ordinal table, and native lowering expands the entry. The table is freed when the function completes, so no descriptor outlives its function.

### RV32 emission

The RV32 emitter writes 32-bit RISC-V instructions into an unlinked image. All byte counts in this article are sizes of that unlinked image. They are not firmware sizes, and they say nothing about editor rendering or gameplay.

## The three arms

**Early** is stock RV32. Its output is byte-identical to the unmodified compiler. The bounds check computes a boolean in a register and then branches on that boolean.

**Late** retains every checked UTF-16 address descriptor and every ordered literal write descriptor until native lowering.

**Selected** is a static policy. It retains address descriptors for reads only, and it retains literal write descriptors only when the literal is at least 8 UTF-16 units long. Every other site expands early, exactly as stock does.

The normal Wasm output is the same in all three arms. The source language and the ABI are also unchanged. The only difference between the arms is when RV32 expansion happens for these two operation kinds.

## Worked example 1, a checked read

Take a read of position `i` from buffer `s`, written here in source notation as `let c = s[i]`. In the late arm, native lowering evaluates the position exactly once and then emits this shape. The registers are chosen for exposition. The instruction sequence is the one the late lowering emits.

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

For a checked write such as `s[i] = f(x)`, the order is fixed. The position is evaluated once, the bounds check runs, then the right-hand side `f(x)` is evaluated, and then the halfword is stored. If `i` is out of range, the trap happens before `f` runs, so none of the memory effects of `f` happen. All three arms keep this order, and the fixtures check it.

A literal write copies a string literal into a buffer at a position that has already been checked. The literal frontend leaves the existing bounds guards in place in all three arms, so the late descriptor does not remove any checks. In the late arm, native lowering loads the saved address once and then emits the same immediate halfword stores as stock, one per UTF-16 unit, in source order. The characters are encoded as instruction immediates. The late lowering adds no payload blob and no data segment. This is a separate mechanism from the literal pooling studied earlier in this project, and its results should not be combined with those.

The selected policy measures literals in UTF-16 units. Code points and bytes do not count toward the threshold.

| Literal | Code points | UTF-16 units | Late retains | Selected retains |
|---|---|---|---|---|
| `""` | 0 | 0 | yes | no |
| `"Capture"` | 7 | 7 | yes | no |
| `"Captured"` | 8 | 8 | yes | yes |
| `"Captur𝄞"` | 7 | 8 | yes | yes |
| `"♞"` | 1 | 1 | yes | no |

`𝄞` (U+1D11E) lies outside the Basic Multilingual Plane, so it takes a surrogate pair of two units. `"Captur𝄞"` therefore crosses the threshold even though it has seven code points. An empty literal keeps its normal semantics in every arm, including the guards that the frontend leaves in place.

## What was compared

There were three comparisons.

1. **Product compiles.** Four programs (a control, the editor, Chess and the painter) were compiled in each arm. For each compile the study recorded the unlinked image bytes and how many address and literal descriptors were retained.
2. **Independent held-out source.** A program that played no part in designing the policy was compiled in each arm and run on the host RV32 interpreter. All 1,603 outcomes were kept, including 101 traps, and each arm's final memory was compared byte for byte. The study also recorded image bytes and interpreter steps.
3. **Directed fixtures.** The operator wrote 243 fixture states per arm. They cover negative positions, extreme positions, effects of aliasing with the header, sequencing of the check and the right-hand side, and the 7-unit and 8-unit literal boundary.

The study compares the empirical always-late arm with the static selected policy, and both with stock. It makes no claim about code generation in general.

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

The Chess source contains a nested painter literal of 16,316 bytes. Stock code expands every unit of that literal with full per-store address work, and the late lowering replaces that with one address load followed by the same immediate stores. So the 29.34% reduction for Chess under always-late is largely the effect of one unusually large writer. The control, editor and painter rows, with reductions of 9.24% to 14.84%, are a better guide to what a typical program sees. The Chess figure should not be read as an expected reduction in image memory for other programs.

## Scope and failed hypotheses

The frozen study is narrower than the original design. It has no generalized copy descriptor, no fusion or dispatch on user-written branches, and no early-peephole or late-generic control arms. That missing control matters for interpretation. The late arm changes two things at once. It moves expansion later, and it emits a different guard shape (`BLTU` over `EBREAK` instead of a materialized boolean). An early-peephole arm emitting the same guard at the original site would separate the two effects, and this study does not have one. The results support the claim that these two descriptors, with these lowerings, beat stock RV32. They do not show how much of the gain comes from timing alone.

The selected policy was built on the hypothesis that write addresses and literals shorter than 8 units contribute little. The data contradict it. Selected was larger than late on every product row, ran more interpreter steps on the held-out source, and lost about 4.5 percentage points on the label loop. On the held-out source the literal counts are equal, so that loss comes from the declined address sites. A second hypothesis, that the count loop would separate the policies, also failed. Both arms reached exactly 15.901%.

The loops are representative directed calls that anyone can reproduce. They do not measure whole-application speed.

## Reproducing the method

1. Build three compilers from the same revision. Leave early unmodified and confirm that its RV32 output is byte-identical to stock. Enable full retention for late, and enable the static read-only, 8-unit rule for selected.
2. Confirm that Wasm output is byte-identical across all three arms.
3. Compile control, editor, Chess and painter in each arm. Record the unlinked image bytes and the number of retained address and literal descriptors. Divide each retaining arm's bytes by early's bytes.
4. Compile the held-out source in each arm and run it on the host RV32 interpreter. Keep all 1,603 outcomes, including the 101 traps. Require identical trap outcomes and byte-identical final memory against early. Record interpreter steps.
5. Run the 243 fixture states in each arm. Include negative positions, positions near `0x7FFFFFFF` and `0xFFFFFFFF`, header-adjacent positions, writes whose right-hand side has memory effects, empty literals, and literals of exactly 7 and 8 UTF-16 units.
6. On the device, flash the exact image the host exported for each arm and time the parse, count and label loops. For each row, pair the arm's cycle count with an early cycle count, compute the percentage reduction, and take the median across rows. Restore normal firmware afterward.

## Follow-up

The study measures the benefit of retention but not its cost. A small next step is to record, for each function in the four products and the held-out source, the peak number of live descriptors and the peak size of the ordinal table under late and selected. With those numbers next to the byte and step rows, the read-only and 8-unit rule could be compared against always-late on both cost and benefit.

## Physical board

The director ran 231 physical rows across seven arms on the held-out source. Each arm ran from the exact image the host exported, and normal firmware was restored afterward. Median paired cycle reductions relative to early were 4.982% for parse, 15.901% for count and 21.267% for label with always-late. With selected they were 4.937%, 15.901% and 16.742%. These figures describe directed calls into the held-out program on the board and are separate from the interpreter step counts and image byte ratios above.
