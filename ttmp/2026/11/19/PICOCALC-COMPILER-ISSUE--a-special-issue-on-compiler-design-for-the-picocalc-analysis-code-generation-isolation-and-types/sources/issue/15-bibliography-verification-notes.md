# Bibliography Verification Notes

The references of this issue were first written from memory. Before publication, three research assistants (language-model agents with web access) checked each one against publisher records, the text of the paper, or official documentation, and recorded what they found. Their notes are reproduced here unedited apart from heading levels, because they contain the DOI or URL of every source, the exact wording of the findings the articles rely on, and an account of what could not be confirmed.

Of 107 numbered entries, 103 were confirmed as cited, four were corrected, and one claim (the size of an early Turbo Pascal executable) could not be confirmed and is not used in the issue. The corrections were: the conference title of Su and Wagner's paper; the name of one of the Hume language levels; the author list and date of the Pascal-P report; and the full title of Xie and Leijen's paper. Several statements in the articles were also sharpened as a result, among them what the slim-binaries report says about loading speed and what the Static Hermes announcement says about type annotations.

## Part 1: Analysis and inference


Checked on 2026-11-19 against the web. Nothing below is stated from memory alone.

### How entries were checked

- **Bibliographic data** (authors, title, venue, volume, pages, year): publisher-deposited Crossref records for each DOI (`https://api.crossref.org/works/<doi>`), cross-checked with OpenAlex.
- **Core results and numbers**: the paper's own abstract or body text, read from the ACM abstract (via OpenAlex) or from an author- or course-hosted PDF. The "Confirmed at" line names the copy that was read.
- **Not reachable**: DBLP and Springer Link both answered with bot challenges, so neither was read directly. Springer chapter data comes from Crossref instead.

Status values: VERIFIED (your version is right), CORRECTED (your version had an error, stated), UNVERIFIED (could not confirm). Sub-claims that could not be confirmed are listed per entry and again at the end.

### Summary

- 30 VERIFIED, 1 CORRECTED (entry 10), 0 UNVERIFIED.
- Six VERIFIED entries carry a caveat that changes how to cite or describe them: 7, 11, 25, 27, 30, 31.
- Four more have one secondary sub-claim left unconfirmed: 3, 5, 6, 20. See the table at the end.

---

### Papers

