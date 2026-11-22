# Reactions to `dense-brief.md`

Reader: student reader, pre-test written before reading. I answered 14 questions from memory
first (see `pretest-answers.md`); several of them turned out to be exactly the topics of this
brief, which makes it easy for me to say where I fell off.

Overall: I can follow the *first sentence* of almost every paragraph and then lose the thread in
the parentheses. The brief is dense in the sense of "every clause is a pointer to literature I
have not read", not in the sense of "long sentences".

---

## Terms I could not explain

Each line: the term, then the sentence it appeared in.

1. **CJI** — "CJI compiles a subset of ordinary JavaScript to RV32 machine code using
   whole-program inference." The abbreviation is never expanded anywhere in the brief. Is it a
   person's initials, an acronym, or a project name?
2. **ESP32-P4** — "PicoCalc OS is a JavaScript operating system on an ESP32-P4 handheld." I know
   it is a microcontroller family, but I could not say how much RAM or what cores it has, and
   the brief's arguments about native code size and arenas all depend on that.
3. **reactor hashes** — "Cache the compiled module keyed by source, compiler and reactor hashes."
   I have never heard "reactor" used this way. Is it a component of the OS, or the Wasm
   "reactor" module concept?
4. **compositor** — "During startup the compositor took 235 ms of a 462 ms gap." I can guess "the
   thing that combines screen layers", but not what it does on this device or why it is
   expensive.
5. **call-site customization** — "Self hit long compile pauses from call-site customization". I
   know Self is a prototype-based Smalltalk-like language, but not what "customization" does to
   a call site or why it costs compile time.
6. **Hölzle and Ungar** — "Hölzle and Ungar's answer was a fast non-optimizing compiler first,
   with optimization reserved for hot code." I recognise the names as compiler people but could
   not say which paper this is or what the argument in it actually was.
7. **RPython** — "RPython and Shed Skin infer types over the whole program and take minutes for
   the same reason CJI does." I believe this is PyPy's restricted Python subset, but not what it
   restricts or how its inference works.
8. **Shed Skin** — same sentence. I have only seen the name; I could not say what it compiles to
   or what it infers.
9. **Modula-2 definition modules** — "Modula-2 definition modules, OCaml interface files and
   TypeScript's isolatedDeclarations all declare the boundary so checking becomes local." I know
   Modula-2 has separate definition and implementation parts; I could not say what exactly the
   definition module contains or how the compiler uses it to stay local.
10. **`isolatedDeclarations`** — same sentence. A TypeScript compiler flag, I think, but I could
    not explain what it requires of the programmer or why it makes checking local.
11. **Static TypeScript** — "Static TypeScript compiled a TypeScript subset with classes,
    closures and a garbage-collected heap to machine code for microcontrollers with only a
    peephole pass." I have a vague memory of MakeCode using this, but I could not describe it.
12. **jump functions** — "jump functions summarize each procedure once instead of re-analysing
    bodies each round." I could not explain what a jump function is (a summary of a procedure's
    effect on the data-flow facts?) nor why summarizing once is sound.
13. **SCC order** — "constraint graphs solved in SCC order replace global rounds with one
    topological pass." I know SCC = strongly connected components from graph theory, and I can
    guess the point is dependency order, but I could not explain why this gives one pass.
14. **ABCD** — "ABCD gives the demand-driven variant." No expansion, no context. I cannot say
    what ABCD stands for or what it does. (Guessing: some bounds-check elimination algorithm?)
15. **TCC's value stack** — "Track at compile time which register holds each stack entry, and
    write to memory only at calls and control-flow joins (TCC's value stack, Liftoff, Ertl's
    static stack caching)." I know TCC is a small C compiler; I could not explain its value
    stack or how it differs from what I would write.
16. **Liftoff** — same sentence. I think this is V8's baseline Wasm compiler; I could not say
    how it does stack caching.
17. **Ertl's static stack caching** — same sentence. I cannot place Ertl or the technique.
18. **Best's algorithm** — "Best's algorithm picks the eviction." I have no idea what this
    algorithm is, what it evicts, or what its cost model is.
19. **Destination-driven generation** — "Destination-driven generation removes the
    branch-over-jump shape." I cannot explain what makes generation "destination-driven".
