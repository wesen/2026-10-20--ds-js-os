# 9. Types That Pay for Themselves

The typed language has five kinds of type and is about to be asked to carry twelve more applications. This article examines six additions to its type system, one at a time, and two more that should wait. For each it states the defect or cost in the existing code that motivates it, shows the mechanism on an example of a few lines, and says what it costs at compile time and at run time. By the end you should be able to explain each mechanism to a colleague, say which of them remove run-time checks and which remove classes of error, and justify an order in which to build them.

The article depends on Article 4 for the rule of local checking, on Article 7 for bounds checks and the acyclic call graph, and on Article 8 for waits.

## 9.1 The criterion

A type-system feature is admitted here only if it meets three conditions.

1. **It can be checked locally.** The compiler must be able to check a function from its own text and the declarations it mentions, reading the source once from top to bottom (Article 4). Anything that needs facts from the whole program is excluded.
2. **It adds no run-time checks, and where possible removes some.** The device has no time to spare for checks that a compiler could have discharged.
3. **It addresses something observed.** Each section below starts from code or measurements in the repository.

## 9.2 Enumerations with exhaustive matching

**Observation.** The typed sources communicate through bare integers. The file browser's key handler (`worlds/files/files.typed`) returns 14 to mean "delete" and 15 to mean "submit". The Editor's event handler tests `event.kind === 4`. The search routine's progress is `state.findPhase`, where values below 4 are phases, 4 means "not found" and 5 means "found". Nothing connects a number to its meaning except a comment, and nothing detects a handler that forgets a case.

**Mechanism.** An **enumeration** declares a type whose values are a fixed list of names.

```
enum FindPhase { LineSuffix, LaterLines, EarlierLines, LinePrefix, NotFound, Found }

match (state.findPhase) {
    LineSuffix, LaterLines, EarlierLines, LinePrefix: { continueSearch(state); }
    NotFound: { state.notice = Notice.NoMatch; }
    Found: { showMatch(state); }
}
```

The compiler represents each name as a small integer, so the generated code is the same as today's. Two checks are added. A value of one enumeration cannot be used where another is expected, and a `match` must mention every name. The second check, **exhaustiveness**, has a practical consequence: when a new phase is added, the compiler lists every `match` that must be updated. Algorithms for checking exhaustiveness and for reporting useless cases are standard [Maranget 2007]; for enumerations without nested data the check is a comparison of two sets.

**Cost.** None at run time, and a small change to the compiler. This is the cheapest item in the article.

## 9.3 Distinct integer types

**Observation.** A position in the Editor's document can be expressed in four coordinate systems: bytes of UTF-8 in the file, UTF-16 code units in memory, code points for the cursor column, and wrapped rows on the display. The string `a🙂b` is six bytes, four code units and three code points. All four are `i32` in the source. Passing a code-point column where a code-unit offset is expected compiles without complaint. The result is wrong only for text containing characters that need two code units, such as emoji, which is the kind of error that tests written with plain text miss.

**Mechanism.** A **distinct type** is a new name for an existing representation that the checker treats as a different type.

```
type Unit  = distinct i32;      // offset in UTF-16 code units
type Point = distinct i32;      // count of code points

function columnOf(text: string, at: Unit): Point { ... }
```

A `Point` cannot be passed as a `Unit`. Conversion is possible only through functions that perform it, such as the reactor's function that maps a code-point count to a code-unit offset. Arithmetic within one type is allowed: adding two `Unit` values gives a `Unit`.

The idea in its general form is Kennedy's **dimension types**, which extend a type system with units of measure, including products and quotients of units, and infer them automatically [Kennedy 1994]. The Editor needs only the simplest fragment, in which units are never multiplied.

**Cost.** None at run time; the representation is unchanged. The checker gains one rule.

## 9.4 Flow-sensitive refinement and bounds checks

**Observation.** Every indexed access is bounds-checked: the index is compared with the length, and an index out of range stops the program with a trap (Article 7). The native Editor contains 404 trap instructions (counted by Experiment 1 of Article 2), and its source has 85 calls of `charCodeAt` alone. The check is expensive in today's backend, which emits 20 instructions for it in the listing of `countUnit`. With the compile-time operand stack of Article 5 it would be about four: load the length, compare and branch, and the trap itself. In hand-written code, where the length is already in a register, it is two; the hand-written loop of Article 5 has seven instructions without the check and would have nine with it.

