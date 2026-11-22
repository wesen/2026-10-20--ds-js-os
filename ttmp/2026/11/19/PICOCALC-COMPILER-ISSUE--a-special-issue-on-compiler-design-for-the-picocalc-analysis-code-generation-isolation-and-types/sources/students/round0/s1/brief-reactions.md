# Reactions to `dense-brief.md`

Reader: student. I read the pre-test first and answered it in `pretest-answers.md`. Below I mark what I could not explain to a classmate, what I could read but not justify, and what I would ask.

---

## Terms I could not explain

One line each, with the sentence it appeared in.

- **CJI** — "CJI compiles a subset of ordinary JavaScript to RV32 machine code using whole-program inference." I do not know what the letters stand for, and the brief never says. Is it the name of the compiler, the language subset, or a project?
- **reactor hashes** — "Cache the compiled module keyed by source, compiler and reactor hashes." I do not know what a "reactor" is in PicoCalc. It sounds PicoCalc-specific and is never defined.
- **the tickets** — "No latency in the tickets reaches the LCD". I do not know what "the tickets" are: issue tickets? queued work items? I could not explain this sentence at all.
- **turn (as a unit of scheduling)** — "the typed Editor on RV32 used 52.9 ms of CPU over 33 turns." I think a "turn" is one event-loop iteration with a time budget, but the brief never says so, and later "pre-emption inside a turn" leans on that reading.
- **compositor / JSON screen protocol** — "the compositor and its JSON screen protocol are [the bottleneck]." I can guess a compositor draws the screen, but I could not explain how a *protocol* built from JSON becomes a measured cost.
- **call-site customization** — "Self hit long compile pauses from call-site customization". I think this means specializing code per call site (inline caches), but I could not explain the mechanism or why it causes pause times.
- **Hölzle and Ungar** — "Hölzle and Ungar's answer was a fast non-optimizing compiler first". I do not know who these people are or what system they built. I can infer "the answer" is a two-tier compiler, but not what they actually measured.
- **RPython** — "RPython and Shed Skin infer types over the whole program". I have heard the name and could say "the language PyPy's interpreter is written in", but not what its type inference does.
- **Shed Skin** — same sentence. I know nothing about it.
- **Modula-2 definition modules** — "Modula-2 definition modules, OCaml interface files and TypeScript's isolatedDeclarations all declare the boundary". I can guess a definition module lists what a module exports, but I could not explain how that "makes checking local".
- **`isolatedDeclarations`** — "TypeScript's isolatedDeclarations". I know TypeScript loosely; I do not know this specific compiler flag or what it forbids.
- **Static TypeScript** — "Static TypeScript compiled a TypeScript subset ... with only a peephole pass." I can guess it is a Microsoft research project for microcontrollers; I could not say what subset it dropped or why a peephole pass sufficed.
- **jump functions** — "jump functions summarize each procedure once instead of re-analysing bodies each round". I have no idea what a jump function is, formally or informally.
- **sparse propagation on SSA** — "sparse propagation on SSA replaces the dense fixpoint". I know SSA from the pre-test; "sparse propagation" vs "dense fixpoint" I can only half-reconstruct.
- **constraint graphs solved in SCC order** — "constraint graphs solved in SCC order replace global rounds with one topological pass". I know SCC = strongly connected components. I cannot explain why solving in that order is equivalent to iterating to a fixpoint.
- **ABCD** — "ABCD gives the demand-driven variant." I do not know this acronym at all. (Array Bounds Check elimination with Demand-drivenness? I am guessing, and a guess is not an explanation.)
- **TCC's value stack** — "TCC's value stack, Liftoff, Ertl's static stack caching". I think TCC is Tiny C Compiler; "value stack" as a compile-time stack model I could not explain.
- **Liftoff** — same sentence. I believe it is V8's baseline Wasm compiler, but the brief uses it as a name-drop for the technique, not as a fact I can verify here.
- **Ertl's static stack caching** — same sentence. I do not know M. Anton Ertl's work on stack caching.
- **Best's algorithm** — "Best's algorithm picks the eviction." I have no idea what algorithm this is or what an "eviction" is here (which stack entry to spill?).
- **destination-driven generation** — "Destination-driven generation removes the branch-over-jump shape." I can read the words; I could not explain the technique or its connection to branch-over-jump.
- **copy-and-patch** — "Copy-and-patch is not worth it here." I do not know this compilation technique, so I cannot judge the verdict.
- **Slim binaries** — "Slim binaries shipped a checked, target-independent tree and generated code at load." I do not know this system or the word "slim" here.
- **lowering** — "lowers that Wasm to RV32". I use the word, but I could not define precisely what counts as lowering vs compiling.
- **fuel counter** — "a fuel counter decremented at loop back-edges gives pre-emption inside a turn". I can explain this one from the pre-test. Listing it here only because the term is jargon; I do get it.
- **trampoline** — "every jump lands inside the slot or on a trampoline". I have seen the word in two different meanings (a dispatch loop, a bounce stub). I do not know which one is meant.
- **PMP with user mode** — "The hardware route is PMP with user mode." I believe PMP = RISC-V Physical Memory Protection, and "user mode" is a CPU privilege level. I could not explain how the two combine into an isolation boundary.
- **sum types with exhaustive matching** — "Sum types with exhaustive matching." I can explain tagged unions and the compiler warning on a missing case, so this one is fine.
- **distinct integer types** — "Distinct integer types for the four coordinate systems". I can guess "a `byte` index cannot be assigned to a `codepoint` index", but I could not name the mechanism (nominal wrappers? units of measure?).
- **flow-sensitive refinement** — "Flow-sensitive refinement so that in `while (at < s.length) { s.charCodeAt(at) }` the bounds check is removed." I can follow the *example*; I could not explain the analysis that justifies the removal.
- **defunctionalized continuations** — "the WorldState token fields are defunctionalized continuations written by hand". I know "defunctionalize" only from the pre-test prompt. "Continuation" and "WorldState token" are both PicoCalc-specific here and undefined.
- **liveness analysis** — "liveness analysis identifies which locals cross an await". I can explain liveness in one sentence, but not what it means for a local to "cross an await".
- **regions / per-turn arena** — "a per-turn arena reset when the handler returns". I explained regions in the pre-test; "per-turn" again depends on the undefined "turn".
- **linear handles** — "Linear handles and typestate for the grant-and-revoke protocol". I know typestate; "linear handle" I could only say "a handle you may use exactly once", and I could not explain how linearity *enforces* revoke.
- **effects as capabilities / manifest claims** — "Effects as capabilities: manifest claims checked against the code." I could not explain what a "manifest claim" is or who writes it. Is it like the Android app manifest?
- **erasable type annotations** — "One source for both engines via erasable type annotations." I can guess "annotations that add no runtime behaviour, so the same file runs in a plain JS engine", but the brief does not say how they stay erased through two compilers.
- **`writeLiteral`** — "A typed binary screen protocol instead of JSON built with writeLiteral." An API name, undefined; I cannot tell if it is a compiler helper, an emitter, or an app routine.
- **mixed mode** — "mixed mode (native for hot functions, Wasm for the rest)". I can explain the idea; I cannot explain how a call crosses the boundary cheaply.

