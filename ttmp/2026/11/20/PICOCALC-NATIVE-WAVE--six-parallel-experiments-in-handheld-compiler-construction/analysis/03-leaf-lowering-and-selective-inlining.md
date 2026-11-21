---
Title: Small leaves and bounded inlining in the PicoCalc Typed compiler
Ticket: PICOCALC-NATIVE-WAVE
DocType: analysis
Status: active
Author: Claude Opus High
---

# Small Leaves and Bounded Inlining in the PicoCalc Typed Compiler

In the maintained Chess engine, a function that converts a square index or checks a board coordinate can run thousands of times before a move is chosen. A small experiment emits those helpers without a stack frame and copies selected leaf bodies into their callers. The prototypes run from a staged copy of the Typed RV32 backend. [Design and reproduction guide](../design-doc/03-leaf-functions-and-selective-inlining.md) · [Investigation diary](../reference/13-leaf-lowering-diary.md)

## What a call costs on RV32

A function call on RV32 is a jump that has to remember where it came from. The caller runs `jal` or `jalr`, which writes the address of the next instruction into the return-address register `ra` and then jumps to the callee. When the callee is done, it jumps back through `ra`. If the callee calls something else, that inner call overwrites `ra`. So any function that makes calls has to save `ra` somewhere first, usually in a stack frame.

The calling convention also divides the registers between caller and callee. Arguments arrive in `a0` through `a7`, and the result goes back in `a0`. The argument registers and the temporaries `t0` through `t6` are volatile, which means a callee may overwrite them without restoring them. If the caller has a value in one of those registers and still needs it after the call, the caller has to put it somewhere safe before the call and get it back afterwards. That save-and-reload pair is called a spill and a restore. The saved registers `s0` through `s11` and the stack pointer `sp` belong to the caller, so a callee that uses them has to restore them before it returns.

The Typed compiler's existing lowering gives every function the same framed control. A prologue lowers `sp`, saves `ra` and any other state the body might disturb, and the body runs. Then an epilogue restores everything, raises `sp` again, and returns. This shape is always correct. For a function that adds a constant to its argument, though, most of the instructions are bookkeeping.

## The frameless recipe

A leaf is a function that makes no calls. Because it never calls anything, `ra` stays intact from entry to exit, and the leaf never needs to save it. If the leaf also has no local variables and reads all of its inputs from argument registers, it doesn't need stack space either. It can compute its result in volatile registers, put the result in `a0`, and return straight through `ra`. That is the frameless recipe.

The prototype only uses the recipe when it can show the function fits a narrow shape:

- every parameter is a read-only, pure `i32` or `bool`, and there are at most eight, so all of them arrive in `a0`–`a7`
- the function has no frontend locals, calls, loops or memory access
- the raw lowered body is at most 128 cells
- expression evaluation fits in five operand registers

Early returns are allowed, and so are forward structured control such as `if` and `else`. Both only jump forward to labels the compiler hasn't reached yet, and that keeps label patching simple.

Division needs special care. RV32 `div` doesn't trap on a zero divisor. It quietly returns a fixed value. Typed code expects a trap, so the compiler emits an explicit guard before each division. The stock guard can use `a0` as a temporary because the parameter is in its stack slot. The frameless guard uses `t5`, preserving the incoming `a0` for any later read on the continuing path. The regression suite checks that the leaf versions trap exactly where the stock versions do.

## The plusSeven example

Here is a small module. A helper `plusSeven(x)` returns `x + 7`. A caller computes `a`, calls `plusSeven(a)`, and then uses `a` again afterwards. So `a` is live across the call.

With the framed control, the helper is 40 bytes and the module is 100 bytes. With the frameless recipe, the helper drops to 20 bytes and the module to 80. The caller doesn't change. The savings come from the frame setup, return sequence and parameter slot traffic that the helper no longer needs.

The inline arm then replaces the call inside the caller with the helper's body, which makes the module 92 bytes. That is 12 bytes more than the leaf module and still 8 bytes less than the control. The module grows because the helper's entry is kept. The prototype always emits an independently callable leaf body, even when every visible call to it has been inlined. That keeps any other reference to the function working without extra analysis.