Most of these checks are redundant, and visibly so:

```
while (at < text.length) {
    if (text.charCodeAt(at) === unit) { n = n + 1; }
    at = at + 1;
}
```

The loop condition has just established `at < text.length`.

**Mechanism.** In **flow-sensitive typing**, the type a variable has at a particular place in the program depends on the tests that control reaching that place. Tobin-Hochstadt and Felleisen introduced the idea as *occurrence typing*: the type system assigns "variable occurrences a subtype of their declared type based on the predicates prior to the occurrence" [Tobin-Hochstadt & Felleisen 2008, 2010]. TypeScript's narrowing of a variable's type inside an `if` is the same idea.

For bounds checks the rule can be stated in one sentence and implemented in one pass. *When the compiler enters a block guarded by the condition `i < s.length`, it records that fact; the fact remains valid until `i` or `s` is assigned or any call is made; while it is valid, an access `s.charCodeAt(i)` needs no upper-bound check.* Discarding the fact at every call is deliberately cautious. Deciding which calls could change a length would need knowledge of the called function, which the first criterion rules out.

In the example, the fact is recorded on entering the loop body, used at `text.charCodeAt(at)`, and discarded at `at = at + 1`. Nothing has to be remembered from one iteration to the next, because the loop condition is tested again before each iteration and establishes the fact afresh.

The lower bound needs separate care. The existing check uses one unsigned comparison, which also rejects negative indices. A signed guard `at < text.length` says nothing about `at >= 0`. The clean solution is a type: an index type, written here as `index`, whose values are unsigned 32-bit integers. A string's `length` has this type, a loop counter is declared with it (`let at: index = 0`), and comparisons between two `index` values are unsigned. For such a variable the guard `at < text.length` is exactly the comparison the bounds check would make, so it implies the whole check.

There is a ladder of more powerful versions, and it is useful to know where the proposal stands on it.

| Approach | What it can prove | Where the work happens |
| --- | --- | --- |
| Guard facts, as above | Accesses directly protected by a visible test | One pass in the compiler |
| Dependent types for array bounds | Accesses justified by function signatures such as "`at` is less than the length of `text`", with decidable checking [Xi & Pfenning 1998] | Type checker with a constraint solver |
| Liquid types | Refinements inferred automatically from a set of candidate predicates [Rondon et al. 2008]; applied to Rust in Flux [Lehmann et al. 2023] | Solver-based inference |
| ABCD, the bounds-check elimination algorithm described in Article 4 | Checks made redundant by any chain of comparisons | An optimizing compiler with a whole-function analysis |

The first rung satisfies the criterion of section 9.1. The second becomes attractive later, because a signature that states an index is in range moves the check from the callee to the one caller that established it. The third and fourth belong on a workstation.

**Cost.** A saving at run time: each removed check saves about four instructions under the improved backend of Article 5, and one place where the program can trap. The compiler gains one table of facts, cleared at assignments and calls.

## 9.5 Regions and a per-turn arena

**Observation.** The typed language cannot allocate. An application receives a fixed set of buffers from the reactor and a state record of scalar fields. This was enough for a text editor, whose data is one large buffer. It is not enough for Agenda's sorted and grouped task list, which in the current port is C code inside Agenda's reactor, or for a calculator's expression trees.

The language already has a memory discipline, although it is nowhere written down. A reference to a buffer is valid while one event is being handled, which is one turn, and must be obtained again in the next. The state record survives from turn to turn and may hold only scalars. A **region** is a set of values that share a lifetime. The language thus already has two: values that live for the current turn, and values that live as long as the application.

**Mechanism.** In region-based memory management, every value is placed in a region, and a region is freed all at once. Tofte and Talpin's formulation treats the store as a stack of regions and uses a type-and-effect analysis to decide where each region is created and destroyed, so that memory is reclaimed without a garbage collector [Tofte & Talpin 1997]. Cyclone brought regions to a C-like language with modest annotation cost [Grossman et al. 2002].

The proposal needs none of the inference, because the system's structure supplies the lifetimes. Give each world an **arena** for the current turn: a block of memory with a pointer to its first free byte. Allocation checks that enough room remains and advances the pointer, about four instructions. When the handler returns, the nucleus (the system's kernel) resets the pointer. Nothing is ever freed individually.

