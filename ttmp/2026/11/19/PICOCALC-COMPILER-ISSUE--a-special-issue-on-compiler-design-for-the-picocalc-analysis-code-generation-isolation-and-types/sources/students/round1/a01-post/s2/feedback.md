# Feedback from a student reader

## Passages I had to read twice

- "**Memory used, of a 768 KiB limit** ... 528 KiB ... 710 KiB" (§1.5) — I could not tell what the 768 KiB is. §1.1 says internal RAM has 363,727 bytes free at one boot and 35,831 once programs run, and that heaps and compiled code live in PSRAM. So which pool does 768 KiB come from, and does it include the compiled code or only run-time state? Q4 depends on this and the article never says.
- "The **typed compiler** ... There are no objects, closures, floating-point numbers or dynamic allocation." (§1.3) followed by "`string` (a read-only counted sequence of UTF-16 code units), `buffer` (a writable one)" — I had to go back and check how a `string` can exist with no dynamic allocation, i.e. who allocates it and how long it lives. The article never answers that.
- "The rows are not a controlled comparison: the programs were rewritten in the typed language, and for Files and Agenda only part of the application is typed." (§1.3) — if only part is typed, then "0.20 s (Wasm), 0.25 s (RV32) for its typed part" measures something whose boundary I cannot see. Twice through and I still do not know what "its typed part" excludes.
- "QuickJS ... compiles the 16,326-byte Agenda source to bytecode in 37 ms" (§1.3) — I read this twice looking for what "compiles to bytecode" costs in comparison, because 37 ms is compile time only and says nothing about how fast the bytecode then runs. The article never separates the two, so the 37 ms looks like an argument that bytecode is fast, which it is not evidence for.
- "Whether a piece of code may be run as machine code is therefore a question about where that code came from and who checked it." (§1.1) — a rhetorically strong sentence, but the article never says how "who checked" is decided, so it reads as a claim to be taken on faith at this point.
- "To compile `text.charCodeAt(at) === unit` without a general, slow comparison, it must know what `unit` can be, which depends on every caller." (§1.4) — "general, slow comparison" is doing a lot of work unexplained; I do not know whether this means a type-tagged comparison at run time, or a comparison that must handle strings, or something else.

## Terms used before they were explained, or never explained

- **cache** ("anything touched with the cache disabled", §1.1) — never explained; I do not know which cache, why it must be disabled, or from which context.
- **25 minutes / two seconds** (intro, §1 preamble) — the framing number "25 minutes" never appears again as a number; the table gives 1,475 s and 425 s, and the largest typed figure is 3.14 s. The reader has to guess that "25 minutes" means about 1,475 s and "two seconds" means about 3 s (or 0.20 s).
- **bytecode** (§1.2 engine table, §1.3) — used as if known; never defined, and its relation to the WebAssembly of the typed compiler is never stated.
- **linear memory** ("Each world has its own linear memory", §1.2) — never defined.
- **ELF file** ("RV32 machine code loaded from an ELF file", §1.2) — never expanded or explained.
- **lowering** ("Optional lowering" in the flowchart; "the optional lowering step turns them into 103 RV32 instructions", §1.4) — the word is used as a term of art with no definition; "translation" would have been enough.
- **manifest** ("The system's manifest lists 22 worlds", §1.2) — never explained: what file, who reads it, when.
- **PSRAM** ("External PSRAM, 32 MB") — never expanded, though the reader must know it is off-chip to understand the internal-RAM constraint.
- **WAMR** (§1.2 table) — never expanded (presumably WebAssembly Micro Runtime).
- **RV32** — the table says "RV32" under compressed instructions etc., but the article never says that RV32 means 32-bit instructions, which is the whole point of the size question in Q4.
- **UTF-16 code units** ("counted sequence of UTF-16 code units", §1.3) — never explained, although `charCodeAt` and `countUnit` both depend on it.
- **physical memory protection registers** (§1.1) — named, never explained beyond "they exist".
- **trap** — explained (§1.4, bold), good.
- **reactor**, **world**, **turn**, **claims**, **nucleus**, **engine**, **compositor** — all explained at first or near-first use, good.

## Claims I could not verify from the article itself