The more interesting part is what happens to `a`. In the framed and leaf versions, the caller spills `a` before the call and restores it afterwards, because `a` sits in a volatile register that the callee may overwrite. After inlining there is no call, and the inlined body happens to use only registers the inliner knows about. A more aggressive inliner could prove that `a`'s register survives and remove both the spill and the restore. The prototype keeps both. The surrounding code is exactly what the caller's code generator produced for a call, and that code is already correct whenever the inlined body uses no more registers than a real call would clobber. The frameless recipe guarantees that. Removing the spill and restore would mean adding a register-liveness proof across the spliced code. That proof is new machinery with its own failure modes, and it would save a handful of bytes per site. The conservative choice keeps the inliner a pure substitution. Its correctness depends on the leaf's register discipline and nothing else.

## Rebasing local exit labels

A leaf with an early return jumps to its own exit, and its `if`/`else` arms jump to labels numbered inside the helper. When that body is copied into a caller, two things have to change. First, a `return` can no longer mean "jump through `ra`". In the inlined copy it means "put the value in the result register and continue after the inlined body". The inliner copies the existing exit jump and maps its target to the instruction after the spliced body. Every internal jump also gets a new source and target offset within the caller. Adding the insertion offset to both locations is called rebasing. The backend resolves the recorded jumps during final image assembly.

## Bounded selection

The compiler streams functions as it goes. Inlining therefore needs the callee's lowered body to be available when a later caller is compiled. The inline arm buffers checked function bodies and builds recipes for the qualifying leaves before lowering callers. Buffering has a cost of its own, so the experiment includes a buffered-leaf control. That arm buffers exactly as the inline arm does but never inlines. Comparing the leaf, buffered-leaf and inline arms separates the effect of buffering from the effect of the substitution itself.

Selection is bounded on three axes. A callee qualifies only if its body is at most 20 words. Across the whole program, inlining may add at most 96 words and use at most 32 sites. Candidates are considered in function-body order, the order in which the compiler meets them, and the budget is spent first come, first served. The same source therefore always gives the same set of inlined sites.

## What the measurements show

**Compile time.** Host compile times are 13 warmed serial samples per arm, with the four arms rotated between samples. They are host measurements. They do not describe compile time on the ESP32-P4. The minimum-to-maximum spreads are wide compared with the differences between medians, so the medians are a rough guide at best.

| Arm | Chess bytes | Chess host median ms | Painter bytes | Painter host median ms | Telemetry image B | Telemetry RV32 steps |
|---|---|---|---|---|---|---|
| stock | 26,580 | 2.116 | 23,848 | 1.502 | 2,876 | 158,570 |
| leaf | 26,276 | 1.805 | 23,776 | 1.470 | 2,812 | 149,879 |
| leaf-buffered | 26,276 | 1.760 | 23,776 | 1.565 | — | — |
| inline | 26,660 | 2.148 | 23,776 | 1.682 | 2,952 | 146,509 |

**Chess.** Fifteen Chess functions qualified as leaves, including `chessSquare`, `chessDense`, `chessPawnStep` and `chessRight`. The inline arm chose eight sites. There are two `chessDense` sites in `chessMove`, a `chessSquare` site in each of `chessFrom` and `chessTo`, two `chessPawnStep` sites, a `chessRight` site in `chessRemoveRight`, and a `chessPromotedKind` site in `chessMake`. Together they add exactly 96 words, which fills the aggregate budget, so later candidates stayed as calls. The leaf arm shrinks the image by 304 bytes. The inline arm ends 80 bytes above stock, because it keeps every callee entry and adds its copies on top.

The Chess model ran 17 cases from the original engine suite, covering several positions at depths 3 to 5 plus a reduced-budget search and a mate-in-one. Each search began from the same root and restored its cells on completion. All 17 cases matched across the stock, leaf and inline arms on the digest covering best move, score, completed depth, node count and slice count. That is equality of search outcomes. It does not compare the arms node by node. The modeled instruction count fell by about 7.2% to 8.0% in the leaf arm and about 7.7% to 8.3% in the inline arm. In the opening at depth 3, for example, the count drops from 31,850,741 to 29,319,104 for leaf and 29,217,042 for inline. Inlining adds roughly 0.3 to 0.5 percentage points on top of the leaf change. These numbers come from an instruction model. They are not retired instructions on the P4.