Two rules make this safe, and both are local checks.

- A reference into the turn arena may not be stored in the state record.
- A reference into the turn arena may not be live across a wait (the rule Article 8 already imposes on buffers).

A program that needs data to outlive the turn must copy it into storage that the application owns for its whole life.

**What about data that must persist and grow?** Three designs exist, in increasing order of cost.

| Design | Memory behaviour | Precedent |
| --- | --- | --- |
| Fixed-capacity collections declared in the state | Bounded and known at compile time | nesC, Céu, Embassy (Article 8) |
| Reference counting with reuse | Freed as soon as unreferenced; updates in place | Perceus [Reinking et al. 2021] |
| Tracing garbage collection | Unbounded pauses unless carefully engineered | CJI's runtime; Static TypeScript |

For a world with a 768 KiB limit, a bound known at compile time is a benefit and fixed capacity should be the default. The other two should wait for an application that demonstrably needs them.

**Cost.** Allocation becomes possible at about four instructions per object with no collector. These instructions do work the program asked for; they are not checks added by the type system. The checker gains a lifetime attribute on reference types.

## 9.6 Linear handles and typestate

**Observation.** Authority on this system is carried by **handles**, numbers that stand for an open file or a granted permission. Agenda can lend its notes file to Editor. The project's notes on that exchange read as a list of obligations: accepting a new grant revokes the old one; a refusal, a timeout or a failure to send revokes the pending one; Editor releases the previous file only after the new one has been read successfully. Each obligation is enforced by careful code and a test.

**Mechanism.** A **linear type** is one whose values must be used exactly once: they cannot be copied and cannot be discarded [Wadler 1990]. If `Grant` is linear, then on every path through a function a grant must end in exactly one of the operations that consume it: revoking it, sending it to another world, or storing it in the state. A path that forgets is a compile error. With structured control flow the check is a single pass: after an `if`, both branches must have consumed the same set of handles. They need not have consumed them in the same way; one branch may revoke a grant that the other stores.

**Typestate** refines this. Strom and Yemini observed that a type determines which operations exist, while the object's *state* determines which of them are permitted at a given moment, and that tracking the state at compile time detects sequences "that are syntactically legal but semantically undefined" [Strom & Yemini 1986]. A file handle that is still being opened does not permit a write. Writing the type as `File<Opening>` and `File<Ready>`, with the read-completion event converting one to the other, makes the obligation visible to the checker.

A ready-made vocabulary exists. The WebAssembly Component Model distinguishes an *owned* handle, which "implies unique ownership of the resource", from a *borrowed* one, a temporary loan for the duration of a call. The theory of such **substructural** type systems is set out in a chapter of *Advanced Topics in Types and Programming Languages* [Walker 2005]. Session types extend the idea from one handle to an entire exchange of messages between two parties [Honda 1993], which is where a typed treatment of the request-and-reply conversations between worlds would lead. Linear handles come last in the order of section 9.10 because their checker is the largest piece of work in this article.

**Cost.** None at run time. The checker must track which linear values are held at each point, which is more work than the earlier items.

## 9.7 Effects as capabilities

**Observation.** The manifest, the system's configuration file, gives each world its claims: the hardware and directories it may open (Article 1). The code of a typed world reaches the system only through the 28 functions of its reactor, each called by name. Which of them a world can ever call is therefore visible in its source, and nobody currently looks.

**Mechanism.** An **effect system** records, for each function, the set of side effects it may perform, alongside its type [Lucassen & Gifford 1988]. Here an effect is "may call reactor function *f*". The effect of a function is the union of the effects of the calls in its body. Because typed functions are defined before they are called and the call graph is acyclic (Article 7), the compiler knows every callee's effect when it reaches a call. The whole computation is one union per call during the existing single pass.

The result is one set per world, available at compile time. It can be compared with the manifest in both directions. A world that calls the file-reading function while holding no file claim and receiving no handle can never succeed in that call, and the compiler should report it. A world that holds a claim it never uses has more authority than it needs, contrary to the principle of least privilege on which capability systems rest (a capability is an unforgeable token that both names a resource and conveys the right to use it; the handles of this system are capabilities) [Dennis & Van Horn 1966; Miller 2006]. Recent work on tracking the capabilities that a value captures in its type shows the same idea carried into a full language [Boruch-Gruszecki et al. 2023].

