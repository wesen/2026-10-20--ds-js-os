# Bibliography check 02: code generation and load time

Checked on 2026-11-19 against the web. Each entry was confirmed on at least one authoritative page (Crossref record for the DOI, publisher or repository record, the paper's own text, or official project documentation).

Status values:

- **VERIFIED**: the citation as given matches the sources.
- **CORRECTED**: something in the recalled citation was wrong; the entry says what.
- **UNVERIFIED**: no reliable source found for the claim.

"Evidence" says what was actually read. "Paper text" means the PDF or PostScript of the paper was downloaded and read; "Crossref" means the bibliographic record for the DOI was fetched from api.crossref.org; "search index" means the abstract was seen only as quoted by a search result, because the publisher page refused the fetch.

---

## 1. Wirth, Compiler Construction; Wirth and Gutknecht, Project Oberon

### `wirth1996`

- **Author:** Niklaus Wirth
- **Title:** Compiler Construction
- **Venue:** Addison-Wesley, 1996, ISBN 0-201-40353-6. Revised editions published online by the author: "Zürich, November 2005" and "Zürich, May 2017" (the copy currently on the author's ETH page, in two PDFs).
- **URL:** https://people.inf.ethz.ch/wirth/CompilerConstruction/index.html (2017 revision); https://c9x.me/compile/bib/wirthcc.pdf (2005 revision)
- **Status:** VERIFIED
- **Evidence:** Text of both online revisions.
- **Core result:** The book builds a complete compiler for Oberon-0, a subset of Oberon, by recursive descent, targeting a simple RISC machine. Chapter 1 contrasts multipass compilers with single-pass ones and says the book concentrates "on the development of an actual single-pass compiler"; a later chapter notes that unknown branch destinations are "a difficulty ... inherent in all single-pass compilers" and solves it with fixups.

### `wirthgutknecht1992`

- **Authors:** Niklaus Wirth, Jürg Gutknecht
- **Title:** Project Oberon: The Design of an Operating System and Compiler
- **Venue:** Addison-Wesley / ACM Press, 1992, ISBN 0-201-54428-8 (xi + 548 pp. per library catalogue). The 2013 revised edition, free online, is retitled "Project Oberon: The Design of an Operating System, a Compiler, and a Computer".
- **URL:** https://people.inf.ethz.ch/wirth/ProjectOberon/index.html
- **Status:** VERIFIED (your short title is an abbreviation of the full title above)
- **Evidence:** Library catalogue records (BVB, TU München) for the 1992 edition; text of the 2013 edition.
- **Core result:** A book-length description, with full source, of the Oberon system built by the two authors in 1986–89. In the 2013 edition, chapter 12 describes the compiler as a recursive-descent parser (ORP) that calls a code generator (ORG) as each construct is recognised, and refers to it as a single-pass compiler. I read only the 2013 text, not the 1992 printing.

## 2. `wirth1995`

- **Author:** Niklaus Wirth
- **Title:** A Plea for Lean Software
- **Venue:** IEEE Computer 28(2):64–68, February 1995
- **DOI:** 10.1109/2.348001
- **Status:** VERIFIED
- **Evidence:** Crossref; article text (copy at https://berthub.eu/articles/LeanSoftware_text.pdf).
- **Core result:** Argues that software size has grown faster than its function, and offers the Oberon system as a counter-example: designed and implemented from scratch by two people in three years, with a core that "occupies fewer than 200 Kbytes, including editor and compiler". Quotes Reiser's observation that software gets slower faster than hardware gets faster, and closes with nine lessons.

## 3. `nori1974`

- **Authors:** K. V. Nori, U. Ammann, K. Jensen, H. H. Nägeli
- **Title:** The PASCAL "P" compiler: Implementation notes
- **Venue:** ETH Zürich, Department of Computer Science, technical report (Berichte des Instituts für Informatik 10), December 1974, 62 pp.
- **DOI:** 10.3929/ethz-a-000142255 (https://www.research-collection.ethz.ch/handle/20.500.11850/68666)
- **Status:** CORRECTED
- **What was wrong:** The 1974 ETH report has four authors. Jacobi is not among them in the ETH Research Collection record or in DataCite. Ch. Jacobi appears as fifth author on the later reprint: K. V. Nori, U. Ammann, K. Jensen, H. H. Nägeli, Ch. Jacobi, "Pascal-P Implementation Notes", in D. W. Barron (ed.), *Pascal: The Language and its Implementation*, John Wiley, 1981, pp. 125–170 (DBLP listing; Virginia Tech bibliography record). Cite one or the other, not a five-author 1974 report.
- **UNVERIFIED part:** A "revised edition, July 1976" of the ETH report with Jacobi added is often cited in the literature, but I found no library or repository record for it. Do not give "1974–76" as the date unless you can see that edition.
- **Evidence:** ETH Research Collection item record (via its API) and DataCite record; the series name "Berichte des Instituts für Informatik 10" comes from the ETH PDF cover as quoted in a search index and from a comp.compilers bibliography, while the repository record itself labels the series "D-INFK Technical Report".
- **Core result:** I did not read the report text. Pemberton and Daniels (*Pascal Implementation*) call the notes "the official document distributed with the compiler". Wirth's own account in `wirth1996` chapter 1 is that the Pascal compiler of about 1975 emitted P-code, "a sequence of commands of an abstract computer", and the back end was an interpreter "implementable with little effort" on each new machine, at the cost of interpretive speed.

## 4. `turbopascal1983`

- **Product:** Turbo Pascal, Borland; compiler by Anders Hejlsberg; released 20 November 1983.
- **URL:** https://en.wikipedia.org/wiki/Turbo_Pascal (release date cited there to an Embarcadero page); https://prog21.dadgum.com/116.html (size)
- **Status:** release date and authorship VERIFIED; single-pass claim only weakly sourced; size of the 1983 executable UNVERIFIED.
- **Single pass:** Wikipedia states it was fast "because it was a one-pass compiler written in assembly language", with no citation. Darryl K. Taft's eWEEK article "30 Years Ago: Turbo Pascal, BASIC Turn PCs Into Programming Engines" (5 September 2013, https://www.eweek.com/enterprise-apps/30-years-ago-turbo-pascal-basic-turn-pcs-into-programming-engines/) contains the phrases "a fast one-pass compiler" (attributed to Kahn) and a "very simple one-pass compiler" that "compiled directly to in-memory machine code" (about Hejlsberg's earlier compiler). I saw these only in search-result snippets because the page refused the fetch, so check the wording before quoting. I found no primary Borland document that says "one-pass".
- **Size:** The best-sourced figure is 39,731 bytes, and it is for **version 3.02**, not the 1983 release: James Hague, "Things That Turbo Pascal is Smaller Than" (30 October 2011), says "The entire Turbo Pascal 3.02 executable--the compiler and IDE--was 39,731 bytes." This is a blog post, not a primary source. The "about 33 KB" figure for TURBO.COM in version 1.0 turned up only in one blog post ("Inside Turbo Pascal 1.0", levelup.gitconnected.com) that I could not read in full; I could not confirm it from a disk listing or a Borland document.
- **Correction to your version:** "33–39 KB including editor" mixes two versions. Write "39,731 bytes for version 3.02 (compiler and editor), per Hague 2011", and either drop the version 1.0 figure or mark it unverified.

## 5. Threaded code

### `bell1973`

- **Author:** James R. Bell
- **Title:** Threaded code
- **Venue:** Communications of the ACM 16(6):370–372, June 1973
- **DOI:** 10.1145/362248.362270
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index.
- **Core result:** From the abstract: threaded code "is presented as an alternative to machine language code"; hardware and software realisations are given, and in software it is "interpretive code not needing an interpreter". I did not read the body, so the mechanism is not described here.

### `dewar1975`

- **Author:** Robert B. K. Dewar
- **Title:** Indirect threaded code
- **Venue:** Communications of the ACM 18(6):330–331, June 1975
- **DOI:** 10.1145/360825.360849
- **Status:** VERIFIED
- **Evidence:** Crossref; fragments of the paper text via search index.
- **Core result:** Dewar says the scheme was developed independently, relates it to Bell's threaded code (hence the name), and claims it needs less space and suits machine-independent implementations better. I did not read the body, so the mechanism is not described here.

## 6. `ertl1995`

- **Author:** M. Anton Ertl
- **Title:** Stack caching for interpreters
- **Venue:** PLDI 1995, pp. 315–327
- **DOI:** 10.1145/207110.207165
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract from the author's copy (https://www.complang.tuwien.ac.at/papers/ertl95pldi.ps.gz).
- **Core result:** Reduces the cost of operand access in stack-machine interpreters by keeping top-of-stack items in machine registers. The static/dynamic distinction is as you recalled: in **dynamic** stack caching the interpreter exists in one specialised version per cache state and each instruction switches to the version for the new state; in **static** stack caching a state machine that tracks the cache state is added to the compiler, which then picks state-specialised instructions, and stack-manipulation instructions are optimised away.

## 7. `ertlgregg2003`

- **Authors:** M. Anton Ertl, David Gregg
- **Title:** The Structure and Performance of Efficient Interpreters
- **Venue:** Journal of Instruction-Level Parallelism 5 (2003), pp. 1–25, published November 2003
- **URL:** https://jilp.org/vol5/v5paper12.pdf
- **Status:** VERIFIED
- **Evidence:** Paper text.
- **Core result:** Efficient interpreters execute many indirect branches (3.2%–13% of executed instructions in their benchmarks), and these can take more than half the run time. With a branch target buffer, threaded code mispredicts 57%–63% of dispatch branches and switch dispatch 81%–98%. A good predictor gives speedups of up to 4.77 over no prediction, and threaded code is up to 2.02 times faster than switch dispatch.

## 8. `proebsting1995`

- **Author:** Todd A. Proebsting
- **Title:** Optimizing an ANSI C interpreter with superoperators
- **Venue:** POPL 1995, pp. 322–332
- **DOI:** 10.1145/199448.199526
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract on the University of Arizona publication page.
- **Core result:** Superoperators are an optimisation for bytecoded interpreters; the paper gives a heuristic for inferring them from the usage patterns of simple operators. The abstract says they "decrease executable size and can double or triple the speed of interpreted programs"; the hybrid translator/interpreter (hti) runs on MIPS R3000 and SPARC.

## 9. `piumarta1998`

- **Authors:** Ian Piumarta, Fabio Riccardi
- **Title:** Optimizing direct threaded code by selective inlining
- **Venue:** PLDI 1998, pp. 291–300
- **DOI:** 10.1145/277650.277743 (Crossref resolves this to the PLDI '98 proceedings record; some indexes carry 10.1145/277652.277743 instead)
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text (PostScript copy at flint.cs.yale.edu).
- **Core result:** A dynamic retranslation technique that turns a common sequence of bytecodes into a single threaded "macro" opcode at run time, described as easy to retrofit to existing virtual machines and needing almost no porting effort. The abstract claims "as much as 70% the performance of optimized C for certain numerical computations"; results are given for a small RISC-like interpreter and for the Objective Caml virtual machine.

## 10. `xu2021`

- **Authors:** Haoran Xu, Fredrik Kjolstad
- **Title:** Copy-and-patch compilation: a fast compilation algorithm for high-level languages and bytecode
- **Venue:** Proc. ACM Program. Lang. 5, OOPSLA, Article 136, 30 pages, October 2021
- **DOI:** 10.1145/3485513
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Code is generated by copying pre-built binary "stencils" from a large library and patching their holes with run-time values. Headline numbers from the abstract: on TPC-H queries it generates code two orders of magnitude faster than LLVM -O0 and three orders faster than higher levels, and the code runs 14% faster than LLVM -O0 output; the WebAssembly compiler generates code 4.9×–6.5× faster than V8 Liftoff, and its code is 39%–63% faster than Liftoff's on Coremark and PolyBenchC.
- **CPython:** Confirmed. PEP 744, "JIT Compilation" (Brandt Bucher and Savannah Ostrowski; Informational; status Draft; created 11 April 2024; Python-Version 3.13; https://peps.python.org/pep-0744/), documents the experimental JIT merged into CPython's main branch and cites this paper as the origin of copy-and-patch. Two details matter for a compiler report: LLVM is a build-time dependency only, and CPython uses the technique "to compile optimized micro-op traces", not base bytecode, unlike "most of the prior art", which uses it as a fast baseline JIT. The JIT is not in the default build.

## 11. `engler1996`

- **Author:** Dawson R. Engler
- **Title:** VCODE: a retargetable, extensible, very fast dynamic code generation system
- **Venue:** PLDI 1996, pp. 160–170
- **DOI:** 10.1145/231379.231411
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract on the author's page (https://pdos.csail.mit.edu/~engler/pldi96-abstract.html).
- **Core result:** VCODE generates machine code "in-place" with no intermediate data structures built or consumed at run time. Reported cost: "approximately ... six to ten instructions per generated instruction", which the abstract puts at over an order of magnitude faster than the most efficient general-purpose code generation system then in the literature. Ports at publication: MIPS, SPARC, Alpha.

## 12. `consel1996`

- **Authors:** Charles Consel, François Noël
- **Title:** A general approach for run-time specialization and its application to C
- **Venue:** POPL 1996, pp. 145–156
- **DOI:** 10.1145/237721.237767
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index only (ACM page refused the fetch).
- **Core result:** From a program and a declaration of its run-time invariants, the system produces source-level templates at compile time and transforms them so that a standard compiler can compile them; at run time, specialisation is reduced to copying compiled templates and filling their holes. I did not see the paper's measurements, so I give no speedup figure.

## 13. `dybvig1990`

- **Authors:** R. Kent Dybvig, Robert Hieb, Tom Butler
- **Title:** Destination-Driven Code Generation
- **Venue:** Indiana University Computer Science Department, Technical Report #302, February 1990
- **URL:** https://hdl.handle.net/2022/34138
- **Status:** VERIFIED
- **Evidence:** IU ScholarWorks record; report text.
- **Core result:** A top-down, one-pass code generator over the syntax tree in which each expression is compiled with a data destination (where its value should go) and a control destination (where execution should continue). The report says this yields code mostly free of unnecessary loads, stores, tests and branches, with no back-patching, so peephole optimisation is typically unnecessary. Illustrated on a subset of C; used in an incremental Scheme compiler.

## 14. `ghuloum2006`

- **Author:** Abdulaziz Ghuloum
- **Title:** An Incremental Approach to Compiler Construction
- **Venue:** Proceedings of the 2006 Scheme and Functional Programming Workshop (Portland, Oregon, 17 September 2006), University of Chicago Technical Report TR-2006-06, pp. 27–37
- **URL:** https://www.schemeworkshop.org/2006/11-ghuloum.pdf
- **Status:** VERIFIED
- **Evidence:** Paper text (page numbers 27–37 are printed on the pages).
- **Core result:** Builds a compiler from a large subset of Scheme to x86 assembly in many small steps, each of which is a complete working compiler for a larger subset and emits real assembly.

## 15. `sethi1970`

- **Authors:** Ravi Sethi, J. D. Ullman
- **Title:** The Generation of Optimal Code for Arithmetic Expressions
- **Venue:** Journal of the ACM 17(4):715–728, October 1970
- **DOI:** 10.1145/321607.321620
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index.
- **Core result:** For a machine with N ≥ 1 registers and no algebraic laws assumed, gives an algorithm that evaluates an expression in the fewest possible instructions (now known as the Sethi–Ullman algorithm), then extends it to commutative and associative operators.

## 16. Linear scan

### `poletto1999`

- **Authors:** Massimiliano Poletto, Vivek Sarkar
- **Title:** Linear scan register allocation
- **Venue:** ACM TOPLAS 21(5):895–913, September 1999
- **DOI:** 10.1145/330249.330250
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Allocates registers in one greedy pass over the variables' live intervals instead of colouring an interference graph. The paper reports it is up to several times faster than a fast graph-colouring allocator, and the resulting code is within 12% of the speed of code from an aggressive graph-colouring allocator on all but two of their benchmarks.

### `traub1998`

- **Authors:** Omri Traub, Glenn Holloway, Michael D. Smith
- **Title:** Quality and speed in linear-scan register allocation
- **Venue:** PLDI 1998, pp. 142–151
- **DOI:** 10.1145/277650.277714
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Compares a linear-scan allocator with graph colouring in Machine SUIF and introduces "second-chance binpacking", which lets a spilled value get a register again later. The abstract says linear scan is much faster on programs with many register candidates and that the improvements bring code quality near that of graph colouring while keeping the allocator linear.

## 17. Peephole optimisation

### `mckeeman1965`

- **Author:** W. M. McKeeman
- **Title:** Peephole optimization
- **Venue:** Communications of the ACM 8(7):443–444, July 1965
- **DOI:** 10.1145/364995.365000
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index.
- **Core result:** Names the technique. From the abstract: redundant instructions may be discarded during the final stage of compilation by a simple optimising technique called peephole optimisation; the method is described with examples.

### `davidson1980`

- **Authors:** Jack W. Davidson, Christopher W. Fraser
- **Title:** The Design and Application of a Retargetable Peephole Optimizer
- **Venue:** ACM TOPLAS 2(2):191–202, April 1980
- **DOI:** 10.1145/357094.357098
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** PO uses a symbolic machine description to simulate pairs of adjacent instructions and replace them with one equivalent instruction where possible, so the optimiser is machine independent. The paper's conclusion is that a naive code generator can give good code when followed by PO.

## 18. Tanenbaum et al.

### `tanenbaum1982`

- **Authors:** Andrew S. Tanenbaum, Hans van Staveren, Johan W. Stevenson
- **Title:** Using Peephole Optimization on Intermediate Code
- **Venue:** ACM TOPLAS 4(1):21–36, January 1982
- **DOI:** 10.1145/357153.357155
- **Status:** VERIFIED
- **Evidence:** Crossref; abstract via search index only.
- **Core result:** Describes a table-driven peephole optimiser that works on a stack-machine intermediate code (EM) rather than on object code. The abstract, as quoted by one index, reports "an improvement of about 15 percent, depending on the precise metric used"; I could not open the ACM page to confirm the figure, so treat it as likely but not checked against the paper.

### `tanenbaum1983`

- **Authors:** Andrew S. Tanenbaum, Hans van Staveren, E. G. Keizer, Johan W. Stevenson
- **Title:** A practical tool kit for making portable compilers
- **Venue:** Communications of the ACM 26(9):654–660, September 1983
- **DOI:** 10.1145/358172.358182
- **Status:** VERIFIED
- **Evidence:** Crossref; text of the version distributed with the kit (https://tack.sourceforge.net/olddocs/toolkit.html), which is a technical-report variant, not the CACM typesetting.
- **Core result:** Describes the Amsterdam Compiler Kit, built on the UNCOL idea that N front ends and M back ends give N languages on M machines with N + M programs. Front ends translate each language to the common stack-machine code EM, which then passes through a peephole optimiser, a global optimiser, a table-driven back end, a target-machine optimiser and a universal assembler/linker.

## 19. Fraser, Hanson, Proebsting

### `fraser1992`

- **Authors:** Christopher W. Fraser, David R. Hanson, Todd A. Proebsting
- **Title:** Engineering a simple, efficient code-generator generator
- **Venue:** ACM Letters on Programming Languages and Systems 1(3):213–226, September 1992
- **DOI:** 10.1145/151640.151642
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Presents iburg, which reads a burg tree-pattern specification and emits a hard-coded matcher that does dynamic programming at compile time. The abstract gives its size as 200–700 lines of Icon or 950 lines of C, against 3000 lines of C for Twig and 5000 for burg, with matchers up to 25 times faster than Twig's.

### `fraserhanson1995`

- **Authors:** Christopher W. Fraser, David R. Hanson
- **Title:** A Retargetable C Compiler: Design and Implementation
- **Venue:** Benjamin/Cummings, 1995, ISBN 0-8053-1670-1, xv + 564 pp. (now sold under the Addison-Wesley imprint; Fraser's own CV lists it as Addison-Wesley, 1995)
- **URL:** https://www.pearson.com/store/isbn-redirect/9780805316704
- **Status:** VERIFIED
- **Evidence:** lcc bibliography (ftp.math.utah.edu/pub/tex/bib/lcc.pdf); publisher listing.
- **Core result:** A literate-program presentation of lcc, a retargetable ANSI C compiler; the source for the compiler, three back ends and the code-generator generator is freely available. I did not open the book itself.

## 20. `deutsch1984`

- **Authors:** L. Peter Deutsch, Allan M. Schiffman
- **Title:** Efficient implementation of the Smalltalk-80 system
- **Venue:** POPL 1984, pp. 297–302
- **DOI:** 10.1145/800017.800542
- **Status:** VERIFIED
- **Evidence:** Crossref; scanned paper text (OCR).
- **Core result:** Keeps code and run-time state in more than one representation and converts on demand: virtual-machine code (v-code) is translated at run time to native code (n-code), which is cached and "regenerated rather than paged". Describes the one-element in-line cache for message sends, which they measure as effective about 95% of the time; n-code takes about five times the space of v-code.

## 21. Franz and Kistler; Franz

### `franz1997`

- **Authors:** Michael Franz, Thomas Kistler
- **Title:** Slim binaries
- **Venue:** Communications of the ACM 40(12):87–94, December 1997
- **DOI:** 10.1145/265563.265576
- **Status:** VERIFIED
- **Evidence:** Crossref for the CACM citation. I read the text of the same-titled precursor, UC Irvine ICS Technical Report 96-24 (June 1996, https://escholarship.org/uc/item/8f41s6q7), not the CACM typesetting; the statements below are from the report.
- **Core result:** Object files hold a compressed syntax-tree encoding instead of native code, and the loader generates native code on the fly. On load speed the report is careful: compression lowers I/O cost "by so much that it can almost compensate for the extra time" of code generation; on the fastest machine measured, loading a whole suite of network applications from slim binaries took about two seconds, "almost twice as much as required for native binaries". So the supported claim is that load-time generation is competitive with native loading, not that it is faster. They also report the generated code is comparable to that of the ETH Oberon compilers, and that slim binaries are smaller than LZW-compressed native code or source.

### `franz1994`

- **Author:** Michael Steffen Oliver Franz
- **Title:** Code-generation on-the-fly: a key to portable software
- **Venue:** Doctoral thesis, ETH Zürich, Diss. ETH No. 10497, 1994, 99 pp.; referee N. Wirth, co-referee J. Gutknecht. Also published by Verlag der Fachvereine, Zürich, ISBN 3-7281-2115-0.
- **DOI:** 10.3929/ethz-a-000937489
- **Status:** VERIFIED
- **Evidence:** ETH Research Collection item record (via its API); DataCite; abstract as indexed by ProQuest.
- **Core result:** Defers code generation to load time: modules are stored in a machine-independent abstract representation and a code-generating loader creates native code on the fly. Per the abstract, such loading "requires little more time than the input of equivalent native code from a disk storage medium", mainly because the representation is about twice as compact as machine code for a CISC processor. Secondary sources call the representation semantic-dictionary encoding; I did not read the thesis body to check the term.

## 22. Titzer

### `titzer2022`

- **Author:** Ben L. Titzer
- **Title:** A fast in-place interpreter for WebAssembly
- **Venue:** Proc. ACM Program. Lang. 6, OOPSLA2, Article 148, pp. 646–672, October 2022
- **DOI:** 10.1145/3563311 (preprint arXiv:2205.01183)
- **Status:** VERIFIED
- **Evidence:** Crossref; preprint text.
- **Core result:** Interprets WebAssembly bytecode directly, without rewriting it to another format, using a compact per-function side table that maps branch origins to target offsets with constant-time access. The abstract's claim is that in-place interpretation is space-efficient and performs on par with interpreting a custom internal format. Implemented in the Wizard engine.

### `titzer2024`

- **Author:** Ben L. Titzer
- **Title:** Whose Baseline Compiler Is It Anyway?
- **Venue:** 2024 IEEE/ACM International Symposium on Code Generation and Optimization (CGO), pp. 207–220
- **DOI:** 10.1109/CGO57630.2024.10444855 (preprint arXiv:2305.13241)
- **Status:** VERIFIED
- **Evidence:** Crossref; preprint text (arXiv v2, 5 November 2023). Numbers below are from the preprint.
- **Core result:** Explains single-pass WebAssembly compilers as one forward abstract interpretation and compares six of them (Wizard-SPC, wazero, wasm-now, wasmer singlepass, V8 Liftoff, SpiderMonkey baseline).
- **The abstract state:** It consists of an abstract value stack, an abstract control stack and register allocation state. Each local and each operand-stack slot has an abstract value recording whether and where the slot has been stored to memory, which register (if any) holds it, and its concrete value if it is a constant. Instructions that only move values (`local.get`, `local.set`, constants) often emit no code and just update this state. At control-flow merges the compiler keeps a snapshot of the state for each label; for a `loop`, whose body has not been seen, it must over-approximate. With this state a single pass can do register allocation, constant and branch folding, strength reduction, some instruction selection, and avoidance of redundant spills.
- **Headline figures:** Wizard-SPC code runs 5× to 28× faster than Wizard's interpreter per benchmark, 10× to 15× on suite averages; the run-time overhead of value tags can be reduced to near zero.

## 23. `haas2017`

- **Authors:** Andreas Haas, Andreas Rossberg, Derek L. Schuff, Ben L. Titzer, Michael Holman, Dan Gohman, Luke Wagner, Alon Zakai, JF Bastien
- **Title:** Bringing the web up to speed with WebAssembly
- **Venue:** PLDI 2017, pp. 185–200
- **DOI:** 10.1145/3062341.3062363
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Presents the design and formal semantics of WebAssembly. Both points confirmed. Control flow is structured: the paper says the constructs ensure "by construction that control flow cannot form irreducible loops" and that these properties "allow WebAssembly code to be validated in a single pass, compiled in a single pass, or even transformed to an SSA-form intermediate form in a single pass". Validation in the four browser implementations uses an abstract control stack, an abstract operand stack with types and a forward program counter, checking bytecodes on the fly with no intermediate representation, at a measured 75–150 MiB/s single-threaded. The paper's wording is "single pass"; it uses "single linear pass" for decoding to SSA.

## 24. `backes2018`

- **Author:** Clemens Backes
- **Title:** Liftoff: a new baseline compiler for WebAssembly in V8
- **Venue:** V8 blog, 20 August 2018
- **URL:** https://v8.dev/blog/liftoff
- **Status:** VERIFIED
- **Evidence:** Page text.
- **Core result:** Liftoff "avoids the time and memory overhead of constructing an IR and generates machine code in a single pass over the bytecode of a WebAssembly function"; "code generation is performed while decoding and validating the function body". It keeps metadata about the operand stack in a "virtual stack" that "exists only during compilation"; each value is either in a register or spilled to the frame, and small integer constants are only recorded, with no code emitted until they are used. At blocks it snapshots the virtual-stack state, and at branches it emits code to adapt the current state to the expected one.
- **Note on wording:** The post says "virtual stack" and "state". It does not use "register cache". The corresponding structure in V8's source is `LiftoffAssembler::CacheState` (src/wasm/baseline/liftoff-assembler.h), so cite the source file, not the blog, if you use the term "cache state".

## 25. `bellard-tcc`

- **Author:** Fabrice Bellard
- **Title:** Tiny C Compiler Reference Documentation, chapter 8 "Developer's guide"
- **URL:** https://bellard.org/tcc/tcc-doc.html
- **Status:** VERIFIED
- **Evidence:** Page text.
- **Core result:** Section 8.3: the parser is hand-coded and "does only one pass", with stated exceptions. Section 8.7.1: "The TCC code generator directly generates linked binary code in one pass", and "No intermediate representation of expression is kept except the current values stored in the value stack". Section 8.7.2: each parsed expression's value is pushed on the value stack (`vstack`, top `vtop`, entries of type `SValue`), where a field says whether the value is a constant, a local, in a register, or in the CPU flags; on x86 three temporary registers are used and one is spilled when more are needed. Section 8.8 lists the optimisations: constant propagation, shifts for some multiplications and divisions, a cache for processor flags, and a "jump target" value for `&&`, `||` and `!`.

## 26. `ierusalimschy2005`

- **Authors:** Roberto Ierusalimschy, Luiz Henrique de Figueiredo, Waldemar Celes
- **Title:** The Implementation of Lua 5.0
- **Venue:** Journal of Universal Computer Science 11(7):1159–1176, 2005
- **DOI:** 10.3217/jucs-011-07-1159 (as listed by J.UCS; copy at https://www.lua.org/doc/jucs05.pdf)
- **Status:** VERIFIED
- **Evidence:** Paper text.
- **Core result:** All three points confirmed. The design goals call for "a fast, smart, one-pass compiler"; "The Lua compiler uses no intermediate representation. It emits instructions for the virtual machine 'on the fly' as it parses a program", delaying code for variables and constants so they can be used directly as operands; and the authors believe Lua 5.0's is "the first register-based virtual machine to have a wide use". The paper also covers the algorithm for tables used as arrays, the implementation of closures, and coroutines.

## 27. `ball2019`

- **Authors:** Thomas Ball, Peli de Halleux, Michał Moskal
- **Title:** Static TypeScript: an implementation of a static compiler for the TypeScript language
- **Venue:** MPLR 2019 (16th ACM SIGPLAN International Conference on Managed Programming Languages and Runtimes, Athens, 21–22 October 2019), pp. 105–116
- **DOI:** 10.1145/3357390.3361032
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text (author copy at https://mmoskal.github.io/pdf/static-typescript.pdf).
- **Core result:** Static TypeScript is a TypeScript subset compiled in the browser to ARM Thumb machine code and linked with a precompiled C++ runtime, running on devices with as little as 16 kB of RAM. Against embedded interpreters (Duktape, IoT.js/JerryScript, MicroPython) it is "well over an order of magnitude faster" on property-access-heavy benchmarks and "about an order of magnitude faster" on combinatorial code; against Node.js it is less than two times slower on the former, several times slower on the latter, and 20 times slower on floating-point code.
- **What the compiler does:** The paper calls its compilation scheme "relatively simple". The TypeScript compiler's typed AST is lowered to a custom IR with constructs desugared to runtime calls, then to Thumb assembly, followed by a simple peephole optimiser whose rules were found by counting 2–3 instruction sequences in generated code (it saves 14% of code size on one large program and a few percent of time). Classes get fields at statically computed offsets and Java-like virtual tables, rather than dynamic maps. The authors' own bytecode VM for the same language is 5–6 times slower than the Thumb output yet still much faster than the interpreters, which they take to suggest that the static memory layout of classes contributes significantly to the speed.

## 28. `dunkels2006`

- **Authors:** Adam Dunkels, Niclas Finne, Joakim Eriksson, Thiemo Voigt
- **Title:** Run-time dynamic linking for reprogramming wireless sensor networks
- **Venue:** SenSys 2006 (4th ACM Conference on Embedded Networked Sensor Systems), pp. 15–28
- **DOI:** 10.1145/1182807.1182810
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text (https://dunkels.com/adam/dunkels06runtime.pdf).
- **Core result:** Implements a linker and loader for standard ELF object files in Contiki and compares its energy cost with an application-specific VM (CVM) and a Java VM. Findings: native code is cheaper to execute but more expensive to ship and link than VM code, so there is a break-even point. For their object-tracking program the CVM version needs about 40,000 iterations (against compact CELF loading) or about 80,000 (against ELF) before interpretation cost exceeds the native version's loading cost; for a vector convolution, native ELF code beats the Java version at 100 iterations and the CVM version at 500. For a small application, replacing the full image costs about 20 times more than a modular update. Their conclusion is that a combination of native and VM code is an energy-efficient choice, with the linker used to update the native part.

## 29. `levis2002`

- **Authors:** Philip Levis, David Culler
- **Title:** Maté: a tiny virtual machine for sensor networks
- **Venue:** ASPLOS X, 2002, pp. 85–95
- **DOI:** 10.1145/605397.605407
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** A bytecode interpreter on TinyOS that fits in 1 KB of RAM and 16 KB of program memory. Programs are split into capsules of up to 24 one-byte instructions that fit in a packet and can forward themselves through the network; complex programs take under 100 bytes. The paper's argument is that for frequently reprogrammed networks the CPU energy spent interpreting is outweighed by the radio energy saved by shipping such small programs.

## 30. Code compression

### `ernst1997`

- **Authors:** Jens Ernst, William Evans, Christopher W. Fraser, Steven Lucco, Todd A. Proebsting (order as printed on the paper; Crossref lists Proebsting before Lucco)
- **Title:** Code compression
- **Venue:** PLDI 1997, pp. 358–365
- **DOI:** 10.1145/258915.258947
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Describes two compressed program forms. The interpretable form (BRISC) is roughly the size of gzipped x86 code, can be interpreted without decompression, and can be compiled to good machine code at 2.5 megabytes per second on a 120 MHz Pentium. The "wire" form must be decompressed before use but is, for gcc, roughly 21% the size of SPARC code.

### `fraser1995`

- **Authors:** Christopher W. Fraser, Todd A. Proebsting
- **Title:** Custom Instruction Sets for Code Compression
- **Venue:** Unpublished manuscript, dated 19 October 1995, 9 pp.
- **URL:** https://cwf.github.io/pro/Fraser%20and%20Proebsting.%20Custom%20instruction%20sets%20for%20code%20compression.pdf
- **Status:** VERIFIED, including the "unpublished" status
- **Evidence:** Manuscript text; Fraser's CV lists it under "Other publications" with only the date 10/1995; a February 1996 comp.compilers post by Proebsting calls it "unpublished, submitted to PLDI 96".
- **Core result:** A C compiler (built on lcc and an iburg variant) that, for a given program, generates a custom compact interpreter and bytecode for it. The abstract's figure: in a typical application, the compiler halves its own size.

## 31. `mokhov2018`

- **Authors:** Andrey Mokhov, Neil Mitchell, Simon Peyton Jones
- **Title:** Build systems à la carte
- **Venue:** Proc. ACM Program. Lang. 2, ICFP, Article 79, 29 pages, 2018
- **DOI:** 10.1145/3236774
- **Status:** VERIFIED
- **Evidence:** Crossref; Microsoft Research publication page; first author's page.
- **Core result:** Models a build system as two independent choices, a scheduler (the order in which tasks are built) and a rebuilder (how it decides whether a task must be rebuilt), and shows that Make, Excel, Shake, Bazel and others are points in that grid, with executable Haskell definitions. An extended version appeared in the Journal of Functional Programming 30 (2020).

## 32. `keep2013`

- **Authors:** Andrew W. Keep, R. Kent Dybvig
- **Title:** A nanopass framework for commercial compiler development
- **Venue:** ICFP 2013, pp. 343–350
- **DOI:** 10.1145/2500365.2500618
- **Status:** VERIFIED
- **Evidence:** Crossref; paper text.
- **Core result:** Rebuilt the commercial Chez Scheme compiler with the nanopass framework, replacing five of the original ten passes with more than fifty small ones over formally specified intermediate languages. The new compiler's code is on average 15–27% faster, and compile times are "well within a factor of two" of the original, which answers the worry that many passes must be slow.

## 33. `micropython-emitters`

- **Title:** "Maximising MicroPython speed", sections "The Native code emitter" and "The Viper code emitter", MicroPython documentation
- **URL:** https://docs.micropython.org/en/latest/reference/speed_python.html
- **Status:** VERIFIED, with one qualification
- **Evidence:** Page source; micropython.org front page; MicroPython glossary.
- **Viper integers:** Confirmed verbatim: "Integer processing is non-compliant because it uses machine words: arithmetic on 32 bit hardware is performed modulo 2**32." Viper also adds pointer types (`ptr`, `ptr8`, `ptr16`, `ptr32`).
- **Native emitter:** `@micropython.native` "causes the MicroPython compiler to emit native CPU opcodes rather than bytecode"; the page gives the gain as "roughly twice as fast as bytecode" at the cost of larger code.
- **Compiles on the device:** This page does not say where compilation happens. The supporting statements are on https://micropython.org/: "MicroPython is a full Python compiler and runtime that runs on the bare-metal", with "a native emitter that targets machine code directly" among its features. Cite that page for the on-device claim. The glossary notes that code can also be precompiled on a PC with the cross-compiler.

## 34. `devicescript`

- **Title:** DeviceScript: TypeScript for Tiny IoT Devices
- **Publisher:** Microsoft (labelled "Experimental Project from Microsoft Research")
- **URL:** https://github.com/microsoft/devicescript ; documentation at https://microsoft.github.io/devicescript
- **Status:** VERIFIED
- **Evidence:** Repository README; GitHub API record; repository page banner; InfoWorld article of 13 June 2023.
- **What it is:** A TypeScript subset for microcontrollers (ESP32, RP2040). The README says it "is compiled to a custom VM bytecode, which can run in very constrained environments"; so yes, a bytecode VM, not native compilation. InfoWorld reported the VM as about 10 KB of code.
- **Dates and status:** Repository created 14 March 2022; public coverage from mid-2023; last release v2.16.4 on 19 April 2024; last push 24 October 2024. The repository is archived and read-only; the banner on the live page gives the archive date as 8 December 2025. The project is no longer maintained.

## 35. `moddable-preload`

- **Title:** Using XS Preload to Optimize Applications (Moddable SDK documentation; revised 18 June 2026)
- **URL:** https://www.moddable.com/documentation/xs/preload
- **Status:** VERIFIED
- **Evidence:** Document source; "XS Linker Warnings" page.
- **Core result:** "Preloading executes parts of a JavaScript application during the build process, before the application is downloaded to the target device." The module body runs in the XS linker on the build machine, and the resulting objects and closures are stored in flash (ROM), which shortens start-up and moves that memory out of RAM. Modules are listed in the manifest's `preload` array. Because the build machine is not the target, a preloaded module body cannot call native functions (a build error). Objects in flash can still be modified, through a pointer XS keeps in RAM, unless they are frozen; XS freezes the prototypes of preloaded classes automatically and the document recommends freezing data to save that RAM.

## 36. `wamr-modes`

- **Title:** WebAssembly Micro Runtime (Bytecode Alliance): README, `product-mini/README.md`, `doc/build_wamr.md`
- **URL:** https://github.com/bytecodealliance/wasm-micro-runtime ; https://github.com/bytecodealliance/wasm-micro-runtime/blob/main/product-mini/README.md ; https://github.com/bytecodealliance/wasm-micro-runtime/blob/main/doc/build_wamr.md
- **Status:** VERIFIED, with a correction to the list of modes
- **Evidence:** The three documents' source text.
- **Modes:** The official text lists six, not four: "fast interpreter, classi[c] interpreter, AOT, LLVM JIT, Fast JIT and Multi-tier JIT". On Linux the fast interpreter and AOT are enabled by default and JIT is off.
- **Stated ratios:** "The fast interpreter runs ~2X faster than classic interpreter, but consumes about 2X memory to hold the pre-compiled code." Fast JIT "gains ~50% performance of AOT". AOT and JIT are described only as "near to native speed". Multi-tier JIT starts in Fast JIT and switches to LLVM JIT code as it becomes available. Text sizes on Cortex-M4F: about 58.9 K for the fast interpreter, 56.3 K for the classic interpreter, 29.4 K for the AOT runtime.
- **A second figure exists:** An Intel article by the WAMR authors ("A fast WebAssembly Interpreter design in WASM-Micro-Runtime", updated 7 October 2021) gives the fast interpreter as about 150% faster on CoreMark for about 30% more memory, which differs from the "2X memory" in the build documentation. Say which source you quote.

---

## Summary

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
