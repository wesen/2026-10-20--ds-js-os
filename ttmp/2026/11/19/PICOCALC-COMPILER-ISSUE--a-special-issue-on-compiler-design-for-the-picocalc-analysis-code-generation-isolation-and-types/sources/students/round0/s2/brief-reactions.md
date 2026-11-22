# Reactions to `dense-brief.md`

Reader: a student reader, working only from these files, no web access. Everything below is what I actually thought on first read of a brief written for experts.

## Terms I could not explain

One line each: the term, then the sentence I met it in.

1. **CJI** — "CJI compiles a subset of ordinary JavaScript to RV32 machine code using whole-program inference." I only know it because the brief defines it by its behaviour; I could not say what the letters stand for or what its design is.
2. **RV32** — "to RV32 machine code". I know it means 32-bit RISC-V in general terms but could not say what the PicoCalc's actual profile is (extensions, registers, MMU or not).
3. **ESP32-P4** — "a JavaScript operating system on an ESP32-P4 handheld". I could describe it as a microcontroller, nothing about memory size, cache, or flash/RAM split, which the whole brief depends on.
4. **reactor hash** — "Cache the compiled module keyed by source, compiler and reactor hashes." I have no idea what a reactor is here or why it would change compiled output.
5. **"the compositor"** — "the compositor took 235 ms of a 462 ms gap." A guess: the thing that draws screen updates. I could not describe how it is implemented (task? interrupt? main loop?).
6. **JSON screen protocol** — "the compositor and its JSON screen protocol are." Sounds like apps send JSON messages that describe screen updates, but I could not write one line of it.
7. **"tickets"** — "No latency in the tickets reaches the LCD." I cannot tell whether tickets are issue-tracker entries, instrumentation records, or JS objects in the OS.
8. **"turns"** — "the typed Editor on RV32 used 52.9 ms of CPU over 33 turns." Nothing in the brief defines a turn or how long one is allowed to take.
9. **"gap" (startup)** — "235 ms of a 462 ms gap." Which two events bound this gap, and why call it a gap rather than a phase?
10. **call-site customization** — "Self hit long compile pauses from call-site customization." I know the words; I could not explain what is customized at a call site.
11. **Hölzle and Ungar** — "Hölzle and Ungar's answer was a fast non-optimizing compiler first". Names only; I could not say which paper, which system, which year.
12. **Self** — "Self hit long compile pauses". I know Self is an old Smalltalk-family language; I could not say why it compiled at all rather than interpreted.
13. **RPython** — "RPython and Shed Skin infer types over the whole program". I know RPython is PyPy's restricted Python, but not how its inference works or why it is slow.
14. **Shed Skin** — "RPython and Shed Skin infer types over the whole program". Name only; no model of what subset it accepts.
15. **Modula-2 definition modules** — "Modula-2 definition modules, OCaml interface files and TypeScript's isolatedDeclarations all declare the boundary". I can guess "like a .mli file", but I have never used Modula-2.
16. **`isolatedDeclarations`** — the same sentence. Could not say what TypeScript requires of you to get it, or what checking becomes local to what.
17. **Static TypeScript** — "Static TypeScript compiled a TypeScript subset with classes, closures and a garbage-collected heap to machine code for microcontrollers with only a peephole pass." I assume it is the MakeCode one, but cannot describe its restrictions or its output format.
18. **jump functions** — "jump functions summarize each procedure once instead of re-analysing bodies each round". The words mean nothing to me mechanically — what is summarized, into what lattice?
19. **SCC order (in this context)** — "constraint graphs solved in SCC order replace global rounds with one topological pass". I know strongly connected components; I do not see what a constraint graph node is here, or why SCC order gives one pass.
20. **ABCD** — "ABCD gives the demand-driven variant." Pure acronym; I could not expand it or say what it computes.
21. **dense fixpoint** — "sparse propagation on SSA replaces the dense fixpoint". I roughly know both words; I could not explain why the dense version is what makes CJI slow.
22. **value stack (TCC's)** — "TCC's value stack, Liftoff, Ertl's static stack caching". Could not explain how TCC's code generator tracks it.
23. **Liftoff** — same sentence. I believe it is V8's Wasm baseline compiler, but I could not say what it does differently from a smarter tier.
24. **Ertl's static stack caching** — same sentence. Author name plus a technique name; no idea of the rule set.
25. **Best's algorithm** — "Best's algorithm picks the eviction." Which eviction, of what, under which cost model?
26. **Destination-driven generation** — "Destination-driven generation removes the branch-over-jump shape." I can guess it means "generate code into the place the result must go", but not how it removes the branch.
27. **"branch over a jump"** — "every conditional branch is a branch over a jump". I think this means `if !cond goto L; goto Else; L:` style, but I am not sure this is the shape meant.
28. **Copy-and-patch** — "Copy-and-patch is not worth it here." I have read the phrase before (a JIT that stitches pre-compiled snippets) but could not explain how it handles registers or relocations.
29. **Slim binaries** — "Slim binaries shipped a checked, target-independent tree and generated code at load." Author-name-free description, but I cannot say what the tree looked like or how it was compressed.
30. **"slot"** — "a checker confirms that every jump lands inside the slot or on a trampoline." Slot of what — a code page, an app's sandbox region, a memory segment?
31. **trampoline** — "inside the slot or on a trampoline". I can guess "an indirection stub", but not why landing on one is the safe alternative.
32. **PMP** — "The hardware route is PMP with user mode." I believe RISC-V physical memory protection, but could not say how many regions, granularity, or who programs it.
33. **user mode** — same sentence. I know the general idea; I could not say what the PicoCalc OS would need to trap and emulate to support it.
34. **fuel counter** — "a fuel counter decremented at loop back-edges gives pre-emption inside a turn." I understand the idea; I could not say what "pre-emption" means when the interrupted handler holds mutable world state.
35. **liveness analysis** — "liveness analysis identifies which locals cross an await". I know liveness for registers; I could not state the version that answers "does this local need to be saved across a suspension".
36. **WorldState** — "the WorldState token fields are defunctionalized continuations written by hand". A capitalised name with no definition; I could not say what a token is or what fields it has.
37. **defunctionalized continuation** — the same sentence. I answered this in the pre-test in the abstract; seeing it applied to hand-written fields, I could not follow.
38. **linear handles** — "Linear handles and typestate for the grant-and-revoke protocol". I know linearity means "used exactly once"; I could not say what a handle is in this OS.
39. **grant-and-revoke protocol** — the same sentence. Never defined; I cannot tell whether it is about capabilities between apps, or hardware.
40. **Effects as capabilities / manifest claims** — "Effects as capabilities: manifest claims checked against the code." I could not say what a manifest is here, or what a claim looks like.
41. **four coordinate systems (bytes, UTF-16 units, code points, rows)** — "Distinct integer types for the four coordinate systems". The four are listed, so I can name them, but I could not say which API returns which, which is why the types would help.
42. **erasable type annotations** — "One source for both engines via erasable type annotations." I think this means annotations that can be dropped without changing meaning, but I could not say how the untyped engine then behaves.
43. **writeLiteral** — "instead of JSON built with writeLiteral". A function name with no signature.
44. **28 SDK imports / "the three places that list them by hand"** — "An interface definition for the 28 SDK imports, generated into the three places that list them by hand." I cannot tell which three places, or what an interface definition file looks like in this codebase.
45. **"mixed mode"** — "mixed mode (native for hot functions, Wasm for the rest) is an option". I can follow the parenthetical but not who decides, when, or where the boundary lives.
46. **sum types with exhaustive matching** — "Sum types with exhaustive matching." I know this well; listed only so you know where my knowledge starts and stops.

## Claims I could not follow

1. > "No latency in the tickets reaches the LCD, and the typed Editor on RV32 used 52.9 ms of CPU over 33 turns."

   I understand the numbers; I do not understand the conclusion. 52.9 ms is small, but over how much wall-clock time? If 33 turns took 20 seconds, then CPU is 0.3% and the claim is strong; if the turns were only 60 ms each, CPU is most of it. Missing: wall-clock denominators, and what "latency in the tickets" means as a category.

2. > "During startup the compositor took 235 ms of a 462 ms gap."

   What are the two ends of the gap, and what was the rest of the 462 ms? I also do not know whether the compositor measurement is self time or inclusive. Without that, I cannot judge whether 235 ms is improvable or already near the cost of pushing pixels.

3. > "The hypothesis is that app code is no longer the bottleneck, and the compositor and its JSON screen protocol are."

   The step from two measurements to this hypothesis is invisible. Missing: a profile that attributes the whole startup or turn budget, so I can see what the other ~200 ms is.

4. > "The cost difference comes from whole-program inference versus declared boundaries, not from JavaScript semantics."

   This is the central claim of the brief and it is asserted, not argued. The two compilers also differ in target (RV32 native vs Wasm), in language subset, in pass structure (whole-program iterative vs one pass) and in code generator quality — so "the difference is inference" could be blamed on at least four other things. Missing: what was held constant, or one measurement that isolates inference cost.

5. > "Self hit long compile pauses from call-site customization; Hölzle and Ungar's answer was a fast non-optimizing compiler first, with optimization reserved for hot code."

   I can read it as a history lesson, but I cannot see the analogy. CJI is an ahead-of-time whole-program compiler on a handheld; Self was a research JIT. Missing: exactly which mechanism in CJI corresponds to call-site customization, and what "fast non-optimizing first" would even mean when there is no interpreter tier on the device.

6. > "If CJI's analysis is kept: jump functions summarize each procedure once instead of re-analysing bodies each round"

   Why is summarizing once sound when the summary depends on the types of the arguments, which come from call sites that may change during iteration? Missing: the condition under which a jump function must be recomputed, and what happens when the summary is wrong.

7. > "constraint graphs solved in SCC order replace global rounds with one topological pass"

   I know SCCs. I do not know why this reaches a fixpoint in one pass rather than needing iteration inside an SCC, and what happens to non-trivial SCCs (which I assume are exactly the recursive ones).

8. > "ABCD gives the demand-driven variant."

   The acronym is never expanded and the sentence never says what question ABCD answers or why demand-driven helps *compile time* specifically. Missing: one sentence of "instead of computing X everywhere, compute only where Y is asked".

9. > "Copy-and-patch is not worth it here."

   No reason given. On a device where native code is 2–5x larger than VM code, I would expect the opposite conclusion, since copy-and-patch snippets are small and the stub work is minimal. Missing: the cost that kills it (flash? relocation at boot? a compiler-at-build-time requirement?).

10. > "Native code is two to five times larger than VM code, so mixed mode (native for hot functions, Wasm for the rest) is an option."

    The "so" does not connect for me. If native code is bigger, that argues *against* native, or for *selective* native; but it also does not tell me whether the limit is flash capacity, instruction cache, or boot time to write code into executable memory. Missing: which resource the 2–5x pressure lands on and how big the budget is.

11. > "A function's name is registered only after its body is parsed, so recursion is impossible and the call graph is acyclic."

    I follow "registered after" giving "cannot call itself directly". I do not follow why indirect recreation of recursion is impossible: two functions calling each other, or a function stored in a record then called through it. If calls are only by name and dynamic dispatch does not exist, then it works — but the brief never says that.

12. > "Stack depth is therefore a compile-time constant."

    "Constant" seems to need more than acyclicity: fixed frame size per function (no variable-length arrays, no `alloca`), a known entry point, and a bound on loop-driven depth (loops do not nest calls, so fine). Also, is it a constant or a computable maximum? Missing: the assumptions list, and whether the number is checked against the actual task stack at load time.

13. > "Loops are the only unbounded construct, so a fuel counter decremented at loop back-edges gives pre-emption inside a turn."

    Two things are missing. First, why straight-line code needs no counting (I assume a bounded body length, which is only true if there is a limit on body size). Second, and much bigger: what "pre-emption" *means* here — is the interrupted handler resumed at the same point next turn, or rolled back and re-run? If resumed, the fuel counter has to live somewhere per-app, and if rolled back, the whole "no pointers" argument has to also guarantee that a partially applied screen update can be undone. The brief assumes the reader knows the turn/rollback model.

14. > "The output can be verified instead of the compiler trusted: a checker confirms that every jump lands inside the slot or on a trampoline."

    Verifying jump targets is a small part of safety. What proves that loads and stores stay inside the app's data region, that arithmetic cannot corrupt a return address, and that the checker itself is correct (or at least conservative)? The brief's earlier sentence — "no pointers and bounds-checks every access" — seems to be doing that work, but then the *compiler* is trusted again for the bounds checks. Missing: the full invariant list the checker enforces.

15. > "Flow-sensitive refinement so that in `while (at < s.length) { s.charCodeAt(at) }` the bounds check is removed."

    I believe the guard gives `at < s.length`, and `charCodeAt` needs `0 <= at < length`. The missing piece is the negative side (`at >= 0`) and the aliasing/mutation question (`s` could change inside the loop body, and `length` is re-read). The snippet has an empty body, which hides the whole difficulty — with a real body, the refinement must survive a store or be re-established.

16. > "`await` compiled to state machines: the WorldState token fields are defunctionalized continuations written by hand"

    I follow the general mechanism from my pre-test answer, but not this sentence. Which fields, written where, by whom, and what does it mean that they are "written by hand" — does the compiler not generate the state machine yet, so the runtime is already doing it manually?

17. > "Regions: a per-turn arena reset when the handler returns."

    If values allocated in a turn can be stored in world state or sent to another app, a blind reset frees live data. Missing: the rule that makes this safe (deep copy on escape? everything in a turn is scratch except explicitly copied values?).

18. > "Effects as capabilities: manifest claims checked against the code."

    Checked by which phase — the type checker, the linker, the loader, or a separate verifier? And is a claim "this app may draw" or "this app may call import 7"? I cannot evaluate the idea without knowing the granularity.

19. > "Gradual typing only at world-message boundaries."

    Why only there, and what is checked at the boundary — the shape of the message, or the types of the fields? If the inside of every handler is statically typed, the boundary is where dynamic values enter, so presumably a runtime tag check plus a cast; the brief does not say.

20. > "One source for both engines via erasable type annotations."

    If the annotations are erasable, the untyped engine gets the same program with types removed — which is exactly what CJI compiles slowly today. So how does this reduce to "fewer engines"? Missing: whether CJI is meant to keep working on the same source, and how.

## Clarity by section

- **What I would do next** — 3. The list of six actions is easy to read, but each item leans on measurements and names introduced nowhere (tickets, gaps, reactor hashes), so I could repeat the list but not defend any item.
- **Why one compiler is slow and the other fast** — 2. The section spends its length on four historical systems I have not used, and the key claim ("the difference is inference, not semantics") is asserted; the list of four fixes at the end lands before I have any model of the problem.
- **Code generation** — 4. This is the clearest part: the bad shape (two loads, the op, a store) and the goal (keep stack entries in registers) are stated concretely, and I could describe the fix to a classmate; only the named techniques block me.
- **Load time** — 4. Short and with a clear idea (ship checked Wasm, generate code at load); the only gap is what a "checked, target-independent tree" is.
- **Isolation** — 4. The chain language → no pointers → no recursion → acyclic call graph → constant stack → loops are the only unbounded thing → fuel is genuinely a chain I can follow; it loses points for the unexplained jump to the verifier ("slot", "trampoline") and for leaving the resume-vs-rollback question open.
- **Type system directions** — 2. Ten separate ideas in eleven lines, each with one justification clause; I can name them all and implement none, and the ordering is alphabetical-ish rather than by importance.
- **Architecture** — 3. Four short items, each a plausible direction, but "the three places that list them by hand" refers to a codebase I cannot see, so I cannot tell what work is implied.

## Questions I would ask the author

1. What is a "turn" exactly — how long is the budget, what happens at the end of it, and is a handler resumed or restarted?
2. What is a "ticket", and what does "latency in the tickets reaches the LCD" mean as a measurement?
3. Which two events bound the "462 ms gap" during startup, and what is the other ~200 ms spent on?
4. Is the 52.9 ms / 33 turns figure per turn, total, or an average — and what fraction of the per-turn budget is that?
5. What is a "reactor hash", and why would a change to the reactor invalidate compiled output?
6. Could the 8 s–25 min CJI times and the 0.2–3.1 s typed-compiler times be compared under a single measurement, with the same app, so I can see where the seconds go?
7. How much of CJI's time is inference versus code generation? Has that split been measured, or is it inferred from the literature named?
8. Which of the four proposed inference fixes (jump functions, sparse SSA, SCC-ordered constraint solving, ABCD) is the best single investment, and why not just do that one?
9. Does the typed language really have no way to call a function through a value? If so, why is that restriction acceptable to the twelve apps that still need porting?
10. If a handler runs out of fuel mid-draw, what does the screen look like, and who is responsible for making that consistent?
11. What exactly does the code checker prove — just jump targets, or also memory access ranges and stack discipline? Who checks the checker?
12. Why is copy-and-patch not worth it — flash size, relocation cost at boot, or something about the stub layer?
13. Where does the boundary between native and Wasm live in mixed mode, and what decides that a function is "hot" on a device that compiles at boot?
14. For the four coordinate systems: which API function returns which unit, and what was the actual bug that distinct types would have caught?
15. What do the hand-written defunctionalized continuations in WorldState look like today, and what would the compiler generate instead?
16. At the world-message boundary, what is checked — the message shape, or the numbers inside it — and what happens when the check fails?
17. What is the grant-and-revoke protocol, who are the parties, and what is the bug it is meant to prevent?
18. "Fewer engines" — which engines go, and what runs the twelve apps in the meantime?

## A teaching order

Eight lessons, in the order I would want them, each starting from the thing that has to come first.

1. **The machine and the mission.** What the PicoCalc is: CPU, memory, flash, screen, and what "boot", a "turn" and a "tick" mean. Must explain first: the device's actual limits, because every later tradeoff is about them.
2. **Why we compile at all, and what the two compilers are.** The two pipelines side by side — CJI to RV32, typed JS to Wasm to RV32 — with their times on one axis and their language features on the other. Must explain first: what a compiler pass is, and what "ahead of time" versus "at boot" means.
3. **Whole-program inference and why it costs minutes.** Start from a small function, show how a call site tells you the argument types, show the iteration and why you cannot compile files separately. Must explain first: types as unknowns to be solved, not as annotations to be checked.
4. **Making inference affordable.** Jump functions, sparse propagation on SSA, SCC-ordered solving, demand-driven analysis — each introduced as a fix for a specific pain point seen in lesson 3. Must explain first: fixpoints and what "slow" means concretely (number of body re-analyses).
5. **Declared boundaries.** Modula-2 definition modules, OCaml `.mli`, `isolatedDeclarations`: one idea — a declared interface makes checking local. Must explain first: what "local" checking buys you (no whole-program pass, incremental compile).
6. **Code generation for a stack machine.** The naive lowering (frame slot per operand) drawn out instruction by instruction, then the register-tracking version, then the peephole that removes store-then-load. Must explain first: what registers, spills and calling conventions are, since the naive version is easier to see *before* the clever one.
7. **Safety: isolation, verification, fuel.** From "no pointers, bounds-checked" to "acyclic call graph", "constant stack depth", "fuel at back-edges", and the checker that verifies jump targets. Must explain first: what could go wrong if the compiler were buggy (the threat model), otherwise the checker sounds like bureaucracy.
8. **The language and its future.** `await` as a state machine, regions per turn, typestate and linear handles, effects as capabilities, gradual typing at the boundary, distinct integer types. Must explain first: `await` and continuations, because everything else in this lesson builds on the idea of a suspended frame.

## What example would help most

1. **A real CJI compile log.** The single most useful artefact would be one app's compile broken into phases with timings — parse, infer round 1..N, codegen — so the "8 s to 25 min" number has a shape. Right after it, the same app through the typed compiler, phase by phase. Without this, the whole "inference is the difference" argument is a slogan to me.

2. **One basic block lowered twice, side by side.** About ten lines of typed JS, then the Wasm, then the RV32 the current backend emits (all those loads, the op, the store, the branch-over-jump), then the RV32 with register tracking plus the peephole applied. I can only judge "two loads, the operation and a store" if I see the six instructions, and I can only judge Best's algorithm if I see which value it decides to spill.

3. **One `await` before and after.** A handler that draws something, awaits, then draws again: today, as the hand-written WorldState fields; then as the state machine the compiler would generate, with the locals it has to save marked. That single picture would also explain liveness-across-`await` and why "no recursion → fixed frame offset" matters.

Honourable mention: a diagram of the 28 SDK imports and the three hand-written lists, because "generated into the three places that list them by hand" is the one architecture item I could not picture at all.