**Cost.** None at run time. A set per function in the compiler.

## 9.8 Two directions that should wait

**Resource bounds in types.** The turn budget, the longest time a handler may run (Article 1), is a resource bound, and there are type systems that prove such bounds. Sized types carry bounds on data sizes and can prove termination of reactive programs [Hughes et al. 1996]; amortized analysis infers linear bounds on heap use automatically [Hofmann & Jost 2003]. The more a language can express, the less can be proved about the resources its programs use. The Hume language was designed around that trade-off. It is a stack of language levels, from one with no functions at all up to full recursion, in which each level "adds expressibility to the expression semantics, but either loses some desirable property or increases the technical difficulty of providing formal correctness/cost models" [Hammond & Michaelson 2003]. The typed language today sits near the bottom of that stack: functions that cannot be passed around as values and cannot call themselves, plus loops. The loops are what prevent a static time bound. A language in which every loop outside an asynchronous function carried an evident bound would allow the worst-case cost of a turn to be computed, as Céu does by construction (Article 8). This is a research direction. In the meantime the fuel counter of Article 7, which stops a handler that loops too long, gives the guarantee at run time.

**Gradual typing.** A gradual type system lets typed and untyped code be mixed freely, inserting run-time checks where they meet [Siek & Taha 2006]. Measurements on a mature implementation found that programs in which some modules are typed and others are not could run up to 105 times slower than either extreme, because of the checks at the many internal boundaries [Takikawa et al. 2016]. The measurement is of another language, and the mechanism is general: every value that crosses between typed and untyped code must be checked. This system already has a boundary between typed and untyped code, and it is in the right place. Typed worlds and JavaScript worlds exchange messages, and a message is checked once when it is decoded. The typed language should not acquire an untyped value type.

## 9.9 Matters that are not type theory

Several gaps in the language are simple omissions: `else`, `for`, `break`, the operator `!==`, and the ability to call a function defined later in the file. The last must come with the explicit cycle check described in Article 7, because the stack bound depends on it. Floating-point numbers for the calculator are a larger matter: the processor has hardware support only for single precision, so a 64-bit `f64` type would be computed in software, and the type system must keep it strictly apart from `i32`, with explicit conversions.

## 9.10 Summary and order

| Feature | Removes | Run-time cost | Compiler effort | Order |
| --- | --- | --- | --- | ---: |
| Enumerations with exhaustive `match` | Mistaken and forgotten cases | none | small | 1 |
| Distinct integer types | Mixed-up coordinate systems | none | small | 2 |
| Guard facts for bounds checks | Redundant checks and traps | a saving | small | 3 |
| Reactor-usage effects | Excess or missing claims | none | small | 4 |
| Per-turn arena with lifetime rule | The inability to allocate | about 4 instructions per allocation, no checks | medium | 5 |
| Linear handles, then typestate | Leaked and misused grants | none | medium to large | 6 |

The order follows value for effort, with one dependency: the arena's rule about waits presupposes the `await` of Article 8.

## 9.11 Key points

- A feature belongs in this language only if it is checked locally, adds no run-time checks, and addresses an observed problem.
- Enumerations and distinct integer types change no generated code and catch errors the current sources can only prevent by convention.
- A guard such as `at < text.length` is a fact the compiler can carry into the guarded block, removing the bounds check there. An unsigned index type covers the lower bound.
- The language already has two lifetimes, the turn and the application. A per-turn arena makes the first one usable for allocation, with two local rules to keep it safe.
- Linear types make "this handle must be released or passed on exactly once" a compile-time property. Typestate adds "and only in the right state".
- The reactor functions a world can call are computable in the existing single pass and can be checked against its manifest.
- Typed and untyped code should continue to meet only at world messages.

## 9.12 Check your understanding

