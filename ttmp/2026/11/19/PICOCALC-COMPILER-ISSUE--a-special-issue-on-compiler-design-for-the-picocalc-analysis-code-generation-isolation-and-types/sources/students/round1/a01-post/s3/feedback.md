# Feedback on Article 1: "The Machine, the Mission and the Vocabulary"

## Passages I had to read twice

- "Internal RAM | A few hundred kilobytes; 363,727 bytes free at one boot, 35,831 bytes free once all programs are running | Stacks and anything touched with the cache disabled must fit here." — "the cache disabled" is never explained anywhere: whose cache, CPU data cache, and why would anything be touched with it disabled? Without that, the consequence column does not tell me what actually has to fit in internal RAM.
- "Memory used, of a 768 KiB limit" — where the 768 KiB limit comes from is never stated. Earlier I was told internal RAM is a few hundred kilobytes and PSRAM is 32 MB, so I cannot tell whether 768 KiB is the per-world memory limit from the manifest, or a total, or a subset of PSRAM.
- "The rows are not a controlled comparison: the programs were rewritten in the typed language, and for Files and Agenda only part of the application is typed." — it took a second read to see that the Editor row is marked "the entire application" while the Files and Agenda rows are only "its typed part", so the columns are measuring different amounts of program.
- "it means the compiler copies the program's code into a reserved place inside that prebuilt module and patches the connections" — "patches the connections" is the operative phrase and I still do not know what a "connection" is (function pointers, a table, call sites?).
- "the compiler emits 77 bytes of WebAssembly for the body, and the optional lowering step turns them into 103 RV32 instructions" — this is the only evidence in the article for why native code is bigger, but nothing says whether 103 RV32 instructions are 4 bytes each (412 bytes) or compressed (fewer), so I could not use it to explain the size gap myself.
- "Five properties of that chip set the terms for every design decision in this issue." — reads like a table introduction, but the fifth row (memory protection) is then discussed in prose and the other four are not, so I expected four more explanations.

## Terms used before they were explained, or never explained

- **cache** ("anything touched with the cache disabled"): never explained.
- **WebAssembly**: the format is assumed known; it is never introduced even though the whole comparison depends on what it is.
- **bytecode**: used for QuickJS ("compiled at load time to bytecode and interpreted") without definition.
- **linear memory** (WAMR row): never explained; I inferred "a flat array the program owns".
- **ELF file** ("machine code loaded from an ELF file"): never explained.
- **compressed instructions** (in the processor row): never explained, and it matters for the code-size discussion.
- **RISC-V / RV32**: assumed background, only glossed as a 32-bit core.
- **lowering** ("optional lowering step"): glossed only as "translates that WebAssembly to RV32 machine code"; it is not clear whether it is a separate tool, a compiler pass, or part of the same binary.
- **specialize library calls** (inside the CJI flowchart, and again as "specialize library calls; repeat inference"): appears only in the diagram label and in Question 6's answer material, never in prose.
- **"a 16-bit unit"** / "counted sequence of UTF-16 code units": UTF-16 is assumed known.
- **PSRAM**: named as "external PSRAM" with 32 MB, but never contrasted with internal RAM beyond one sentence.
- **768 KiB limit**: never tied to the manifest's "memory limit" for a world.
- **the lifetime/free bytes figures** ("363,727 bytes free at one boot"): what "at one boot" means is not explained.

## Claims I could not verify from the article itself

- "Roughly 60–170 times slower than a laptop core on the compiler workloads measured in this project" — no measurement, no laptop model, no workload named in this article.
- "WAMR | ... | 2–6 times slower than native in the measurements here" — the measurements are not shown here; I am asked to accept a range.
- "CJI can compile itself, and the self-compiled CJI runs on the handheld" — no evidence, timing or version given; a self-hosting claim is a big one to state bare.
- "Article 3 presents the experiments that do isolate the cause" / "Article 3 explains why collecting them takes minutes" — the causal claim is deferred entirely; this article asserts it but gives no experiment.
- "The compiler emits 77 bytes of WebAssembly for the body" and "103 RV32 instructions" — no listing, no compiler flags, no way to check the counts.
- "The firmware image is currently about 4.3–4.5 MB" — no build output shown.
- "The system's manifest lists 22 worlds" — no manifest excerpt.
- "the whole address space" (memory-protection row) — no statement of what the address space is or how PMP registers are used.
- "Most of this issue is about removing that trade" — a promise about later articles; nothing here supports it.
- "Roughly 60–170 times" and "5.5 times faster per turn" are of different kinds: the second I could check (290.6 ÷ 52.9 ≈ 5.49) and the first I could not.
- "nearly three times larger" — this one I could check (240,452 ÷ 88,255 ≈ 2.72), but it sits next to "leaves only 58 KiB of its memory limit free" (768 − 710 = 58 ✓), while the *memory* ratio is only 1.34; nothing explains that the growth is all code.

## Section scores

- **1.1 The machine — 4.** The table of five resources is concrete and memorable, but the "cache disabled" phrase and the unexplained laptop comparison left gaps; a reader cannot check any figure.
- **1.2 The operating system in six terms — 4.** World, claims, nucleus, turn, budget, engine, compositor and reactor are each defined crisply and in dependency order; the engine table is the clearest thing in the article. It loses a point because "linear memory", "ELF" and the 768 KiB limit go undefined.
- **1.3 The mission and the two compilers — 5.** The one-question framing ("how much must the compiler understand before it emits the first instruction?"), the two flowcharts, and the three-orders-of-magnitude table make the contrast impossible to miss.
- **1.4 One function through both pipelines — 5.** The worked `countUnit` example is the best teaching move in the article: the same eight lines, once trivially compilable and once needing facts from the whole program.
- **1.5 Where the code runs, and what that costs — 3.** The four-row comparison is exactly the right shape, but the row headers mix compiled size with runtime memory, no explanation is given for the 710 vs 528 KiB gap, and the speed/size/freedom trade-off is asserted rather than derived.
- **1.6 Key points — 3.** Accurate, but almost a verbatim restatement of the sections; it adds no compression and repeats "reactor" without the patching detail.
- **1.7 Check your understanding — 4.** Questions 1, 3 and 5 are answerable straight from the text and test real understanding; questions 4 and 6 need facts the article did not supply (see below).

## Questions that the article did not let me answer

- **Question 4** ("give one reason from this article why the native version is larger") could only be answered by stretching the 77-bytes → 103-instructions example, which is about one function, not the whole Editor, and says nothing about the 710 vs 528 KiB memory figure the question actually quotes. What is missing: a sentence on where native code size comes from (per-instruction width, no shared runtime, inlined checks) plus a memory breakdown for the native session.
- **Question 6** was answerable in outline, but only if the reader already knows what bytecode is. What is missing: one clause explaining that an interpreter's bytecode is compact and does its type work at run time, so nothing has to be proven ahead of time.
- **Question 2** asked whether a fault "can damage other worlds"; the article's isolation column implies the answer but never states that an interpreter fault is contained to the offending world, so I answered partly by inference.

## One thing to add and one thing to cut

- **Add:** one short paragraph in 1.5 breaking down the native Editor's 710 KiB (code, heap, stacks) and stating plainly why lowered machine code is bigger than the WebAssembly it came from — that single paragraph would fix the weakest answerable area and Q4 with it.
- **Cut:** the "Key points" list in 1.6, or reduce it to the three facts a reader must carry into Article 2 (32 MB PSRAM and no MMU; turn budget; three engines with only two confining) — as written it repeats the body text and spends a bullet on the reactor, which 1.2 already defines better.
