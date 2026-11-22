# 4. Making Inference Affordable, or Avoiding It

Article 3 showed that CJI, the project's compiler for unannotated JavaScript, spends its time solving for facts that depend on the whole program. Its example was Agenda, a 16 kB task-list application that took 25 minutes to compile. This article presents the two families of remedy. The first keeps whole-program inference and makes it cheaper; the second changes the language so that the compiler never needs facts from outside the function it is compiling. By the end you should be able to match each of five analysis techniques to the specific waste it removes, say for each whether it changes the answer, state what a declared boundary is and why it makes checking local, and explain where the two families meet.

## 4.1 Five kinds of waste

The project's measurements identify five distinct ways in which CJI's range analysis does work that produces nothing. Some of the figures appeared in Article 3; the others come from the same profiling records. Each kind of waste has a known remedy in the literature. The table is the map of this half of the article. Recall from Article 3 that a *pass* is one visit to every function, that the analysis repeats passes until nothing changes, and that *widening* is the device of jumping a growing bound to a large value so that the repetition ends.

| Waste observed in CJI | Evidence (Agenda) | Remedy | Does the answer change? |
| --- | --- | --- | --- |
| Function bodies are analyzed again when only their inputs changed | 2,741 bodies analyzed in 11,760 function visits | Summaries (jump functions) | No, if the summary is exact |
| Every statement is visited in every round, though few facts change | 78.3% of 11.7 million joins had identical inputs | Sparse propagation on SSA form | No, given the right renaming |
| The whole program is passed over until nothing changes | 95 passes over the whole program | Solve in dependency order | It can only become more precise |
| Ranges are computed for values nobody asks about | A proof is needed only for operations compiled as integer arithmetic pending that proof | Demand-driven analysis | Same answers for the questions asked, unless the search gives up, in which case the check is kept |
| Everything is recomputed after a small edit | By design, each build starts from nothing | Incremental analysis | No |

### Summaries: analyze a body once

A **summary** of a function is a compact description of how its outputs depend on its inputs. With a summary in hand, the analysis can respond to new information about a caller by evaluating the summary, without reading the function's body again.

The classical form is the **jump function** of Callahan, Cooper, Kennedy and Torczon. For each call inside a function, and each argument of that call, the jump function is a small expression giving the argument's value in terms of the enclosing function's own parameters [Callahan et al. 1986; Cooper & Torczon 2023, §9.4.2]. Consider:

```js
function nextIndex(i, n) { return clamp(i + 1, n); }
```

The call to `clamp` has two jump functions: `J₁ = i + 1` and `J₂ = n`. Suppose the analysis learns that some caller passes `nextIndex` a first argument `i` in the range [0, 9]. Evaluating `J₁` gives [1, 10] for the first parameter of `clamp` immediately. The body of `nextIndex` is not visited again.

A natural objection is that facts flow from callers into callees, so analysing a body once cannot be enough. The objection confuses two things. A summary is a formula whose inputs are the caller's facts. When the facts change, the formula's *result* changes; the formula itself does not, which is why it can be computed once. The facts still travel around the call graph as many times as needed; each trip is now the evaluation of a formula instead of the analysis of a body. A jump function, which describes one call's arguments in terms of the enclosing function's parameters, depends only on the text of the enclosing function and needs recomputing only when that text changes. When a jump function would be too complicated to represent, the analysis records "unknown" for that argument. The result is then less precise, and it is still safe: the compiler falls back to the general code.

CJI already has the beginnings of this mechanism. Of the 11,760 function visits for Agenda, 9,019 were skipped because the function's inputs had not changed, which left 2,741 visits in which a body was analyzed. An experimental cache that stored complete per-function results avoided 62 percent of those 2,741 and cut 29 percent of compile time on a workstation, and it was rejected because storing complete results raised peak memory from 4.5 MB to 7.3 MB inside an 8 MiB heap. A jump function stores an expression per argument instead of a result per program point, which is the property that matters on this device. Whether it fits in CJI's heap is an open, testable question.

### Sparse propagation: follow the facts that change

CJI's range analysis is **dense**: it keeps a table of ranges for every variable at every program point and, on each visit, recomputes the table for each statement. Most statements do not affect most variables. The measurements show it: 78.3 percent of joins combined a range with itself, and 39.6 percent of writes into the table stored the value already there.

A **sparse** analysis attaches each fact to the place where a value is defined and sends it directly to the places where that value is used. This requires a program representation in which every use names exactly one definition, which is **static single-assignment form** (SSA). In SSA each variable is assigned in exactly one place; where two definitions meet at a control-flow merge, a φ-function creates a new name that selects between them [Cytron et al. 1991]. Propagation along SSA edges touches a statement only when one of its inputs has changed. The standard algorithm of this kind is sparse conditional constant propagation [Wegman & Zadeck 1991; Cooper & Torczon 2023, §9.3 and §10.7.1].