20. **Copy-and-patch** — "Copy-and-patch is not worth it here." The name only. I believe it
    stitches together pre-compiled instruction templates, but not how, or why it would or would
    not pay off.
21. **Slim binaries** — "Slim binaries shipped a checked, target-independent tree and generated
    code at load." I have seen the term; I could not say what the tree is, what "checked" means,
    or what was slow about load-time generation.
22. **fuel counter** — "a fuel counter decremented at loop back-edges gives pre-emption inside a
    turn." I can guess the idea but I do not know the term of art or its standard pitfalls.
23. **trampoline** — "a checker confirms that every jump lands inside the slot or on a
    trampoline." In this context I cannot say what a trampoline is — an indirect-jump veneer? a
    per-slot stub?
24. **PMP** — "The hardware route is PMP with user mode." I am fairly sure this is RISC-V
    Physical Memory Protection, but I could not explain how many regions it offers or how the
    OS would use it.
25. **defunctionalized continuations** — "the WorldState token fields are defunctionalized
    continuations written by hand". I answered the *definition* of defunctionalization in the
    pre-test, but I cannot map the phrase onto hand-written token fields in a runtime.
26. **liveness analysis** — "liveness analysis identifies which locals cross an await". I know
    the phrase from register allocation; I could not say how it is used to build a frame layout.
27. **linear handles** — "Linear handles and typestate for the grant-and-revoke protocol." I know
    typestate (pre-test Q11) but not what a "linear handle" is in this setting.
28. **manifest claims** — "Effects as capabilities: manifest claims checked against the code." I
    cannot say what a manifest is here (app metadata?) or what a "claim" is.
29. **`writeLiteral`** — "A typed binary screen protocol instead of JSON built with writeLiteral."
    Never seen this API; could not say why building JSON with it is the problem.
30. **erasable type annotations** — "One source for both engines via erasable type annotations." I
    can guess "annotations deleted before the untrusted compiler runs", but not why that helps
    here specifically.
31. **WorldState** — "the WorldState token fields are defunctionalized continuations written by
    hand". This looks like a central runtime concept of the OS and it is never introduced.

---

## Claims I could not follow

1. > "No latency in the tickets reaches the LCD, and the typed Editor on RV32 used 52.9 ms of
   > CPU over 33 turns."
   What is a "turn"? What is a "ticket"? And what does "no latency reaches the LCD" mean
   concretely — that no reported latency was ever observed by a user, or that measurements never
   made it into a display? Without knowing what is measured I cannot tell whether 52.9 ms is
   excellent or terrible.

2. > "During startup the compositor took 235 ms of a 462 ms gap."
   I do not know what "the gap" is (gap between what and what), so I cannot judge whether the
   compositor is being blamed fairly or whether 235 of 462 is good news or bad news.

3. > "The hypothesis is that app code is no longer the bottleneck, and the compositor and its
   > JSON screen protocol are."
   Why do these two measurements support that hypothesis? A 52.9 ms figure for the Editor and a
   startup number for the compositor do not obviously connect. What is missing is the step "if
   app code were the bottleneck we would expect to see X in these numbers".

4. > "The cost difference comes from whole-program inference versus declared boundaries, not from
   > JavaScript semantics."
   This is stated as a conclusion but I cannot see the argument. Two compilers differ in at
   least four ways (language subset, inference strategy, target, backend). What makes us sure
   that the *inference strategy* is the responsible variable and not, say, the fact that the
   typed language has no closures or no GC? Missing: the experiment or the argument that
   isolates the variable.

5. > "Self hit long compile pauses from call-site customization; Hölzle and Ungar's answer was a
   > fast non-optimizing compiler first, with optimization reserved for hot code."
   I can read the words but not the causal chain. Why does customizing call sites cause *compile*
   pauses? And what exactly is being borrowed for CJI — the two-tier structure, or the specific
   insight that optimization should be delayed?

6. > "Static TypeScript compiled a TypeScript subset with classes, closures and a garbage-collected
   > heap to machine code for microcontrollers with only a peephole pass."
   The phrase "only a peephole pass" implies this was surprising and successful. Why is a
   peephole pass enough? Where does register allocation go? Or does code get emitted with a
   fixed assignment and the peephole is the whole optimizer? Missing: what the generated code
   quality was.

