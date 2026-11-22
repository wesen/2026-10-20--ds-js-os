# Reader feedback on Article 1: "The Machine, the Mission and the Vocabulary"

## Passages I had to read twice

1. "Between 58 and 169 times slower than a laptop core, measured by running the same compiler on the same inputs on both."

   Two numbers a factor of three apart are given for one quantity, and nothing says which measurement gave which. I cannot calibrate any later speed claim in the issue against a figure I cannot interpret.

2. "One recording shows 363,727 bytes free early in boot and 35,831 bytes free once all programs were running."

   I could not tell which of these two figures is meant to be the *budget* later articles spend. The row's consequence column talks about stacks and low-level routines, but the numbers themselves measure free memory at two moments, so the reader has to invent the limit.

3. "It may also do anything the firmware may do."

   The pronoun arrives two sentences after "The native version is 5.5 times faster per turn…", with a sentence about memory accounting in between, so on first reading "it" could be the native code, the native version, or the engines. The point is important and is buried in an aside.

4. "The two engines also account for memory differently, so not all of the 182 KiB difference is code."

   No figure is given for how much is accounting and how much is code, so the sentence only removes a conclusion the reader had just been invited to draw. Worse, the article's own sizes suggest the code difference is about 148.6 KiB of the 182 KiB, i.e. that nearly all of it *is* code.

5. "A program cannot create a string or a buffer; the reactor owns a fixed set of them and lends them to the program."

   The reader needs numbers — how many strings and buffers, how large, whether borrowing is free, what happens when they run out — because this restriction shapes every typed program written in the rest of the issue. Article 1 never returns to it.

6. "In the typed compiler, this text is all the compiler needs."

   I read this twice because the next two sentences depend on knowledge the article has not given: that a string's length is a "32-bit count stored at the start of the string", and that `charCodeAt` is "a bounds check followed by a load of a 16-bit unit". The string layout is asserted, not shown or illustrated, so "all the compiler needs" quietly relies on a data layout the reader has to take on trust.

7. "and by about a thousand where only part of an application is typed"

   Which rows this refers to is not stated, and the phrase "where only part of an application is typed" sounds like it should make the comparison *fairer*, when in fact it makes it less fair. I had to go back to the table and divide each pair (206 / 0.20 ≈ 1,030; 523 / 0.52 ≈ 1,005; 425 / 1.99 ≈ 213) to work out what was meant.

## Terms used before they were explained, or never explained

- **JSON** — used in §1.2 and in the §1.2 flowchart ("screen description (JSON)"); neither the article nor the glossary says what JSON is or that it is a text format.
- **UTF-16 code unit** — the `string` type is defined as "a read-only counted sequence of UTF-16 code units", and the running example is called `countUnit`, but neither UTF-16 nor "code unit" is explained anywhere; that a code unit is 16 bits must be inferred from "a load of a 16-bit unit" in §1.4.
- **firmware** — used from the first table ("the firmware's tasks", "firmware image", "firmware privileges") and never defined.
- **partition** — "the firmware image may use an 8 MiB partition" is never explained as a reserved region of the flash chip.
- **RISC-V** — "Two RISC-V cores" appears before RV32 is glossed; the instruction-set family is assumed knowledge.
- **MB versus MiB** — "32 MB", "an 8 MiB partition, and files use about 8 MB", "about 4.3–4.5 MB": the two units are used side by side as if interchangeable and their difference is never stated.
- **memory management unit / virtual memory** — named in §1.1 only to say they are absent, with no explanation of what they normally do.
- **"Specialize library calls; repeat inference"** — a whole box in the §1.3 flowchart, unglossed here; the glossary entry "Library specialization" is tagged [3], so Article 1 uses it before explaining it.
- **QuickJS** — described only as "JavaScript, compiled at load time to bytecode and interpreted"; the reader is not told whether it is an existing embeddable engine or something written for this project.

## Claims I could not verify from the article itself

1. "Between 58 and 169 times slower than a laptop core, measured by running the same compiler on the same inputs on both." — No laptop, no compiler, no input named, and no explanation of why the factor varies by three times. The measurement exists only by reference.

2. "CJI can compile itself, and the self-compiled CJI runs on the handheld; the companion report describes how its output on the device was checked, byte for byte, against the workstation's." — The evidence is in a document not reproduced here. The article never states what was compiled, how two outputs were compared, or what "byte for byte" rules out.

3. "262 s originally; 206 s after the optimizations described in Article 3" and "1,475 s originally; 523 s after the same optimizations" — "The same optimizations" produce a 21% gain on Files and a 65% gain on Agenda. The article gives no reason for the fivefold difference in effect, so I cannot check that the cause really is the same.