Does a sparse analysis compute the same ranges? It does, on one condition: the representation must create a new name wherever a fact about a value can change. Assignments are covered by SSA. Branches are not. Inside the body of `while (i < n)`, the value `i` is known to be less than `n`, and plain SSA uses the same name for `i` on both sides of the test. Extended SSA forms insert a renaming, written π, on each branch outcome so that the stronger fact has its own name [Bodík et al. 2000]:

```
if (i1 < n) {
    i2 = π(i1)        // same value as i1; the analysis records i2 < n
    use(i2)
} else {
    i3 = π(i1)        // same value as i1; the analysis records i3 >= n
}
```

The π does nothing at run time. It exists so that the fact "less than `n`" belongs to the name `i2` and to no other. With that renaming, sparse analysis preserves the precision of the dense analysis it replaces. One implementation, a range analysis for C programs, became 5 to 110 times faster and extended its reach from programs of 111 thousand lines to 1.4 million [Oh et al. 2012]. SSA itself can be built directly while parsing structured code, without a separate dominance computation [Braun et al. 2013].

### Dependency order: solve each part once

CJI passes over the whole program until no summary changes: 95 passes for Agenda. Most of the program does not depend on most of the rest, so most of each pass confirms what was already final.

The alternative is to make the dependencies explicit. Build a **constraint graph** with a node for each value and an edge wherever one value's range feeds another's. Find its **strongly connected components**, the maximal groups of nodes that depend on each other in a cycle; loops and recursion produce such cycles. Process the components in topological order, so that every component is solved after everything it depends on is final. Iteration is still needed *inside* a component that contains a cycle: widening first, to make the iteration end, and then **narrowing**, a second phase that tightens the widened bounds again using the conditions in the code (for example, restoring "less than `n`" after a jump to infinity). It is never needed between components. This is the structure of the range analysis built by Pereira's group for the LLVM compiler [Campos et al. 2012]. In their measurements on a standard benchmark suite, solving component by component was the largest single gain, up to 450 times faster on one program, and it also *raised* precision, because widening is applied only inside cycles and each component is narrowed before its results are used. The resulting analysis processes half a million lines of code in under ten seconds, with time and memory growing linearly in program size [Rodrigues et al. 2013]. For a restricted but useful class of range constraints, the exact best answer can even be computed in polynomial time with no widening at all [Su & Wagner 2005].

### Demand: answer only the questions asked

CJI computes a range for every numeric value. The consumers of ranges are far fewer: the operations provisionally compiled as integer arithmetic, and the places where a numeric key selects a library routine (the case behind the negative-zero error described in the companion report). A **demand-driven** analysis starts from each consumer and searches backwards through the constraint graph only as far as needed to prove or refute the one property in question. The reference design is ABCD, an algorithm for removing array bounds checks that works on extended SSA and examines only the constraints relevant to each check [Bodík et al. 2000]. Its answers are the same as the exhaustive analysis's for the questions it asks, up to a bound on search effort beyond which it gives up and keeps the check. In the original implementation, in a research Java virtual machine, it removed on average 45 percent of the bounds checks executed by its benchmark programs, using fewer than ten analysis steps per check.

### Incremental analysis: reuse the last answer

On the handheld the common case is an edit to one function followed by a rebuild. An **incremental** analysis keeps its previous result and recomputes only what the edit can affect. Range analysis and its relatives have been made incremental by expressing them as rules over relations and maintaining the derived facts under changes [Szabó et al. 2018]. Formulating interprocedural analysis as reachability in a graph is the older foundation for this style [Reps et al. 1995]. The fully *compositional* variant analyzes each procedure in isolation and produces a summary valid in any calling context, which is how the Infer analyzer scales to very large code bases [Calcagno et al. 2009].

### What these remedies cannot do

Each technique removes a real inefficiency, and the first three would compose. None changes the fact established in Article 3: with the range analysis removed altogether, CJI still needs 170 seconds for Agenda, because solving for *types* and specializing library calls are also whole-program activities. Cheaper inference makes CJI a better workstation compiler. It does not make it an interactive compiler on a 360 MHz device.

## 4.2 Declared boundaries

The second family of remedy does not make whole-program inference cheaper. It makes it unnecessary.

A **declared boundary** is a statement, written in the program, of what crosses the edge of a function: the types of its parameters and of its result. With boundaries declared, the compiler needs only two things to compile a function: the function's own text, and the declarations of the functions it calls. Nothing about callers is required. Checking is **local**: its cost is proportional to the size of the function, it can be done in any order, and an edit to one function's body cannot change the code generated for another.

