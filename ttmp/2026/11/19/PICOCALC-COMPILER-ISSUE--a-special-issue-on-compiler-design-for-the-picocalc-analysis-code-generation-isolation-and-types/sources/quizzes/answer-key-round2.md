# Answer key for the revised "Check your understanding" questions (round 2)

Grading: 2 = all required points present and nothing materially wrong; 1 = partly right, or right but missing a required point; 0 = wrong, absent, or "I do not know". A required point may be expressed in any words. Extra correct detail is neither rewarded nor penalized. An answer that contradicts a required point scores at most 1.

Questions changed since round 1 are marked (new) or (revised).

## Article 1

1. Required: (a) each world has a turn budget; a handler that overruns is stopped; (b) it must save its progress, request a timer and return, and continue in a later turn.
2. Required: QuickJS, WAMR, native. QuickJS and WAMR confine the program; native does not (firmware privileges).
3. Required: any two of: that `text` is always a string at every call; that `at` stays within exactly representable integers; what `unit` can be (depends on every caller).
4. Required: the same function takes several times more bytes as RV32 instructions than as WebAssembly (e.g. 412 bytes against 77 for `countUnit`; module 240,452 against 88,255 bytes). Mentioning that the engines also account memory differently is correct but not required.
5. Required: the application sends a screen description (JSON) through the nucleus to the compositor; the compositor lays out and draws; the display driver world transfers the pixels to the LCD.
6. (new) Required: a hybrid has some functions rewritten in the typed language while the rest is C code inside its reactor; the typed-compiler time for Files and Agenda covers only the typed functions, whereas Editor's covers the entire application, so the rows measure different amounts of program.

## Article 2

1. (revised) Required: it ends when the nucleus accepts the application's first screen description; the user still waits for the compositor's layout and drawing and/or the transfer to the LCD. (Also acceptable as the thing still waited for: nothing before the compile began is included.)
2. (new) Required: 1.6 / (35.6 + 1.6) = 4.3 percent (native Editor); largest speedup 1 / (1 − 0.043) ≈ 1.045; it is an upper limit because the unmeasured drawing time can only enlarge the denominator.
3. (new) Required: Agenda was waiting for its turn (its file was ready); the compositor used the largest share (293 ms); the project changed the scheduler so that the application's first turn runs ahead of other startup work (saving about 340 ms).
4. Required: garbage collection was 85.9 s or 5.8 percent; enlarging the heap saved only 1.2 percent. (The 88 percent attributed to range analysis is acceptable as the second number.)
5. (revised) Required: the script's count under the current backend's rules equals the real emitted instruction count for all 161 functions; this shows the script reads the code correctly; it does not show that the predicted counts could be achieved by a real backend.
6. (new) Required: 118 microseconds per token is the whole WebAssembly compile on the device divided by the number of tokens (1,988 ms / 16,792); 31 microseconds per token is tokenizing alone (about half a second per boot), and it is the extrapolation: the workstation figure scaled by the factor of 66.

## Article 3

1. Required: `half` passes 0.5 for `k`, so the product can be a fraction and the multiply must be floating-point; the code for `scale` depends on all its callers, so it cannot be compiled separately from the rest of the program.
2. (revised) Required: [0,0], [0,1], [0,2]; widening jumps the moving bound to a much larger value (infinity, or a threshold), in the table on pass 3, and the fixpoint is confirmed on pass 4; the cost is precision.
3. (new) Required: JavaScript numbers are floating-point; `max + 2` = 2^53 + 1 is not representable and rounds to 2^53, so the difference is 1; without the proof the compiler used exact integer arithmetic, which gives 2.
4. (new) Required: one analysis before the first round and one after each of the six rounds gives seven; each analysis is itself an iteration of many passes (about fourteen on average), giving 95 in total.
5. Required: replacing the range proof by local rules still left 170 s (168 s in the frontend); the remaining cost is attributed to whole-program type inference and library specialization. Full credit also requires nothing false; noting that this attribution is an inference is correct but not required.
6. Required: QuickJS is the fast first tier; CJI lacks a mechanism to restrict optimization to the code that is executed often.

## Article 4

1. Required: J1 = i + 1; for i in [5,7] the argument is in [6,8].
2. (key revised) Required: a summary is a formula whose inputs are the caller's facts; when the facts change only its result changes, so new facts are handled by evaluating it; it needs recomputing only when the function's text changes.
3. Required: inside the true branch `i < n` is known, but plain SSA uses one name on both outcomes so the fact has no name to attach to; extended SSA inserts a renaming (π) on each branch outcome.
4. (new) Required: 2,741 (11,760 − 9,019 skipped); the skipped visits cost little already, so only the 2,741 body analyses are what summaries could still save.
5. Required: a function is checked from its own text plus the declared signatures of what it calls. Two consequences from: cost proportional to function size; any order; an edit to one body cannot change another's code; per-function caching; fast on-device compile.
6. (new) Required: CJI already accepts type annotations in comments (`/*: … */`); they would have to be required on every function boundary.

## Article 5

1. Required: ten instructions: `lw`, `sw` for `local.get`; `li`, `sw` for the constant; `lw`, `lw`, `add`, `sw` for the add; `lw`, `sw` for `local.set`. Full credit for 10 with this pattern; 1 point for the right pattern with a miscount.
2. Required: list [local y] → [local y, const 1] → [register] with `lw t0,0(sp)`; `addi t0,t0,1` → [] with `sw t0,4(sp)`: 3 instructions.
3. (new) Required: a trap, because it ends the handling of the event and nothing reads the frame afterwards; a hardware interrupt, because it saves and restores all registers itself.
4. Required: single forward pass, so the distance to the end of the block is unknown when the `if` is reached; conditional branches reach only about 4 KiB, jumps 1 MiB; measurement: 1,008 of 1,009 in Editor (all in Agenda and Files) were within short range.
5. (new) Required: 175,860 − 66,176 = 109,684 bytes ≈ 107 KiB; it matters because the native Editor has only 58 KiB of memory to spare.
6. Required: any two of: loading the length once before the loop (needs to know nothing in the loop changes it); omitting the bounds check (needs proof that the loop condition implies it); loop test at the bottom. Each with the kind of knowledge.

