# Answer key for the "Check your understanding" questions

Grading: 2 = all required points present and nothing materially wrong; 1 = partly right, or right but missing a required point; 0 = wrong, absent, or "I do not know". A required point may be expressed in any words. Extra correct detail is neither rewarded nor penalized. An answer that contradicts a required point scores at most 1.

## Article 1

1. Required: (a) each world has a turn budget; a handler that overruns is stopped (the world is stopped/reported); (b) it must save its progress, request a timer (or otherwise return), and continue in a later turn.
2. Required: QuickJS, WAMR, native. QuickJS and WAMR confine the program (a fault cannot damage other worlds); native does not (runs with firmware privileges, can damage anything).
3. Required: any two of: that `text` is always a string at every call; that `at` stays within exactly representable integers / is an integer; what `unit` can be (depends on every caller). The essential idea is facts about callers/values elsewhere in the program.
4. Required: native machine code is larger than WebAssembly (240,452 vs 88,255 bytes compiled size; "nearly three times larger"). Accept "the native module is bigger".
5. Required: application sends a screen description (JSON) via the nucleus to the compositor world; the compositor lays out and draws; display driver world transfers to the LCD. Applications do not draw pixels themselves.
6. Required: QuickJS produces bytecode for an interpreter; CJI produces native machine code from untyped source (which requires whole-program inference). The key contrast is bytecode vs machine code from untyped source.

## Article 2

1. Required: the interval ends when the nucleus accepts the application's first screen description; the user still waits for compositor layout/drawing and/or transfer to the LCD.
2. Required: 1 / (1 − 0.2) = 1.25. Calculation or formula shown.
3. Required: almost none; the application waited for its turn (scheduling / other worlds, mainly the compositor), so faster application code could save at most about 2 ms of 559 ms.
4. Required: garbage collection was 85.9 s, i.e. 5.8% of the frontend/total; and enlarging the heap saved only 1.2% (also acceptable: 88% of instructions in range analysis as the second number). Two numbers needed for 2.
5. Required: the model's count for the current backend equals the real emitted instruction count for all 161 functions, which validates the walk/decoding; it does not establish that the predicted counts for models A/B would be achieved by a real implementation (it is not an implementation; assumptions such as free registers).
6. Required: single runs cannot distinguish a small effect from noise / measurement bias from incidental factors; alternating order guards against drift/order effects. Either idea for 1, both (noise/bias plus order) for 2.

## Article 3

1. Required: `half` passes 0.5 for `k`, so the product can be a fraction and the multiply must be floating-point; the code for `scale` depends on all its callers, so it cannot be compiled (optimally/correctly as integer) separately from the rest of the program.
2. Required: [0,0], [0,1], [0,2]; widening jumps the moving bound to a much larger value (a threshold or infinity) so iteration terminates quickly; cost is loss of precision.
3. Required: any two of: results must stay within ±2^53 (exact integer range); operands may be fractions or NaN; negative zero must be distinguished; all numbers are 64-bit floating point so integer arithmetic is only valid under proof.
4. Required: a specialized copy is new code containing its own calls, whose types must be inferred and which must be specialized in turn.
5. Required: replacing the range proof by local rules still left 170 s (168 s in the frontend); the remaining cost is whole-program type inference and library specialization.
6. Required: QuickJS is the fast first tier; CJI lacks a mechanism to restrict optimization to hot code (no trigger / it compiles everything).

## Article 4

1. Required: J1 = i + 1; for i in [5,7] the argument is in [6,8].
2. Required: the summary is a function of the caller facts (a dependence), it does not contain the facts; new facts are handled by evaluating it; it only needs recomputing when the function's own text changes.
3. Required: inside the true branch `i < n` is known but plain SSA uses the same name on both outcomes so the stronger fact has nowhere to attach; extended SSA inserts a renaming (π) on each branch outcome.
4. Required: iteration is still required inside a strongly connected component that contains a cycle (loops/recursion); never required between components (each solved once after its dependencies).
5. Required: a function is checked/compiled from its own text plus the declared signatures of what it calls (nothing about callers). Two consequences from: cost proportional to function size; any order / parallel; an edit to one body cannot change code for another; enables per-function caching/incremental compilation; fast on-device compile.
6. Required: the type annotations (declared types) already present in the source.

## Article 5