- "Roughly 60–170 times slower than a laptop core on the compiler workloads measured in this project" (§1.1) — no laptop is named, no workload is named, and no measurement is shown or referenced. Missing: which two machines, which compiler workloads, and where the measurement appears.
- "CJI can compile itself, and the self-compiled CJI runs on the handheld." (§1.3) — stated with no evidence: no compile time for the self-compilation, no statement that the self-compiled output was compared with the original, no pointer to a section or article. Missing: a step or a result showing the self-compiled CJI produces identical output.
- "In the stock system it runs in QuickJS; in the device firmware measured in this issue it has been compiled to native code by CJI" (§1.2, about the compositor) — the §1.5 table only gives numbers for the Editor. Missing: any measurement or artefact showing the compositor itself as CJI output.
- "363,727 bytes free at one boot, 35,831 bytes free once all programs are running" (§1.1) — "at one boot" suggests a single observation; no procedure, no variation across boots, no statement of which programs were running. Missing: how it was measured and whether it is typical.
- "The firmware image is currently about 4.3–4.5 MB" (§1.1) — no build output or commit is cited. Missing: which build, which date.
- "The native version is 5.5 times faster per turn, nearly three times larger" (§1.5) — the ratio is reproducible (290.6 / 52.9 = 5.49; 240,452 / 88,255 = 2.72), but "per turn" is stated while the row is "a 33-turn editing session", so the article never says what one turn of that session was. Missing: the definition of a turn of the benchmark.
- "The compiler emits 77 bytes of WebAssembly for the body, and the optional lowering step turns them into 103 RV32 instructions." (§1.4) — precise numbers with no artefact. Missing: the compiler invocation that prints them, or a reference to the appendix/article where the listing can be seen (Article 5 is promised, but nothing here lets me check the 77/103).
- "Editor's budget on the device is 200 ms." (§1.2) — no source; the manifest would presumably carry it, but the manifest is not shown.
- "QuickJS ... compiles the 16,326-byte Agenda source to bytecode in 37 ms on the same device." (§1.3) — no method; 16,326 bytes is suspiciously precise for a source that is also described only as "Agenda".
- "The last row deserves emphasis because it is the source of the *trust* question" (§1.1) — this is a claim about the rest of the issue that this article cannot support on its own; it asks the reader to accept a promissory note.

## Section scores

- **1.1 The machine — 5.** The table of five resources with a consequence column is the clearest page in the article, and the trust paragraph follows directly from the last row.
- **1.2 The operating system in six terms — 4.** Every one of the six terms is defined, but "engine", "manifest", "linear memory", "bytecode" and "ELF" are introduced inside those definitions without their own explanation, and the six-term promise hides a seventh term ("claims" is folded into "world").
- **1.3 The mission and the two compilers — 2.** This is the weakest section: the two flowcharts are good, but the comparison table admits in the same breath that the rows are not comparable, "for its typed part" is never unpacked, and the "25 minutes / two seconds" framing from the introduction turns into numbers that do not match it.
- **1.4 One function through both pipelines — 4.** The typed half is excellent and follows one thing at a time; the CJI half lists the facts needed but never shows what CJI would put in their place, so the contrast is asserted rather than demonstrated.
- **1.5 Where the code runs, and what that costs — 3.** The table has the numbers a reader wants, but the "768 KiB limit" pool is undefined, "memory used" is unqualified, and the one question the table raises in a reader's mind (why is native bigger?) is left for later articles.
- **1.6 Key points — 5.** Five bullets, each traceable to a sentence above; a reader who skipped the body could still answer four of the six questions from this alone.
- **1.7 Check your understanding — 4.** Questions 1, 2, 3, 5 and 6 are answerable from the text with the right amount of work; question 4 asks for a causal explanation the article does not give.

## Questions that the article did not let me answer

- **Q4 (why is the native Editor larger?)** — the article gives the sizes and calls native "nearly three times larger", but never states why. A reader can only infer a cause from §1.4's 77-bytes-to-103-instructions example, which compares a function body, not an application. Missing: one sentence saying what the extra bytes are (wider instructions, bounds checks, code the interpreter no longer provides), or an explicit forward reference to the article that explains it.
- **Q5 (draw a line of text) — partly.** The prose says only that an application sends the compositor a JSON description. The words "display driver world" and "LCD" appear only in the mermaid diagram and in the §1.1 table row "Display driver world"; the text never says that the compositor itself sends output onward to the display driver. Missing: one prose sentence carrying the last two hops.
- **Q2 — nearly, but not for the reason stated.** The engine table gives "The interpreter confines the program" for QuickJS and "None: the code runs with firmware privileges" for Native, so the answer is derivable; however, the article never says whether a trapped WAMR world or a stopped QuickJS world is *restarted* or discarded, which "can damage other worlds" arguably implies. A reader may over- or under-read the word "damage".
- **Q6 — answerable, but only loosely.** The distinction (bytecode for an interpreter versus machine code from untyped source) is stated in one sentence in §1.3, without evidence that the 37 ms is a like-for-like compile step; a careful reader notices that QuickJS's step also does not do type inference, and the article does not confirm that this is the whole difference.
- **Q1** is answerable from §1.2 alone; **Q3** from §1.4 alone. No changes needed.

## One thing to add and one thing to cut

**Add:** a short "reading the two tables" paragraph — or a footnote per table — that states, for each numeric column, exactly what was measured and against which budget: what the 768 KiB limit is a limit on, whether "compiled size" and "memory used" count the same thing, and what one benchmark "turn" is. Four of the six quiz questions turn on those tables, and the one that fails (Q4) fails exactly because the tables are given without a key.

**Cut:** the Files and Agenda rows of the §1.3 timing table, or at least the two "for its typed part" cells. The article itself says those rows are not a controlled comparison and defers the isolation of the cause to Article 3, so the cells buy nothing but two confusing figures and undermine the section's credibility. Keeping only the Editor row (which the article says is "the entire application") leaves the two-column contrast intact and honest, and gives the section room for the sentence about *why* typed compilation is cheaper instead of the roll-call of unverifiable numbers.