#### 1. `kildall1973`
- **Authors:** Gary A. Kildall
- **Title:** A unified approach to global program optimization
- **Venue:** Proceedings of the 1st Annual ACM SIGACT-SIGPLAN Symposium on Principles of Programming Languages (POPL '73), 1973, pp. 194–206
- **DOI:** https://doi.org/10.1145/512927.512945
- **Status:** VERIFIED
- **Core result:** Presents one general flow-analysis algorithm over a directed-graph model of the program, parameterised by an "optimizing function", and proves it correct. Instantiating the function gives constant propagation, common subexpression elimination, elimination of redundant register loads, and live expression analysis.

#### 2. `kam1977`
- **Authors:** John B. Kam, Jeffrey D. Ullman
- **Title:** Monotone data flow analysis frameworks
- **Venue:** Acta Informatica 7(3), 1977, pp. 305–317
- **DOI:** https://doi.org/10.1007/BF00290339
- **Status:** VERIFIED
- **Core result:** Generalises Kildall's lattice approach to frameworks that are monotone but not distributive. The maximal fixed point exists for every instance and Kildall's algorithm finds it, but for non-distributive frameworks it can differ from the meet-over-all-paths solution, and no algorithm computes meet-over-all-paths for monotone frameworks in general.
- **Note:** The abstract was read as a search-engine excerpt of the Springer page, not from Springer directly.

#### 3. `cousot1977`
- **Authors:** Patrick Cousot, Radhia Cousot
- **Title:** Abstract interpretation: a unified lattice model for static analysis of programs by construction or approximation of fixpoints
- **Venue:** Conference Record of the Fourth ACM SIGACT-SIGPLAN Symposium on Principles of Programming Languages (POPL '77), Los Angeles, 1977, pp. 238–252
- **DOI:** https://doi.org/10.1145/512950.512973
- **Confirmed at:** https://www.di.ens.fr/~cousot/COUSOTpapers/POPL77.shtml (author page); OCR text of the paper
- **Status:** VERIFIED
- **Core result:** Defines program analysis as executing the program over a lattice of abstract values, so that the abstract result soundly summarises all concrete executions (the rule of signs is the opening example).
- **Widening:** Confirmed. Section 9 covers fixpoint approximation for the case where Kleene sequences are infinite. It defines a widening operation for increasing approximation sequences and a narrowing operation for decreasing ones, each with an interval example. The author page describes Section 9 as introducing "finite fixpoint approximation methods to be used when Kleene's sequences are infinite". The only text copy I could read is a jumbled OCR, so I confirmed the terms and the interval definitions but not exact subsection numbers.
- **Not confirmed:** whether this is the first appearance in print. A 2017 talk by Cousot dates the idea to 1975 reports; I did not check those or a 1976 paper. "The standard reference for widening" is safe; "first introduced in" is not checked.

#### 4. `cytron1991`
- **Authors:** Ron Cytron, Jeanne Ferrante, Barry K. Rosen, Mark N. Wegman, F. Kenneth Zadeck
- **Title:** Efficiently computing static single assignment form and the control dependence graph
- **Venue:** ACM Transactions on Programming Languages and Systems 13(4), October 1991, pp. 451–490
- **DOI:** https://doi.org/10.1145/115372.115320
- **Status:** VERIFIED
- **Core result:** Gives algorithms that build SSA form and the control dependence graph for arbitrary control flow graphs, using the new concept of dominance frontiers. Offers analytical and experimental evidence that both structures are usually linear in program size.

#### 5. `wegman1991`
- **Authors:** Mark N. Wegman, F. Kenneth Zadeck
- **Title:** Constant propagation with conditional branches
- **Venue:** ACM Transactions on Programming Languages and Systems 13(2), April 1991, pp. 181–210 (earlier version: POPL '85, pp. 291–299, https://doi.org/10.1145/318593.318659)
- **DOI:** https://doi.org/10.1145/103135.103136
- **Status:** VERIFIED
- **Core result:** Presents four constant propagation algorithms, all conservative (every constant reported is constant on all executions, but not all constants are found), plus an interprocedural variant that gathers aliasing information alongside. The abstract calls them among the simplest, fastest and most powerful known.
- **Not confirmed from the paper:** the name "sparse conditional constant propagation" for the strongest of the four. Secondary sources use it; I read only the abstract.

#### 6. `callahan1986`
- **Authors:** David Callahan, Keith D. Cooper, Ken Kennedy, Linda Torczon
- **Title:** Interprocedural constant propagation
- **Venue:** Proceedings of the 1986 SIGPLAN Symposium on Compiler Construction, pp. 152–161 (also SIGPLAN Notices 21(7), July 1986)
- **DOI:** https://doi.org/10.1145/12276.13327
- **Status:** VERIFIED
- **Core result:** A general algorithm that determines, for each procedure, which inputs have known constant values at run time. Precision depends on the local analysis of each procedure; several strategies are proposed and a prototype in a vectorising Fortran compiler is reported.
- **"Jump functions":** Confirmed through a second paper, not the primary text. Grove and Torczon, "Interprocedural constant propagation: a study of jump function implementation", PLDI 1993, pp. 90–99 (https://doi.org/10.1145/155090.155099), states that in the 1986 framework intraprocedural propagation "is modeled with a jump function" and that Callahan et al. proposed several kinds without data to choose between them. The 1986 abstract itself does not use the term, and I could not get a readable copy of the body.

#### 7. `sharir1981`
- **Authors:** Micha Sharir, Amir Pnueli
- **Title:** Two approaches to interprocedural data flow analysis
- **Venue:** In Steven S. Muchnick and Neil D. Jones (eds.), *Program Flow Analysis: Theory and Applications*, Prentice-Hall, Englewood Cliffs, NJ, 1981, pp. 189–233
- **URL:** no DOI (book chapter). Earlier version: Technical Report 002, Courant Institute, New York University, September 1978.
- **Confirmed at:** reference list of Reps, Horwitz, Sagiv, POPL '95 (pages and editors); library catalogue records (book: Prentice-Hall, 1981, xvii + 418 pp.)
- **Status:** VERIFIED. Your version gave only the year; the venue above completes it.
- **Core result:** Two ways to do interprocedural analysis precisely: the functional approach, which summarises each procedure as an input-output function, and the call-strings approach, which analyses one whole-program flow graph while tagging facts with call history.
- **Not confirmed:** the chapter number. "Chapter 7" appears in some citations but no source I found states it.

#### 8. `reps1995`
- **Authors:** Thomas Reps, Susan Horwitz, Mooly Sagiv
- **Title:** Precise interprocedural dataflow analysis via graph reachability
- **Venue:** Proceedings of the 22nd ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '95), 1995, pp. 49–61
- **DOI:** https://doi.org/10.1145/199448.199462
- **Confirmed at:** https://www.cs.cornell.edu/courses/cs711/2005fa/papers/rhs-popl95.pdf
- **Status:** VERIFIED
- **Core result:** Interprocedural problems with a finite set of facts and distributive flow functions (the IFDS class) can be solved precisely in polynomial time by reachability over an "exploded supergraph". The tabulation algorithm runs in O(ED³) in general and O(ED) for locally separable (gen/kill) problems.

#### 9. `bodik2000`
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

#### 10. `su2004` / `su2005`
- **Authors:** Zhendong Su, David Wagner
- **Conference title:** A Class of Polynomially Solvable Range Constraints for Interval Analysis without Widenings **and Narrowings**
- **Conference venue:** TACAS 2004 (Barcelona, March 29 – April 2, 2004), LNCS 2988, Springer, pp. 280–295. DOI: https://doi.org/10.1007/978-3-540-24730-2_23
- **Journal title:** A class of polynomially solvable range constraints for interval analysis without widenings
- **Journal venue:** Theoretical Computer Science 345(1), November 2005, pp. 122–138. DOI: https://doi.org/10.1016/j.tcs.2005.07.035
- **Confirmed at:** https://people.eecs.berkeley.edu/~daw/papers/range-tcs05.pdf (journal version, abstract read)
- **Status:** CORRECTED. The title you gave is the journal title. The TACAS 2004 paper has a longer title ending "without Widenings and Narrowings". Venues and years were right.
- **Core result:** The first polynomial-time algorithm for a general class of integer range constraints. It computes the optimal (least) solution of the fixpoint equations, so precise range analysis for this class needs neither widening nor narrowing.

#### 11. `campos2012`
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

#### 12. `rodrigues2013`
- **Authors:** Raphael Ernani Rodrigues, Victor Hugo Sperle Campos, Fernando Magno Quintão Pereira
- **Title:** A fast and low-overhead technique to secure programs against integer overflows
- **Venue:** Proceedings of the 2013 IEEE/ACM International Symposium on Code Generation and Optimization (CGO '13), Shenzhen, February 2013, pp. 1–11
- **DOI:** https://doi.org/10.1109/CGO.2013.6494996
- **Confirmed at:** https://homepages.dcc.ufmg.br/~fernando/publications/papers/CGO13_raphael.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** Uses the range analysis of entry 11 to remove overflow checks that provably cannot fire. It avoids about 25% of the checks (24.93%) and halves the instrumentation overhead; instrumented SPEC programs run 1.73% slower.
- **Scalability:** the interprocedural analysis handles programs with half a million lines of code in under ten seconds, and time and memory grow linearly with program size (R² of 0.967 for time, 0.994 for memory).

#### 13. `oh2012`
- **Authors:** Hakjoo Oh, Kihong Heo, Wonchan Lee, Woosuk Lee, Kwangkeun Yi
- **Title:** Design and implementation of sparse global analyses for C-like languages
- **Venue:** Proceedings of the 33rd ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI '12), Beijing, pp. 229–238
- **DOI:** https://doi.org/10.1145/2254064.2254092
- **Confirmed at:** https://prosys.kaist.ac.kr/publications/pldi12.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** A general method for making an abstract-interpretation analyser sparse without losing precision, for relational as well as non-relational domains.
- **Numbers:** the sparse interval analysis is 5–110x faster than the non-sparse baseline and scales to 1.4M lines of C; the baseline reached 111 KLOC. The sparse octagon analysis is 13–56x faster than its baseline and scales to 130 KLOC.

#### 14. `braun2013`
- **Authors:** Matthias Braun, Sebastian Buchwald, Sebastian Hack, Roland Leißa, Christoph Mallon, Andreas Zwinkau
- **Title:** Simple and Efficient Construction of Static Single Assignment Form
- **Venue:** Compiler Construction (CC 2013), LNCS 7791, Springer, 2013, pp. 102–122
- **DOI:** https://doi.org/10.1007/978-3-642-37051-9_6
- **Confirmed at:** https://c9x.me/compile/bib/braun13cc.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** Builds SSA directly from an AST or bytecode with no prior analysis: no dominance tree and no dominance frontiers. The IR is in SSA form throughout construction. The result is pruned SSA for all programs and minimal SSA for reducible control flow, with running time on par with Cytron et al.

#### 15. `agesen1995`
- **Authors:** Ole Agesen
- **Title:** The Cartesian Product Algorithm: Simple and Precise Type Inference of Parametric Polymorphism
- **Venue:** ECOOP '95 – Object-Oriented Programming, Århus, Denmark, August 1995, LNCS 952, Springer, pp. 2–26
- **DOI:** https://doi.org/10.1007/3-540-49538-X_2
- **Confirmed at:** https://bibliography.selflanguage.org/cpa.html (abstract read)
- **Status:** VERIFIED
- **Core result:** A type inference algorithm for code with parametric polymorphism that is more precise and more efficient than its predecessors and handles inheritance directly. In use in the Self system since late 1993.

#### 16. `chambers1989`
- **Authors:** Craig Chambers, David Ungar
- **Title:** Customization: optimizing compiler technology for SELF, a dynamically-typed object-oriented programming language
- **Venue:** Proceedings of the ACM SIGPLAN 1989 Conference on Programming Language Design and Implementation (PLDI '89), pp. 146–160
- **DOI:** https://doi.org/10.1145/73141.74831
- **Status:** VERIFIED
- **Core result:** The compiler produces several copies of a procedure, each customised to one receiver type, predicts likely types and guards them with run-time tests, and splits calls per control path. With inlining, the abstract says this doubled the performance of dynamically typed object-oriented languages.

#### 17. `holzle1994oopsla`
- **Authors:** Urs Hölzle, David Ungar
- **Title:** A third-generation SELF implementation: reconciling responsiveness with performance
- **Venue:** Proceedings of the Ninth Annual Conference on Object-Oriented Programming Systems, Languages, and Applications (OOPSLA '94), Portland, October 1994, pp. 229–243
- **DOI:** https://doi.org/10.1145/191080.191116
- **Confirmed at:** https://bibliography.selflanguage.org/_static/third-generation.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** SELF-93 pairs a fast non-optimising compiler with a slower optimising one that recompiles hot code. It runs two to three times faster than existing Smalltalk systems while staying responsive.
- **On compilation pauses:** Optimisation normally causes long pauses, which is why interactive systems avoided it. The paper argues pauses must be measured clustered: short pauses in quick succession count as one. Clustering changes the measured distribution by an order of magnitude: fewer than 2% of individual pauses exceed 0.1 s, against 37% of clustered pauses. In a 50-minute interactive session on a SPARCstation-2, 195 clustered pauses exceeded 200 ms and 21 exceeded one second; almost two thirds were under 0.1 s and 97% under one second.

#### 18. `holzle1994pldi`
- **Authors:** Urs Hölzle, David Ungar
- **Title:** Optimizing dynamically-dispatched calls with run-time type feedback
- **Venue:** Proceedings of the ACM SIGPLAN 1994 Conference on Programming Language Design and Implementation (PLDI '94), pp. 326–336
- **DOI:** https://doi.org/10.1145/178243.178478
- **Status:** VERIFIED
- **Core result:** The runtime feeds observed receiver types back to the compiler, which can then inline any dynamically dispatched call. On large SELF applications this cut call frequency by a factor of 3.6 and improved performance by a factor of 1.7.

#### 19. `ancona2007`
- **Authors:** Davide Ancona, Massimo Ancona, Antonio Cuni, Nicholas D. Matsakis
- **Title:** RPython: a step towards reconciling dynamically and statically typed OO languages
- **Venue:** Proceedings of the 2007 Symposium on Dynamic Languages (DLS '07), Montreal, pp. 53–64
- **DOI:** https://doi.org/10.1145/1297081.1297091
- **Confirmed at:** https://llvm.org/pubs/2007-10-DLS-RPython.pdf (full text read)
- **Status:** VERIFIED
- **Core result:** RPython is a statically typed proper subset of Python. Dynamic features are allowed only in an initial bootstrapping phase; the resulting program is then type-inferred and translated to CLI or JVM bytecode.
- **Whole-program inference:** Confirmed. The paper says the flow graph generator and the annotator "perform a global analysis of a program as a whole" from a user-supplied entry point, and that the toolchain "relies on a full-program analysis", so type checking is not compositional and separate compilation is difficult.
- **Translation time:** The PyPy build documentation (https://doc.pypy.org/en/latest/build.html) says translation takes "20 minutes on a fast machine" and needs at least 3 GB of memory on 32-bit and 6 GB on 64-bit, and that building with CPython 2.7 instead of PyPy 2.7 takes two to three times as long. This is the current documentation, not a figure from the 2007 paper.

#### 20. `dufour2006`
- **Authors:** Mark Dufour
- **Title:** Shed Skin: An Optimizing Python-to-C++ Compiler
- **Venue:** Master's thesis, Parallel and Distributed Systems Group, Delft University of Technology, April 19, 2006
- **URL:** original link is dead; archived copy at https://web.archive.org/web/20070705073352/http://mark.dufour.googlepages.com/shedskin.pdf
- **Confirmed at:** thesis title page (rendered and read)
- **Status:** VERIFIED
- **Core result:** A compiler from implicitly statically typed Python to C++ that infers all types for the whole program.
- **Scalability limits:** Confirmed. The current documentation (https://shedskin.readthedocs.io/en/latest/documentation/) states that the type inference techniques "do not scale very well beyond several thousand lines of code" and that the largest compiled program is about 6,000 lines. The project README recommends it for a few hundred to a few thousand lines.
- **Not read from the thesis:** the description of the inference as Agesen's Cartesian Product Algorithm combined with Plevyak's iterative flow analysis. That comes from the Wikipedia article; the thesis PDF text layer is not extractable and I read only its front matter.

#### 21. `szabo2018`
- **Authors:** Tamás Szabó, Gábor Bergmann, Sebastian Erdweg, Markus Voelter
- **Title:** Incrementalizing lattice-based program analyses in Datalog
- **Venue:** Proceedings of the ACM on Programming Languages 2(OOPSLA), Article 139, 2018, 29 pages
- **DOI:** https://doi.org/10.1145/3276509
- **Status:** VERIFIED
- **Core result:** Presents DRedL, an algorithm that incrementally maintains recursive aggregation over custom lattices in Datalog, where earlier incremental frameworks supported only powerset lattices. Built into the IncA framework, strong-update points-to and string analyses for Java react to code changes within milliseconds.

#### 22. `calcagno2009`
- **Authors:** Cristiano Calcagno, Dino Distefano, Peter W. O'Hearn, Hongseok Yang
- **Title:** Compositional shape analysis by means of bi-abduction
- **Venue:** Proceedings of the 36th Annual ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '09), Savannah, pp. 289–300 (extended version: Journal of the ACM 58(6), 2011, https://doi.org/10.1145/2049697.2049700)
- **DOI:** https://doi.org/10.1145/1480881.1480917
- **Confirmed at:** paper PDF (full text read)
- **Status:** VERIFIED
- **Core result:** The first compositional shape analysis: each procedure is analysed independently of its callers, using bi-abduction to infer jointly the missing precondition (anti-frame) and the untouched state (frame).
- **Numbers:** on Linux kernel 2.6.25.4 (2.473 MLOC, 101,330 procedures) it found at least one consistent specification for 59,215 procedures (58.4%) in 6,869 s on one core or 1,739 s on eight, with a one-second timeout per procedure.

#### 23. `gupta1993`
- **Authors:** Rajiv Gupta
- **Title:** Optimizing array bound checks using flow analysis
- **Venue:** ACM Letters on Programming Languages and Systems 2(1–4), March–December 1993, pp. 135–150
- **DOI:** https://doi.org/10.1145/176454.176507
- **Status:** VERIFIED
- **Core result:** Flow analyses that eliminate redundant bound checks and move checks out of loops. The optimised program reports a bound violation if and only if the original would, though possibly at a different point.

#### 24. `markstein1982`
- **Authors:** Victoria Markstein, John Cocke, Peter Markstein
- **Title:** Optimization of range checking
- **Venue:** Proceedings of the 1982 SIGPLAN Symposium on Compiler Construction, pp. 114–119 (also SIGPLAN Notices 17(6), June 1982)
- **DOI:** https://doi.org/10.1145/800230.806986
- **Status:** VERIFIED
- **Core result:** Optimises run-time range checks in frequently executed regions using strength reduction, code motion and common subexpression elimination.

#### 26. `pierce2000`
- **Authors:** Benjamin C. Pierce, David N. Turner
- **Title:** Local type inference
- **Venue:** ACM Transactions on Programming Languages and Systems 22(1), January 2000, pp. 1–44 (earlier version: POPL '98, pp. 252–265)
- **DOI:** https://doi.org/10.1145/345099.345100
- **Status:** VERIFIED
- **Core result:** Two partial inference methods for a language with subtyping and impredicative polymorphism, both local: missing annotations are recovered only from adjacent syntax-tree nodes, with no unification variables. One infers type arguments at polymorphic applications; the other propagates types downward to infer annotations on bound variables.

#### 27. `dunfield2021`
- **Authors:** Jana Dunfield, Neel Krishnaswami
- **Title:** Bidirectional Typing
- **Venue:** ACM Computing Surveys 54(5), pp. 1–38
- **DOI:** https://doi.org/10.1145/3450952 (preprint: https://arxiv.org/abs/1908.05839)
- **Status:** VERIFIED, with a caveat on the year.
- **Year:** Crossref records online publication on 25 May 2021 and a print issue date of 30 June 2022. The arXiv journal reference says 2021. Citing 2021 is defensible; some indexes will show 2022.
- **Core result:** A survey of bidirectional typing, which combines checking against a known type with synthesising a type from a term. Checking handles features where inference is undecidable, synthesis avoids heavy annotation, and error locality improves.
- **Not confirmed:** the article number.

#### 28. `amdahl1967`
- **Authors:** Gene M. Amdahl
- **Title:** Validity of the single processor approach to achieving large scale computing capabilities
- **Venue:** AFIPS Conference Proceedings, vol. 30 (Spring Joint Computer Conference, Atlantic City, April 18–20, 1967), pp. 483–485
- **DOI:** https://doi.org/10.1145/1465482.1465560
- **Confirmed at:** 2007 IEEE Solid-State Circuits Society Newsletter reprint (full text read)
- **Status:** VERIFIED
- **Core result:** Argues that the sequential part of a workload bounds the benefit of parallel processors. The example given is that data-management housekeeping, about 40% of executed instructions and inherently sequential, alone caps throughput at five to seven times the sequential rate.
- **Note:** The paper contains no equations. The formula known as Amdahl's law is a later formalisation; do not attribute the formula itself to this paper.

---

### Specifications, tools and proposals

#### 25. `asmjs2014`
- **Editors:** David Herman, Luke Wagner, Alon Zakai (all Mozilla)
- **Title:** asm.js — Working Draft, 18 August 2014
- **Status:** VERIFIED, with a URL warning.
- **URL warning:** the canonical address `http://asmjs.org/spec/latest/` no longer resolves. The domain returned NXDOMAIN on 2026-11-19. Cite one of these instead:
  - archived rendering: https://web.archive.org/web/20241225233944/http://asmjs.org/spec/latest/
  - specification source: https://github.com/asm-js/spec (`html/index.src.html`)
- **Type annotations in valid JavaScript:** Confirmed. The spec says function parameters "are provided a type annotation by means of an explicit coercion on function entry". Section 5.1 recognises three parameter forms: `x = x|0;` (int), `x = +x;` (double) and `x = f(x);` where `f` is `fround` (float). Section 5.2 does the same for returns: `return +e;` has type double and `return e|0;` has type signed.
- **Other confirmed points:** asm.js is "a strict subset of JavaScript", so the spec defines only validation and the execution semantics are JavaScript's. Validated code is amenable to ahead-of-time compilation with unboxed numbers and no run-time type checks.

#### 29. TypeScript flags and the TC39 proposal

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

#### 30. `mikov2023`
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

#### 31. AssemblyScript and Porffor

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

### Sub-claims not confirmed

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

## Part 2: Code generation and load time


Checked on 2026-11-19 against the web. Each entry was confirmed on at least one authoritative page (Crossref record for the DOI, publisher or repository record, the paper's own text, or official project documentation).

Status values:

- **VERIFIED**: the citation as given matches the sources.
- **CORRECTED**: something in the recalled citation was wrong; the entry says what.
- **UNVERIFIED**: no reliable source found for the claim.

"Evidence" says what was actually read. "Paper text" means the PDF or PostScript of the paper was downloaded and read; "Crossref" means the bibliographic record for the DOI was fetched from api.crossref.org; "search index" means the abstract was seen only as quoted by a search result, because the publisher page refused the fetch.

---

### 1. Wirth, Compiler Construction; Wirth and Gutknecht, Project Oberon

#### `wirth1996`

- **Author:** Niklaus Wirth
- **Title:** Compiler Construction
- **Venue:** Addison-Wesley, 1996, ISBN 0-201-40353-6. Revised editions published online by the author: "Zürich, November 2005" and "Zürich, May 2017" (the copy currently on the author's ETH page, in two PDFs).
- **URL:** https://people.inf.ethz.ch/wirth/CompilerConstruction/index.html (2017 revision); https://c9x.me/compile/bib/wirthcc.pdf (2005 revision)
- **Status:** VERIFIED
- **Evidence:** Text of both online revisions.
- **Core result:** The book builds a complete compiler for Oberon-0, a subset of Oberon, by recursive descent, targeting a simple RISC machine. Chapter 1 contrasts multipass compilers with single-pass ones and says the book concentrates "on the development of an actual single-pass compiler"; a later chapter notes that unknown branch destinations are "a difficulty ... inherent in all single-pass compilers" and solves it with fixups.

#### `wirthgutknecht1992`

- **Authors:** Niklaus Wirth, Jürg Gutknecht
- **Title:** Project Oberon: The Design of an Operating System and Compiler
- **Venue:** Addison-Wesley / ACM Press, 1992, ISBN 0-201-54428-8 (xi + 548 pp. per library catalogue). The 2013 revised edition, free online, is retitled "Project Oberon: The Design of an Operating System, a Compiler, and a Computer".
- **URL:** https://people.inf.ethz.ch/wirth/ProjectOberon/index.html
- **Status:** VERIFIED (your short title is an abbreviation of the full title above)
- **Evidence:** Library catalogue records (BVB, TU München) for the 1992 edition; text of the 2013 edition.
- **Core result:** A book-length description, with full source, of the Oberon system built by the two authors in 1986–89. In the 2013 edition, chapter 12 describes the compiler as a recursive-descent parser (ORP) that calls a code generator (ORG) as each construct is recognised, and refers to it as a single-pass compiler. I read only the 2013 text, not the 1992 printing.

### 2. `wirth1995`

- **Author:** Niklaus Wirth
- **Title:** A Plea for Lean Software
- **Venue:** IEEE Computer 28(2):64–68, February 1995
- **DOI:** 10.1109/2.348001
- **Status:** VERIFIED
- **Evidence:** Crossref; article text (copy at https://berthub.eu/articles/LeanSoftware_text.pdf).
- **Core result:** Argues that software size has grown faster than its function, and offers the Oberon system as a counter-example: designed and implemented from scratch by two people in three years, with a core that "occupies fewer than 200 Kbytes, including editor and compiler". Quotes Reiser's observation that software gets slower faster than hardware gets faster, and closes with nine lessons.

### 3. `nori1974`

- **Authors:** K. V. Nori, U. Ammann, K. Jensen, H. H. Nägeli
- **Title:** The PASCAL "P" compiler: Implementation notes
- **Venue:** ETH Zürich, Department of Computer Science, technical report (Berichte des Instituts für Informatik 10), December 1974, 62 pp.
- **DOI:** 10.3929/ethz-a-000142255 (https://www.research-collection.ethz.ch/handle/20.500.11850/68666)
- **Status:** CORRECTED
- **What was wrong:** The 1974 ETH report has four authors. Jacobi is not among them in the ETH Research Collection record or in DataCite. Ch. Jacobi appears as fifth author on the later reprint: K. V. Nori, U. Ammann, K. Jensen, H. H. Nägeli, Ch. Jacobi, "Pascal-P Implementation Notes", in D. W. Barron (ed.), *Pascal: The Language and its Implementation*, John Wiley, 1981, pp. 125–170 (DBLP listing; Virginia Tech bibliography record). Cite one or the other, not a five-author 1974 report.
- **UNVERIFIED part:** A "revised edition, July 1976" of the ETH report with Jacobi added is often cited in the literature, but I found no library or repository record for it. Do not give "1974–76" as the date unless you can see that edition.
- **Evidence:** ETH Research Collection item record (via its API) and DataCite record; the series name "Berichte des Instituts für Informatik 10" comes from the ETH PDF cover as quoted in a search index and from a comp.compilers bibliography, while the repository record itself labels the series "D-INFK Technical Report".
- **Core result:** I did not read the report text. Pemberton and Daniels (*Pascal Implementation*) call the notes "the official document distributed with the compiler". Wirth's own account in `wirth1996` chapter 1 is that the Pascal compiler of about 1975 emitted P-code, "a sequence of commands of an abstract computer", and the back end was an interpreter "implementable with little effort" on each new machine, at the cost of interpretive speed.

### 4. `turbopascal1983`

- **Product:** Turbo Pascal, Borland; compiler by Anders Hejlsberg; released 20 November 1983.
- **URL:** https://en.wikipedia.org/wiki/Turbo_Pascal (release date cited there to an Embarcadero page); https://prog21.dadgum.com/116.html (size)
- **Status:** release date and authorship VERIFIED; single-pass claim only weakly sourced; size of the 1983 executable UNVERIFIED.
- **Single pass:** Wikipedia states it was fast "because it was a one-pass compiler written in assembly language", with no citation. Darryl K. Taft's eWEEK article "30 Years Ago: Turbo Pascal, BASIC Turn PCs Into Programming Engines" (5 September 2013, https://www.eweek.com/enterprise-apps/30-years-ago-turbo-pascal-basic-turn-pcs-into-programming-engines/) contains the phrases "a fast one-pass compiler" (attributed to Kahn) and a "very simple one-pass compiler" that "compiled directly to in-memory machine code" (about Hejlsberg's earlier compiler). I saw these only in search-result snippets because the page refused the fetch, so check the wording before quoting. I found no primary Borland document that says "one-pass".
- **Size:** The best-sourced figure is 39,731 bytes, and it is for **version 3.02**, not the 1983 release: James Hague, "Things That Turbo Pascal is Smaller Than" (30 October 2011), says "The entire Turbo Pascal 3.02 executable--the compiler and IDE--was 39,731 bytes." This is a blog post, not a primary source. The "about 33 KB" figure for TURBO.COM in version 1.0 turned up only in one blog post ("Inside Turbo Pascal 1.0", levelup.gitconnected.com) that I could not read in full; I could not confirm it from a disk listing or a Borland document.
- **Correction to your version:** "33–39 KB including editor" mixes two versions. Write "39,731 bytes for version 3.02 (compiler and editor), per Hague 2011", and either drop the version 1.0 figure or mark it unverified.

### 5. Threaded code

#### `bell1973`

- **Author:** James R. Bell
- **Title:** Threaded code
- **Venue:** Communications of the ACM 16(6):370–372, June 1973
- **DOI:** 10.1145/362248.362270
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index.
- **Core result:** From the abstract: threaded code "is presented as an alternative to machine language code"; hardware and software realisations are given, and in software it is "interpretive code not needing an interpreter". I did not read the body, so the mechanism is not described here.

#### `dewar1975`

- **Author:** Robert B. K. Dewar
- **Title:** Indirect threaded code
- **Venue:** Communications of the ACM 18(6):330–331, June 1975
- **DOI:** 10.1145/360825.360849
- **Status:** VERIFIED
- **Evidence:** Crossref; fragments of the paper text via search index.
- **Core result:** Dewar says the scheme was developed independently, relates it to Bell's threaded code (hence the name), and claims it needs less space and suits machine-independent implementations better. I did not read the body, so the mechanism is not described here.

### 6. `ertl1995`

- **Author:** M. Anton Ertl
- **Title:** Stack caching for interpreters
- **Venue:** PLDI 1995, pp. 315–327
- **DOI:** 10.1145/207110.207165
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract from the author's copy (https://www.complang.tuwien.ac.at/papers/ertl95pldi.ps.gz).
- **Core result:** Reduces the cost of operand access in stack-machine interpreters by keeping top-of-stack items in machine registers. The static/dynamic distinction is as you recalled: in **dynamic** stack caching the interpreter exists in one specialised version per cache state and each instruction switches to the version for the new state; in **static** stack caching a state machine that tracks the cache state is added to the compiler, which then picks state-specialised instructions, and stack-manipulation instructions are optimised away.

### 7. `ertlgregg2003`

- **Authors:** M. Anton Ertl, David Gregg
- **Title:** The Structure and Performance of Efficient Interpreters
- **Venue:** Journal of Instruction-Level Parallelism 5 (2003), pp. 1–25, published November 2003
- **URL:** https://jilp.org/vol5/v5paper12.pdf
- **Status:** VERIFIED
- **Evidence:** Paper text.
- **Core result:** Efficient interpreters execute many indirect branches (3.2%–13% of executed instructions in their benchmarks), and these can take more than half the run time. With a branch target buffer, threaded code mispredicts 57%–63% of dispatch branches and switch dispatch 81%–98%. A good predictor gives speedups of up to 4.77 over no prediction, and threaded code is up to 2.02 times faster than switch dispatch.

### 8. `proebsting1995`

- **Author:** Todd A. Proebsting
- **Title:** Optimizing an ANSI C interpreter with superoperators
- **Venue:** POPL 1995, pp. 322–332
- **DOI:** 10.1145/199448.199526
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract on the University of Arizona publication page.
- **Core result:** Superoperators are an optimisation for bytecoded interpreters; the paper gives a heuristic for inferring them from the usage patterns of simple operators. The abstract says they "decrease executable size and can double or triple the speed of interpreted programs"; the hybrid translator/interpreter (hti) runs on MIPS R3000 and SPARC.

### 9. `piumarta1998`

- **Authors:** Ian Piumarta, Fabio Riccardi
- **Title:** Optimizing direct threaded code by selective inlining
- **Venue:** PLDI 1998, pp. 291–300
- **DOI:** 10.1145/277650.277743 (Crossref resolves this to the PLDI '98 proceedings record; some indexes carry 10.1145/277652.277743 instead)
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text (PostScript copy at flint.cs.yale.edu).
- **Core result:** A dynamic retranslation technique that turns a common sequence of bytecodes into a single threaded "macro" opcode at run time, described as easy to retrofit to existing virtual machines and needing almost no porting effort. The abstract claims "as much as 70% the performance of optimized C for certain numerical computations"; results are given for a small RISC-like interpreter and for the Objective Caml virtual machine.

### 10. `xu2021`

- **Authors:** Haoran Xu, Fredrik Kjolstad
- **Title:** Copy-and-patch compilation: a fast compilation algorithm for high-level languages and bytecode
- **Venue:** Proc. ACM Program. Lang. 5, OOPSLA, Article 136, 30 pages, October 2021
- **DOI:** 10.1145/3485513
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Code is generated by copying pre-built binary "stencils" from a large library and patching their holes with run-time values. Headline numbers from the abstract: on TPC-H queries it generates code two orders of magnitude faster than LLVM -O0 and three orders faster than higher levels, and the code runs 14% faster than LLVM -O0 output; the WebAssembly compiler generates code 4.9×–6.5× faster than V8 Liftoff, and its code is 39%–63% faster than Liftoff's on Coremark and PolyBenchC.
- **CPython:** Confirmed. PEP 744, "JIT Compilation" (Brandt Bucher and Savannah Ostrowski; Informational; status Draft; created 11 April 2024; Python-Version 3.13; https://peps.python.org/pep-0744/), documents the experimental JIT merged into CPython's main branch and cites this paper as the origin of copy-and-patch. Two details matter for a compiler report: LLVM is a build-time dependency only, and CPython uses the technique "to compile optimized micro-op traces", not base bytecode, unlike "most of the prior art", which uses it as a fast baseline JIT. The JIT is not in the default build.

### 11. `engler1996`

- **Author:** Dawson R. Engler
- **Title:** VCODE: a retargetable, extensible, very fast dynamic code generation system
- **Venue:** PLDI 1996, pp. 160–170
- **DOI:** 10.1145/231379.231411
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract on the author's page (https://pdos.csail.mit.edu/~engler/pldi96-abstract.html).
- **Core result:** VCODE generates machine code "in-place" with no intermediate data structures built or consumed at run time. Reported cost: "approximately ... six to ten instructions per generated instruction", which the abstract puts at over an order of magnitude faster than the most efficient general-purpose code generation system then in the literature. Ports at publication: MIPS, SPARC, Alpha.

### 12. `consel1996`

- **Authors:** Charles Consel, François Noël
- **Title:** A general approach for run-time specialization and its application to C
- **Venue:** POPL 1996, pp. 145–156
- **DOI:** 10.1145/237721.237767
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index only (ACM page refused the fetch).
- **Core result:** From a program and a declaration of its run-time invariants, the system produces source-level templates at compile time and transforms them so that a standard compiler can compile them; at run time, specialisation is reduced to copying compiled templates and filling their holes. I did not see the paper's measurements, so I give no speedup figure.

### 13. `dybvig1990`

- **Authors:** R. Kent Dybvig, Robert Hieb, Tom Butler
- **Title:** Destination-Driven Code Generation
- **Venue:** Indiana University Computer Science Department, Technical Report #302, February 1990
- **URL:** https://hdl.handle.net/2022/34138
- **Status:** VERIFIED
- **Evidence:** IU ScholarWorks record; report text.
- **Core result:** A top-down, one-pass code generator over the syntax tree in which each expression is compiled with a data destination (where its value should go) and a control destination (where execution should continue). The report says this yields code mostly free of unnecessary loads, stores, tests and branches, with no back-patching, so peephole optimisation is typically unnecessary. Illustrated on a subset of C; used in an incremental Scheme compiler.

### 14. `ghuloum2006`

- **Author:** Abdulaziz Ghuloum
- **Title:** An Incremental Approach to Compiler Construction
- **Venue:** Proceedings of the 2006 Scheme and Functional Programming Workshop (Portland, Oregon, 17 September 2006), University of Chicago Technical Report TR-2006-06, pp. 27–37
- **URL:** https://www.schemeworkshop.org/2006/11-ghuloum.pdf
- **Status:** VERIFIED
- **Evidence:** Paper text (page numbers 27–37 are printed on the pages).
- **Core result:** Builds a compiler from a large subset of Scheme to x86 assembly in many small steps, each of which is a complete working compiler for a larger subset and emits real assembly.

### 15. `sethi1970`

- **Authors:** Ravi Sethi, J. D. Ullman
- **Title:** The Generation of Optimal Code for Arithmetic Expressions
- **Venue:** Journal of the ACM 17(4):715–728, October 1970
- **DOI:** 10.1145/321607.321620
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index.
- **Core result:** For a machine with N ≥ 1 registers and no algebraic laws assumed, gives an algorithm that evaluates an expression in the fewest possible instructions (now known as the Sethi–Ullman algorithm), then extends it to commutative and associative operators.

### 16. Linear scan

#### `poletto1999`

- **Authors:** Massimiliano Poletto, Vivek Sarkar
- **Title:** Linear scan register allocation
- **Venue:** ACM TOPLAS 21(5):895–913, September 1999
- **DOI:** 10.1145/330249.330250
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Allocates registers in one greedy pass over the variables' live intervals instead of colouring an interference graph. The paper reports it is up to several times faster than a fast graph-colouring allocator, and the resulting code is within 12% of the speed of code from an aggressive graph-colouring allocator on all but two of their benchmarks.

#### `traub1998`

- **Authors:** Omri Traub, Glenn Holloway, Michael D. Smith
- **Title:** Quality and speed in linear-scan register allocation
- **Venue:** PLDI 1998, pp. 142–151
- **DOI:** 10.1145/277650.277714
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Compares a linear-scan allocator with graph colouring in Machine SUIF and introduces "second-chance binpacking", which lets a spilled value get a register again later. The abstract says linear scan is much faster on programs with many register candidates and that the improvements bring code quality near that of graph colouring while keeping the allocator linear.

### 17. Peephole optimisation

#### `mckeeman1965`

- **Author:** W. M. McKeeman
- **Title:** Peephole optimization
- **Venue:** Communications of the ACM 8(7):443–444, July 1965
- **DOI:** 10.1145/364995.365000
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index.
- **Core result:** Names the technique. From the abstract: redundant instructions may be discarded during the final stage of compilation by a simple optimising technique called peephole optimisation; the method is described with examples.

#### `davidson1980`

- **Authors:** Jack W. Davidson, Christopher W. Fraser
- **Title:** The Design and Application of a Retargetable Peephole Optimizer
- **Venue:** ACM TOPLAS 2(2):191–202, April 1980
- **DOI:** 10.1145/357094.357098
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** PO uses a symbolic machine description to simulate pairs of adjacent instructions and replace them with one equivalent instruction where possible, so the optimiser is machine independent. The paper's conclusion is that a naive code generator can give good code when followed by PO.

### 18. Tanenbaum et al.

#### `tanenbaum1982`

- **Authors:** Andrew S. Tanenbaum, Hans van Staveren, Johan W. Stevenson
- **Title:** Using Peephole Optimization on Intermediate Code
- **Venue:** ACM TOPLAS 4(1):21–36, January 1982
- **DOI:** 10.1145/357153.357155
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index only.
- **Core result:** Describes a table-driven peephole optimiser that works on a stack-machine intermediate code (EM) rather than on object code. The abstract, as quoted by one index, reports "an improvement of about 15 percent, depending on the precise metric used"; I could not open the ACM page to confirm the figure, so treat it as likely but not checked against the paper.

#### `tanenbaum1983`

- **Authors:** Andrew S. Tanenbaum, Hans van Staveren, E. G. Keizer, Johan W. Stevenson
- **Title:** A practical tool kit for making portable compilers
- **Venue:** Communications of the ACM 26(9):654–660, September 1983
- **DOI:** 10.1145/358172.358182
- **Status:** VERIFIED
- **Evidence:** Crossref; text of the version distributed with the kit (https://tack.sourceforge.net/olddocs/toolkit.html), which is a technical-report variant, not the CACM typesetting.
- **Core result:** Describes the Amsterdam Compiler Kit, built on the UNCOL idea that N front ends and M back ends give N languages on M machines with N + M programs. Front ends translate each language to the common stack-machine code EM, which then passes through a peephole optimiser, a global optimiser, a table-driven back end, a target-machine optimiser and a universal assembler/linker.

### 19. Fraser, Hanson, Proebsting

#### `fraser1992`

- **Authors:** Christopher W. Fraser, David R. Hanson, Todd A. Proebsting
- **Title:** Engineering a simple, efficient code-generator generator
- **Venue:** ACM Letters on Programming Languages and Systems 1(3):213–226, September 1992
- **DOI:** 10.1145/151640.151642
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Presents iburg, which reads a burg tree-pattern specification and emits a hard-coded matcher that does dynamic programming at compile time. The abstract gives its size as 200–700 lines of Icon or 950 lines of C, against 3000 lines of C for Twig and 5000 for burg, with matchers up to 25 times faster than Twig's.

#### `fraserhanson1995`

- **Authors:** Christopher W. Fraser, David R. Hanson
- **Title:** A Retargetable C Compiler: Design and Implementation
- **Venue:** Benjamin/Cummings, 1995, ISBN 0-8053-1670-1, xv + 564 pp. (now sold under the Addison-Wesley imprint; Fraser's own CV lists it as Addison-Wesley, 1995)
- **URL:** https://www.pearson.com/store/isbn-redirect/9780805316704
- **Status:** VERIFIED
- **Evidence:** lcc bibliography (ftp.math.utah.edu/pub/tex/bib/lcc.pdf); publisher listing.
- **Core result:** A literate-program presentation of lcc, a retargetable ANSI C compiler; the source for the compiler, three back ends and the code-generator generator is freely available. I did not open the book itself.

### 20. `deutsch1984`

- **Authors:** L. Peter Deutsch, Allan M. Schiffman
- **Title:** Efficient implementation of the Smalltalk-80 system
- **Venue:** POPL 1984, pp. 297–302
- **DOI:** 10.1145/800017.800542
- **Status:** VERIFIED
- **Evidence:** Crossref; scanned paper text (OCR).
- **Core result:** Keeps code and run-time state in more than one representation and converts on demand: virtual-machine code (v-code) is translated at run time to native code (n-code), which is cached and "regenerated rather than paged". Describes the one-element in-line cache for message sends, which they measure as effective about 95% of the time; n-code takes about five times the space of v-code.

### 21. Franz and Kistler; Franz

#### `franz1997`

- **Authors:** Michael Franz, Thomas Kistler
- **Title:** Slim binaries
- **Venue:** Communications of the ACM 40(12):87–94, December 1997
- **DOI:** 10.1145/265563.265576
- **Status:** VERIFIED
- **Evidence:** Crossref for the CACM citation. I read the text of the same-titled precursor, UC Irvine ICS Technical Report 96-24 (June 1996, https://escholarship.org/uc/item/8f41s6q7), not the CACM typesetting; the statements below are from the report.
- **Core result:** Object files hold a compressed syntax-tree encoding instead of native code, and the loader generates native code on the fly. On load speed the report is careful: compression lowers I/O cost "by so much that it can almost compensate for the extra time" of code generation; on the fastest machine measured, loading a whole suite of network applications from slim binaries took about two seconds, "almost twice as much as required for native binaries". So the supported claim is that load-time generation is competitive with native loading, not that it is faster. They also report the generated code is comparable to that of the ETH Oberon compilers, and that slim binaries are smaller than LZW-compressed native code or source.

#### `franz1994`

- **Author:** Michael Steffen Oliver Franz
- **Title:** Code-generation on-the-fly: a key to portable software
- **Venue:** Doctoral thesis, ETH Zürich, Diss. ETH No. 10497, 1994, 99 pp.; referee N. Wirth, co-referee J. Gutknecht. Also published by Verlag der Fachvereine, Zürich, ISBN 3-7281-2115-0.
- **DOI:** 10.3929/ethz-a-000937489
- **Status:** VERIFIED
- **Evidence:** ETH Research Collection item record (via its API); DataCite; abstract as indexed by ProQuest.
- **Core result:** Defers code generation to load time: modules are stored in a machine-independent abstract representation and a code-generating loader creates native code on the fly. Per the abstract, such loading "requires little more time than the input of equivalent native code from a disk storage medium", mainly because the representation is about twice as compact as machine code for a CISC processor. Secondary sources call the representation semantic-dictionary encoding; I did not read the thesis body to check the term.

### 22. Titzer

#### `titzer2022`

- **Author:** Ben L. Titzer
- **Title:** A fast in-place interpreter for WebAssembly
- **Venue:** Proc. ACM Program. Lang. 6, OOPSLA2, Article 148, pp. 646–672, October 2022
- **DOI:** 10.1145/3563311 (preprint arXiv:2205.01183)
- **Status:** VERIFIED
- **Evidence:** Crossref; preprint text.
- **Core result:** Interprets WebAssembly bytecode directly, without rewriting it to another format, using a compact per-function side table that maps branch origins to target offsets with constant-time access. The abstract's claim is that in-place interpretation is space-efficient and performs on par with interpreting a custom internal format. Implemented in the Wizard engine.

#### `titzer2024`

- **Author:** Ben L. Titzer
- **Title:** Whose Baseline Compiler Is It Anyway?
- **Venue:** 2024 IEEE/ACM International Symposium on Code Generation and Optimization (CGO), pp. 207–220
- **DOI:** 10.1109/CGO57630.2024.10444855 (preprint arXiv:2305.13241)
- **Status:** VERIFIED
- **Evidence:** Crossref; preprint text (arXiv v2, 5 November 2023). Numbers below are from the preprint.
- **Core result:** Explains single-pass WebAssembly compilers as one forward abstract interpretation and compares six of them (Wizard-SPC, wazero, wasm-now, wasmer singlepass, V8 Liftoff, SpiderMonkey baseline).
- **The abstract state:** It consists of an abstract value stack, an abstract control stack and register allocation state. Each local and each operand-stack slot has an abstract value recording whether and where the slot has been stored to memory, which register (if any) holds it, and its concrete value if it is a constant. Instructions that only move values (`local.get`, `local.set`, constants) often emit no code and just update this state. At control-flow merges the compiler keeps a snapshot of the state for each label; for a `loop`, whose body has not been seen, it must over-approximate. With this state a single pass can do register allocation, constant and branch folding, strength reduction, some instruction selection, and avoidance of redundant spills.
- **Headline figures:** Wizard-SPC code runs 5× to 28× faster than Wizard's interpreter per benchmark, 10× to 15× on suite averages; the run-time overhead of value tags can be reduced to near zero.

### 23. `haas2017`

- **Authors:** Andreas Haas, Andreas Rossberg, Derek L. Schuff, Ben L. Titzer, Michael Holman, Dan Gohman, Luke Wagner, Alon Zakai, JF Bastien
- **Title:** Bringing the web up to speed with WebAssembly
- **Venue:** PLDI 2017, pp. 185–200
- **DOI:** 10.1145/3062341.3062363
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Presents the design and formal semantics of WebAssembly. Both points confirmed. Control flow is structured: the paper says the constructs ensure "by construction that control flow cannot form irreducible loops" and that these properties "allow WebAssembly code to be validated in a single pass, compiled in a single pass, or even transformed to an SSA-form intermediate form in a single pass". Validation in the four browser implementations uses an abstract control stack, an abstract operand stack with types and a forward program counter, checking bytecodes on the fly with no intermediate representation, at a measured 75–150 MiB/s single-threaded. The paper's wording is "single pass"; it uses "single linear pass" for decoding to SSA.

### 24. `backes2018`

- **Author:** Clemens Backes
- **Title:** Liftoff: a new baseline compiler for WebAssembly in V8
- **Venue:** V8 blog, 20 August 2018
- **URL:** https://v8.dev/blog/liftoff
- **Status:** VERIFIED
- **Evidence:** Page text.
- **Core result:** Liftoff "avoids the time and memory overhead of constructing an IR and generates machine code in a single pass over the bytecode of a WebAssembly function"; "code generation is performed while decoding and validating the function body". It keeps metadata about the operand stack in a "virtual stack" that "exists only during compilation"; each value is either in a register or spilled to the frame, and small integer constants are only recorded, with no code emitted until they are used. At blocks it snapshots the virtual-stack state, and at branches it emits code to adapt the current state to the expected one.
- **Note on wording:** The post says "virtual stack" and "state". It does not use "register cache". The corresponding structure in V8's source is `LiftoffAssembler::CacheState` (src/wasm/baseline/liftoff-assembler.h), so cite the source file, not the blog, if you use the term "cache state".

### 25. `bellard-tcc`

- **Author:** Fabrice Bellard
- **Title:** Tiny C Compiler Reference Documentation, chapter 8 "Developer's guide"
- **URL:** https://bellard.org/tcc/tcc-doc.html
- **Status:** VERIFIED
- **Evidence:** Page text.
- **Core result:** Section 8.3: the parser is hand-coded and "does only one pass", with stated exceptions. Section 8.7.1: "The TCC code generator directly generates linked binary code in one pass", and "No intermediate representation of expression is kept except the current values stored in the value stack". Section 8.7.2: each parsed expression's value is pushed on the value stack (`vstack`, top `vtop`, entries of type `SValue`), where a field says whether the value is a constant, a local, in a register, or in the CPU flags; on x86 three temporary registers are used and one is spilled when more are needed. Section 8.8 lists the optimisations: constant propagation, shifts for some multiplications and divisions, a cache for processor flags, and a "jump target" value for `&&`, `||` and `!`.

### 26. `ierusalimschy2005`

- **Authors:** Roberto Ierusalimschy, Luiz Henrique de Figueiredo, Waldemar Celes
- **Title:** The Implementation of Lua 5.0
- **Venue:** Journal of Universal Computer Science 11(7):1159–1176, 2005
- **DOI:** 10.3217/jucs-011-07-1159 (as listed by J.UCS; copy at https://www.lua.org/doc/jucs05.pdf)
- **Status:** VERIFIED
- **Evidence:** Paper text.
- **Core result:** All three points confirmed. The design goals call for "a fast, smart, one-pass compiler"; "The Lua compiler uses no intermediate representation. It emits instructions for the virtual machine 'on the fly' as it parses a program", delaying code for variables and constants so they can be used directly as operands; and the authors believe Lua 5.0's is "the first register-based virtual machine to have a wide use". The paper also covers the algorithm for tables used as arrays, the implementation of closures, and coroutines.

### 27. `ball2019`

- **Authors:** Thomas Ball, Peli de Halleux, Michał Moskal
- **Title:** Static TypeScript: an implementation of a static compiler for the TypeScript language
- **Venue:** MPLR 2019 (16th ACM SIGPLAN International Conference on Managed Programming Languages and Runtimes, Athens, 21–22 October 2019), pp. 105–116
- **DOI:** 10.1145/3357390.3361032
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text (author copy at https://mmoskal.github.io/pdf/static-typescript.pdf).
- **Core result:** Static TypeScript is a TypeScript subset compiled in the browser to ARM Thumb machine code and linked with a precompiled C++ runtime, running on devices with as little as 16 kB of RAM. Against embedded interpreters (Duktape, IoT.js/JerryScript, MicroPython) it is "well over an order of magnitude faster" on property-access-heavy benchmarks and "about an order of magnitude faster" on combinatorial code; against Node.js it is less than two times slower on the former, several times slower on the latter, and 20 times slower on floating-point code.
- **What the compiler does:** The paper calls its compilation scheme "relatively simple". The TypeScript compiler's typed AST is lowered to a custom IR with constructs desugared to runtime calls, then to Thumb assembly, followed by a simple peephole optimiser whose rules were found by counting 2–3 instruction sequences in generated code (it saves 14% of code size on one large program and a few percent of time). Classes get fields at statically computed offsets and Java-like virtual tables, rather than dynamic maps. The authors' own bytecode VM for the same language is 5–6 times slower than the Thumb output yet still much faster than the interpreters, which they take to suggest that the static memory layout of classes contributes significantly to the speed.

### 28. `dunkels2006`

- **Authors:** Adam Dunkels, Niclas Finne, Joakim Eriksson, Thiemo Voigt
- **Title:** Run-time dynamic linking for reprogramming wireless sensor networks
- **Venue:** SenSys 2006 (4th ACM Conference on Embedded Networked Sensor Systems), pp. 15–28
- **DOI:** 10.1145/1182807.1182810
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text (https://dunkels.com/adam/dunkels06runtime.pdf).
- **Core result:** Implements a linker and loader for standard ELF object files in Contiki and compares its energy cost with an application-specific VM (CVM) and a Java VM. Findings: native code is cheaper to execute but more expensive to ship and link than VM code, so there is a break-even point. For their object-tracking program the CVM version needs about 40,000 iterations (against compact CELF loading) or about 80,000 (against ELF) before interpretation cost exceeds the native version's loading cost; for a vector convolution, native ELF code beats the Java version at 100 iterations and the CVM version at 500. For a small application, replacing the full image costs about 20 times more than a modular update. Their conclusion is that a combination of native and VM code is an energy-efficient choice, with the linker used to update the native part.

### 29. `levis2002`

- **Authors:** Philip Levis, David Culler
- **Title:** Maté: a tiny virtual machine for sensor networks
- **Venue:** ASPLOS X, 2002, pp. 85–95
- **DOI:** 10.1145/605397.605407
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** A bytecode interpreter on TinyOS that fits in 1 KB of RAM and 16 KB of program memory. Programs are split into capsules of up to 24 one-byte instructions that fit in a packet and can forward themselves through the network; complex programs take under 100 bytes. The paper's argument is that for frequently reprogrammed networks the CPU energy spent interpreting is outweighed by the radio energy saved by shipping such small programs.

### 30. Code compression

#### `ernst1997`

- **Authors:** Jens Ernst, William Evans, Christopher W. Fraser, Steven Lucco, Todd A. Proebsting (order as printed on the paper; Crossref lists Proebsting before Lucco)
- **Title:** Code compression
- **Venue:** PLDI 1997, pp. 358–365
- **DOI:** 10.1145/258915.258947
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Describes two compressed program forms. The interpretable form (BRISC) is roughly the size of gzipped x86 code, can be interpreted without decompression, and can be compiled to good machine code at 2.5 megabytes per second on a 120 MHz Pentium. The "wire" form must be decompressed before use but is, for gcc, roughly 21% the size of SPARC code.

#### `fraser1995`

- **Authors:** Christopher W. Fraser, Todd A. Proebsting
- **Title:** Custom Instruction Sets for Code Compression
- **Venue:** Unpublished manuscript, dated 19 October 1995, 9 pp.
- **URL:** https://cwf.github.io/pro/Fraser%20and%20Proebsting.%20Custom%20instruction%20sets%20for%20code%20compression.pdf
- **Status:** VERIFIED, including the "unpublished" status
- **Evidence:** Manuscript text; Fraser's CV lists it under "Other publications" with only the date 10/1995; a February 1996 comp.compilers post by Proebsting calls it "unpublished, submitted to PLDI 96".
- **Core result:** A C compiler (built on lcc and an iburg variant) that, for a given program, generates a custom compact interpreter and bytecode for it. The abstract's figure: in a typical application, the compiler halves its own size.

### 31. `mokhov2018`

- **Authors:** Andrey Mokhov, Neil Mitchell, Simon Peyton Jones
- **Title:** Build systems à la carte
- **Venue:** Proc. ACM Program. Lang. 2, ICFP, Article 79, 29 pages, 2018
- **DOI:** 10.1145/3236774
- **Status:** VERIFIED
- **Evidence:** Crossref; Microsoft Research publication page; first author's page.
- **Core result:** Models a build system as two independent choices, a scheduler (the order in which tasks are built) and a rebuilder (how it decides whether a task must be rebuilt), and shows that Make, Excel, Shake, Bazel and others are points in that grid, with executable Haskell definitions. An extended version appeared in the Journal of Functional Programming 30 (2020).

### 32. `keep2013`

- **Authors:** Andrew W. Keep, R. Kent Dybvig
- **Title:** A nanopass framework for commercial compiler development
- **Venue:** ICFP 2013, pp. 343–350
- **DOI:** 10.1145/2500365.2500618
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Rebuilt the commercial Chez Scheme compiler with the nanopass framework, replacing five of the original ten passes with more than fifty small ones over formally specified intermediate languages. The new compiler's code is on average 15–27% faster, and compile times are "well within a factor of two" of the original, which answers the worry that many passes must be slow.

### 33. `micropython-emitters`

- **Title:** "Maximising MicroPython speed", sections "The Native code emitter" and "The Viper code emitter", MicroPython documentation
- **URL:** https://docs.micropython.org/en/latest/reference/speed_python.html
- **Status:** VERIFIED, with one qualification
- **Evidence:** Page source; micropython.org front page; MicroPython glossary.
- **Viper integers:** Confirmed verbatim: "Integer processing is non-compliant because it uses machine words: arithmetic on 32 bit hardware is performed modulo 2**32." Viper also adds pointer types (`ptr`, `ptr8`, `ptr16`, `ptr32`).
- **Native emitter:** `@micropython.native` "causes the MicroPython compiler to emit native CPU opcodes rather than bytecode"; the page gives the gain as "roughly twice as fast as bytecode" at the cost of larger code.
- **Compiles on the device:** This page does not say where compilation happens. The supporting statements are on https://micropython.org/: "MicroPython is a full Python compiler and runtime that runs on the bare-metal", with "a native emitter that targets machine code directly" among its features. Cite that page for the on-device claim. The glossary notes that code can also be precompiled on a PC with the cross-compiler.

### 34. `devicescript`

- **Title:** DeviceScript: TypeScript for Tiny IoT Devices
- **Publisher:** Microsoft (labelled "Experimental Project from Microsoft Research")
- **URL:** https://github.com/microsoft/devicescript ; documentation at https://microsoft.github.io/devicescript
- **Status:** VERIFIED
- **Evidence:** Repository README; GitHub API record; repository page banner; InfoWorld article of 13 June 2023.
- **What it is:** A TypeScript subset for microcontrollers (ESP32, RP2040). The README says it "is compiled to a custom VM bytecode, which can run in very constrained environments"; so yes, a bytecode VM, not native compilation. InfoWorld reported the VM as about 10 KB of code.
- **Dates and status:** Repository created 14 March 2022; public coverage from mid-2023; last release v2.16.4 on 19 April 2024; last push 24 October 2024. The repository is archived and read-only; the banner on the live page gives the archive date as 8 December 2025. The project is no longer maintained.

### 35. `moddable-preload`

- **Title:** Using XS Preload to Optimize Applications (Moddable SDK documentation; revised 18 June 2026)
- **URL:** https://www.moddable.com/documentation/xs/preload
- **Status:** VERIFIED
- **Evidence:** Document source; "XS Linker Warnings" page.
- **Core result:** "Preloading executes parts of a JavaScript application during the build process, before the application is downloaded to the target device." The module body runs in the XS linker on the build machine, and the resulting objects and closures are stored in flash (ROM), which shortens start-up and moves that memory out of RAM. Modules are listed in the manifest's `preload` array. Because the build machine is not the target, a preloaded module body cannot call native functions (a build error). Objects in flash can still be modified, through a pointer XS keeps in RAM, unless they are frozen; XS freezes the prototypes of preloaded classes automatically and the document recommends freezing data to save that RAM.

### 36. `wamr-modes`

- **Title:** WebAssembly Micro Runtime (Bytecode Alliance): README, `product-mini/README.md`, `doc/build_wamr.md`
- **URL:** https://github.com/bytecodealliance/wasm-micro-runtime ; https://github.com/bytecodealliance/wasm-micro-runtime/blob/main/product-mini/README.md ; https://github.com/bytecodealliance/wasm-micro-runtime/blob/main/doc/build_wamr.md
- **Status:** VERIFIED, with a correction to the list of modes
- **Evidence:** The three documents' source text.
- **Modes:** The official text lists six, not four: "fast interpreter, classi[c] interpreter, AOT, LLVM JIT, Fast JIT and Multi-tier JIT". On Linux the fast interpreter and AOT are enabled by default and JIT is off.
- **Stated ratios:** "The fast interpreter runs ~2X faster than classic interpreter, but consumes about 2X memory to hold the pre-compiled code." Fast JIT "gains ~50% performance of AOT". AOT and JIT are described only as "near to native speed". Multi-tier JIT starts in Fast JIT and switches to LLVM JIT code as it becomes available. Text sizes on Cortex-M4F: about 58.9 K for the fast interpreter, 56.3 K for the classic interpreter, 29.4 K for the AOT runtime.
- **A second figure exists:** An Intel article by the WAMR authors ("A fast WebAssembly Interpreter design in WASM-Micro-Runtime", updated 7 October 2021) gives the fast interpreter as about 150% faster on CoreMark for about 30% more memory, which differs from the "2X memory" in the build documentation. Say which source you quote.

---

### Summary

36 numbered entries, 45 individual works.

- **VERIFIED:** 34 entries (43 works).
- **CORRECTED:** 1 entry (#3, author list and date of the Pascal-P report).
- **UNVERIFIED:** 1 entry in part (#4, the size of the 1983 Turbo Pascal executable; the single-pass claim rests on secondary sources).

Smaller points that differ from the recalled version, inside entries otherwise verified:

- #1: full title of the 1992 book is "Project Oberon: The Design of an Operating System and Compiler".
- #4: the 39,731-byte figure belongs to Turbo Pascal 3.02, not to the 1983 release.
- #10: PEP 744 is an Informational PEP in Draft status; CPython applies copy-and-patch to optimised micro-op traces, not to base bytecode.
- #18: the "about 15 percent" figure for `tanenbaum1982` was seen only in a search index.
- #21: slim-binary loading is reported as almost twice as slow as native loading on the fastest machine tested, described as competitive, not faster; and that text was read in the 1996 technical report, not the CACM article.
- #24: the Liftoff post says "virtual stack"; "cache state" is a V8 source-code name.
- #33: the cited MicroPython page does not state that compilation happens on the device; micropython.org does.
- #36: WAMR documents six running modes.

## Part 3: Isolation, types and asynchrony


Checked on 2026-11-19 against the web. Each entry was confirmed against at least one of: publisher metadata deposited with Crossref (DOI records), OpenAlex copies of publisher abstracts, the paper's own text (author- or venue-hosted PDF), the author's or project's page, or official documentation.

Limits of this check:

- DBLP and the Springer, ACM DL, ScienceDirect and HAL landing pages refused scripted access (bot checks or HTTP 403), so they were not used directly. Bibliographic data for those items comes from the Crossref DOI record plus a second source named in the entry.
- "Result" lines state only what the cited source says. Where the publisher abstract could not be read, the entry says which source the summary rests on.
- Article numbers for PACMPL and TOPLAS papers were not checked; pages are given as Crossref lists them.

Status values: VERIFIED (matches the recollection), CORRECTED (the recollection was wrong or incomplete; the difference is stated), UNVERIFIED (not confirmed).

Counts by numbered entry: 40 VERIFIED, 2 CORRECTED (20, 35), 0 UNVERIFIED. Individual details that could not be confirmed are listed at the end.

---

### 1. `wahbe1993`

- Authors: Robert Wahbe, Steven Lucco, Thomas E. Anderson, Susan L. Graham
- Title: Efficient software-based fault isolation
- Venue: Proceedings of the 14th ACM Symposium on Operating Systems Principles (SOSP '93), December 1993, pp. 203–216. Also ACM SIGOPS Operating Systems Review 27(5).
- Link: https://doi.org/10.1145/168619.168635 (author copy: https://homes.cs.washington.edu/~tom/pubs/sfi.pdf)
- Status: VERIFIED
- Result: An untrusted module is loaded into its own fault domain inside the host's address space, and its object code is rewritten so that it cannot write or jump outside that domain. The paper states that "sandboxing incurs an average of 4% execution time overhead on both the DECstation and the Alpha"; Table 1 gives an average of 4.3% on each platform. A cross-fault-domain call takes roughly 1.1 µs on a DECstation 5000/240 and 0.8 µs on a DEC Alpha 400 (figures read from a scanned copy), which the paper calls more than an order of magnitude faster than any existing RPC system.

### 2. `yee2009`

- Authors: Bennet Yee, David Sehr, Gregory Dardyk, J. Bradley Chen, Robert Muth, Tavis Ormandy, Shiki Okasaka, Neha Narula, Nicholas Fullagar
- Title: Native Client: A Sandbox for Portable, Untrusted x86 Native Code
- Venue: 2009 30th IEEE Symposium on Security and Privacy, May 2009, pp. 79–93
- Link: https://doi.org/10.1109/SP.2009.25 (PDF: https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/34913.pdf)
- Status: VERIFIED
- Result: Untrusted x86 code must follow alignment and control-flow rules, and a static validator confirms before execution that the rules were followed (reliable disassembly, no unsafe instructions, control-flow integrity, no data access outside the sandbox). This keeps the compiler toolchain outside the trusted code base; the validator "requires less than 600 C statements". On SPEC2000 the worst-case overhead is about 12% (crafty), with the other benchmarks averaging about 5%.

### 3. `morrisett2012`

- Authors: Greg Morrisett, Gang Tan, Joseph Tassarotti, Jean-Baptiste Tristan, Edward Gan
- Title: RockSalt: better, faster, stronger SFI for the x86
- Venue: Proceedings of the 33rd ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI '12), June 2012, pp. 395–404
- Link: https://doi.org/10.1145/2254064.2254111
- Status: VERIFIED
- Result: A replacement for the Native Client checker for 32-bit x86, built from table-driven DFAs that are generated from a declarative description and proved correct against a Coq model of an x86 subset. The verified checker is "only about 80 lines of Coq code" (hand-translated to under 100 lines of C) and "checks roughly 1M instructions per second".

### 4. `johnson2021`

- Authors: Evan Johnson, David Thien, Yousef Alhessi, Shravan Narayan, Fraser Brown, Sorin Lerner, Tyler McMullen, Stefan Savage, Deian Stefan
- Title: Доверя́й, но проверя́й: SFI safety for native-compiled Wasm
- Venue: Network and Distributed System Security Symposium (NDSS) 2021, 21–25 February 2021
- Link: https://doi.org/10.14722/ndss.2021.24078 (https://www.ndss-symposium.org/ndss-paper/доверяй-но-проверяй-sfi-safety-for-native-compiled-wasm/)
- Status: VERIFIED (the recollection gave no title; the title is the Russian proverb "trust, but verify" followed by the English subtitle)
- Result: VeriWasm is a static, offline verifier that checks the x86-64 binaries produced by the Lucet WebAssembly compiler for SFI safety (memory isolation and control flow confined to the sandbox), so the compiler does not have to be trusted. The verifier's soundness proof is mechanised in Coq. The evaluation covers two Wasm-sandboxed Firefox libraries and 103 Fastly client binaries, and the abstract reports that it detects bugs with no false positives.

### 5. `bosamiya2022`

- Authors: Jay Bosamiya, Wen Shih Lim, Bryan Parno
- Title: Provably-Safe Multilingual Software Sandboxing using WebAssembly
- Venue: 31st USENIX Security Symposium (USENIX Security 22), August 2022, pp. 1975–1992. Distinguished Paper Award.
- Link: https://www.usenix.org/conference/usenixsecurity22/presentation/bosamiya
- Status: VERIFIED
- Result: Two Wasm-to-native sandboxing compilers with safety arguments: vWasm, written and machine-checked in F*, and rWasm, which compiles Wasm to safe Rust so that sandbox safety rests on Rust's guarantees (with an informal proof). The authors report performance comparable to standard, unverified approaches.

### 6. `morrisett1998` / `morrisett1999`

- Authors: Greg Morrisett, David Walker, Karl Crary, Neal Glew
- Title: From System F to typed assembly language
- Venue: (a) Proceedings of the 25th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '98), pp. 85–97. (b) ACM Transactions on Programming Languages and Systems 21(3), May 1999, pp. 527–568.
- Link: https://doi.org/10.1145/268946.268954 (POPL); https://doi.org/10.1145/319301.319345 (TOPLAS)
- Status: VERIFIED
- Result: Defines a typed assembly language (TAL) based on a conventional RISC assembly language and gives a type-preserving compiler from System F to it, as a sequence of typed transformations that includes CPS and closure conversion. Well-typed TAL code cannot violate the abstractions of the source language, so the compiler output can be checked for safety without trusting the compiler.

### 7. `necula1997` and `necula1996`

- `necula1997`: George C. Necula. Proof-carrying code. Proceedings of the 24th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '97), pp. 106–119. https://doi.org/10.1145/263699.263712
- `necula1996`: George C. Necula, Peter Lee. Safe kernel extensions without run-time checking. Proceedings of the Second USENIX Symposium on Operating Systems Design and Implementation (OSDI '96), October 1996, pp. 229–243. https://doi.org/10.1145/238721.238781
- Status: VERIFIED (both)
- Result: The code producer ships a formal proof that the code obeys a safety policy published by the host; the host validates the proof instead of trusting the producer or adding run-time checks. In the OSDI paper, hand-written DEC Alpha packet filters carry such proofs and run "with no run-time overhead, beyond a one-time cost of 1 to 3 milliseconds for validating the enclosed proofs".

### 8. `hunt2007` and `bershad1995`

- `hunt2007`: Galen C. Hunt, James R. Larus. Singularity: rethinking the software stack. ACM SIGOPS Operating Systems Review 41(2), April 2007, pp. 37–49. https://doi.org/10.1145/1243418.1243424
- `bershad1995`: Brian N. Bershad, Stefan Savage, Przemysław Pardyak, Emin Gün Sirer, Marc E. Fiuczynski, David Becker, Craig Chambers, Susan Eggers. Extensibility, safety and performance in the SPIN operating system. Proceedings of the 15th ACM Symposium on Operating Systems Principles (SOSP '95), pp. 267–283. Also OSR 29(5). https://doi.org/10.1145/224056.224077
- Status: VERIFIED (both)
- Result (Singularity): Processes are isolated by language safety and verification instead of hardware protection. A software-isolated process (SIP) is a "closed object space": no other SIP can modify or directly reach its objects, and SIPs communicate by transferring exclusive ownership of data over contract-based channels. The paper's Table 1 lists a kernel API call at 80 CPU cycles on Singularity against 437 on Linux, and process creation at 388,000 cycles against 719,000 on Linux.
- Result (SPIN): Extensions are written in the type-safe language Modula-3 and dynamically linked into the kernel. Language and link-time mechanisms export fine-grained interfaces to them, which gives extensions rapid access to system services while protecting the kernel code that shares their address space.

### 9. `levy2017`

- Authors: Amit Levy, Bradford Campbell, Branden Ghena, Daniel B. Giffin, Pat Pannuto, Prabal Dutta, Philip Levis
- Title: Multiprogramming a 64kB Computer Safely and Efficiently (ACM metadata prints "64kB"; the paper's title page prints "64 kB")
- Venue: Proceedings of the 26th Symposium on Operating Systems Principles (SOSP '17), October 2017, pp. 234–251
- Link: https://doi.org/10.1145/3132747.3132786 (PDF: https://www.tockos.org/assets/papers/tock-sosp2017.pdf)
- Status: VERIFIED, with one caveat on the parenthetical
- Result: Tock has two isolation mechanisms. Kernel components ("capsules") are confined at compile time by Rust's type system and scheduled cooperatively. Processes are preemptively scheduled, may be written in any language, and are memory-isolated by the hardware memory protection unit (MPU) of Cortex-M microcontrollers.
- Caveat: the paper's text contains no mention of RISC-V or PMP. PMP is how later Tock ports to RISC-V implement the same kernel MPU interface; cite the Tock documentation for that (https://docs.tockos.org/riscv/pmp, "Adapter from a generic PMP implementation exposing TOR-type regions to the Tock mpu::MPU trait"), not this paper.

### 10. `amar2023`

- Authors: Saar Amar, David Chisnall, Tony Chen, Nathaniel Wesley Filardo, Ben Laurie, Kunyan Liu, Robert Norton, Simon W. Moore, Yucong Tao, Robert N. M. Watson, Hongyan Xia
- Title: CHERIoT: Complete Memory Safety for Embedded Devices
- Venue: 56th Annual IEEE/ACM International Symposium on Microarchitecture (MICRO '23), October 2023, pp. 641–653
- Link: https://doi.org/10.1145/3613424.3614266 (PDF: https://cheriot.org/papers/2023-micro-cheriot-uarch.pdf)
- Status: VERIFIED
- Result: An adaptation of the CHERI capability architecture for small RISC-V cores, co-designed with an RTOS, that gives fine-grained compartments and memory safety that is deterministic, not probabilistic. In the paper's Table 2, an Ibex RV32E core is 26,988 gates; adding a 16-entry PMP gives 55,905 (2.07×), and CHERIoT capabilities with the load filter and background revoker give 61,422 (2.28×), which the text describes as a little under 10% more area than the PMP baseline.

### 11. `feeley1993`

- Authors: Marc Feeley
- Title: Polling efficiently on stock hardware
- Venue: Proceedings of the Conference on Functional Programming Languages and Computer Architecture (FPCA '93), July 1993, pp. 179–187
- Link: https://doi.org/10.1145/165180.165205 (author copy: http://www.iro.umontreal.ca/~feeley/papers/FeeleyFPCA93.pdf)
- Status: VERIFIED
- Result: "Balanced polling" places interrupt checks so that no more than a fixed number of instructions run between checks, which bounds interrupt latency at low cost. The abstract reports that call-return polling (a check at every procedure entry and exit) costs typically 70% more, and sometimes over 400% more, than balanced polling; the paper's measurements give an average overhead of about 15% for balanced polling when the latency bound is above 50 instructions.

### 12. `erlang-reductions`

- Source: Erlang/OTP documentation, `erlang:bump_reductions/1`, and the emulator source
- Link: https://www.erlang.org/doc/apps/erts/erlang.html#bump_reductions/1 ; https://github.com/erlang/otp/blob/master/erts/emulator/beam/erl_vm.h
- Status: VERIFIED
- Result: The documentation says: "In the Beam emulator, the reduction counter is normally incremented by one for each function and BIF call. A context switch is forced when the counter reaches the maximum number of reductions for a process (4000 reductions in Erlang/OTP 19.2 and later)." The source defines `#define CONTEXT_REDS 4000 /* Swap process out after this number */`. The value used before OTP 19.2 (often quoted as 2000) was not checked.

### 13. `gay2003`

- Authors: David Gay, Philip Levis, Robert von Behren, Matt Welsh, Eric Brewer, David Culler
- Title: The nesC language: A holistic approach to networked embedded systems
- Venue: Proceedings of the ACM SIGPLAN 2003 Conference on Programming Language Design and Implementation (PLDI '03), pp. 1–11
- Link: https://doi.org/10.1145/781131.781133
- Status: VERIFIED (all four parenthetical claims are in the paper)
- Result: The paper states that "nesC is a 'static language': There is no dynamic memory allocation and the call-graph is fully known at compile-time", and that function pointers are also prohibited. These restrictions allow whole-program analysis: compile-time data-race detection, whole-program inlining and dead-code elimination. Long-latency operations are split-phase: a command returns immediately and completion is signalled later by an event.

### 14. `hill2000`

- Authors: Jason Hill, Robert Szewczyk, Alec Woo, Seth Hollar, David Culler, Kristofer Pister
- Title: System architecture directions for networked sensors
- Venue: Proceedings of the Ninth International Conference on Architectural Support for Programming Languages and Operating Systems (ASPLOS IX), November 2000, pp. 93–104
- Link: https://doi.org/10.1145/378993.379006
- Status: VERIFIED
- Result: Introduces TinyOS, a tiny event-driven operating system for sensor nodes. The abstract states that it "fits in 178 bytes of memory, propagates events in the time it takes to copy 1.25 bytes of memory, context switches in the time it takes to copy 6 bytes of memory and supports two level scheduling"; the evaluation attributes the 178 bytes to the scheduler.

### 15. `dunkels2006`

- Authors: Adam Dunkels, Oliver Schmidt, Thiemo Voigt, Muneeb Ali
- Title: Protothreads: simplifying event-driven programming of memory-constrained embedded systems
- Venue: Proceedings of the 4th International Conference on Embedded Networked Sensor Systems (SenSys '06), pp. 29–42
- Link: https://doi.org/10.1145/1182807.1182811
- Status: VERIFIED
- Result: Protothreads let event-driven code be written in a sequential, thread-like style without a stack per thread. The abstract gives "a memory overhead of only two bytes per protothread"; the paper specifies two bytes on the MSP430 and three bytes on the AVR, the size of the stored continuation point. Rewriting existing state-machine programs reduced lines of code by one third.

### 16. `adya2002`

- Authors: Atul Adya, Jon Howell, Marvin Theimer, William J. Bolosky, John R. Douceur
- Title: Cooperative Task Management without Manual Stack Management (the paper adds the subtitle "or, Event-driven Programming is Not the Opposite of Threaded Programming")
- Venue: Proceedings of the 2002 USENIX Annual Technical Conference, Monterey, California, June 10–15, 2002
- Link: https://www.usenix.org/conference/2002-usenix-annual-technical-conference/cooperative-task-management-without-manual-stack
- Status: VERIFIED. Page numbers are not shown on the USENIX page; the commonly cited range (289–302) was not confirmed.
- Result: Separates task management (cooperative or preemptive) from stack management (manual or automatic) and shows that cooperative scheduling can be combined with automatic stack management. Section 3.2 coins the term: when a function must yield for I/O, it and its callers have to be split into continuation-passing pieces, and "We call this phenomenon 'stack ripping' and see it as the primary drawback to manual stack management."

### 17. `lauer1979`

- Authors: Hugh C. Lauer, Roger M. Needham
- Title: On the duality of operating system structures
- Venue: ACM SIGOPS Operating Systems Review 13(2), April 1979, pp. 3–19. This is a reprint of a paper presented at the Second International Symposium on Operating Systems, IRIA, October 1978.
- Link: https://doi.org/10.1145/850657.850658
- Status: VERIFIED (both years in the recollection are right: 1978 presentation, 1979 reprint)
- Result: Message-oriented systems (few static processes, explicit messages) and procedure-oriented systems (many small processes, shared data with locks) are duals: a system built in one style has a direct counterpart in the other. The abstract concludes that neither model is inherently preferable and that the choice should follow the machine architecture, not the application.

### 18. `santanna2013` and `santos2018`

- `santanna2013`: Francisco Sant'Anna, Noemi Rodriguez, Roberto Ierusalimschy, Olaf Landsiedel, Philippas Tsigas. Safe system-level concurrency on resource-constrained nodes. Proceedings of the 11th ACM Conference on Embedded Networked Sensor Systems (SenSys '13), November 2013, pp. 1–14 (per-article pagination). https://doi.org/10.1145/2517351.2517360
- `santos2018`: Rodrigo C. M. Santos, Guilherme F. Lima, Francisco Sant'Anna, Roberto Ierusalimschy, Edward H. Haeusler. A memory-bounded, deterministic and terminating semantics for the synchronous programming language Céu. Proceedings of the 19th ACM SIGPLAN/SIGBED International Conference on Languages, Compilers, and Tools for Embedded Systems (LCTES '18), June 2018, pp. 1–18. https://doi.org/10.1145/3211332.3211334
- Status: VERIFIED (both)
- Result (2013): Céu is a synchronous language for sensor nodes whose compile-time analysis yields deterministic and memory-safe concurrent programs, at the price of excluding long computations and hard real-time response. Ports of network protocols and a CC2420 radio driver were shorter than the nesC versions, "with a penalty of memory increase below 10%".
- Result (2018): Gives a small-step structural operational semantics for Céu and proves that reactions are memory-bounded, deterministic and terminating: "for a given arbitrary timeline of input events, multiple executions of the same program always react in bounded time and arrive at the same final finite memory state". An extended version with a different author order (Lima, Santos, Ierusalimschy, Haeusler, Sant'Anna) is in Journal of Systems Architecture 97 (2019), pp. 239–257, https://doi.org/10.1016/j.sysarc.2019.01.014.

### 19. `berry1992`

- Authors: Gérard Berry, Georges Gonthier
- Title: The Esterel synchronous programming language: design, semantics, implementation
- Venue: Science of Computer Programming 19(2), November 1992, pp. 87–152
- Link: https://doi.org/10.1016/0167-6423(92)90005-V
- Status: VERIFIED (bibliographic data). The publisher abstract could not be read; the summary below rests on the Semantic Scholar record for this DOI and a search-engine summary of the paper text.
- Result: Esterel is a deterministic concurrent language for reactive systems built on the synchrony hypothesis, under which a program's outputs are treated as simultaneous with its inputs. The paper presents the language's imperative and temporal primitives, gives its mathematical semantics, and describes how the Esterel v2 and v3 compilers translate concurrent programs into equivalent sequential automata.

### 20. `hammond2003`

- Authors: Kevin Hammond, Greg Michaelson
- Title: Hume: A Domain-Specific Language for Real-Time Embedded Systems
- Venue: Generative Programming and Component Engineering (GPCE 2003), Lecture Notes in Computer Science 2830, Springer, 2003, pp. 37–56
- Link: https://doi.org/10.1007/978-3-540-39815-8_3 (authors' preprint: https://www.macs.hw.ac.uk/~greg/publications/hm.gpce03.ps)
- Status: CORRECTED
- What was wrong: the level between FSM-Hume and PR-Hume is HO-Hume, not "Template-Hume". Figure 1 of the paper ("Hume Design Space", read in the authors' preprint) lists, from least to most expressive: HW-Hume (no functions, non-recursive data structures), FSM-Hume (non-recursive first-order functions, non-recursive data structures), HO-Hume (non-recursive higher-order functions, non-recursive data structures), PR-Hume (primitive recursive functions), Full Hume (full recursion). The paper does use the word "template", but for box templates in its metaprogramming layer.
- Second caveat: the paper does not tabulate decidable properties per level. It says only that each level "adds expressibility to the expression semantics, but either loses some desirable property or increases the technical difficulty of providing formal correctness/cost models", and it gives a stack-and-heap cost model for FSM-Hume. The per-level properties are stated on the Hume project page at Heriot-Watt (https://www.macs.hw.ac.uk/~greg/hume/): HW-Hume has "decidable equivalence and termination, and predictable time and space behaviour"; FSM-Hume "has strongly bounded time and space behaviour"; HO-Hume adds higher-order functions "with known cost models"; PR-Hume adds "user-defined primitive recursive bounded functions"; "full Hume is a Turing Complete language". Cite that page, not the GPCE paper, for these properties.

### 21. `reynolds1972` and `danvy2001`

- `reynolds1972`: John C. Reynolds. Definitional interpreters for higher-order programming languages. Proceedings of the ACM Annual Conference (ACM '72), Boston, 1972, volume 2, pp. 717–740. https://doi.org/10.1145/800194.805852. Reprinted in Higher-Order and Symbolic Computation 11(4), 1998, pp. 363–397, https://doi.org/10.1023/A:1010027404223.
- `danvy2001`: Olivier Danvy, Lasse R. Nielsen. Defunctionalization at work. Proceedings of the 3rd ACM SIGPLAN International Conference on Principles and Practice of Declarative Programming (PPDP '01), September 2001, pp. 162–174. https://doi.org/10.1145/773184.773202
- Status: VERIFIED (both)
- Result: Reynolds classifies interpreters by whether they use higher-order functions and whether evaluation order in the defined language depends on that of the defining language, and derives one kind from another by constructive transformations. Danvy and Nielsen study that derivation as a technique in its own right: defunctionalization is "a whole-program transformation from higher-order to first-order functional programs", and they use it to connect higher-order and first-order specifications.

### 22. `bierman2012`

- Authors: Gavin Bierman, Claudio Russo, Geoffrey Mainland, Erik Meijer, Mads Torgersen
- Title: Pause 'n' Play: Formalizing Asynchronous C♯
- Venue: ECOOP 2012 – Object-Oriented Programming, Lecture Notes in Computer Science 7313, Springer, 2012, pp. 233–257
- Link: https://doi.org/10.1007/978-3-642-31057-7_12
- Status: VERIFIED (abstract read from a university repository record of the paper)
- Result: Describes the async/await feature of C# 5.0 and gives it a precise mathematical semantics that is abstract, avoiding the compiler-generated state machines, yet concrete enough to state and prove implementation properties.

### 23. `embassy-docs`

- Source: Embassy project documentation and repository README
- Link: https://embassy.dev/book/ (executor section); https://github.com/embassy-rs/embassy/blob/main/README.md ; https://github.com/embassy-rs/embassy/blob/main/embassy-executor/README.md
- Status: VERIFIED
- Result: The project README and home page state: "Tasks get transformed at compile time into state machines that get run cooperatively. It requires no dynamic memory allocation and runs on a single stack, so no per-task stack size tuning is required." The executor documentation lists "No `alloc`, no heap needed" and "Tasks are statically allocated"; the executor README adds that each task gets its own `static` whose size is computed at compile time, so running out of task memory is a link-time error and not a run-time one.

### 24. `tofte1997`

- Authors: Mads Tofte, Jean-Pierre Talpin
- Title: Region-Based Memory Management
- Venue: Information and Computation 132(2), February 1997, pp. 109–176
- Link: https://doi.org/10.1006/inco.1996.2613
- Status: VERIFIED (bibliographic data). The publisher abstract could not be read; the summary rests on the authors' later retrospective (Tofte, Birkedal, Elsman, Hallenberg, Higher-Order and Symbolic Computation 17(3), 2004) and the Semantic Scholar record.
- Result: The store is a stack of regions, and every value, including closures, is put into a region. A type-and-effect analysis (region inference) annotates the program with where each region is allocated and deallocated, so memory is reclaimed without a garbage collector; the paper proves the scheme sound for a skeletal language extracted from Standard ML.

### 25. `grossman2002`

- Authors: Dan Grossman, Greg Morrisett, Trevor Jim, Michael Hicks, Yanling Wang, James Cheney
- Title: Region-based memory management in Cyclone
- Venue: Proceedings of the ACM SIGPLAN 2002 Conference on Programming Language Design and Implementation (PLDI '02), pp. 282–293
- Link: https://doi.org/10.1145/512529.512563
- Status: VERIFIED
- Result: Cyclone is a type-safe language derived from C whose static region system supports region subtyping and integrates with stack allocation and a garbage collector; default annotations and local inference keep the annotation burden light. The abstract reports that porting legacy C required changing about 8% of the code, and only 6% of those changes were region annotations.

### 26. `reinking2021`

- Authors: Alex Reinking, Ningning Xie, Leonardo de Moura, Daan Leijen
- Title: Perceus: garbage free reference counting with reuse
- Venue: Proceedings of the 42nd ACM SIGPLAN International Conference on Programming Language Design and Implementation (PLDI 2021), pp. 96–111
- Link: https://doi.org/10.1145/3453483.3454032
- Status: VERIFIED
- Result: Perceus is a compile-time algorithm that inserts precise reference-count operations so that cycle-free programs are "garbage free": only live references are retained. This enables reuse analysis, which turns functional updates into guaranteed in-place updates at run time (the "functional but in-place" style). The paper proves the algorithm sound and garbage free and reports competitive performance in Koka.

### 27. `wadler1990`

- Authors: Philip Wadler
- Title: Linear types can change the world!
- Venue: In M. Broy and C. Jones (eds.), Programming Concepts and Methods (IFIP TC 2 Working Conference, Sea of Galilee, Israel, April 1990), North-Holland, Amsterdam, 1990
- Link: https://homepages.inf.ed.ac.uk/wadler/topics/linear-logic.html
- Status: VERIFIED (author's own publication page). Page numbers are not given there; one secondary bibliography gives a start page of 561, which was not confirmed.
- Result: Proposes a type system for functional languages based on Girard's linear logic. In the author's words, values of a linear type "must be used exactly once: like the world, they cannot be duplicated or destroyed", so they need no reference counting or garbage collection and can safely be updated destructively.

### 28. `strom1986`

- Authors: Robert E. Strom, Shaula Yemini
- Title: Typestate: A programming language concept for enhancing software reliability
- Venue: IEEE Transactions on Software Engineering SE-12(1), January 1986, pp. 157–171
- Link: https://doi.org/10.1109/TSE.1986.6312929
- Status: VERIFIED
- Result: A type fixes which operations an object supports; its typestate fixes which of those are permitted at a given program point. Tracking typestate at compile time detects sequences that are syntactically legal but semantically undefined, such as reading an uninitialised variable or dereferencing a pointer after its object has been freed.

### 29. `honda1993` and `honda2008`

- `honda1993`: Kohei Honda. Types for dyadic interaction. CONCUR '93, Lecture Notes in Computer Science 715, Springer, 1993, pp. 509–523. https://doi.org/10.1007/3-540-57208-2_35
- `honda2008`: Kohei Honda, Nobuko Yoshida, Marco Carbone. Multiparty asynchronous session types. Proceedings of the 35th Annual ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '08), pp. 273–284. https://doi.org/10.1145/1328438.1328472. Journal version: Journal of the ACM 63(1), 2016.
- Status: VERIFIED (both)
- Result (1993): Formulates a typed calculus of name-passing processes in which types describe the composable structure of two-party interaction; the abstract (read from the RIMS Kōkyūroku 851 printing of the same paper) notes that the type discipline yields deadlock freedom for a subset of terms.
- Result (2008): Extends binary session types to several parties communicating asynchronously. A global type describes the whole conversation and is projected onto each participant for local type checking; the paper establishes communication safety, progress and session fidelity.

### 30. `kennedy1994`

- Authors: Andrew Kennedy
- Title: Dimension types
- Venue: Programming Languages and Systems — ESOP '94, Lecture Notes in Computer Science 788, Springer, 1994, pp. 348–362
- Link: https://doi.org/10.1007/3-540-57880-3_23
- Status: VERIFIED (abstract as reported by a search-engine reading of the Springer page; the page itself could not be fetched)
- Result: Extends a strongly typed language with dimension types that may be polymorphic (implemented as an extension of the ML Kit compiler). Every typable expression has a most general type, inferred by an algorithm that uses equational unification over Abelian groups in addition to ordinary unification.

### 31. `tobin2008` and `tobin2010`

- `tobin2008`: Sam Tobin-Hochstadt, Matthias Felleisen. The design and implementation of Typed Scheme. Proceedings of the 35th Annual ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '08), pp. 395–406. https://doi.org/10.1145/1328438.1328486
- `tobin2010`: Sam Tobin-Hochstadt, Matthias Felleisen. Logical types for untyped languages. Proceedings of the 15th ACM SIGPLAN International Conference on Functional Programming (ICFP '10), pp. 117–128. https://doi.org/10.1145/1863543.1863561
- Status: VERIFIED (both)
- Result: Typed Scheme is an explicitly typed sister language of PLT Scheme built on occurrence typing, which gives different occurrences of a variable different subtypes depending on the predicates tested before them. The 2010 paper reformulates this: the type system assigns "variable occurrences a subtype of their declared type based on the predicates prior to the occurrence", so existing Scheme code can be typed with few changes.

### 32. `xi1998`

- Authors: Hongwei Xi, Frank Pfenning
- Title: Eliminating array bound checking through dependent types
- Venue: Proceedings of the ACM SIGPLAN 1998 Conference on Programming Language Design and Implementation (PLDI '98), pp. 249–257
- Link: https://doi.org/10.1145/277650.277732
- Status: VERIFIED
- Result: Conservatively extends Standard ML with a restricted form of dependent types so that array bound checks and list tag checks can be proved unnecessary and removed. Type checking stays decidable.

### 33. `rondon2008` and `lehmann2023`

- `rondon2008`: Patrick M. Rondon, Ming Kawaguchi, Ranjit Jhala. Liquid types. Proceedings of the 29th ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI '08), pp. 159–169. https://doi.org/10.1145/1375581.1375602 (the Crossref record misspells the second author as "Kawaguci"; the paper prints "Kawaguchi")
- `lehmann2023`: Nico Lehmann, Adam T. Geller, Niki Vazou, Ranjit Jhala. Flux: Liquid Types for Rust. Proceedings of the ACM on Programming Languages 7(PLDI), June 2023, pp. 1533–1557. https://doi.org/10.1145/3591283
- Status: VERIFIED (both)
- Result (2008): Logically Qualified Data Types combine Hindley-Milner inference with predicate abstraction to infer dependent (refinement) types automatically from a supplied set of logical qualifiers. On the DML array benchmarks the DSOLVE tool "reduces the amount of manual annotation required for proving safety from 31% of program text to under 1%".
- Result (2023): Flux combines refinement types with Rust's ownership types, so that reasoning about mutable locations is handled by the borrow discipline and loop invariants are inferred. Against the Prusti verifier on the paper's benchmarks, the abstract reports specification lines halved, verification time down by an order of magnitude, and annotation overhead cut from up to 24% of code size (average 14%) to nothing.

### 34. `siek2006` and `takikawa2016`

- `siek2006`: Jeremy G. Siek, Walid Taha. Gradual typing for functional languages. Scheme and Functional Programming Workshop 2006, University of Chicago Technical Report TR-2006-06, September 2006, pp. 81–92. http://www.schemeworkshop.org/2006/13-siek.pdf
- `takikawa2016`: Asumu Takikawa, Daniel Feltey, Ben Greenman, Max S. New, Jan Vitek, Matthias Felleisen. Is sound gradual typing dead? Proceedings of the 43rd Annual ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '16), pp. 456–468. https://doi.org/10.1145/2837614.2837630
- Status: VERIFIED (both)
- Result (2006): Defines a lambda calculus with optional type annotations in which the type checker catches incompatibilities between the known parts of types, and proves the type system sound with respect to the simply typed lambda calculus for fully annotated terms.
- Result (2016): Proposes evaluating gradual typing by measuring every configuration between fully untyped and fully typed for each benchmark. Applied to Typed Racket, the paper concludes that "Typed Racket's cost of soundness is not tolerable": for the suffixtree benchmark "almost all partially typed configurations exhibit slowdowns of up to 105x" (table: maximum 105.27x, mean 53.01x), although its fully typed version runs at 0.7x the untyped time.

### 35. `plotkin2009` and `xie2021`

- `plotkin2009`: Gordon Plotkin, Matija Pretnar. Handlers of Algebraic Effects. Programming Languages and Systems (ESOP 2009), Lecture Notes in Computer Science 5502, Springer, 2009, pp. 80–94. https://doi.org/10.1007/978-3-642-00590-9_7. Extended version: Handling Algebraic Effects, Logical Methods in Computer Science 9(4), 2013.
- `xie2021`: Ningning Xie, Daan Leijen. Generalized evidence passing for effect handlers: efficient compilation of effect handlers to C. Proceedings of the ACM on Programming Languages 5(ICFP), August 2021, 30 pages. https://doi.org/10.1145/3473576
- Status: `plotkin2009` VERIFIED. `xie2021` CORRECTED (minor): the recollection dropped the subtitle "efficient compilation of effect handlers to C"; the venue is the ICFP issue of PACMPL volume 5.
- Result (2009): Gives an algebraic account of exception handlers and generalises it to handlers for any effect described by an algebraic theory (summary rests on the Semantic Scholar record and the abstract of the 2013 extended version, which lists exceptions, state, nondeterminism, interactive input/output and time).
- Result (2021): Derives an efficient compilation scheme for effect handlers through a sequence of refinements: multi-prompt delimited control, generalised evidence passing, yield bubbling, and finally a monadic translation into plain lambda calculus. It is implemented as a Haskell library and as the C backend of Koka.

### 36. `boruch2023`

- Authors: Aleksander Boruch-Gruszecki, Martin Odersky, Edward Lee, Ondřej Lhoták, Jonathan Brachthäuser
- Title: Capturing Types
- Venue: ACM Transactions on Programming Languages and Systems 45(4), November 2023, 52 pages
- Link: https://doi.org/10.1145/3618003
- Status: VERIFIED
- Result: Presents CC<:□, a calculus in which a type records the free variables (capabilities) its values capture. Tracking captured variables in types is enough to implement effects and effect polymorphism safely through scoped capabilities, and the paper shows how it guides the implementation of capture checking in a practical language.

### 37. `miller2006` and `dennis1966`

- `miller2006`: Mark Samuel Miller. Robust Composition: Towards a Unified Approach to Access Control and Concurrency Control. PhD dissertation, Johns Hopkins University, Baltimore, Maryland, May 2006. http://www.erights.org/talks/thesis/
- `dennis1966`: Jack B. Dennis, Earl C. Van Horn. Programming semantics for multiprogrammed computations. Communications of the ACM 9(3), March 1966, pp. 143–155. https://doi.org/10.1145/365230.365252
- Status: VERIFIED (both)
- Result (2006): Extends object-style composition to concurrent, mutually suspicious components spread over untrusted machines, using the E language and the CapDesk desktop as worked examples.
- Result (1966): Defines the supervisor operations of a multiprogrammed system. Each computation runs within a sphere of protection "specified by a list of capabilities or C-list", where "each capability in a C-list locates by means of a pointer some computing object, and indicates the actions that the computation may perform with respect to that object".

### 38. `hofmann2003` and `hughes1996`

- `hofmann2003`: Martin Hofmann, Steffen Jost. Static prediction of heap space usage for first-order functional programs. Proceedings of the 30th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '03), pp. 185–197. https://doi.org/10.1145/604131.604148
- `hughes1996`: John Hughes, Lars Pareto, Amr Sabry. Proving the correctness of reactive systems using sized types. Proceedings of the 23rd ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '96), pp. 410–423. https://doi.org/10.1145/237721.240882
- Status: VERIFIED (both)
- Result (2003): A type system with resource annotations yields linear upper bounds on the heap consumption of first-order functional programs; the annotations are inferred automatically by linear programming.
- Result (1996): Types carry bounds on the sizes of recursive data structures. Checking them detects deadlock, non-termination and similar errors in embedded reactive programs.

### 39. `lucassen1988`

- Authors: J. M. Lucassen, D. K. Gifford
- Title: Polymorphic effect systems
- Venue: Proceedings of the 15th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '88), pp. 47–57
- Link: https://doi.org/10.1145/73560.73564
- Status: VERIFIED
- Result: Introduces a kinded type system with three base kinds: types (what an expression returns), effects (what side effects it may have) and regions (where in the store those effects occur). The effect information tells a compiler which expressions may be scheduled in parallel.

### 40. `wasm-component-model`

- Source: WebAssembly Component Model specification and Bytecode Alliance documentation
- Link: https://component-model.bytecodealliance.org/design/wit.html ; https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md ; https://github.com/WebAssembly/component-model/blob/main/design/mvp/Explainer.md
- Status: VERIFIED
- Result: A `resource` "defines a new abstract type for a resource, which is an entity with a lifetime that can only be passed around indirectly via handle values" (WIT.md). There are two handle types. An `own` handle implies "unique ownership of the resource"; when it is dropped the resource is destroyed (Explainer). A `borrow` handle is "a temporary loan of a handle from the caller to the callee for the duration of the call" (WIT.md): the callee must drop it before returning, and it may not appear in a function result.
- Syntax note: `own` and `borrow` are the handle type constructors of the component model's type grammar, written `(own $T)` and `(borrow $T)`. In the current WIT.md grammar an owned handle is written as the bare resource name and only the borrowed form has explicit syntax, `borrow<T>`; the string `own<` does not occur in WIT.md.

### 41. `attapl2005`

- Editor: Benjamin C. Pierce
- Title: Advanced Topics in Types and Programming Languages
- Publisher: The MIT Press, Cambridge, Massachusetts. Copyright 2005 (the Crossref record carries an online date of 23 December 2004). ISBN 0-262-16228-8.
- Link: https://www.cis.upenn.edu/~bcpierce/attapl/ (table of contents: https://www.cis.upenn.edu/~bcpierce/attapl/frontmatter.pdf); https://doi.org/10.7551/mitpress/1104.001.0001
- Status: VERIFIED (chapter titles, authors and pages read from the book's front matter and the Crossref chapter records)
- Chapters asked for:
  - Chapter 1, "Substructural Type Systems", David Walker, pp. 3–44 (Part I, Precise Type Analyses)
  - Chapter 3, "Effect Types and Region-Based Memory Management", Fritz Henglein, Henning Makholm, Henning Niss, pp. 87–136 (Part I)
  - Chapter 4, "Typed Assembly Language", Greg Morrisett, pp. 141–176 (Part II, Types for Low-Level Languages)
  - Chapter 5, "Proof-Carrying Code", George Necula, pp. 177–220 (Part II)
- Note: effect types and region-based memory management are one chapter, not two.

### 42. `esp32p4`

- Sources: (a) ESP32-P4 Series Datasheet, pre-release v0.7, https://www.espressif.com/sites/default/files/documentation/esp32-p4_datasheet_en.pdf. (b) ESP32-P4 Technical Reference Manual, Version 1.0, Chapter 2 "High-Performance CPU", https://www.espressif.com/sites/default/files/documentation/esp32-p4_technical_reference_manual_en.pdf. (c) ESP-IDF master branch, https://github.com/espressif/esp-idf/blob/master/components/esp_tee/Kconfig.projbuild and https://github.com/espressif/esp-idf/blob/master/docs/conf_common.py. All read on 2026-11-19.
- Status: VERIFIED
- Privilege modes: machine and user only; no supervisor mode.
  - Datasheet §4.1.1.1, HP CPU feature list: "Machine and User privilege modes".
  - TRM, HP CPU feature list: "User (U) privilege mode execution" and "Interrupt delegation to user mode".
  - TRM, `misa` register: "U User mode implemented = 1. (RO)" and "S Supervisor mode implemented = 0. (RO)".
  - TRM, `mstatus.MPP`: "0x0: User mode 0x3: Machine mode".
- PMP entries: 32, plus 16 entries of a separate custom attribute checker (PMA).
  - Datasheet §4.1.1.1: "Up to 32 PMP regions and 16 PMA regions".
  - TRM feature list: "Standard physical memory protection (PMP) configurable up to 32 regions and custom attributes (PMA) configurable up to 16 regions for security".
  - TRM §2.10.1.2: "Up to 32 PMP entries", "Minimum address granularity of 128 bytes", address matching modes OFF, TOR and NAPOT (NA4 not supported). §2.10.1.3: "PMP CSRs can only be programmed in machine mode."
  - The TRM register summary lists `pmpcfg0`–`pmpcfg7` and "pmpaddrn (n: 0-31)", which is consistent with 32 entries. Two sentences in the same section still say "the enabled 16 pmpcfgX and pmpaddrX registers" and "implements all pmpcfg0-3 and pmpaddr0-15 CSRs"; these contradict the feature lists and the register summary and look like leftover text.
- ESP-TEE support: not for the ESP32-P4 as of ESP-IDF master on 2026-11-19.
  - `components/esp_tee/Kconfig.projbuild`: `menu "ESP-TEE (Trusted Execution Environment)"` / `depends on IDF_TARGET_ESP32C6 || IDF_TARGET_ESP32H2 || IDF_TARGET_ESP32C5 || IDF_TARGET_ESP32C61`.
  - `docs/conf_common.py`: `ESP_TEE_TARGETS = ['esp32c6', 'esp32h2', 'esp32c5', 'esp32c61']`.
  - The ESP-TEE documentation page exists for esp32c6, esp32h2 and esp32c5 and returns "Page Not Found" for esp32p4 (https://docs.espressif.com/projects/esp-idf/en/latest/esp32p4/security/tee/index.html).
- Do not confuse this with the chip's hardware: the datasheet block diagram does show a "TEE" block and "PMP and PMA", and §4.1.4.11 describes an access permission management (APM) module. The hardware has the mechanisms; the ESP-IDF ESP-TEE framework does not list the P4 as a target.

---

### Details that were not confirmed

- Entry 16 (`adya2002`): page numbers. The USENIX record gives none.
- Entry 27 (`wadler1990`): page numbers. The author's page gives none.
- Entry 19 (`berry1992`), entry 24 (`tofte1997`), entry 30 (`kennedy1994`), entry 35 (`plotkin2009`): the publisher abstract could not be fetched; each entry names the secondary source its summary rests on.
- Entry 20 (`hammond2003`): the level names were read from the authors' preprint, not from the Springer final version.
- Entry 12: the pre-OTP-19.2 reduction count.
- Entry 18 (`santanna2013`), entry 35 (`xie2021`), entry 36 (`boruch2023`): ACM article numbers.