4. "The two engines also account for memory differently, so not all of the 182 KiB difference is code." — No breakdown of the two memory figures is given. From the article's own numbers the code difference is 240,452 − 88,255 = 152,197 bytes (148.6 KiB) out of 182 KiB (186,368 bytes), so at most about 33 KiB can be accounting; the claim is unquantified and, as written, understates what the same table implies.

5. "Each RV32 instruction occupies 4 bytes, so the native form is 412 bytes." — True only if the compiler never emits the compressed 2-byte encodings that RISC-V allows. The article does not say whether it does, so the 412-byte figure and the "more than five times" comparison rest on an unstated assumption.

6. "Editor's budget on the device is 200 ms" and "The system's manifest… lists 22 worlds" — Both are asserted without the manifest being shown, and "in the builds measured here" is the only qualification.

7. "The interpreter confines the program" (QuickJS isolation column) — Unlike the WAMR row, no mechanism is given, and the article never says what happens to *other* worlds when a QuickJS world faults. The claim that a fault cannot damage other worlds has to be inferred from "May run untrusted source: yes".

8. "QuickJS… compiles the 16,326-byte Agenda source to bytecode in 37 ms on the same device." — A single figure with no repeat count, no warm-up note and no statement of what was included.

9. "The firmware image is currently about 4.3–4.5 MB." — No evidence given, and it is stated in a table cell about flash partitioning, where the reader most wants a source.

(Arithmetic that did check out, so these are not complaints: 1,475 s ÷ 60 = 24.6 min, matching "25 minutes"; 290.6 ÷ 52.9 = 5.49, matching "5.5 times faster"; 240,452 ÷ 88,255 = 2.72, matching "nearly three times"; 103 × 6 ≈ 77-byte comparison holds at 5.3×; 768 − 710 = 58 KiB free.)

## Section scores

- **1.1 The machine — 4.** The table of five resources with consequences is the clearest thing in the article, but the processor row's unexplained 58–169× range and the bare "RISC-V"/"memory management unit" vocabulary cost it a point.
- **1.2 The operating system in eight terms — 3.** The eight bolded terms are each defined, but they are packed so tightly that bytecode, interpreter, WebAssembly, linear memory, ELF, compositor and reactor all arrive in three paragraphs, and JSON and UTF-16 arrive with no definition at all.
- **1.3 The mission and the two compilers — 3.** The two pipelines in the flowchart are genuinely memorable, but the honest warning that the table is not a controlled comparison leaves the reader to do the divisions before the "hundred" and "thousand" factors mean anything.
- **1.4 One function through both pipelines — 5.** The best section: one program, two paths, every step tied to a concrete byte or instruction count, and the reason CJI needs the whole program is shown rather than asserted.
- **1.5 Where the code runs, and what that costs — 4.** The three-way trade-off table is exactly what a reader wants, but the memory-accounting sentence leaves about 33 KiB unexplained and the "It may also do anything the firmware may do" aside is easy to miss or misattribute.
- **1.6 Where the numbers come from — 3.** Honest about provenance, but saying that every figure comes from records not shown means nothing in the article can be checked from the article, and it pushes the reader to a second document.
- **1.7 Key points — 5.** Five bullets that faithfully summarise the sections, in the same order and with the same numbers; useful as a revision sheet.
- *(1.8 is the quiz, so it is not scored as a teaching section; see below.)*

## Questions that the article did not let me answer

- **Question 2, in part.** The engines' *isolation* is stated, but the question asks whether "a fault in the program can damage other worlds", and the article never says what happens to other worlds when a QuickJS or WAMR world faults — only that the interpreter "confines the program" and that such code "may run untrusted source". The answer requires an inference the text does not license in words. For native the answer is clear from §1.1 and §1.5.
- **Question 6, in part.** The definition of "hybrid" is inferable (§1.3 calls them hybrids and says the rest "remains as C code inside their reactors"), but *why* that breaks comparability is stated only as "The rows are therefore not a controlled comparison". The reader must reconstruct the argument from the column headers; a sentence naming the mixed workload would have made it answerable outright.
- All other questions (1, 3, 4, 5) were answerable from the text, though Question 4 is answerable only after doing arithmetic the article does not do.

## One thing to add and one thing to cut

**Add.** One short paragraph of provenance for "Between 58 and 169 times slower than a laptop core": which compiler, which input, which laptop core, and which of the two figures came from which measurement. Every speed claim in the issue is a ratio to a desktop and this is the only calibration point in Article 1; without it, numbers like "1,475 s" or "2–6 times slower than native" have no external anchor.

**Cut.** "The two engines also account for memory differently, so not all of the 182 KiB difference is code." It defends nothing, gives no quantity, and contradicts the impression made by the article's own size figures (240,452 − 88,255 = 152,197 of the 186,368 bytes), so it makes a clean point muddier. Better in Article 5, with the breakdown attached.