1. Required sequence (6 or 7 instructions accepted if consistent): `lw t0,0(sp)`; `sw t0,8(sp)`; `li/addi t0,1`; `sw t0,12(sp)`; `lw t1,12(sp)`; `lw t0,8(sp)`; `add t0,t0,t1`; `sw t0,8(sp)`; `lw t0,8(sp)`; `sw t0,4(sp)` — 10 instructions. Full credit for 10 with the load/store pattern; 1 point for the right pattern with a miscount.
2. Required: list [local y] → [local y, const 1] → [reg t0] with `lw t0,0(sp)`; `addi t0,t0,1` → [] with `sw t0,4(sp)`: 3 instructions. Full credit for 3 instructions and a lazy list; accept 4 if the constant is loaded separately but then 1 point.
3. Required: code after the join is emitted once and must find each value in the same place whichever path was taken; this is correctness (if paths disagree no single following code is right).
4. Required: single forward pass, branch distance unknown when the `if` is reached; conditional branches reach only about 4 KiB, jumps 1 MiB, so it always uses the long form; measurement: 1,008 of 1,009 in Editor (all in Agenda/Files) were within short range, so it is almost never necessary.
5. Required: establishes that the walk decodes/interprets the WebAssembly correctly (cost rules for today's scheme are right); leaves unproven that a real backend would achieve the model A/B counts (assumptions: free temporaries, no implementation, compressed instructions ignored).
6. Required: any two of: loading the string length once before the loop (needs to know nothing in the loop changes it / loop-invariant); omitting the bounds check (needs proof that the loop condition implies it); loop test at the bottom (loop inversion). Each with the kind of knowledge.

## Article 6

1. Required: no; the compiler's source is one of the inputs in the key, a changed compiler may emit different code, so the key changes and the lookup misses (recompile).
2. Required: so that a power loss leaves the old record pointing at the old intact module (record never points at an incomplete module); after power loss the device finds the old record and old module (and possibly an orphan new module).
3. Required: 1.15 s / 7.2 ms ≈ 160 turns; with caching the extra compile is paid once per source change rather than every boot, so native is repaid quickly/always worthwhile.
4. Required: portability/compactness (one file for several processors; smaller files nearly compensate) — they judged it competitive; on the handheld the role is played by WebAssembly.
5. Required: the per-world memory limit (768 KiB); native Editor uses 710 KiB vs 528 KiB for WebAssembly.
6. Required: only that one function is recompiled; a link step (renumbering/patching call indices and linking into the reactor) is still required.

## Article 7

1. Required: the loader limits which functions a module may link to, but nothing stops the code from jumping to any address; concerns control safety.
2. Required: f calling g needs g defined earlier; g calling f needs f defined earlier; both impossible (names registered after the body). If forward calls are allowed, an explicit cycle check on the call graph must be added.
3. Required: call graph is acyclic so depth is bounded and each frame size is known; sum of frame sizes along the worst chain of calls plus the stack needed by the deepest reactor function reached.
4. Required: today it never returns, the budget check never happens and the kernel stalls (all worlds stop); with fuel the counter reaches zero at a back-edge and the turn ends with a trap/fault; fuel does not let it finish later (it stops, does not schedule/resume).
5. Required: address masking still confines it (forces any address into the world's region regardless of what the compiler did); pattern checking does not, because it only confirms a check sequence is present / that the access is checked against some length, depending on the compiler having kept the registers/types straight.
6. Required: verifier advantage: no chip dependence, or cheap reactor calls (a jump, not a trap); PMP advantage: no per-access cost, or covers native code from any compiler including CJI.

## Article 8

1. Required: a number identifying a request, returned when the operation is started; the application must store it and compare it with the token carried by later events to recognize the completion and continue.
2. Required: live: length, read, written; dead: handle, ok, stop. `stop` is recomputed on every outer iteration before use, so its old value is never read.
3. Required: a continuation (rest of the computation) is represented as data: a tag saying which continuation (e.g. which token is non-zero / a phase or state number) plus the saved variables it needs (e.g. unitsRead, unitsWritten, sourceLength); the Editor's author built this by hand.
4. Required: 0 = not running → start: request the read; 1 = waiting for the read → continue after the read (check ok, initialise, loop); 2 = waiting for the yield → reload saved variables and continue at the loop test.
5. Required: no recursion (acyclic call graph) so at most one activation of a function exists at a time; restriction: one instance per frame, so the number of simultaneous instances is fixed (one by default; more must be declared).
6. Required: during a wait other events are handled and application state may change; explicit waits mark exactly where such interleaving can occur so the author can reason about it.

## Article 9

1. Required: the compiler reports every `match` that does not handle the new value; valuable because it lists all places to update / prevents forgotten cases.
2. Required: prevents passing a value of one coordinate system where another is expected (e.g. code-point count as code-unit offset); costs nothing at run time.
3. Required: fact `at < text.length`; invalid when `at` or `text` is assigned or a call could change the length; need not survive the back-edge because the loop condition re-establishes it on every iteration.
4. Required: a signed test says nothing about `at >= 0` (a negative index would pass); an unsigned index type makes the guard an unsigned comparison, which implies both bounds.
5. Required: a turn-arena reference may not be stored in the state record; may not be live across a wait; data that must outlive the turn must be copied into storage the application owns for its whole life.
6. Required: both branches must have consumed the grant (the same handles) exactly once — each path ends in exactly one consuming operation (revoke, send, or store in state).

## Article 10

1. Required: calls go to the wrong function (with arguments of the wrong meaning) and no check detects it; a single description generates both tables, so they cannot differ.
2. Required: building the JSON text in the application (step 1), converting/escaping to UTF-8 JSON (step 2), parsing JSON into dynamically typed garbage-collected objects in the compositor (step 4). Two of three for 1 point.
3. Required: semantics differ; any two of: `i32` addition wraps → `(a+b)|0`; multiplication → `Math.imul`; division truncates/traps → checked helper; `charCodeAt` out of range traps → wrapper class; records → object/typed array.
4. Required: it can detect errors in the compiler backends (WebAssembly/RV32 disagreeing with the reference); it cannot detect an error in the source program's logic.
5. Required: typed ports without `await` are five to six times longer and are written as hand-made continuations; porting twelve applications first would produce code that `await` then makes obsolete.
6. Required: any one prediction with its refuting observation and the stated consequence, e.g. Files does not come out near 593 instructions → the counting model is wrong, re-examine before Editor.