---

## Claims I could not follow

Sentences where I understood the words but not why they are true or why they matter.

1. **"The cost difference comes from whole-program inference versus declared boundaries, not from JavaScript semantics."**
   What is missing: a *measurement* or an *argument*. Both compilers accept input in the same family of language, one takes 8 s–25 min and one 0.2–3.1 s, so the delta is attributed to the analysis strategy. But the typed compiler also has a much smaller language (i32, bool, string, buffer, records) and no closures and no heap, which would independently make it faster. The brief says "not JavaScript semantics" without ruling out "typed compiler does less work per program".

2. **"The hypothesis is that app code is no longer the bottleneck, and the compositor and its JSON screen protocol are."**
   What is missing: how a JSON screen protocol becomes a *measured* cost, and what the counter-hypothesis would be. 235 ms of a 462 ms gap is quoted, but I am not told what the other 227 ms is, so I cannot see how the hypothesis survives that remainder.

3. **"Self hit long compile pauses from call-site customization; Hölzle and Ungar's answer was a fast non-optimizing compiler first, with optimization reserved for hot code."**
   What is missing: the causal chain from customization to pause, and why a fast non-optimizing compiler fixes it rather than just moving the cost. The analogy is being used as an argument for CJI's next step, but I cannot check the analogy from here.

4. **"Static TypeScript compiled a TypeScript subset with classes, closures and a garbage-collected heap to machine code for microcontrollers with only a peephole pass."**
   What is missing: what makes this possible — the claim reads like "you can skip type inference and optimization entirely if the language is typed", and that is a big conclusion to draw from one project name.

5. **"jump functions summarize each procedure once instead of re-analysing bodies each round; sparse propagation on SSA replaces the dense fixpoint; constraint graphs solved in SCC order replace global rounds with one topological pass"**
   What is missing: *why each of these is the same result, just cheaper*. All three claim an equivalence (same answer, less work) with no argument. If any one of them is only an approximation, the whole "keep CJI's analysis" option changes character.

6. **"The RV32 backend stores every operand in a stack-frame slot... Track at compile time which register holds each stack entry, and write to memory only at calls and control-flow joins"**
   What is missing: *why only at calls and joins*. That is exactly the part I do not understand — what goes wrong at a join that forces a flush, and why a register cannot be carried across it.