**Painter.** Painter has three leaves (`meshColor`, `outlineTable`, `capTable`) and no call sites that qualified for inlining. That makes it a useful control, because the inline arm should behave exactly like the leaf arm, and it does. Four opening poses (phases 0, 5, 8 and 23) produced identical whole memory across all arms. Modeled instructions fell by about 0.87% under the leaf recipe. Phase 0 went from 768,445 to 761,749, for example, with leaf, leaf-buffered and inline all equal.

**Held-out telemetry.** A sealed telemetry program was written independently of the implementation, so the prototype wasn't tuned to it. It runs 1,603 oracle invocations per arm, including 101 that must trap, spread across request, inspect, event-count, burst-read and label checks. Every arm matched the oracle on every invocation and trap. Its image is 64 bytes smaller under leaf and 76 bytes larger under inline. Modeled RV32 steps fall by 5.5% under leaf and 7.6% under inline, and those modeled counts were verified. Separately, 39 adversarial checks probe the admission rules and the trap behavior.

**Physical held-out timing.** The director ran the telemetry workload on the physical device as a separate experiment, using 11 rotated blocks. The [held-out physical timing](../various/director/paired-results.json) shows a median paired parse-time reduction of 11.277% for leaf and 15.942% for inline. The count and label control paths, which the changes should leave alone, showed 0%. This comparison covers execution of one held-out program.

## Chess search on the physical PicoCalc

We also ran the leaf and inline variants on the ESP32-P4 at 360 MHz. Each arm was a standalone flash-mapped RV32 image, and all three arms were loaded into the same temporary app. Five configurations, three arms and three repetitions gave 45 samples. The arm order rotated by (q + rep + fixtureIndex) modulo 3, so no arm always held the same slot in a run. The clock starts at search start and stops after the final slice. It leaves out setup, rendering and the scheduling between interactive turns, so the figures cover isolated search compute only. Each cell has three samples taken within one boot, so the figures do not show spread across boots. The full Chess results matched in all 45 samples, including every restored root cell. Stock, leaf and inline produced the same best moves, scores, completed depths and node counts.

| Position | Depth (req/done) | Budget | Nodes | Stock median µs | Leaf median µs | Inline median µs | Leaf paired reduction | Inline paired reduction |
|---|---|---|---|---|---|---|---|---|
| opening | 3 / 3 | 30000 | 871 | 121142 | 112530 | 112155 | 7.108 % | 7.416 % |
| after-e2e4 | 4 / 4 | 30000 | 14868 | 2288423 | 2125654 | 2117157 | 7.115 % | 7.483 % |
| kiwipete | 3 / 3 | 30000 | 7194 | 1333487 | 1242052 | 1238172 | 6.857 % | 7.137 % |
| pawn-ending | 5 / 5 | 30000 | 1729 | 142057 | 130988 | 131172 | 7.793 % | 7.663 % |
| after-e2e4 | 4 / 3 | 1600 | 1600 | 239159 | 221526 | 220738 | 7.371 % | 7.702 % |

Compared with stock, leaf lowering cut the median paired elapsed time by 6.857 to 7.793 percent. Selective inlining cut it by 7.137 to 7.702 percent. Inlining beat leaf alone by 0.28 to 0.37 points in four cases. In the pawn ending it was 0.13 points behind, and three samples cannot reliably separate a gap that small. The improvement held across very different search sizes, from 871 nodes to 14868 nodes, and it also held when the node budget cut a search short. These physical results point the same way as the earlier modeled observations, but they measure something different. The instruction model counts the RV32 instructions executed in its own run. The P4 measurement counts elapsed microseconds. Timings on the board also depend on controller code, body layout and flash cache behavior, so elapsed time can change even when the instruction count does not. These measurements include neither key handling nor compile time. [Physical receipt](../various/03-leaf/physical.json)

## Reading the results carefully

Matching results show that the arms agree on what the oracle and the digests record. Modeled instruction counts are a model of the generated code and not a measurement of the processor. Host compile medians are host numbers with wide spreads. Within those limits, the prototype shows that a narrowly admitted frameless leaf recipe cuts modeled work in Chess by close to 8% with exact behavioral agreement. Bounded inlining on top of it adds a smaller further gain, at a code-size cost set by the 96-word budget and the decision to keep callee entries. [Aggregate results](../various/03-leaf/summary.json) · [Independent design](../various/03-leaf/opus-design.txt)
