# Bibliography check 03: isolation, types and asynchrony

Checked on 2026-11-19 against the web. Each entry was confirmed against at least one of: publisher metadata deposited with Crossref (DOI records), OpenAlex copies of publisher abstracts, the paper's own text (author- or venue-hosted PDF), the author's or project's page, or official documentation.

Limits of this check:

- DBLP and the Springer, ACM DL, ScienceDirect and HAL landing pages refused scripted access (bot checks or HTTP 403), so they were not used directly. Bibliographic data for those items comes from the Crossref DOI record plus a second source named in the entry.
- "Result" lines state only what the cited source says. Where the publisher abstract could not be read, the entry says which source the summary rests on.
- Article numbers for PACMPL and TOPLAS papers were not checked; pages are given as Crossref lists them.

Status values: VERIFIED (matches the recollection), CORRECTED (the recollection was wrong or incomplete; the difference is stated), UNVERIFIED (not confirmed).

Counts by numbered entry: 40 VERIFIED, 2 CORRECTED (20, 35), 0 UNVERIFIED. Individual details that could not be confirmed are listed at the end.

---

## 1. `wahbe1993`

- Authors: Robert Wahbe, Steven Lucco, Thomas E. Anderson, Susan L. Graham
- Title: Efficient software-based fault isolation
- Venue: Proceedings of the 14th ACM Symposium on Operating Systems Principles (SOSP '93), December 1993, pp. 203–216. Also ACM SIGOPS Operating Systems Review 27(5).
- Link: https://doi.org/10.1145/168619.168635 (author copy: https://homes.cs.washington.edu/~tom/pubs/sfi.pdf)
- Status: VERIFIED
- Result: An untrusted module is loaded into its own fault domain inside the host's address space, and its object code is rewritten so that it cannot write or jump outside that domain. The paper states that "sandboxing incurs an average of 4% execution time overhead on both the DECstation and the Alpha"; Table 1 gives an average of 4.3% on each platform. A cross-fault-domain call takes roughly 1.1 µs on a DECstation 5000/240 and 0.8 µs on a DEC Alpha 400 (figures read from a scanned copy), which the paper calls more than an order of magnitude faster than any existing RPC system.

## 2. `yee2009`

- Authors: Bennet Yee, David Sehr, Gregory Dardyk, J. Bradley Chen, Robert Muth, Tavis Ormandy, Shiki Okasaka, Neha Narula, Nicholas Fullagar
- Title: Native Client: A Sandbox for Portable, Untrusted x86 Native Code
- Venue: 2009 30th IEEE Symposium on Security and Privacy, May 2009, pp. 79–93
- Link: https://doi.org/10.1109/SP.2009.25 (PDF: https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/34913.pdf)
- Status: VERIFIED
- Result: Untrusted x86 code must follow alignment and control-flow rules, and a static validator confirms before execution that the rules were followed (reliable disassembly, no unsafe instructions, control-flow integrity, no data access outside the sandbox). This keeps the compiler toolchain outside the trusted code base; the validator "requires less than 600 C statements". On SPEC2000 the worst-case overhead is about 12% (crafty), with the other benchmarks averaging about 5%.

## 3. `morrisett2012`

- Authors: Greg Morrisett, Gang Tan, Joseph Tassarotti, Jean-Baptiste Tristan, Edward Gan
- Title: RockSalt: better, faster, stronger SFI for the x86
- Venue: Proceedings of the 33rd ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI '12), June 2012, pp. 395–404
- Link: https://doi.org/10.1145/2254064.2254111
- Status: VERIFIED
- Result: A replacement for the Native Client checker for 32-bit x86, built from table-driven DFAs that are generated from a declarative description and proved correct against a Coq model of an x86 subset. The verified checker is "only about 80 lines of Coq code" (hand-translated to under 100 lines of C) and "checks roughly 1M instructions per second".

## 4. `johnson2021`

- Authors: Evan Johnson, David Thien, Yousef Alhessi, Shravan Narayan, Fraser Brown, Sorin Lerner, Tyler McMullen, Stefan Savage, Deian Stefan
- Title: Доверя́й, но проверя́й: SFI safety for native-compiled Wasm
- Venue: Network and Distributed System Security Symposium (NDSS) 2021, 21–25 February 2021
- Link: https://doi.org/10.14722/ndss.2021.24078 (https://www.ndss-symposium.org/ndss-paper/доверяй-но-проверяй-sfi-safety-for-native-compiled-wasm/)
- Status: VERIFIED (the recollection gave no title; the title is the Russian proverb "trust, but verify" followed by the English subtitle)
- Result: VeriWasm is a static, offline verifier that checks the x86-64 binaries produced by the Lucet WebAssembly compiler for SFI safety (memory isolation and control flow confined to the sandbox), so the compiler does not have to be trusted. The verifier's soundness proof is mechanised in Coq. The evaluation covers two Wasm-sandboxed Firefox libraries and 103 Fastly client binaries, and the abstract reports that it detects bugs with no false positives.

## 5. `bosamiya2022`

- Authors: Jay Bosamiya, Wen Shih Lim, Bryan Parno
- Title: Provably-Safe Multilingual Software Sandboxing using WebAssembly
- Venue: 31st USENIX Security Symposium (USENIX Security 22), August 2022, pp. 1975–1992. Distinguished Paper Award.
- Link: https://www.usenix.org/conference/usenixsecurity22/presentation/bosamiya
- Status: VERIFIED
- Result: Two Wasm-to-native sandboxing compilers with safety arguments: vWasm, written and machine-checked in F*, and rWasm, which compiles Wasm to safe Rust so that sandbox safety rests on Rust's guarantees (with an informal proof). The authors report performance comparable to standard, unverified approaches.

## 6. `morrisett1998` / `morrisett1999`

- Authors: Greg Morrisett, David Walker, Karl Crary, Neal Glew
- Title: From System F to typed assembly language
- Venue: (a) Proceedings of the 25th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '98), pp. 85–97. (b) ACM Transactions on Programming Languages and Systems 21(3), May 1999, pp. 527–568.
- Link: https://doi.org/10.1145/268946.268954 (POPL); https://doi.org/10.1145/319301.319345 (TOPLAS)
- Status: VERIFIED
- Result: Defines a typed assembly language (TAL) based on a conventional RISC assembly language and gives a type-preserving compiler from System F to it, as a sequence of typed transformations that includes CPS and closure conversion. Well-typed TAL code cannot violate the abstractions of the source language, so the compiler output can be checked for safety without trusting the compiler.

## 7. `necula1997` and `necula1996`

- `necula1997`: George C. Necula. Proof-carrying code. Proceedings of the 24th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '97), pp. 106–119. https://doi.org/10.1145/263699.263712
- `necula1996`: George C. Necula, Peter Lee. Safe kernel extensions without run-time checking. Proceedings of the Second USENIX Symposium on Operating Systems Design and Implementation (OSDI '96), October 1996, pp. 229–243. https://doi.org/10.1145/238721.238781
- Status: VERIFIED (both)
- Result: The code producer ships a formal proof that the code obeys a safety policy published by the host; the host validates the proof instead of trusting the producer or adding run-time checks. In the OSDI paper, hand-written DEC Alpha packet filters carry such proofs and run "with no run-time overhead, beyond a one-time cost of 1 to 3 milliseconds for validating the enclosed proofs".

## 8. `hunt2007` and `bershad1995`

- `hunt2007`: Galen C. Hunt, James R. Larus. Singularity: rethinking the software stack. ACM SIGOPS Operating Systems Review 41(2), April 2007, pp. 37–49. https://doi.org/10.1145/1243418.1243424
- `bershad1995`: Brian N. Bershad, Stefan Savage, Przemysław Pardyak, Emin Gün Sirer, Marc E. Fiuczynski, David Becker, Craig Chambers, Susan Eggers. Extensibility, safety and performance in the SPIN operating system. Proceedings of the 15th ACM Symposium on Operating Systems Principles (SOSP '95), pp. 267–283. Also OSR 29(5). https://doi.org/10.1145/224056.224077
- Status: VERIFIED (both)
- Result (Singularity): Processes are isolated by language safety and verification instead of hardware protection. A software-isolated process (SIP) is a "closed object space": no other SIP can modify or directly reach its objects, and SIPs communicate by transferring exclusive ownership of data over contract-based channels. The paper's Table 1 lists a kernel API call at 80 CPU cycles on Singularity against 437 on Linux, and process creation at 388,000 cycles against 719,000 on Linux.
- Result (SPIN): Extensions are written in the type-safe language Modula-3 and dynamically linked into the kernel. Language and link-time mechanisms export fine-grained interfaces to them, which gives extensions rapid access to system services while protecting the kernel code that shares their address space.

## 9. `levy2017`

- Authors: Amit Levy, Bradford Campbell, Branden Ghena, Daniel B. Giffin, Pat Pannuto, Prabal Dutta, Philip Levis
- Title: Multiprogramming a 64kB Computer Safely and Efficiently (ACM metadata prints "64kB"; the paper's title page prints "64 kB")
- Venue: Proceedings of the 26th Symposium on Operating Systems Principles (SOSP '17), October 2017, pp. 234–251
- Link: https://doi.org/10.1145/3132747.3132786 (PDF: https://www.tockos.org/assets/papers/tock-sosp2017.pdf)
- Status: VERIFIED, with one caveat on the parenthetical
- Result: Tock has two isolation mechanisms. Kernel components ("capsules") are confined at compile time by Rust's type system and scheduled cooperatively. Processes are preemptively scheduled, may be written in any language, and are memory-isolated by the hardware memory protection unit (MPU) of Cortex-M microcontrollers.
- Caveat: the paper's text contains no mention of RISC-V or PMP. PMP is how later Tock ports to RISC-V implement the same kernel MPU interface; cite the Tock documentation for that (https://docs.tockos.org/riscv/pmp, "Adapter from a generic PMP implementation exposing TOR-type regions to the Tock mpu::MPU trait"), not this paper.

## 10. `amar2023`

- Authors: Saar Amar, David Chisnall, Tony Chen, Nathaniel Wesley Filardo, Ben Laurie, Kunyan Liu, Robert Norton, Simon W. Moore, Yucong Tao, Robert N. M. Watson, Hongyan Xia
- Title: CHERIoT: Complete Memory Safety for Embedded Devices
- Venue: 56th Annual IEEE/ACM International Symposium on Microarchitecture (MICRO '23), October 2023, pp. 641–653
- Link: https://doi.org/10.1145/3613424.3614266 (PDF: https://cheriot.org/papers/2023-micro-cheriot-uarch.pdf)
- Status: VERIFIED
- Result: An adaptation of the CHERI capability architecture for small RISC-V cores, co-designed with an RTOS, that gives fine-grained compartments and memory safety that is deterministic, not probabilistic. In the paper's Table 2, an Ibex RV32E core is 26,988 gates; adding a 16-entry PMP gives 55,905 (2.07×), and CHERIoT capabilities with the load filter and background revoker give 61,422 (2.28×), which the text describes as a little under 10% more area than the PMP baseline.

## 11. `feeley1993`

- Authors: Marc Feeley
- Title: Polling efficiently on stock hardware
- Venue: Proceedings of the Conference on Functional Programming Languages and Computer Architecture (FPCA '93), July 1993, pp. 179–187
- Link: https://doi.org/10.1145/165180.165205 (author copy: http://www.iro.umontreal.ca/~feeley/papers/FeeleyFPCA93.pdf)
- Status: VERIFIED
- Result: "Balanced polling" places interrupt checks so that no more than a fixed number of instructions run between checks, which bounds interrupt latency at low cost. The abstract reports that call-return polling (a check at every procedure entry and exit) costs typically 70% more, and sometimes over 400% more, than balanced polling; the paper's measurements give an average overhead of about 15% for balanced polling when the latency bound is above 50 instructions.

## 12. `erlang-reductions`

- Source: Erlang/OTP documentation, `erlang:bump_reductions/1`, and the emulator source
- Link: https://www.erlang.org/doc/apps/erts/erlang.html#bump_reductions/1 ; https://github.com/erlang/otp/blob/master/erts/emulator/beam/erl_vm.h
- Status: VERIFIED
- Result: The documentation says: "In the Beam emulator, the reduction counter is normally incremented by one for each function and BIF call. A context switch is forced when the counter reaches the maximum number of reductions for a process (4000 reductions in Erlang/OTP 19.2 and later)." The source defines `#define CONTEXT_REDS 4000 /* Swap process out after this number */`. The value used before OTP 19.2 (often quoted as 2000) was not checked.

## 13. `gay2003`

- Authors: David Gay, Philip Levis, Robert von Behren, Matt Welsh, Eric Brewer, David Culler
- Title: The nesC language: A holistic approach to networked embedded systems
- Venue: Proceedings of the ACM SIGPLAN 2003 Conference on Programming Language Design and Implementation (PLDI '03), pp. 1–11
- Link: https://doi.org/10.1145/781131.781133
- Status: VERIFIED (all four parenthetical claims are in the paper)
- Result: The paper states that "nesC is a 'static language': There is no dynamic memory allocation and the call-graph is fully known at compile-time", and that function pointers are also prohibited. These restrictions allow whole-program analysis: compile-time data-race detection, whole-program inlining and dead-code elimination. Long-latency operations are split-phase: a command returns immediately and completion is signalled later by an event.

## 14. `hill2000`

- Authors: Jason Hill, Robert Szewczyk, Alec Woo, Seth Hollar, David Culler, Kristofer Pister
- Title: System architecture directions for networked sensors
- Venue: Proceedings of the Ninth International Conference on Architectural Support for Programming Languages and Operating Systems (ASPLOS IX), November 2000, pp. 93–104
- Link: https://doi.org/10.1145/378993.379006
- Status: VERIFIED
- Result: Introduces TinyOS, a tiny event-driven operating system for sensor nodes. The abstract states that it "fits in 178 bytes of memory, propagates events in the time it takes to copy 1.25 bytes of memory, context switches in the time it takes to copy 6 bytes of memory and supports two level scheduling"; the evaluation attributes the 178 bytes to the scheduler.

## 15. `dunkels2006`

- Authors: Adam Dunkels, Oliver Schmidt, Thiemo Voigt, Muneeb Ali
- Title: Protothreads: simplifying event-driven programming of memory-constrained embedded systems
- Venue: Proceedings of the 4th International Conference on Embedded Networked Sensor Systems (SenSys '06), pp. 29–42
- Link: https://doi.org/10.1145/1182807.1182811
- Status: VERIFIED
- Result: Protothreads let event-driven code be written in a sequential, thread-like style without a stack per thread. The abstract gives "a memory overhead of only two bytes per protothread"; the paper specifies two bytes on the MSP430 and three bytes on the AVR, the size of the stored continuation point. Rewriting existing state-machine programs reduced lines of code by one third.

## 16. `adya2002`

- Authors: Atul Adya, Jon Howell, Marvin Theimer, William J. Bolosky, John R. Douceur
- Title: Cooperative Task Management without Manual Stack Management (the paper adds the subtitle "or, Event-driven Programming is Not the Opposite of Threaded Programming")
- Venue: Proceedings of the 2002 USENIX Annual Technical Conference, Monterey, California, June 10–15, 2002
- Link: https://www.usenix.org/conference/2002-usenix-annual-technical-conference/cooperative-task-management-without-manual-stack
- Status: VERIFIED. Page numbers are not shown on the USENIX page; the commonly cited range (289–302) was not confirmed.
- Result: Separates task management (cooperative or preemptive) from stack management (manual or automatic) and shows that cooperative scheduling can be combined with automatic stack management. Section 3.2 coins the term: when a function must yield for I/O, it and its callers have to be split into continuation-passing pieces, and "We call this phenomenon 'stack ripping' and see it as the primary drawback to manual stack management."

## 17. `lauer1979`

- Authors: Hugh C. Lauer, Roger M. Needham
- Title: On the duality of operating system structures
- Venue: ACM SIGOPS Operating Systems Review 13(2), April 1979, pp. 3–19. This is a reprint of a paper presented at the Second International Symposium on Operating Systems, IRIA, October 1978.
- Link: https://doi.org/10.1145/850657.850658
- Status: VERIFIED (both years in the recollection are right: 1978 presentation, 1979 reprint)
- Result: Message-oriented systems (few static processes, explicit messages) and procedure-oriented systems (many small processes, shared data with locks) are duals: a system built in one style has a direct counterpart in the other. The abstract concludes that neither model is inherently preferable and that the choice should follow the machine architecture, not the application.

## 18. `santanna2013` and `santos2018`

- `santanna2013`: Francisco Sant'Anna, Noemi Rodriguez, Roberto Ierusalimschy, Olaf Landsiedel, Philippas Tsigas. Safe system-level concurrency on resource-constrained nodes. Proceedings of the 11th ACM Conference on Embedded Networked Sensor Systems (SenSys '13), November 2013, pp. 1–14 (per-article pagination). https://doi.org/10.1145/2517351.2517360
- `santos2018`: Rodrigo C. M. Santos, Guilherme F. Lima, Francisco Sant'Anna, Roberto Ierusalimschy, Edward H. Haeusler. A memory-bounded, deterministic and terminating semantics for the synchronous programming language Céu. Proceedings of the 19th ACM SIGPLAN/SIGBED International Conference on Languages, Compilers, and Tools for Embedded Systems (LCTES '18), June 2018, pp. 1–18. https://doi.org/10.1145/3211332.3211334
- Status: VERIFIED (both)
- Result (2013): Céu is a synchronous language for sensor nodes whose compile-time analysis yields deterministic and memory-safe concurrent programs, at the price of excluding long computations and hard real-time response. Ports of network protocols and a CC2420 radio driver were shorter than the nesC versions, "with a penalty of memory increase below 10%".
- Result (2018): Gives a small-step structural operational semantics for Céu and proves that reactions are memory-bounded, deterministic and terminating: "for a given arbitrary timeline of input events, multiple executions of the same program always react in bounded time and arrive at the same final finite memory state". An extended version with a different author order (Lima, Santos, Ierusalimschy, Haeusler, Sant'Anna) is in Journal of Systems Architecture 97 (2019), pp. 239–257, https://doi.org/10.1016/j.sysarc.2019.01.014.

## 19. `berry1992`

- Authors: Gérard Berry, Georges Gonthier
- Title: The Esterel synchronous programming language: design, semantics, implementation
- Venue: Science of Computer Programming 19(2), November 1992, pp. 87–152
- Link: https://doi.org/10.1016/0167-6423(92)90005-V
- Status: VERIFIED (bibliographic data). The publisher abstract could not be read; the summary below rests on the Semantic Scholar record for this DOI and a search-engine summary of the paper text.
- Result: Esterel is a deterministic concurrent language for reactive systems built on the synchrony hypothesis, under which a program's outputs are treated as simultaneous with its inputs. The paper presents the language's imperative and temporal primitives, gives its mathematical semantics, and describes how the Esterel v2 and v3 compilers translate concurrent programs into equivalent sequential automata.

## 20. `hammond2003`

- Authors: Kevin Hammond, Greg Michaelson
- Title: Hume: A Domain-Specific Language for Real-Time Embedded Systems
- Venue: Generative Programming and Component Engineering (GPCE 2003), Lecture Notes in Computer Science 2830, Springer, 2003, pp. 37–56
- Link: https://doi.org/10.1007/978-3-540-39815-8_3 (authors' preprint: https://www.macs.hw.ac.uk/~greg/publications/hm.gpce03.ps)
- Status: CORRECTED
- What was wrong: the level between FSM-Hume and PR-Hume is HO-Hume, not "Template-Hume". Figure 1 of the paper ("Hume Design Space", read in the authors' preprint) lists, from least to most expressive: HW-Hume (no functions, non-recursive data structures), FSM-Hume (non-recursive first-order functions, non-recursive data structures), HO-Hume (non-recursive higher-order functions, non-recursive data structures), PR-Hume (primitive recursive functions), Full Hume (full recursion). The paper does use the word "template", but for box templates in its metaprogramming layer.
- Second caveat: the paper does not tabulate decidable properties per level. It says only that each level "adds expressibility to the expression semantics, but either loses some desirable property or increases the technical difficulty of providing formal correctness/cost models", and it gives a stack-and-heap cost model for FSM-Hume. The per-level properties are stated on the Hume project page at Heriot-Watt (https://www.macs.hw.ac.uk/~greg/hume/): HW-Hume has "decidable equivalence and termination, and predictable time and space behaviour"; FSM-Hume "has strongly bounded time and space behaviour"; HO-Hume adds higher-order functions "with known cost models"; PR-Hume adds "user-defined primitive recursive bounded functions"; "full Hume is a Turing Complete language". Cite that page, not the GPCE paper, for these properties.

## 21. `reynolds1972` and `danvy2001`

- `reynolds1972`: John C. Reynolds. Definitional interpreters for higher-order programming languages. Proceedings of the ACM Annual Conference (ACM '72), Boston, 1972, volume 2, pp. 717–740. https://doi.org/10.1145/800194.805852. Reprinted in Higher-Order and Symbolic Computation 11(4), 1998, pp. 363–397, https://doi.org/10.1023/A:1010027404223.
- `danvy2001`: Olivier Danvy, Lasse R. Nielsen. Defunctionalization at work. Proceedings of the 3rd ACM SIGPLAN International Conference on Principles and Practice of Declarative Programming (PPDP '01), September 2001, pp. 162–174. https://doi.org/10.1145/773184.773202
- Status: VERIFIED (both)
- Result: Reynolds classifies interpreters by whether they use higher-order functions and whether evaluation order in the defined language depends on that of the defining language, and derives one kind from another by constructive transformations. Danvy and Nielsen study that derivation as a technique in its own right: defunctionalization is "a whole-program transformation from higher-order to first-order functional programs", and they use it to connect higher-order and first-order specifications.

## 22. `bierman2012`

- Authors: Gavin Bierman, Claudio Russo, Geoffrey Mainland, Erik Meijer, Mads Torgersen
- Title: Pause 'n' Play: Formalizing Asynchronous C♯
- Venue: ECOOP 2012 – Object-Oriented Programming, Lecture Notes in Computer Science 7313, Springer, 2012, pp. 233–257
- Link: https://doi.org/10.1007/978-3-642-31057-7_12
- Status: VERIFIED (abstract read from a university repository record of the paper)
- Result: Describes the async/await feature of C# 5.0 and gives it a precise mathematical semantics that is abstract, avoiding the compiler-generated state machines, yet concrete enough to state and prove implementation properties.

## 23. `embassy-docs`

- Source: Embassy project documentation and repository README
- Link: https://embassy.dev/book/ (executor section); https://github.com/embassy-rs/embassy/blob/main/README.md ; https://github.com/embassy-rs/embassy/blob/main/embassy-executor/README.md
- Status: VERIFIED
- Result: The project README and home page state: "Tasks get transformed at compile time into state machines that get run cooperatively. It requires no dynamic memory allocation and runs on a single stack, so no per-task stack size tuning is required." The executor documentation lists "No `alloc`, no heap needed" and "Tasks are statically allocated"; the executor README adds that each task gets its own `static` whose size is computed at compile time, so running out of task memory is a link-time error and not a run-time one.

## 24. `tofte1997`

- Authors: Mads Tofte, Jean-Pierre Talpin
- Title: Region-Based Memory Management
- Venue: Information and Computation 132(2), February 1997, pp. 109–176
- Link: https://doi.org/10.1006/inco.1996.2613
- Status: VERIFIED (bibliographic data). The publisher abstract could not be read; the summary rests on the authors' later retrospective (Tofte, Birkedal, Elsman, Hallenberg, Higher-Order and Symbolic Computation 17(3), 2004) and the Semantic Scholar record.
- Result: The store is a stack of regions, and every value, including closures, is put into a region. A type-and-effect analysis (region inference) annotates the program with where each region is allocated and deallocated, so memory is reclaimed without a garbage collector; the paper proves the scheme sound for a skeletal language extracted from Standard ML.

## 25. `grossman2002`

- Authors: Dan Grossman, Greg Morrisett, Trevor Jim, Michael Hicks, Yanling Wang, James Cheney
- Title: Region-based memory management in Cyclone
- Venue: Proceedings of the ACM SIGPLAN 2002 Conference on Programming Language Design and Implementation (PLDI '02), pp. 282–293
- Link: https://doi.org/10.1145/512529.512563
- Status: VERIFIED
- Result: Cyclone is a type-safe language derived from C whose static region system supports region subtyping and integrates with stack allocation and a garbage collector; default annotations and local inference keep the annotation burden light. The abstract reports that porting legacy C required changing about 8% of the code, and only 6% of those changes were region annotations.

## 26. `reinking2021`

- Authors: Alex Reinking, Ningning Xie, Leonardo de Moura, Daan Leijen
- Title: Perceus: garbage free reference counting with reuse
- Venue: Proceedings of the 42nd ACM SIGPLAN International Conference on Programming Language Design and Implementation (PLDI 2021), pp. 96–111
- Link: https://doi.org/10.1145/3453483.3454032
- Status: VERIFIED
- Result: Perceus is a compile-time algorithm that inserts precise reference-count operations so that cycle-free programs are "garbage free": only live references are retained. This enables reuse analysis, which turns functional updates into guaranteed in-place updates at run time (the "functional but in-place" style). The paper proves the algorithm sound and garbage free and reports competitive performance in Koka.

## 27. `wadler1990`

- Authors: Philip Wadler
- Title: Linear types can change the world!
- Venue: In M. Broy and C. Jones (eds.), Programming Concepts and Methods (IFIP TC 2 Working Conference, Sea of Galilee, Israel, April 1990), North-Holland, Amsterdam, 1990
- Link: https://homepages.inf.ed.ac.uk/wadler/topics/linear-logic.html
- Status: VERIFIED (author's own publication page). Page numbers are not given there; one secondary bibliography gives a start page of 561, which was not confirmed.
- Result: Proposes a type system for functional languages based on Girard's linear logic. In the author's words, values of a linear type "must be used exactly once: like the world, they cannot be duplicated or destroyed", so they need no reference counting or garbage collection and can safely be updated destructively.

## 28. `strom1986`

- Authors: Robert E. Strom, Shaula Yemini
- Title: Typestate: A programming language concept for enhancing software reliability
- Venue: IEEE Transactions on Software Engineering SE-12(1), January 1986, pp. 157–171
- Link: https://doi.org/10.1109/TSE.1986.6312929
- Status: VERIFIED
- Result: A type fixes which operations an object supports; its typestate fixes which of those are permitted at a given program point. Tracking typestate at compile time detects sequences that are syntactically legal but semantically undefined, such as reading an uninitialised variable or dereferencing a pointer after its object has been freed.

## 29. `honda1993` and `honda2008`

- `honda1993`: Kohei Honda. Types for dyadic interaction. CONCUR '93, Lecture Notes in Computer Science 715, Springer, 1993, pp. 509–523. https://doi.org/10.1007/3-540-57208-2_35
- `honda2008`: Kohei Honda, Nobuko Yoshida, Marco Carbone. Multiparty asynchronous session types. Proceedings of the 35th Annual ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '08), pp. 273–284. https://doi.org/10.1145/1328438.1328472. Journal version: Journal of the ACM 63(1), 2016.
- Status: VERIFIED (both)
- Result (1993): Formulates a typed calculus of name-passing processes in which types describe the composable structure of two-party interaction; the abstract (read from the RIMS Kōkyūroku 851 printing of the same paper) notes that the type discipline yields deadlock freedom for a subset of terms.
- Result (2008): Extends binary session types to several parties communicating asynchronously. A global type describes the whole conversation and is projected onto each participant for local type checking; the paper establishes communication safety, progress and session fidelity.

## 30. `kennedy1994`

- Authors: Andrew Kennedy
- Title: Dimension types
- Venue: Programming Languages and Systems — ESOP '94, Lecture Notes in Computer Science 788, Springer, 1994, pp. 348–362
- Link: https://doi.org/10.1007/3-540-57880-3_23
- Status: VERIFIED (abstract as reported by a search-engine reading of the Springer page; the page itself could not be fetched)
- Result: Extends a strongly typed language with dimension types that may be polymorphic (implemented as an extension of the ML Kit compiler). Every typable expression has a most general type, inferred by an algorithm that uses equational unification over Abelian groups in addition to ordinary unification.

## 31. `tobin2008` and `tobin2010`

- `tobin2008`: Sam Tobin-Hochstadt, Matthias Felleisen. The design and implementation of Typed Scheme. Proceedings of the 35th Annual ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '08), pp. 395–406. https://doi.org/10.1145/1328438.1328486
- `tobin2010`: Sam Tobin-Hochstadt, Matthias Felleisen. Logical types for untyped languages. Proceedings of the 15th ACM SIGPLAN International Conference on Functional Programming (ICFP '10), pp. 117–128. https://doi.org/10.1145/1863543.1863561
- Status: VERIFIED (both)
- Result: Typed Scheme is an explicitly typed sister language of PLT Scheme built on occurrence typing, which gives different occurrences of a variable different subtypes depending on the predicates tested before them. The 2010 paper reformulates this: the type system assigns "variable occurrences a subtype of their declared type based on the predicates prior to the occurrence", so existing Scheme code can be typed with few changes.

## 32. `xi1998`

- Authors: Hongwei Xi, Frank Pfenning
- Title: Eliminating array bound checking through dependent types
- Venue: Proceedings of the ACM SIGPLAN 1998 Conference on Programming Language Design and Implementation (PLDI '98), pp. 249–257
- Link: https://doi.org/10.1145/277650.277732
- Status: VERIFIED
- Result: Conservatively extends Standard ML with a restricted form of dependent types so that array bound checks and list tag checks can be proved unnecessary and removed. Type checking stays decidable.

## 33. `rondon2008` and `lehmann2023`

- `rondon2008`: Patrick M. Rondon, Ming Kawaguchi, Ranjit Jhala. Liquid types. Proceedings of the 29th ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI '08), pp. 159–169. https://doi.org/10.1145/1375581.1375602 (the Crossref record misspells the second author as "Kawaguci"; the paper prints "Kawaguchi")
- `lehmann2023`: Nico Lehmann, Adam T. Geller, Niki Vazou, Ranjit Jhala. Flux: Liquid Types for Rust. Proceedings of the ACM on Programming Languages 7(PLDI), June 2023, pp. 1533–1557. https://doi.org/10.1145/3591283
- Status: VERIFIED (both)
- Result (2008): Logically Qualified Data Types combine Hindley-Milner inference with predicate abstraction to infer dependent (refinement) types automatically from a supplied set of logical qualifiers. On the DML array benchmarks the DSOLVE tool "reduces the amount of manual annotation required for proving safety from 31% of program text to under 1%".
- Result (2023): Flux combines refinement types with Rust's ownership types, so that reasoning about mutable locations is handled by the borrow discipline and loop invariants are inferred. Against the Prusti verifier on the paper's benchmarks, the abstract reports specification lines halved, verification time down by an order of magnitude, and annotation overhead cut from up to 24% of code size (average 14%) to nothing.

## 34. `siek2006` and `takikawa2016`

- `siek2006`: Jeremy G. Siek, Walid Taha. Gradual typing for functional languages. Scheme and Functional Programming Workshop 2006, University of Chicago Technical Report TR-2006-06, September 2006, pp. 81–92. http://www.schemeworkshop.org/2006/13-siek.pdf
- `takikawa2016`: Asumu Takikawa, Daniel Feltey, Ben Greenman, Max S. New, Jan Vitek, Matthias Felleisen. Is sound gradual typing dead? Proceedings of the 43rd Annual ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '16), pp. 456–468. https://doi.org/10.1145/2837614.2837630
- Status: VERIFIED (both)
- Result (2006): Defines a lambda calculus with optional type annotations in which the type checker catches incompatibilities between the known parts of types, and proves the type system sound with respect to the simply typed lambda calculus for fully annotated terms.
- Result (2016): Proposes evaluating gradual typing by measuring every configuration between fully untyped and fully typed for each benchmark. Applied to Typed Racket, the paper concludes that "Typed Racket's cost of soundness is not tolerable": for the suffixtree benchmark "almost all partially typed configurations exhibit slowdowns of up to 105x" (table: maximum 105.27x, mean 53.01x), although its fully typed version runs at 0.7x the untyped time.

## 35. `plotkin2009` and `xie2021`

- `plotkin2009`: Gordon Plotkin, Matija Pretnar. Handlers of Algebraic Effects. Programming Languages and Systems (ESOP 2009), Lecture Notes in Computer Science 5502, Springer, 2009, pp. 80–94. https://doi.org/10.1007/978-3-642-00590-9_7. Extended version: Handling Algebraic Effects, Logical Methods in Computer Science 9(4), 2013.
- `xie2021`: Ningning Xie, Daan Leijen. Generalized evidence passing for effect handlers: efficient compilation of effect handlers to C. Proceedings of the ACM on Programming Languages 5(ICFP), August 2021, 30 pages. https://doi.org/10.1145/3473576
- Status: `plotkin2009` VERIFIED. `xie2021` CORRECTED (minor): the recollection dropped the subtitle "efficient compilation of effect handlers to C"; the venue is the ICFP issue of PACMPL volume 5.
- Result (2009): Gives an algebraic account of exception handlers and generalises it to handlers for any effect described by an algebraic theory (summary rests on the Semantic Scholar record and the abstract of the 2013 extended version, which lists exceptions, state, nondeterminism, interactive input/output and time).
- Result (2021): Derives an efficient compilation scheme for effect handlers through a sequence of refinements: multi-prompt delimited control, generalised evidence passing, yield bubbling, and finally a monadic translation into plain lambda calculus. It is implemented as a Haskell library and as the C backend of Koka.

## 36. `boruch2023`

- Authors: Aleksander Boruch-Gruszecki, Martin Odersky, Edward Lee, Ondřej Lhoták, Jonathan Brachthäuser
- Title: Capturing Types
- Venue: ACM Transactions on Programming Languages and Systems 45(4), November 2023, 52 pages
- Link: https://doi.org/10.1145/3618003
- Status: VERIFIED
- Result: Presents CC<:□, a calculus in which a type records the free variables (capabilities) its values capture. Tracking captured variables in types is enough to implement effects and effect polymorphism safely through scoped capabilities, and the paper shows how it guides the implementation of capture checking in a practical language.

## 37. `miller2006` and `dennis1966`

- `miller2006`: Mark Samuel Miller. Robust Composition: Towards a Unified Approach to Access Control and Concurrency Control. PhD dissertation, Johns Hopkins University, Baltimore, Maryland, May 2006. http://www.erights.org/talks/thesis/
- `dennis1966`: Jack B. Dennis, Earl C. Van Horn. Programming semantics for multiprogrammed computations. Communications of the ACM 9(3), March 1966, pp. 143–155. https://doi.org/10.1145/365230.365252
- Status: VERIFIED (both)
- Result (2006): Extends object-style composition to concurrent, mutually suspicious components spread over untrusted machines, using the E language and the CapDesk desktop as worked examples.
- Result (1966): Defines the supervisor operations of a multiprogrammed system. Each computation runs within a sphere of protection "specified by a list of capabilities or C-list", where "each capability in a C-list locates by means of a pointer some computing object, and indicates the actions that the computation may perform with respect to that object".

## 38. `hofmann2003` and `hughes1996`

- `hofmann2003`: Martin Hofmann, Steffen Jost. Static prediction of heap space usage for first-order functional programs. Proceedings of the 30th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '03), pp. 185–197. https://doi.org/10.1145/604131.604148
- `hughes1996`: John Hughes, Lars Pareto, Amr Sabry. Proving the correctness of reactive systems using sized types. Proceedings of the 23rd ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '96), pp. 410–423. https://doi.org/10.1145/237721.240882
- Status: VERIFIED (both)
- Result (2003): A type system with resource annotations yields linear upper bounds on the heap consumption of first-order functional programs; the annotations are inferred automatically by linear programming.
- Result (1996): Types carry bounds on the sizes of recursive data structures. Checking them detects deadlock, non-termination and similar errors in embedded reactive programs.

## 39. `lucassen1988`

- Authors: J. M. Lucassen, D. K. Gifford
- Title: Polymorphic effect systems
- Venue: Proceedings of the 15th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages (POPL '88), pp. 47–57
- Link: https://doi.org/10.1145/73560.73564
- Status: VERIFIED
- Result: Introduces a kinded type system with three base kinds: types (what an expression returns), effects (what side effects it may have) and regions (where in the store those effects occur). The effect information tells a compiler which expressions may be scheduled in parallel.

## 40. `wasm-component-model`

- Source: WebAssembly Component Model specification and Bytecode Alliance documentation
- Link: https://component-model.bytecodealliance.org/design/wit.html ; https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md ; https://github.com/WebAssembly/component-model/blob/main/design/mvp/Explainer.md
- Status: VERIFIED
- Result: A `resource` "defines a new abstract type for a resource, which is an entity with a lifetime that can only be passed around indirectly via handle values" (WIT.md). There are two handle types. An `own` handle implies "unique ownership of the resource"; when it is dropped the resource is destroyed (Explainer). A `borrow` handle is "a temporary loan of a handle from the caller to the callee for the duration of the call" (WIT.md): the callee must drop it before returning, and it may not appear in a function result.
- Syntax note: `own` and `borrow` are the handle type constructors of the component model's type grammar, written `(own $T)` and `(borrow $T)`. In the current WIT.md grammar an owned handle is written as the bare resource name and only the borrowed form has explicit syntax, `borrow<T>`; the string `own<` does not occur in WIT.md.

## 41. `attapl2005`

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

## 42. `esp32p4`

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

## Details that were not confirmed

- Entry 16 (`adya2002`): page numbers. The USENIX record gives none.
- Entry 27 (`wadler1990`): page numbers. The author's page gives none.
- Entry 19 (`berry1992`), entry 24 (`tofte1997`), entry 30 (`kennedy1994`), entry 35 (`plotkin2009`): the publisher abstract could not be fetched; each entry names the secondary source its summary rests on.
- Entry 20 (`hammond2003`): the level names were read from the authors' preprint, not from the Springer final version.
- Entry 12: the pre-OTP-19.2 reduction count.
- Entry 18 (`santanna2013`), entry 35 (`xie2021`), entry 36 (`boruch2023`): ACM article numbers.