7. > "jump functions summarize each procedure once instead of re-analysing bodies each round"
   I cannot follow why analysing each procedure once is sound when the whole point of
   whole-program inference is that facts flow back from callers to callees. Does the summary get
   monotone-updated, or is it genuinely one shot? Missing: the soundness argument or a pointer
   to it.

8. > "ABCD gives the demand-driven variant."
   A name with no gloss. I cannot evaluate the recommendation at all.

9. > "Track at compile time which register holds each stack entry, and write to memory only at
   > calls and control-flow joins"
   Why is it safe to leave a stack entry *only* in a register at all other points? If an
   operation can fault, or if the code can be interrupted, the frame in memory is stale. Does
   this design assume no interrupts, or does it accept that the frame is only valid at those two
   kinds of point? Missing: the invariant being maintained.

10. > "Native code is two to five times larger than VM code, so mixed mode (native for hot
    > functions, Wasm for the rest) is an option."
    The "so" does not follow for me. Larger native code is a flash problem; mixed mode is a
    performance/implementation-complexity choice. Why does the size ratio motivate mixed mode
    rather than, say, more aggressive code-size optimization or keeping Wasm always? Missing: the
    cost model — what mixed mode buys and what it costs.

11. > "Copy-and-patch is not worth it here."
    Asserted with no reason. What is the cost model? Is it code size, the need for a runtime
    with specific ABI, or the number of distinct patchable operations in this VM?

12. > "Slim binaries shipped a checked, target-independent tree and generated code at load."
    What does "checked" mean — type-checked, verified, or bounds-checked? And what was the
    measured downside that made the approach not win at the time?

13. > "A function's name is registered only after its body is parsed, so recursion is impossible
    > and the call graph is acyclic."
    I believe this rule prevents a function from naming itself. But mutual recursion (f calls g,
    g calls f) is prevented only if `g`'s name is also unavailable while `f`'s body is parsed —
    that seems to require either declaration order or a restriction on referencing later
    functions. Missing: the exact rule and how it composes over a whole program with a
    pre-existing SDK.

14. > "Stack depth is therefore a compile-time constant."
    From an acyclic call graph I would expect a computable *bound* on the deepest chain, not a
    constant. Is the claim "per program" or "per handler"? And does it include the runtime's own
    frames? The wording hides which of these it means.

15. > "a checker confirms that every jump lands inside the slot or on a trampoline"
    Checking jumps is clearly necessary. Why is it sufficient? What stops a store to an arbitrary
    address, or a jump into the *middle* of an instruction? Missing: the full list of properties
    the checker enforces, and what "the slot" is.

16. > "The hardware route is PMP with user mode."
    Why is the hardware route not the plan? Is it because the ESP32-P4's PMP has too few regions,
    because of performance, or because of portability? Missing a reason.

17. > "Flow-sensitive refinement so that in `while (at < s.length) { s.charCodeAt(at) }` the
    > bounds check is removed."
    I can see the idea, but not why this is *sound* — does `s.length` count as stable across a
    loop iteration, and can the loop body call something that changes `s`? And is the bounds check
    being removed from `charCodeAt`'s inlined body? Missing: what the refinement is guarded by
    and when it is invalidated.

18. > "`await` compiled to state machines: the WorldState token fields are defunctionalized
    > continuations written by hand"
    This is the sentence I understand least in the whole brief. What is a token, what is a
    WorldState, and how does a field of a struct act as a continuation? Missing: an example of
    one program before and after.

19. > "liveness analysis identifies which locals cross an await, and with no recursion each frame
    > has a fixed offset."
    Two claims welded together. Even with no recursion, a suspended frame must live somewhere
    after the handler returns — is it moved to the heap, or does the frame stay at a fixed
    *address* in a per-handler block? "Fixed offset" suggests within a block, but which block and
    who frees it?

20. > "Regions: a per-turn arena reset when the handler returns."
    What about values carried past the turn (the resumed state machine above)? Does the resumed
    frame live in a different region? Missing: the rule for what a handler may keep.

21. > "Effects as capabilities: manifest claims checked against the code."
    I cannot tell whether "checked" means the type checker proves the code only uses claimed
    effects, or a runtime/sandbox check. The sentence's whole force depends on which.

