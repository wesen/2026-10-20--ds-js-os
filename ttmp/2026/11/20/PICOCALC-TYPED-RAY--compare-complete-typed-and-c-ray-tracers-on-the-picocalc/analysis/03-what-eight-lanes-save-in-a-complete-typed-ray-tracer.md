---
Title: What eight lanes save in a complete Typed ray tracer
Ticket: PICOCALC-TYPED-RAY
Status: complete
Topics: [picocalc, compiler, performance]
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Two practical proofs behind 404 bytes of scalar code savings and an eight-lane ESP32-P4 ray row."
LastUpdated: 2026-11-21
WhatFor: Compare source-equivalent ray-tracing code generators.
WhenToUse: Reproducing the compiler portion of the complete-frame study.
---

# What eight lanes save in a complete Typed ray tracer

The stock compiler spends 3,608,697 instructions finding visible surfaces across 160 rows of the default scene. A guarded replacement does the same primary work in 431,044 instructions. How much of that difference belongs to the ESP32-P4's eight-lane instructions? To find out, run the same replacement once more, with its packet arithmetic expanded into ordinary scalar instructions. The resulting 540,274 instructions leave 109,230 attributable to the packet implementation under this particular scalar control. Moving the question from the primary routine to the complete rendered frame changes the denominator again. Eight lanes account for 0.876% of the matched full frame's retired instructions.

## The pixel that makes six divisions

A separate optimization starts at the opposite end of the frame. For every pixel the renderer scales three color channels and packs the surviving high bits into RGB565. Its six divisions have positive literal divisors. A Typed program may expect signed division to trap on a zero divisor or on the unrepresentable quotient of the most negative integer and minus one. The backend normally emits instructions for both checks. On a divisor of 255 neither condition can arise, whatever the dividend was. A small local rule sees the numeric instruction for a positive constant immediately before signed division or remainder. It consumes both instructions at once and emits the appropriate signed machine operation. A divisor of one also permits returning the dividend or a zero remainder after the dividend expression has executed.

This rule leaves the six actual divides in the color packer. It takes its machine body from 392 to 176 bytes, its conditional branch sites from 18 to zero and its embedded trap sites from 12 to zero. The stock execution already skips the trap instructions on these inputs. The dynamic saving comes from the checks and jumps it previously executed to get past them. Across 25,600 calls, the packer's direct retirement count falls from 1,740,800 to 1,126,400, exactly 24 instructions per pixel. A separate 194,465 come out of the default scene's pixel routine and eight from light setup. Together these account for every one of the 808,873 saved instructions in the complete frame. The primary-intersection and shadow routines have identical direct counts in the two programs. [Full per-function measurements](../various/compiler/full-frame.json)

## Where a halfword changes its meaning

Now consider one sphere at one screen row. The renderer starts with a signed value, the square of the radius minus the square of the vertical displacement. From this value it subtracts each pixel's squared horizontal displacement. A negative difference means the ray misses. A nonnegative difference indexes a square-root table to recover the surface depth. Where spheres overlap, the renderer keeps the nearest depth and its object ID.

The horizontal table lives in a Typed buffer of unsigned 16-bit cells. The normal prepared scene places small squares there, yet the row function can also be called directly with any legal buffer contents. If that buffer contains 65,535 and the row value is zero, a signed lane reads the cell as minus one. The apparent difference becomes plus one, even though the scalar test correctly misses. An image comparison using only normally prepared scenes could never expose that error.

The specialized entry first establishes that the buffer reaches the last output cell, the row index and object centers are in range, and the three-or-fewer radii are at most 32. Negative row terms imply an entire miss row for that sphere. For a remaining row, the term lies between zero and 1,024. After packed signed saturating subtraction, the kernel reinterprets each result as **unsigned** and admits it only if it is at most the original row term. True differences obey that condition and equal the original i32 result. With an oversized input, ordinary negative differences become large unsigned values. Large unsigned inputs interpreted as negative signed cells produce either a value above the row or saturation at 32,767. Both paths reject the lane. An exhaustive test checked every combination of 1,025 rows and 65,536 payload values, including 525,825 saturations. [Exhaustive lane evidence](../various/compiler/lane-domain.json)

## Giving the vector engine comparable work

The inferred backend recognizes a particular complete 318-cell instruction sequence plus its signature and local count. Renaming the function preserves the match. Changing the root-table offset by one rejects it. The explicit backend additionally requires a designated function name. A source-spelled fixture designates `rayRowS16x8Intrinsic` and emits precisely the same image as the inference arm. On the device the explicit configuration designates the existing row's name, so both compilers can receive the identical original Typed file. This is exact template selection, with limited scope for accepting equivalent rewrites. The compiler makes no attempt to infer arbitrary sphere formulas.

On admission the new prologue retains the original checked scalar body as a runtime fallback. All preflight checks happen before the first output store. The fallback thus preserves even partially completed writes when a malformed buffer traps. The fast path clears output cells, walks active spheres, peels misaligned leading cells, processes complete eight-halfword groups, then finishes the tail with scalar arithmetic. Each packet uses an aligned 16-byte scratch slot on the stack. Square-root lookup, the nearest-depth comparison and the conditional depth/ID stores still run in scalar order. The real ESP object uses a broadcast load, an aligned vector load, a signed saturated subtract and an aligned vector store. The consultant's independent scanline memo proposed sorting these issues into bounds, aliasing, tails and representation. Its illustrative SSE operations and stand-alone scanline metric did not establish the behavior of this handheld program. [Vendor-decoded row and fallback cases](../various/compiler/rows.json)

| Default scene host measure | Ordinary Typed | Positive divisor | Matched scalar row | Explicit or inferred PIE row |
| --- | ---: | ---: | ---: | ---: |
| Machine image bytes | 9,564 | 9,160 | 10,072 | 9,944 |
| Retired in 160 primary rows | 3,608,697 | 3,608,697 | 540,274 | 431,044 |
| Complete display frame | 15,532,624 | 14,723,751 | 12,464,201 | 12,354,971 |
| Frame with saved depth and ID planes | 16,920,800 | 16,111,927 | 13,852,377 | 13,743,147 |

The packed and matched programs agree on 25,600 pixels, 25,600 depths and 25,600 IDs at each of three poses. A separate comparison covered ten directed row invocations including actual fallback, trap, large unsigned payload values and different payload alignments. The complete frame limits the benefit because it still shades surfaces, tests shadows and packs colors. In the default frame the ordinary shadow routine alone executes 5,528,397 instructions. Equally, division specialization and row substitution were measured in independent arms. A claim about combining them needs a combined image and a new run. These are architectural instruction counts from host execution. Physical frame latency, including any cost of executing a larger code image, belongs to the device experiment. [Complete packed-frame evidence](../various/compiler/packed-frames.json)

Applying the inferred compiler also costs work. In 15 freshly constructed V8 realms per arm, with cyclically rotated arm order, median compilation took 4.439 ms stock, 4.433 ms with positive divisors, 4.539 ms with the explicit intrinsic, 4.890 ms with inference and 4.470 ms with the matched scalar template. Each sample loaded and evaluated the frontend before the timed interval. Backend evaluation was measured separately. Repeated code in one Node process can benefit from V8 caches. These descriptive latency samples give no estimate of standalone QuickJS startup on the P4. The 380 bytes added to the generated ray image are also distinct from the 2,618 additional bytes of JavaScript source loaded for the inferred compiler. [Raw compilation samples and source sizes](../various/compiler/apply-cost.json)