7. **"A peephole pass removes a store followed by a load from the same location. Destination-driven generation removes the branch-over-jump shape."**
   What is missing: why the branch-over-jump shape *exists* in the first place. If the generator already knows it is emitting a pointless jump, why does the shape arise? (My guess: it comes from the uniform `if` translation and the pass cleans it up. The brief does not say, and I do not want to invent it.)

8. **"Native code is two to five times larger than VM code, so mixed mode ... is an option."**
   What is missing: why code size forces mixed mode on *this* device. The leap from "2–5x larger" to "so use mixed mode" needs the flash/RAM budget, which is never stated.

9. **"A function's name is registered only after its body is parsed, so recursion is impossible and the call graph is acyclic."**
   What is missing: this is the most important claim in the isolation section and it is one sentence. I want the failure case spelled out: what exactly does a recursive call *see* when it is written, and is mutual recursion also blocked?

10. **"The output can be verified instead of the compiler trusted: a checker confirms that every jump lands inside the slot or on a trampoline."**
    What is missing: how two properties (jump targets, and presumably masked memory accesses) add up to safety. "Jumps are in range" does not by itself say anything about stores, so I assume there are more checks the brief is compressing into "a checker".

11. **"`await` compiled to state machines: the WorldState token fields are defunctionalized continuations written by hand"**
    What is missing: the relation between the *existing hand-written* mechanism and the *planned compiler-generated* one. Is the compiler being asked to match an existing design, or to replace it? I cannot tell whether this is description or proposal.

12. **"Effects as capabilities: manifest claims checked against the code."**
    What is missing: what is checked against what, at which time (compile, load, or grant), and what the failure mode is. Every noun in the sentence is doing work I cannot cash out.

---

## Clarity by section

- **Context paragraph (before the first `##`)** — **3/5**. It gives the numbers that matter (8 s–25 min vs 0.2–3.1 s) and names the language subset, but leaves "CJI", "reactor", and "turn" undefined, so the reader is already borrowing words in the second sentence.
- **What I would do next** — **4/5**. Six numbered actions in priority order, the most readable part; a reader can hold it in their head. Only "measure before building" and "take CJI off the device" are unclear in scope, not in intent.
- **Why one compiler is slow and the other fast** — **2/5**. Dense with names (Self, Hölzle and Ungar, RPython, Shed Skin, Modula-2, OCaml, isolatedDeclarations, Static TypeScript, peephole), each doing the work of an argument I am not given. I believe the conclusion, but I could not defend it.
- **Code generation** — **1/5**. The worst section for me. It states a fix ("track which register holds each stack entry") and then attaches five unglossed technique names (TCC value stack, Liftoff, Ertl, Best, destination-driven). I could not reproduce a single decision here.
- **Load time** — **3/5**. Short and the point survives: store checked Wasm, lower on device, cite Slim binaries. "Checked, target-independent tree" is the only term that stops me.
- **Isolation** — **2.5/5**. The cleanest chain of reasoning in the brief (no pointers → bounds checks → acyclic call graph → bounded stack → fuel for loops → verify the output), and for once I can *follow* it. But it is compressed to five sentences and "PMP with user mode" is dropped in as if obvious.
- **Type system directions** — **1.5/5**. A list of seven directions, each one line, each a technique name plus a promise. No example except the `charCodeAt` one, which is the only line I actually understand.
- **Architecture** — **2/5**. Four one-line wishes. "One source for both engines", "28 SDK imports generated into three places", "typed binary screen protocol", "fewer engines" — these read as notes to the author, not to me.

---

## Questions I would ask the author