22. > "One source for both engines via erasable type annotations."
    The typed compiler and CJI accept different language subsets (one has closures and GC, one has
    i32/bool/string/buffer/records). How can both compile the same source? Does CJI ignore the
    annotations, or is "one source" only true for the intersection?

23. > "Fewer engines."
    Which engines exist today, and what counts as one? This reads like the conclusion of an
    argument that is not in the brief.

---

## Clarity by section

- **What I would do next** — 3/5. The six actions are crisp and in a sensible order, but almost
  every one of them assumes knowledge from a later section, and two of them (PMP, "fewer
  engines") are one-liners with no reason given.
- **Why one compiler is slow and the other fast** — 3/5. This is the section I learned the most
  from — "whole-program inference vs declared boundaries" is a genuinely useful idea — but it is
  delivered as a list of citations, so I believe the conclusion without being able to rederive
  it.
- **Code generation** — 2/5. I can follow the diagnosis (stack frame for every operand, branch
  over jump) and then the prescription turns into five proper names in three lines; I could not
  reimplement any of it from this text.
- **Load time** — 2/5. Two sentences: an old system I do not know, and "Wasm is that format
  here". I could not say what is gained, what is lost, or why the lowering step is the cheap
  part.
- **Isolation** — 4/5. The best section for me: it builds an argument chain (no pointers →
  no recursion → bounded stack → loops are the only unbounded thing → fuel counter) that I could
  repeat to a classmate. It loses a point because "trampoline" and "the slot" are unexplained
  and the jump-check-is-sufficient claim is not justified.
- **Type system directions** — 2/5. Nine ideas in one paragraph, each a sentence fragment. It
  reads like an agenda, not an explanation; "defunctionalized continuations written by hand" is
  the point where I stopped being able to form any picture.
- **Architecture** — 2/5. Four one-line proposals with no stated problem sizes, and the closing
  "Fewer engines." is not a sentence I can act on.

---

## Questions I would ask the author

1. What does CJI stand for, and is the eight-seconds-to-twenty-five-minutes range driven by
   program size, by a bad case in the inference, or by something else entirely? A 25-minute
   compile on a handheld is a product problem, so I want to know the distribution, not the range.
2. If whole-program inference is the cause of slowness, was that ever *tested* — e.g. by running
   the typed compiler on the same programs, or by giving CJI declared type annotations and
   measuring? Or is the attribution inferred from the literature?
3. What is a "turn", exactly, and who decides its budget? Is a turn one event handler
   invocation, one frame of animation, or one logical step of the OS?
4. What is a "ticket" in "no latency in the tickets reaches the LCD"? Are these bug reports with
   measurements attached, and if the measurements never reached the screen, how were they
   collected at all?
5. How big is flash and RAM on the ESP32-P4 in the configurations you target, and which of these
   proposals is blocked by which limit? I could not tell whether "native code is two to five
   times larger" is a hard problem or an annoyance without those numbers.
6. Is mixed mode actually planned, or is it listed for completeness? It seems to double the
   testing surface, and the brief does not say what it would buy.
7. What does the jump checker check besides jumps? If the language has no pointers and every
   access is bounds-checked, is the checker re-verifying the bounds checks, or only control flow?
   Please give the full list of obligations.
8. You say recursion is impossible because a name is only registered after its body is parsed.
   Then how do functions in the SDK get referenced — are they pre-registered, and does that reopen
   the possibility of a cycle through the SDK?
9. With `await` allowed, does the "no recursion → constant stack depth" argument still hold for
   resumed continuations? A resumed handler is entered at a state, not at the top; is its stack
   use still the compile-time bound of the original function?
10. What is a "WorldState token", and can you show one small program written by hand as a
    defunctionalized continuation next to the `await` version? That single example would probably
    unlock a third of this brief for me.
11. Where does the per-turn arena end and the resumed-state heap begin — is there one arena per
    handler or one per turn, and what happens to a value that a continuation holds across three
    waits?
12. For "effects as capabilities", is the enforcement static (the compiler rejects code that uses
    an unclaimed import), dynamic (the host refuses the call), or both? The word "manifest"
    suggests app metadata, which suggests a runtime check, but "checked against the code" suggests
    a compiler check.
13. Which twelve apps are being ported, and which of the six "what I would do next" items is the
    one that would make the *porting* easier rather than the runtime faster? The list mixes both
    goals without saying so.
14. What is the actual order of work if only one thing can be done this month? Item 1 is
    "measure", item 2 is "cache", item 3 is "rewrite the backend" — but if measurement is the
    first item, shouldn't the answer to "what next" wait for the measurement?

---

## A teaching order

If this became eight lessons for readers like me, I would want it in this order. Note that I put
the *measurement* lesson second, because without it everything after reads as opinion.

1. **What the device is and what the two compilers are.** Must explain first: the hardware
   envelope (flash, RAM, speed, no MMU?), what an "app" is, what a "turn" is, and which compiler
   is used when. Nothing else in the brief can be judged without this.
2. **Measuring before optimising.** Must explain first: what a profile on this device looks like,
   what "CPU over 33 turns" means, how the compositor number was obtained, and how to tell that
   app code is *not* the bottleneck. This lesson teaches the reader to distrust the rest of the
   series appropriately.
3. **Why whole-program type inference is slow.** Must explain first: constraints, propagation,
   fixpoints — the pre-test vocabulary — then the specific mechanism by which a call site makes
   the analysis re-run. The payoff is understanding why "declared boundaries" fix it.
4. **Declared boundaries and modular checking.** Must explain first: what an interface/signature
   file actually contains, and why checking against it is local. Use the Modula-2/OCaml/
   TypeScript examples as three instances of one idea, not as three names to memorise.
5. **Generating code for a stack machine, and then for a register machine.** Must explain first:
   what "every operand in a stack-frame slot" costs, measured in instructions. Then the value
   stack idea, then peepholes, then register allocation. I want to write the bad version and the
   good version myself.
6. **Safety by construction: no pointers, no recursion, bounded stack, fuel.** Must explain
   first: what "safe" means here — memory safety, termination, or both — and what could go wrong
   without each restriction. This is the lesson the brief is closest to already teaching well.
7. **Continuations, arenas and typestate for a turn-based runtime.** Must explain first: what a
   handler's lifetime looks like from allocation to return, then where `await` cuts it, then who
   owns memory across a cut, then what the grant/revoke protocol is.
8. **What to build next, in what order.** Must explain first: a cost/benefit framework (effort,
   risk, what it unlocks) so the six proposals can be compared. Only at the end should the reader
   see the recommendation list.

The brief currently reads in an order close to 1, 3, 5, 8, 6, 7, 4. I would keep the content and
change the sequence.

---

## What example would help most

1. **The `await` / defunctionalized-continuation example.** One function with two awaits, shown
   three times: as source, as the compiler's state machine (numbered states, frame layout), and as
   the hand-written `WorldState` token version. This is the single biggest hole. The sentence
   "the WorldState token fields are defunctionalized continuations written by hand" is
   incomprehensible without it, and it also settles the questions about arenas and resumed frame
   ownership.

2. **A before/after listing of the RV32 lowering for one small function.** Something like `a = b +
   c; if (a > 0) x = 1;`. Show the current output (two loads, op, store; branch over jump) next
   to the improved output (values held in registers, fallthrough). A picture of the operand stack
   at each step alongside the instruction stream would be even better. Then the sentences about
   value stacks, eviction and destination-driven generation have something to attach to.

3. **A worked profile of one startup.** A timeline of the 462 ms gap showing where the 235 ms of
   compositor time goes and how much is JSON encoding, with the measurement method. Right now
   "the compositor and its JSON screen protocol are the bottleneck" is a claim; a flame chart or
   even a simple bar chart would make it a finding, and it would also teach me how to read the
   other numbers in the brief.

Honourable mention: a table of the six proposals with effort, risk and what each unlocks would
fix the "what to do next" section faster than any prose.

---

## One more honesty note

The brief assumes a reader who already knows the literature: Self, RPython, ABCD, Best's
algorithm, Liftoff, Slim binaries, PMP. I did not know most of these before, and my pre-test
answers show which of the sub-topics I could reconstruct and which I could only pattern-match.
The parts I could follow were exactly the parts where the brief gave a *chain of reasoning*
(isolation) rather than a *list of names* (code generation, type directions).
