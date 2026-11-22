# Bibliography check 01: analysis and inference

Checked on 2026-11-19 against the web. Nothing below is stated from memory alone.

## How entries were checked

- **Bibliographic data** (authors, title, venue, volume, pages, year): publisher-deposited Crossref records for each DOI (`https://api.crossref.org/works/<doi>`), cross-checked with OpenAlex.
- **Core results and numbers**: the paper's own abstract or body text, read from the ACM abstract (via OpenAlex) or from an author- or course-hosted PDF. The "Confirmed at" line names the copy that was read.
- **Not reachable**: DBLP and Springer Link both answered with bot challenges, so neither was read directly. Springer chapter data comes from Crossref instead.

Status values: VERIFIED (your version is right), CORRECTED (your version had an error, stated), UNVERIFIED (could not confirm). Sub-claims that could not be confirmed are listed per entry and again at the end.

## Summary

- 30 VERIFIED, 1 CORRECTED (entry 10), 0 UNVERIFIED.
- Six VERIFIED entries carry a caveat that changes how to cite or describe them: 7, 11, 25, 27, 30, 31.
- Four more have one secondary sub-claim left unconfirmed: 3, 5, 6, 20. See the table at the end.

---

## Papers

### 1. `kildall1973`
- **Authors:** Gary A. Kildall
- **Title:** A unified approach to global program optimization
- **Venue:** Proceedings of the 1st Annual ACM SIGACT-SIGPLAN Symposium on Principles of Programming Languages (POPL '73), 1973, pp. 194–206
- **DOI:** https://doi.org/10.1145/512927.512945
- **Status:** VERIFIED
- **Core result:** Presents one general flow-analysis algorithm over a directed-graph model of the program, parameterised by an "optimizing function", and proves it correct. Instantiating the function gives constant propagation, common subexpression elimination, elimination of redundant register loads, and live expression analysis.

### 2. `kam1977`
- **Authors:** John B. Kam, Jeffrey D. Ullman
- **Title:** Monotone data flow analysis frameworks
- **Venue:** Acta Informatica 7(3), 1977, pp. 305–317
- **DOI:** https://doi.org/10.1007/BF00290339
- **Status:** VERIFIED
- **Core result:** Generalises Kildall's lattice approach to frameworks that are monotone but not distributive. The maximal fixed point exists for every instance and Kildall's algorithm finds it, but for non-distributive frameworks it can differ from the meet-over-all-paths solution, and no algorithm computes meet-over-all-paths for monotone frameworks in general.
- **Note:** The abstract was read as a search-engine excerpt of the Springer page, not from Springer directly.

### 3. `cousot1977`
- **Authors:** Patrick Cousot, Radhia Cousot
- **Title:** Abstract interpretation: a unified lattice model for static analysis of programs by construction or approximation of fixpoints
- **Venue:** Conference Record of the Fourth ACM SIGACT-SIGPLAN Symposium on Principles of Programming Languages (POPL '77), Los Angeles, 1977, pp. 238–252
- **DOI:** https://doi.org/10.1145/512950.512973
- **Confirmed at:** https://www.di.ens.fr/~cousot/COUSOTpapers/POPL77.shtml (author page); OCR text of the paper
- **Status:** VERIFIED
- **Core result:** Defines program analysis as executing the program over a lattice of abstract values, so that the abstract result soundly summarises all concrete executions (the rule of signs is the opening example).
- **Widening:** Confirmed. Section 9 covers fixpoint approximation for the case where Kleene sequences are infinite. It defines a widening operation for increasing approximation sequences and a narrowing operation for decreasing ones, each with an interval example. The author page describes Section 9 as introducing "finite fixpoint approximation methods to be used when Kleene's sequences are infinite". The only text copy I could read is a jumbled OCR, so I confirmed the terms and the interval definitions but not exact subsection numbers.
- **Not confirmed:** whether this is the first appearance in print. A 2017 talk by Cousot dates the idea to 1975 reports; I did not check those or a 1976 paper. "The standard reference for widening" is safe; "first introduced in" is not checked.

### 4. `cytron1991`
- **Authors:** Ron Cytron, Jeanne Ferrante, Barry K. Rosen, Mark N. Wegman, F. Kenneth Zadeck
- **Title:** Efficiently computing static single assignment form and the control dependence graph
- **Venue:** ACM Transactions on Programming Languages and Systems 13(4), October 1991, pp. 451–490
- **DOI:** https://doi.org/10.1145/115372.115320
- **Status:** VERIFIED
- **Core result:** Gives algorithms that build SSA form and the control dependence graph for arbitrary control flow graphs, using the new concept of dominance frontiers. Offers analytical and experimental evidence that both structures are usually linear in program size.

### 5. `wegman1991`
- **Authors:** Mark N. Wegman, F. Kenneth Zadeck
- **Title:** Constant propagation with conditional branches
- **Venue:** ACM Transactions on Programming Languages and Systems 13(2), April 1991, pp. 181–210 (earlier version: POPL '85, pp. 291–299, https://doi.org/10.1145/318593.318659)
- **DOI:** https://doi.org/10.1145/103135.103136
- **Status:** VERIFIED
- **Core result:** Presents four constant propagation algorithms, all conservative (every constant reported is constant on all executions, but not all constants are found), plus an interprocedural variant that gathers aliasing information alongside. The abstract calls them among the simplest, fastest and most powerful known.
- **Not confirmed from the paper:** the name "sparse conditional constant propagation" for the strongest of the four. Secondary sources use it; I read only the abstract.

### 6. `callahan1986`
- **Authors:** David Callahan, Keith D. Cooper, Ken Kennedy, Linda Torczon
- **Title:** Interprocedural constant propagation
- **Venue:** Proceedings of the 1986 SIGPLAN Symposium on Compiler Construction, pp. 152–161 (also SIGPLAN Notices 21(7), July 1986)
- **DOI:** https://doi.org/10.1145/12276.13327
- **Status:** VERIFIED
- **Core result:** A general algorithm that determines, for each procedure, which inputs have known constant values at run time. Precision depends on the local analysis of each procedure; several strategies are proposed and a prototype in a vectorising Fortran compiler is reported.
- **"Jump functions":** Confirmed through a second paper, not the primary text. Grove and Torczon, "Interprocedural constant propagation: a study of jump function implementation", PLDI 1993, pp. 90–99 (https://doi.org/10.1145/155090.155099), states that in the 1986 framework intraprocedural propagation "is modeled with a jump function" and that Callahan et al. proposed several kinds without data to choose between them. The 1986 abstract itself does not use the term, and I could not get a readable copy of the body.

### 7. `sharir1981`
- **Authors:** Micha Sharir, Amir Pnueli
- **Title:** Two approaches to interprocedural data flow analysis
- **Venue:** In Steven S. Muchnick and Neil D. Jones (eds.), *Program Flow Analysis: Theory and Applications*, Prentice-Hall, Englewood Cliffs, NJ, 1981, pp. 189–233
- **URL:** no DOI (book chapter). Earlier version: Technical Report 002, Courant Institute, New York University, September 1978.
- **Confirmed at:** reference list of Reps, Horwitz, Sagiv, POPL '95 (pages and editors); library catalogue records (book: Prentice-Hall, 1981, xvii + 418 pp.)
- **Status:** VERIFIED. Your version gave only the year; the venue above completes it.
- **Core result:** Two ways to do interprocedural analysis precisely: the functional approach, which summarises each procedure as an input-output function, and the call-strings approach, which analyses one whole-program flow graph while tagging facts with call history.
- **Not confirmed:** the chapter number. "Chapter 7" appears in some citations but no source I found states it.

### 8. `reps1995`
- **Authors:** Thomas Reps, Susan Horwitz, Mooly Sagiv
- **Title:** Precise interprocedural dataflow analysis via graph reachability
- **Venue:** Proceedings of the 22nd ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '95), 1995, pp. 49–61
- **DOI:** https://doi.org/10.1145/199448.199462
- **Confirmed at:** https://www.cs.cornell.edu/courses/cs711/2005fa/papers/rhs-popl95.pdf
- **Status:** VERIFIED
- **Core result:** Interprocedural problems with a finite set of facts and distributive flow functions (the IFDS class) can be solved precisely in polynomial time by reachability over an "exploded supergraph". The tabulation algorithm runs in O(ED³) in general and O(ED) for locally separable (gen/kill) problems.

### 9. `bodik2000`
- **Authors:** Rastislav Bodík, Rajiv Gupta, Vivek Sarkar
- **Title:** ABCD: eliminating array bounds checks on demand
- **Venue:** Proceedings of the ACM SIGPLAN 2000 Conference on Programming Language Design and Implementation (PLDI '00), Vancouver, pp. 321–333
- **DOI:** https://doi.org/10.1145/349299.349342
- **Confirmed at:** paper PDF (full text read)
- **Status:** VERIFIED
- **Core result:** A lightweight bounds-check eliminator for dynamic compilers that adds a few edges to the SSA value graph and proves a check redundant by a simple graph traversal.
- **Extended SSA:** Confirmed. The program is first converted to extended SSA (e-SSA) form by inserting π-assignments at conditionals and bounds checks; the inequality graph is built from that.
- **Demand-driven:** Confirmed. Each check is analysed separately, so the optimiser can be applied only to hot checks.
- **Numbers:** removes on average 45% of dynamic bounds-check instructions (upper-bound checks, measured dynamically), with fewer than 10 analysis steps per check. About 31% of checks were fully redundant in static terms. Analysis time per check averaged about 4 ms. Run-time speedup on the Symantec benchmarks was about 10%. Implemented in the Jalapeño optimising compiler.

### 10. `su2004` / `su2005`
- **Authors:** Zhendong Su, David Wagner
- **Conference title:** A Class of Polynomially Solvable Range Constraints for Interval Analysis without Widenings **and Narrowings**
- **Conference venue:** TACAS 2004 (Barcelona, March 29 – April 2, 2004), LNCS 2988, Springer, pp. 280–295. DOI: https://doi.org/10.1007/978-3-540-24730-2_23
- **Journal title:** A class of polynomially solvable range constraints for interval analysis without widenings
- **Journal venue:** Theoretical Computer Science 345(1), November 2005, pp. 122–138. DOI: https://doi.org/10.1016/j.tcs.2005.07.035
- **Confirmed at:** https://people.eecs.berkeley.edu/~daw/papers/range-tcs05.pdf (journal version, abstract read)
- **Status:** CORRECTED. The title you gave is the journal title. The TACAS 2004 paper has a longer title ending "without Widenings and Narrowings". Venues and years were right.
- **Core result:** The first polynomial-time algorithm for a general class of integer range constraints. It computes the optimal (least) solution of the fixpoint equations, so precise range analysis for this class needs neither widening nor narrowing.

### 11. `campos2012`
- **Authors:** Victor Hugo Sperle Campos, Raphael Ernani Rodrigues, Igor Rafael de Assis Costa, Fernando Magno Quintão Pereira
- **Title:** Speed and Precision in Range Analysis
- **Venue:** Programming Languages, 16th Brazilian Symposium (SBLP 2012), Natal, Brazil, LNCS 7554, Springer, 2012, pp. 42–56
- **DOI:** https://doi.org/10.1007/978-3-642-33182-4_5
- **Confirmed at:** https://homepages.dcc.ufmg.br/~fernando/publications/papers/SBLP12_victor.pdf (full text read)
- **Status:** VERIFIED, with a caveat on the scalability figure.
- **Core result:** An empirical study of an interprocedural, context-sensitive range analysis implemented in LLVM. It explores 32 configurations of the algorithm, with most figures reported on the SPEC CPU 2006 integer programs.
- **Algorithm structure:** Confirmed as you recalled. Extract constraints (optionally from e-SSA form), build a constraint graph, compute strongly connected components, sort them topologically, then solve each component in three phases: growth analysis with widening, resolution of "futures" (symbolic bounds from comparisons between variables), and narrowing.
- **Numbers in this paper:** solving per component is the largest speed gain, up to 450x faster on xalancbmk, and raises precision by up to 40% on bzip2. e-SSA slows the analysis by up to 71% on xalancbmk.
- **Caveat:** this paper gives no lines-of-code scalability figure. The well-known one is in entry 12.

### 12. `rodrigues2013`
- **Authors:** Raphael Ernani Rodrigues, Victor Hugo Sperle Campos, Fernando Magno Quintão Pereira
- **Title:** A fast and low-overhead technique to secure programs against integer overflows
- **Venue:** Proceedings of the 2013 IEEE/ACM International Symposium on Code Generation and Optimization (CGO '13), Shenzhen, February 2013, pp. 1–11
- **DOI:** https://doi.org/10.1109/CGO.2013.6494996
- **Confirmed at:** https://homepages.dcc.ufmg.br/~fernando/publications/papers/CGO13_raphael.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** Uses the range analysis of entry 11 to remove overflow checks that provably cannot fire. It avoids about 25% of the checks (24.93%) and halves the instrumentation overhead; instrumented SPEC programs run 1.73% slower.
- **Scalability:** the interprocedural analysis handles programs with half a million lines of code in under ten seconds, and time and memory grow linearly with program size (R² of 0.967 for time, 0.994 for memory).

### 13. `oh2012`
- **Authors:** Hakjoo Oh, Kihong Heo, Wonchan Lee, Woosuk Lee, Kwangkeun Yi
- **Title:** Design and implementation of sparse global analyses for C-like languages
- **Venue:** Proceedings of the 33rd ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI '12), Beijing, pp. 229–238
- **DOI:** https://doi.org/10.1145/2254064.2254092
- **Confirmed at:** https://prosys.kaist.ac.kr/publications/pldi12.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** A general method for making an abstract-interpretation analyser sparse without losing precision, for relational as well as non-relational domains.
- **Numbers:** the sparse interval analysis is 5–110x faster than the non-sparse baseline and scales to 1.4M lines of C; the baseline reached 111 KLOC. The sparse octagon analysis is 13–56x faster than its baseline and scales to 130 KLOC.

### 14. `braun2013`
- **Authors:** Matthias Braun, Sebastian Buchwald, Sebastian Hack, Roland Leißa, Christoph Mallon, Andreas Zwinkau
- **Title:** Simple and Efficient Construction of Static Single Assignment Form
- **Venue:** Compiler Construction (CC 2013), LNCS 7791, Springer, 2013, pp. 102–122
- **DOI:** https://doi.org/10.1007/978-3-642-37051-9_6
- **Confirmed at:** https://c9x.me/compile/bib/braun13cc.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** Builds SSA directly from an AST or bytecode with no prior analysis: no dominance tree and no dominance frontiers. The IR is in SSA form throughout construction. The result is pruned SSA for all programs and minimal SSA for reducible control flow, with running time on par with Cytron et al.

### 15. `agesen1995`
- **Authors:** Ole Agesen
- **Title:** The Cartesian Product Algorithm: Simple and Precise Type Inference of Parametric Polymorphism
- **Venue:** ECOOP '95 – Object-Oriented Programming, Århus, Denmark, August 1995, LNCS 952, Springer, pp. 2–26
- **DOI:** https://doi.org/10.1007/3-540-49538-X_2
- **Confirmed at:** https://bibliography.selflanguage.org/cpa.html (abstract read)
- **Status:** VERIFIED
- **Core result:** A type inference algorithm for code with parametric polymorphism that is more precise and more efficient than its predecessors and handles inheritance directly. In use in the Self system since late 1993.

### 16. `chambers1989`
- **Authors:** Craig Chambers, David Ungar
- **Title:** Customization: optimizing compiler technology for SELF, a dynamically-typed object-oriented programming language
- **Venue:** Proceedings of the ACM SIGPLAN 1989 Conference on Programming Language Design and Implementation (PLDI '89), pp. 146–160
- **DOI:** https://doi.org/10.1145/73141.74831
- **Status:** VERIFIED
- **Core result:** The compiler produces several copies of a procedure, each customised to one receiver type, predicts likely types and guards them with run-time tests, and splits calls per control path. With inlining, the abstract says this doubled the performance of dynamically typed object-oriented languages.

### 17. `holzle1994oopsla`
- **Authors:** Urs Hölzle, David Ungar
- **Title:** A third-generation SELF implementation: reconciling responsiveness with performance
- **Venue:** Proceedings of the Ninth Annual Conference on Object-Oriented Programming Systems, Languages, and Applications (OOPSLA '94), Portland, October 1994, pp. 229–243
- **DOI:** https://doi.org/10.1145/191080.191116
- **Confirmed at:** https://bibliography.selflanguage.org/_static/third-generation.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** SELF-93 pairs a fast non-optimising compiler with a slower optimising one that recompiles hot code. It runs two to three times faster than existing Smalltalk systems while staying responsive.
- **On compilation pauses:** Optimisation normally causes long pauses, which is why interactive systems avoided it. The paper argues pauses must be measured clustered: short pauses in quick succession count as one. Clustering changes the measured distribution by an order of magnitude: fewer than 2% of individual pauses exceed 0.1 s, against 37% of clustered pauses. In a 50-minute interactive session on a SPARCstation-2, 195 clustered pauses exceeded 200 ms and 21 exceeded one second; almost two thirds were under 0.1 s and 97% under one second.

### 18. `holzle1994pldi`
- **Authors:** Urs Hölzle, David Ungar
- **Title:** Optimizing dynamically-dispatched calls with run-time type feedback
- **Venue:** Proceedings of the ACM SIGPLAN 1994 Conference on Programming Language Design and Implementation (PLDI '94), pp. 326–336
- **DOI:** https://doi.org/10.1145/178243.178478
- **Status:** VERIFIED
- **Core result:** The runtime feeds observed receiver types back to the compiler, which can then inline any dynamically dispatched call. On large SELF applications this cut call frequency by a factor of 3.6 and improved performance by a factor of 1.7.

### 19. `ancona2007`
- **Authors:** Davide Ancona, Massimo Ancona, Antonio Cuni, Nicholas D. Matsakis
- **Title:** RPython: a step towards reconciling dynamically and statically typed OO languages
- **Venue:** Proceedings of the 2007 Symposium on Dynamic Languages (DLS '07), Montreal, pp. 53–64
- **DOI:** https://doi.org/10.1145/1297081.1297091
- **Confirmed at:** https://llvm.org/pubs/2007-10-DLS-RPython.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** RPython is a statically typed proper subset of Python. Dynamic features are allowed only in an initial bootstrapping phase; the resulting program is then type-inferred and translated to CLI or JVM bytecode.
- **Whole-program inference:** Confirmed. The paper says the flow graph generator and the annotator "perform a global analysis of a program as a whole" from a user-supplied entry point, and that the toolchain "relies on a full-program analysis", so type checking is not compositional and separate compilation is difficult.
- **Translation time:** The PyPy build documentation (https://doc.pypy.org/en/latest/build.html) says translation takes "20 minutes on a fast machine" and needs at least 3 GB of memory on 32-bit and 6 GB on 64-bit, and that building with CPython 2.7 instead of PyPy 2.7 takes two to three times as long. This is the current documentation, not a figure from the 2007 paper.

### 20. `dufour2006`
- **Authors:** Mark Dufour
- **Title:** Shed Skin: An Optimizing Python-to-C++ Compiler
- **Venue:** Master's thesis, Parallel and Distributed Systems Group, Delft University of Technology, April 19, 2006
- **URL:** original link is dead; archived copy at https://web.archive.org/web/20070705073352/http://mark.dufour.googlepages.com/shedskin.pdf
- **Confirmed at:** thesis title page (rendered and read)
- **Status:** VERIFIED
- **Core result:** A compiler from implicitly statically typed Python to C++ that infers all types for the whole program.
- **Scalability limits:** Confirmed. The current documentation (https://shedskin.readthedocs.io/en/latest/documentation/) states that the type inference techniques "do not scale very well beyond several thousand lines of code" and that the largest compiled program is about 6,000 lines. The project README recommends it for a few hundred to a few thousand lines.
- **Not read from the thesis:** the description of the inference as Agesen's Cartesian Product Algorithm combined with Plevyak's iterative flow analysis. That comes from the Wikipedia article; the thesis PDF text layer is not extractable and I read only its front matter.

### 21. `szabo2018`
- **Authors:** Tamás Szabó, Gábor Bergmann, Sebastian Erdweg, Markus Voelter
- **Title:** Incrementalizing lattice-based program analyses in Datalog
- **Venue:** Proceedings of the ACM on Programming Languages 2(OOPSLA), Article 139, 2018, 29 pages
- **DOI:** https://doi.org/10.1145/3276509
- **Status:** VERIFIED
- **Core result:** Presents DRedL, an algorithm that incrementally maintains recursive aggregation over custom lattices in Datalog, where earlier incremental frameworks supported only powerset lattices. Built into the IncA framework, strong-update points-to and string analyses for Java react to code changes within milliseconds.

### 22. `calcagno2009`
- **Authors:** Cristiano Calcagno, Dino Distefano, Peter W. O'Hearn, Hongseok Yang
- **Title:** Compositional shape analysis by means of bi-abduction
- **Venue:** Proceedings of the 36th Annual ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '09), Savannah, pp. 289–300 (extended version: Journal of the ACM 58(6), 2011, https://doi.org/10.1145/2049697.2049700)
- **DOI:** https://doi.org/10.1145/1480881.1480917
- **Confirmed at:** paper PDF (full text read)
- **Status:** VERIFIED
- **Core result:** The first compositional shape analysis: each procedure is analysed independently of its callers, using bi-abduction to infer jointly the missing precondition (anti-frame) and the untouched state (frame).
- **Numbers:** on Linux kernel 2.6.25.4 (2.473 MLOC, 101,330 procedures) it found at least one consistent specification for 59,215 procedures (58.4%) in 6,869 s on one core or 1,739 s on eight, with a one-second timeout per procedure.

### 23. `gupta1993`
- **Authors:** Rajiv Gupta
- **Title:** Optimizing array bound checks using flow analysis
- **Venue:** ACM Letters on Programming Languages and Systems 2(1–4), March–December 1993, pp. 135–150
- **DOI:** https://doi.org/10.1145/176454.176507
- **Status:** VERIFIED
- **Core result:** Flow analyses that eliminate redundant bound checks and move checks out of loops. The optimised program reports a bound violation if and only if the original would, though possibly at a different point.

### 24. `markstein1982`
- **Authors:** Victoria Markstein, John Cocke, Peter Markstein
- **Title:** Optimization of range checking
- **Venue:** Proceedings of the 1982 SIGPLAN Symposium on Compiler Construction, pp. 114–119 (also SIGPLAN Notices 17(6), June 1982)
- **DOI:** https://doi.org/10.1145/800230.806986
- **Status:** VERIFIED
- **Core result:** Optimises run-time range checks in frequently executed regions using strength reduction, code motion and common subexpression elimination.

### 26. `pierce2000`
- **Authors:** Benjamin C. Pierce, David N. Turner
- **Title:** Local type inference
- **Venue:** ACM Transactions on Programming Languages and Systems 22(1), January 2000, pp. 1–44 (earlier version: POPL '98, pp. 252–265)
- **DOI:** https://doi.org/10.1145/345099.345100
- **Status:** VERIFIED
- **Core result:** Two partial inference methods for a language with subtyping and impredicative polymorphism, both local: missing annotations are recovered only from adjacent syntax-tree nodes, with no unification variables. One infers type arguments at polymorphic applications; the other propagates types downward to infer annotations on bound variables.

### 27. `dunfield2021`
- **Authors:** Jana Dunfield, Neel Krishnaswami
- **Title:** Bidirectional Typing
- **Venue:** ACM Computing Surveys 54(5), pp. 1–38
- **DOI:** https://doi.org/10.1145/3450952 (preprint: https://arxiv.org/abs/1908.05839)
- **Status:** VERIFIED, with a caveat on the year.
- **Year:** Crossref records online publication on 25 May 2021 and a print issue date of 30 June 2022. The arXiv journal reference says 2021. Citing 2021 is defensible; some indexes will show 2022.
- **Core result:** A survey of bidirectional typing, which combines checking against a known type with synthesising a type from a term. Checking handles features where inference is undecidable, synthesis avoids heavy annotation, and error locality improves.
- **Not confirmed:** the article number.

### 28. `amdahl1967`
- **Authors:** Gene M. Amdahl
- **Title:** Validity of the single processor approach to achieving large scale computing capabilities
- **Venue:** AFIPS Conference Proceedings, vol. 30 (Spring Joint Computer Conference, Atlantic City, April 18–20, 1967), pp. 483–485
- **DOI:** https://doi.org/10.1145/1465482.1465560
- **Confirmed at:** 2007 IEEE Solid-State Circuits Society Newsletter reprint (full text read)
- **Status:** VERIFIED
- **Core result:** Argues that the sequential part of a workload bounds the benefit of parallel processors. The example given is that data-management housekeeping, about 40% of executed instructions and inherently sequential, alone caps throughput at five to seven times the sequential rate.
- **Note:** The paper contains no equations. The formula known as Amdahl's law is a later formalisation; do not attribute the formula itself to this paper.

---

## Specifications, tools and proposals

### 25. `asmjs2014`
- **Editors:** David Herman, Luke Wagner, Alon Zakai (all Mozilla)
- **Title:** asm.js — Working Draft, 18 August 2014
- **Status:** VERIFIED, with a URL warning.
- **URL warning:** the canonical address `http://asmjs.org/spec/latest/` no longer resolves. The domain returned NXDOMAIN on 2026-11-19. Cite one of these instead:
  - archived rendering: https://web.archive.org/web/20241225233944/http://asmjs.org/spec/latest/
  - specification source: https://github.com/asm-js/spec (`html/index.src.html`)
- **Type annotations in valid JavaScript:** Confirmed. The spec says function parameters "are provided a type annotation by means of an explicit coercion on function entry". Section 5.1 recognises three parameter forms: `x = x|0;` (int), `x = +x;` (double) and `x = f(x);` where `f` is `fround` (float). Section 5.2 does the same for returns: `return +e;` has type double and `return e|0;` has type signed.
- **Other confirmed points:** asm.js is "a strict subset of JavaScript", so the spec defines only validation and the execution semantics are JavaScript's. Validated code is amenable to ahead-of-time compilation with unboxed numbers and no run-time type checks.

### 29. TypeScript flags and the TC39 proposal

**`isolatedDeclarations`** — `typescript55`
- **Release:** TypeScript 5.5, announced June 20, 2024
- **URL:** https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html (announcement: https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/)
- **Status:** VERIFIED
- **Stated purpose:** to let tools other than the TypeScript checker generate declaration files, which in turn allows parallel declaration emit and parallel type checking across projects. The notes say declaration emit normally needs a cross-file type checker because of inference; if exports carry explicit types, tools can emit declarations "without needing to look at the implementation of the module – and without reimplementing a full type-checker". The flag "reports errors when a module can't be reliably transformed without a type-checker", for example a missing explicit return type on an exported function.
- **Limits stated:** it requires `declaration` or `composite`, changes only error reporting and not emit, and brings no speedup by itself.

**`erasableSyntaxOnly`** — `typescript58`
- **Release:** TypeScript 5.8, announced February 28, 2025
- **URL:** https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html (announcement: https://devblogs.microsoft.com/typescript/announcing-typescript-5-8/)
- **Status:** VERIFIED
- **What it does:** makes TypeScript "error on most TypeScript-specific constructs that have runtime behavior": enums, namespaces and modules with runtime code, parameter properties, and `import =` aliases. The motivation given is Node.js 23.6 running TypeScript by stripping types, which requires that TypeScript-specific syntax can be erased to leave valid JavaScript.

**TC39 Type Annotations** — `tc39types`
- **Title:** ECMAScript proposal: Type Annotations (presented for stage 1 in March 2022 under the name "Types as Comments")
- **Authors:** Gil Tayar, Daniel Rosenwasser, Romulo Cintra, Rob Palmer
- **URL:** https://github.com/tc39/proposal-type-annotations
- **Stage:** 1. The proposal's README says so, and it is in the TC39 stage 1 list today (https://github.com/tc39/proposals/blob/main/stage-1-proposals.md). Last presented in September 2023.
- **Status:** VERIFIED
- **What it proposes:** type annotation syntax that engines ignore at run time, treating types as comments, with checking left to external tools.

### 30. `mikov2023`
- **Best citable source:** Tzvetan Mikov (Meta), "Static Hermes: the Next Generation of Hermes", talk at React Native EU 2023.
  - video: https://www.youtube.com/watch?v=q-xKYA0EO-c
  - slides, dated September 9, 2023: https://speakerdeck.com/tmikov2023/static-hermes-react-native-eu-2023-announcement
- **Status:** VERIFIED as a source. The premise in your question needs adjusting; see below.
- **What it says about type annotations:** The slides present "optional ahead of time compilation to native code" and say it "requires sound types for performance". They do **not** say annotations are required for ahead-of-time compilation as such.
  - Without types the compiler must support every combination of operand types, giving "a size explosion or interpreter-like performance".
  - TypeScript and Flow annotations as written cannot be relied on, because they are unsound and "do not guarantee that types are correct at runtime".
  - Static Hermes therefore changes some JavaScript semantics to enforce the annotated types at run time. This is opt-in, and typed code interoperates with unmodified code. Both Flow and TypeScript are supported.
- **Number:** on the nbody benchmark, typed native code ran in 565 ms against 5,511 ms in the interpreter.
- **Maturity:** the 2023 slides say it "is not ready for general usage yet".
- **Supporting sources:**
  - Neil Dhar (Meta), "Optimizing with Static Hermes", Chain React 2024 (https://speakerdeck.com/tmikov2023/optimizing-with-static-hermes-chain-react-2024): describes "optional sound type annotations to improve performance" and says it is still not ready for general use.
  - Tzvetan Mikov, "Compiling a real-world CLI tool to native with Static Hermes", next.app devCon 2026, Berlin, slides dated October 9, 2026 (https://speakerdeck.com/tmikov2023/compiling-a-real-world-cli-tool-to-native-with-static-hermes): the stated goal is to run "real, unmodified Node programs" and compile them ahead of time to bytecode and then native machine code. Unmodified Node programs carry no sound type annotations, so this implies untyped code is compiled ahead of time too.

### 31. AssemblyScript and Porffor

**AssemblyScript** — `assemblyscript`
- **URL:** https://www.assemblyscript.org/introduction.html (source: https://github.com/AssemblyScript/assemblyscript)
- **Status:** VERIFIED
- **One line:** AssemblyScript compiles a variant of TypeScript to WebAssembly using Binaryen, "directly, statically, ahead-of-time". Its own documentation says it will likely never support all of TypeScript, because not all of JavaScript's dynamic features are feasible to compile ahead of time.

**Porffor** — `porffor`
- **URL:** https://porffor.dev (source: https://github.com/CanadaHonk/porffor)
- **Status:** VERIFIED, with a caveat.
- **One line:** Porffor is an ahead-of-time compiler for JavaScript and TypeScript, with no interpreter or JIT, that today compiles through its own IR to C and from there to a native binary; it also supports WebAssembly output. The site describes it as alpha.
- **Caveat:** if you remember Porffor as a JavaScript-to-WebAssembly compiler, that is out of date. The current README says "Porffor compiles JS to C (with an IR inbetween)" and the site lists WebAssembly as an additional target. The site's own figures (for example, compiling 76.8% of 1,295 popular npm packages with output matching Node) are self-reported.

---

## Sub-claims not confirmed

Each of these is flagged in its entry above. None affects the citation itself.

| Entry | Not confirmed |
|---|---|
| 3 | That POPL '77 is the first appearance of widening in print (it defines widening; priority over 1975–76 reports was not checked) |
| 5 | The name "sparse conditional constant propagation" from the paper's own text |
| 6 | "Jump functions" in the 1986 paper's own text (confirmed through Grove and Torczon, PLDI 1993) |
| 7 | The chapter number in the Muchnick–Jones book |
| 11 | Any lines-of-code scalability figure in the SBLP paper (there is none; see entry 12) |
| 20 | The CPA-plus-IFA description of Shed Skin's inference, from the thesis itself |
| 27 | The ACM Computing Surveys article number |