This is an old idea that languages keep rediscovering.

| System | Form of the boundary | What it bought |
| --- | --- | --- |
| Modula-2 (1980s) | A *definition module* lists a module's exported procedures and types, separately from the implementation module | Separate compilation with full type checking across modules [Wirth 1982] |
| OCaml | An interface file (`.mli`) per module | Each module compiles against interfaces only [OCaml manual] |
| TypeScript `isolatedDeclarations` (2024) | Exported functions must carry explicit type annotations | A file's public types can be produced without type-checking the whole program, so tools can process files independently and in parallel [TypeScript 5.5] |
| The typed compiler of this project | Every function declares parameter and result types | One-pass compilation in seconds on the device |

The burden on the programmer is smaller than it appears, because annotations are needed only *at* the boundary. Inside a function, the type of a local variable follows from the expression that initializes it: `let at = 0` makes `at` an `i32` without saying so. Inferring types from adjacent expressions only, with no global solving, is called **local type inference** [Pierce & Turner 2000], and the organized form in which types flow both down from declarations and up from expressions is **bidirectional typing** [Dunfield & Krishnaswami 2021]. The typed compiler does exactly this. Removing all 25 local annotations from one of its source files produced byte-identical output.

### How much language can a one-pass compiler carry?

The typed language today is very small: integers, booleans, counted strings and records. One might conclude that declared boundaries work only for toy languages. The evidence says otherwise.

**Static TypeScript** compiles a subset of TypeScript, including classes, closures and a garbage-collected heap, to machine code for microcontrollers with as little as 16 kB of RAM. Its authors describe the compiler's optimizer plainly: there are "no optimizations to speak of except for a simple peep-hole pass" [Ball et al. 2019]. The type annotations already present in the source do the work that inference and optimization do elsewhere. On benchmarks dominated by access to object properties, the authors report execution well over ten times faster than the embedded interpreters it was compared with.

**MicroPython's native and viper emitters** compile Python functions to machine code on the microcontroller itself. The viper emitter requires type hints and treats annotated integers as machine words, so that arithmetic wraps at the word size [MicroPython], which is the same decision the typed compiler made for `i32`.

**Static Hermes** and **AssemblyScript** [AssemblyScript] apply the same principle to ahead-of-time compilation of typed JavaScript-like source on larger machines. The Static Hermes announcement states the reason in one line: native compilation "requires sound types for performance", because without them the compiler must generate code for every combination of operand types [Mikov 2023].

The consistent result is that a language can have classes, closures and managed memory and still be compiled one function at a time, provided types are declared where functions meet.

### What declared boundaries cost

Three costs are real and should be stated.

- **Annotation.** Every function signature must be written. For code written for this device, that is a few tokens per function.
- **Generic code.** A function that should work for several element types needs either a separate compiled copy per type or a uniform run-time representation of values. Both are well-understood designs, and both must be chosen deliberately. CJI's specialization rounds are the automatic version of the first.
- **Existing JavaScript.** The system's 22 existing programs are not annotated. They continue to run in QuickJS, the system's JavaScript interpreter, and each must be ported by hand to gain anything.

## 4.3 Where the two families meet

CJI already accepts type annotations in comments, in the form `/*: Any[] */`, which declares an array of values of any type; the project used one to remove 15.9 million run-time type dispatches from CJI's own code. If CJI *required* such annotations on every function boundary, its inference would become local, its specialization could be driven by declared types without rounds of solving, and it would be a larger-language relative of the typed compiler. Conversely, as the typed language grows towards records with methods, arrays and closures, it approaches the subset CJI accepts.

The design rule that follows from both articles can be stated in one sentence. *A compiler that must run on the device should need, to compile a function, only that function's text and the declared signatures of what it calls.* The techniques of section 4.1 remain valuable for a compiler that does not follow that rule, which on this project means CJI used as a workstation tool.

## 4.4 Key points

- Summaries let an analysis respond to new caller facts by evaluating a formula. A summary is computed once per function body because it is the formula, and the facts are only its inputs.
- Sparse propagation on SSA touches a statement only when one of its inputs changes. It preserves precision if names are split at branches as well as at assignments.
- Solving a constraint graph component by component in dependency order confines iteration to cycles.
- Demand-driven analysis computes only the facts that some consumer needs.
- A declared boundary makes checking local: a function is compiled from its own text and its callees' signatures.
- Static TypeScript shows that classes, closures and a managed heap are compatible with a compiler that performs almost no optimization.
- Cheaper inference improves CJI as a workstation compiler. Only local checking gives interactive compile times on the device.