1. Section 9.2 gives three places in the existing typed sources where a bare integer carries a meaning. Name two of them, and say what replacing them by an enumeration would change in the generated code.
2. Name the four coordinate systems in which the Editor expresses a position, and describe the specific mistake that section 9.3 says tests tend to miss.
3. In the loop of section 9.4, state the fact the compiler records, the three kinds of event that discard it, and why nothing needs to be remembered from one iteration to the next.
4. Why does a signed test `at < text.length` not justify removing the whole bounds check, and how does an unsigned index type resolve this?
5. State the two rules that make a per-turn arena safe, and say what a program must do with data that has to outlive the turn.
6. A function receives a linear `Grant` and contains an `if` with two branches. What must be true of the grant at the end of each branch, and may the two branches dispose of it in different ways?

## References

- [Boruch-Gruszecki et al. 2023] A. Boruch-Gruszecki, M. Odersky, E. Lee, O. Lhoták, J. Brachthäuser. "Capturing types." *ACM TOPLAS* 45(4), 2023.
- [Dennis & Van Horn 1966] J. B. Dennis, E. C. Van Horn. "Programming semantics for multiprogrammed computations." *Communications of the ACM* 9(3), 1966.
- [Grossman et al. 2002] D. Grossman, G. Morrisett, T. Jim, M. Hicks, Y. Wang, J. Cheney. "Region-based memory management in Cyclone." *PLDI*, 2002.
- [Hammond & Michaelson 2003] K. Hammond, G. Michaelson. "Hume: a domain-specific language for real-time embedded systems." *GPCE*, 2003.
- [Hofmann & Jost 2003] M. Hofmann, S. Jost. "Static prediction of heap space usage for first-order functional programs." *POPL*, 2003.
- [Honda 1993] K. Honda. "Types for dyadic interaction." *CONCUR*, 1993.
- [Hughes et al. 1996] J. Hughes, L. Pareto, A. Sabry. "Proving the correctness of reactive systems using sized types." *POPL*, 1996.
- [Kennedy 1994] A. Kennedy. "Dimension types." *ESOP*, 1994.
- [Lehmann et al. 2023] N. Lehmann, A. T. Geller, N. Vazou, R. Jhala. "Flux: liquid types for Rust." *PLDI*, 2023.
- [Lucassen & Gifford 1988] J. M. Lucassen, D. K. Gifford. "Polymorphic effect systems." *POPL*, 1988.
- [Maranget 2007] L. Maranget. "Warnings for pattern matching." *Journal of Functional Programming* 17(3), 2007.
- [Miller 2006] M. S. Miller. "Robust composition: towards a unified approach to access control and concurrency control." Doctoral dissertation, Johns Hopkins University, 2006.
- [Reinking et al. 2021] A. Reinking, N. Xie, L. de Moura, D. Leijen. "Perceus: garbage free reference counting with reuse." *PLDI*, 2021.
- [Rondon et al. 2008] P. M. Rondon, M. Kawaguchi, R. Jhala. "Liquid types." *PLDI*, 2008.
- [Siek & Taha 2006] J. G. Siek, W. Taha. "Gradual typing for functional languages." *Scheme and Functional Programming Workshop*, 2006.
- [Strom & Yemini 1986] R. E. Strom, S. Yemini. "Typestate: a programming language concept for enhancing software reliability." *IEEE Transactions on Software Engineering* 12(1), 1986.
- [Takikawa et al. 2016] A. Takikawa, D. Feltey, B. Greenman, M. S. New, J. Vitek, M. Felleisen. "Is sound gradual typing dead?" *POPL*, 2016.
- [Tobin-Hochstadt & Felleisen 2008, 2010] S. Tobin-Hochstadt, M. Felleisen. "The design and implementation of Typed Scheme." *POPL*, 2008; "Logical types for untyped languages." *ICFP*, 2010.
- [Tofte & Talpin 1997] M. Tofte, J.-P. Talpin. "Region-based memory management." *Information and Computation* 132(2), 1997.
- [Wadler 1990] P. Wadler. "Linear types can change the world!" *IFIP TC 2 Working Conference on Programming Concepts and Methods*, 1990.
- [Walker 2005] D. Walker. "Substructural type systems." Chapter 1 of B. C. Pierce (ed.), *Advanced Topics in Types and Programming Languages*, MIT Press, 2005. Chapter 3 of the same volume, by Henglein, Makholm and Niss, covers effect types and region-based memory management.
- [Xi & Pfenning 1998] H. Xi, F. Pfenning. "Eliminating array bound checking through dependent types." *PLDI*, 1998.
- WebAssembly Component Model: explainer and WIT documentation (resource and handle types).