## Article 6

1. (new) Required: the firmware identity; the compiler, the reactor and the reactor's function table are all part of the firmware image, so any change to them changes the identity.
2. (new) Required: the new module and its source are written to the storage area that is not active; the record is changed last to name that area; after a power loss before the record changes, the record still names the old area, whose module is intact.
3. Required: 1.15 s / 7.2 ms ≈ 160 turns; with caching the extra compile is paid once per source change instead of every boot.
4. Required: one file runs on every processor (portability), judged an acceptable price; on the handheld the role is played by WebAssembly.
5. Required: the per-world memory limit (768 KiB); native Editor uses 710 KiB against 528 KiB for WebAssembly.
6. (new) Required: 4.76 compares bytes of RV32 code with bytes of WebAssembly function bodies; 2.7 compares the complete modules (240 kB against 88 kB); they differ because each module also contains its reactor, the same C code in both.

## Article 7

1. Required: the loader limits which functions a module may link to, but nothing stops the code from jumping to any address; this concerns control safety.
2. (revised) Required: a by-product of the compiler registering a function's name only after translating its body (one pass, definition before use); an explicit check that the call graph has no cycle must be added; without it the compile-time stack bound is lost.
3. (new) Required: stack need = the function's own frame size plus the largest stack need of anything it calls (typed callee's stack need, or a reactor function's stack use); computable at once because every callee was defined, and so computed, earlier.
4. (new) Required: subtracting 1 bounds the number of loop iterations; subtracting the greatest number of instructions one trip round the loop body can execute bounds executed instructions; a typed callee adds its own greatest straight-line cost (its loops charge themselves); a reactor call is charged its worst case for the given arguments (e.g. the span length).
5. (revised) Required: address masking still confines it, because it forces any address into the world's own region whatever the compiler did; pattern checking accepts the code because the complete check sequence is present, only applied to a wrong base.
6. Required: verifier advantage: no dependence on chip features, or cheap reactor calls (a jump, not a trap); PMP advantage: no per-access cost, or it covers native code from any compiler including CJI.

## Article 8

1. Required: a number identifying a request, returned when the operation starts; the application stores it and compares it with the token carried by later events to recognize the completion and continue.
2. Required: live: length, read, written; dead: handle, ok, stop. `stop` is recomputed on every outer iteration before use.
3. (new) Required: `readToken` (non-zero while a wait is outstanding) together with the boolean `reading` (false during the storage wait, true between slices of normalization); saved variables: `unitsRead`, `unitsWritten`, `sourceLength`.
4. (new) Required: `start` is called once with the function's arguments and runs to the first wait; `resume` is called with each matching completion event; state 1 continues after the read (test `ok`, initialise, go to the loop test); state 2 reloads the saved variables and continues at the loop test.
5. (new) Required: several tasks can be suspended at once and may use the same function, so a single frame per function could be needed by two tasks; the compiler lays out, for each kind of task, one frame for every asynchronous function reachable from the task's top-level function; restriction: one instance of a kind of task at a time unless more sets are declared.
6. Required: during a wait other events are handled and the application's state may change; explicit waits mark exactly where that can happen.

## Article 9

1. (new) Required: any two of: the file browser's key handler returning 14 and 15; `event.kind === 4`; `findPhase` values (below 4 phases, 4 not found, 5 found); nothing changes in the generated code, because each name is represented as a small integer.
2. (new) Required: UTF-8 bytes, UTF-16 code units, code points, wrapped rows; the mistake: passing a code-point column where a code-unit offset is expected, wrong only for text with characters that need two code units (such as emoji).
3. (revised) Required: fact `at < text.length`; discarded when `at` or `text` is assigned, or when any function is called; nothing is remembered across iterations because the loop condition is tested again and re-establishes the fact.
4. Required: a signed test says nothing about `at >= 0`; with an unsigned index type the guard is an unsigned comparison, which is exactly the check.
5. Required: a turn-arena reference may not be stored in the state record; may not be live across a wait; data that must outlive the turn must be copied into storage the application owns for its whole life.
6. (revised) Required: both branches must have consumed the same set of handles, so the grant is consumed on each path; the branches may consume it in different ways (e.g. one revokes, one stores).

## Article 10

1. (new) Required: it catches a function added to one list and not the other (different lengths); it misses two lists of the same length in different orders; a single description generates all the lists, so neither mistake can occur.
2. (revised) Required: steps 1 (building JSON text), 2 (converting and escaping to UTF-8) and 4 (parsing into garbage-collected objects); step 3 (copying the message to the compositor's queue) is needed with any protocol; step 5 (layout and drawing) is the compositor's actual job.
3. Required: semantics differ; any two of: `i32` addition wraps → `(a+b)|0`; multiplication → `Math.imul`; division truncates and traps → a checked helper; `charCodeAt` out of range traps → a wrapper class; records → an object or typed array.
4. Required: it can detect errors in the compiler's backends; it cannot detect an error in the source program's logic (nor one in the frontend that all backends share; either limit earns full credit).
5. (revised) Required: typed ports are four to six times longer than the JavaScript they replace (5.5 for Editor, 4.4 for Agenda with its C); porting twelve more applications first would produce code that `await` then makes obsolete.
6. Required: any one prediction with its refuting observation and the stated consequence.