1. What does CJI stand for, and what is a "reactor hash"? I cannot look these up and the brief assumes both.
2. What is a "turn"? Is it one event-loop iteration, and is the time budget a fixed number or a function of load? "Pre-emption inside a turn" and "per-turn arena" both depend on it.
3. What are "the tickets" in "no latency in the tickets reaches the LCD"?
4. If you removed the compositor and its JSON screen protocol entirely and measured nothing else, what would the startup gap be? That tells me whether the hypothesis is testable with a one-hour experiment.
5. Of the 462 ms gap, 235 ms is compositor. What is the other 227 ms? The section reads as if the remainder is unaccounted for, and "measure first" is your own step 1.
6. Can you state one concrete number for how much of CJI's cost is inference itself rather than, say, register allocation or RV32 emission? Without it, "whole-program inference vs declared boundaries" is a story, not a diagnosis.
7. What does a jump function look like for a three-line procedure? I need one example before I can believe it gives the same answer as a full pass.
8. When you say "write to memory only at calls and control-flow joins" — what exactly goes wrong if you carry a register across a join? Is this a correctness issue or a code-quality issue?
9. Why does the branch-over-jump shape appear in the first place, and is removing it in a peephole pass as good as never emitting it?
10. What are the flash and RAM budgets? "Native is 2–5x larger, so mixed mode" needs a denominator on this device.
11. For the isolation argument: what is the exact list of checks the verifier performs? "Jumps land inside the slot or on a trampoline" cannot be the whole story, since stores are the dangerous part.
12. Does the "name registered only after the body is parsed" rule also outlaw mutual recursion, and what does the programmer see when they try it — parse error, name error, or something else?
13. If the call graph is guaranteed acyclic, is stack depth computed per program or per entry point, and what happens when an app grows past the computed depth at runtime through the host API?
14. "Take CJI off the device" — as step 6, after porting twelve apps. Is there a risk that the porting work is done for the wrong compiler if CJI is later deleted?
15. What is a "reactor", and does caching keyed on the reactor hash mean apps must be recompiled when the OS updates?
16. On `await`: is the compiler supposed to generate the same design as the hand-written WorldState token continuations, or a new one? One design is a port, the other is a rewrite.
17. Is the fuel counter decremented per back-edge with a known cost per iteration, or only probabilistically? A counter tells you *that* you ran long, not *how much longer* was needed.
18. What does "fewer engines" mean concretely — how many are there now, and which one would go?

---

## A teaching order

If this became eight lessons for readers like me.

1. **What the machine and the two compilers are.** Must explain first: the device (ESP32-P4, RAM/flash budget, LCD), what a "turn" is, what CJI is, what the typed compiler is, and the two compile-time numbers. Without the budget and the glossary nothing later can be judged.
2. **Reading the measurements.** Must explain first: what latency is being measured (to the LCD), what "the tickets" are, how the 462/235/52.9-figure set was collected, and why an unchanged number is evidence. This teaches the reader the habit of asking "versus what?" before lesson 3.
3. **Why whole-program inference is slow.** Must explain first: what inference over a whole program *does*, in one worked example with one function and two callers. Then revisit the classic systems (Self, Hölzle and Ungar, RPython, Shed Skin) as *this same phenomenon at larger scale*, not as names.
4. **The other way: declared boundaries.** Must explain first: what "declaring a boundary" means — a signature you promise to honour — then Modula-2 definition modules, OCaml `.mli`, `isolatedDeclarations`, and Static TypeScript. Ends on the design rule: locality of checking.
5. **The baseline RV32 backend, by hand.** Must explain first: stack-machine vs register-machine, and what the current code emits for `a = b + c`. The reader has to *see* the two-loads-op-store triple before "track the register instead" means anything.
6. **Making code generation good.** Must explain first: the compile-time stack model and the join problem (why memory writes happen at joins). Then peephole, destination-driven, and Best's eviction — each taught as "which waste does this remove", with the wastage shown first.
7. **Isolation by construction.** Must explain first: what a pointer is and why removing pointers buys safety, then the acyclic call graph (with mutual recursion as the worked case), bounded stack, fuel counters, and finally the verifier checks one at a time. PMP/user mode last, as the hardware alternative with a cost.
8. **Type-system directions, one at a time.** Must explain first: sum types and exhaustiveness with a two-line example, then distinct integers on the four coordinate systems. Then flow-sensitive refinement on the `charCodeAt` loop, `await` as a state machine, regions per turn, linear handles/typestate on grant-and-revoke, and effects as capabilities. Gradual typing at world boundaries closes, because it is the only place the two compilers meet.

---

## What example would help most

1. **The `a = b + c` emission, before and after.** In "Code generation" I am told the backend emits two loads, an op and a store, and told to instead track registers — but I never see either version. One box of concrete RV32 assembly for the same source line, old and new, would convert the whole section from name-dropping into a technique. The follow-up I need is the same line inside an `if`, so the "join forces a flush" rule becomes visible.

2. **The acyclic call graph, drawn, with the illegal edge.** "A function's name is registered only after its body is parsed" is the load-bearing claim of the isolation section, and a picture would settle it in five seconds: a box per function, arrows for calls, then the naive program trying to call itself and the error it gets. Right now I have to *trust* that recursion is impossible; with the picture I could *check* it.

3. **One full `await` in the WorldState protocol, hand-written, annotated.** The brief says the token fields are "defunctionalized continuations written by hand" and that liveness analysis finds "which locals cross an await". I cannot picture either. A single worked case — a handler that awaits, with the locals marked as live/dead, the saved state number, and the resume point — would make lesson 8's hardest item teachable. Without it, "await compiled to a state machine" stays a slogan I could repeat but not use.