## 4.5 Check your understanding

1. For the function `nextIndex` in section 4.1, write the jump function for the first argument of `clamp`, and use it to compute that argument's range when `i` is in [5, 7].
2. A classmate says: "A summary computed once must be wrong, because callers keep changing." Explain the error in this reasoning.
3. Plain SSA gives `i` one name on both outcomes of the test `i < n`. Why does this lose information for a range analysis, and what do extended SSA forms add?
4. Of the 11,760 function visits made while compiling Agenda, how many analyzed a function body, and why is that the number that matters for judging what summaries could save?
5. State what "local checking" means, and give two practical consequences of it for a compiler that runs on the handheld.
6. Section 4.3 says the two families of remedy meet. Which existing feature of CJI makes that possible, and what would have to become mandatory?

## References

- [Ball et al. 2019] T. Ball, P. de Halleux, M. Moskal. "Static TypeScript: an implementation of a static compiler for the TypeScript language." *MPLR*, 2019.
- [Bodík et al. 2000] R. Bodík, R. Gupta, V. Sarkar. "ABCD: eliminating array bounds checks on demand." *PLDI*, 2000.
- [Braun et al. 2013] M. Braun, S. Buchwald, S. Hack, R. Leißa, C. Mallon, A. Zwinkau. "Simple and efficient construction of static single assignment form." *Compiler Construction*, 2013.
- [Calcagno et al. 2009] C. Calcagno, D. Distefano, P. O'Hearn, H. Yang. "Compositional shape analysis by means of bi-abduction." *POPL*, 2009.
- [Callahan et al. 1986] D. Callahan, K. D. Cooper, K. Kennedy, L. Torczon. "Interprocedural constant propagation." *SIGPLAN Symposium on Compiler Construction*, 1986.
- [Campos et al. 2012] V. H. S. Campos, R. E. Rodrigues, I. R. de Assis Costa, F. M. Q. Pereira. "Speed and precision in range analysis." *Brazilian Symposium on Programming Languages*, LNCS 7554, 2012.
- [Cooper & Torczon 2023] K. D. Cooper, L. Torczon. *Engineering a Compiler*, 3rd edition. Morgan Kaufmann, 2023. §9.3 (SSA), §9.4.2 (jump functions), §10.7.1 (sparse conditional constant propagation).
- [Cytron et al. 1991] R. Cytron, J. Ferrante, B. K. Rosen, M. N. Wegman, F. K. Zadeck. "Efficiently computing static single assignment form and the control dependence graph." *ACM TOPLAS* 13(4), 1991.
- [Dunfield & Krishnaswami 2021] J. Dunfield, N. Krishnaswami. "Bidirectional typing." *ACM Computing Surveys* 54(5), 2021.
- [AssemblyScript] The AssemblyScript project. "Introduction." assemblyscript.org.
- [MicroPython] MicroPython documentation. "Maximising MicroPython speed": the native and viper code emitters.
- [Mikov 2023] T. Mikov. "Static Hermes: the next generation of Hermes." Talk at React Native EU, 2023.
- [OCaml manual] X. Leroy et al. *The OCaml System: Documentation and User's Manual*, chapter on the module system and separate compilation.
- [Oh et al. 2012] H. Oh, K. Heo, W. Lee, W. Lee, K. Yi. "Design and implementation of sparse global analyses for C-like languages." *PLDI*, 2012.
- [Pierce & Turner 2000] B. C. Pierce, D. N. Turner. "Local type inference." *ACM TOPLAS* 22(1), 2000.
- [Reps et al. 1995] T. Reps, S. Horwitz, M. Sagiv. "Precise interprocedural dataflow analysis via graph reachability." *POPL*, 1995.
- [Rodrigues et al. 2013] R. E. Rodrigues, V. H. S. Campos, F. M. Q. Pereira. "A fast and low-overhead technique to secure programs against integer overflows." *CGO*, 2013.
- [Su & Wagner 2005] Z. Su, D. Wagner. "A class of polynomially solvable range constraints for interval analysis without widenings." *Theoretical Computer Science* 345(1), 2005.
- [Szabó et al. 2018] T. Szabó, G. Bergmann, S. Erdweg, M. Voelter. "Incrementalizing lattice-based program analyses in Datalog." *OOPSLA*, 2018.
- [TypeScript 5.5] Microsoft. TypeScript 5.5 release notes, "Isolated declarations", 2024.
- [Wegman & Zadeck 1991] M. N. Wegman, F. K. Zadeck. "Constant propagation with conditional branches." *ACM TOPLAS* 13(2), 1991.
- [Wirth 1982] N. Wirth. *Programming in Modula-2*. Springer, 1982.
