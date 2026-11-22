# Feedback — Article 6, "When to Compile: Caches, Load-Time Generation and Tiers"

Read as a student, front to back, with `glossary.md` open.

## Passages I had to read twice

- "It occupies memory while it runs: a peak of 1.5 MB for Editor's WebAssembly build and 2.5 MB for its native build. This memory belongs to a temporary interpreter that exists only for the duration of the compile..."
  What is the "temporary interpreter"? The typed compiler emits WebAssembly itself; it does not run an interpreter. I guessed this means the WAMR instance used to execute the compiler (which is itself a WebAssembly module), but the article never says so, and it matters because the reader is being asked to compare 1.5/2.5 MB against a 768 KiB world limit.

- "Franz's dissertation, on a different processor, reported that loading with code generation required 'little more time than the input of equivalent native code' [Franz 1994]."
  "the input of equivalent native code" is opaque — reading it in? loading it? — and the sentence sits directly after "almost twice the time of loading native binaries", so I could not tell whether it is meant to support that figure or to qualify it.

- "With a stored module, reuse took 20 ms on a system that was already running; during a boot, the world was ready about 1,450 ms after the start of the boot, a figure that includes the startup of all the other worlds."
  Three numbers (7,028 ms, 20 ms, 1,450 ms) are given but their starting points are not aligned, so I could not compute the saving myself. Is 7,028 ms also measured from the start of a boot? If yes, comparing it to 1,450 ms mixes in the other worlds; if not, the comparison is between unlike things.

- "The middle row is the slim-binary design. It removes the frontend ... and it keeps the stored form usable by either engine."
  Stored WebAssembly is not directly usable by the native engine — it has to be translated to RV32 first, which is exactly the work the row's "translate to RV32 and link only" column states. I re-read to work out that "usable by either engine" means "usable without going back to source".

- "What is lost by storing a compiled form of any kind is exactly one thing: the stored form can become stale."
  "Exactly one thing" is a strong claim; on re-reading I found other losses discussed in the same article (240 kB instead of 88 kB of flash, loss of the property that one text serves two engines), so the paragraph reads as if it is arguing rather than describing.

- "Editor has 120 functions. It compiles in 1.99 s to WebAssembly and 3.14 s to native code, so a function costs 17 ms or 26 ms on average..."
  Neither the divisor nor the division is shown; I re-read to check 1.99/120 ≈ 16.6 ms and 3.14/120 ≈ 26.2 ms. It is easy arithmetic, but the text does not display it while it displays the break-even division in 6.5.

## Terms used before they were explained, or never explained

- **import table** (§6.8 diagram, "Compute key: source, compiler, reactor, engine, import table") — never defined anywhere in the article or glossary; it appears to be the same thing as "the reactor's function table" from §6.3.
- **the reactor's function table** (§6.3) — described in one appositive ("the list of functions the reactor offers to compiled code") and used as a cache-key input, but how a call is bound "by position in that table" is never shown.
- **cryptographic hash** (§6.3) — used as the construction for the key without any definition, and without saying why a collision would be a correctness bug rather than a nuisance.
- **slot A / slot B** (§6.3) — the glossary gives two meanings of *slot* (frame slot, reactor slot) and neither is this one: a file-system storage area holding one module plus its source. A third meaning is used before it is added to the glossary.
- **RV32** (§6.1 onward, repeated in every table) — never expanded; the glossary only mentions "native (RV32 machine code)" inside the definition of *engine*.
- **reactor linker** (§6.3, "it is the same kind of patching the reactor linker already performs"; §6.8 area) — referred to as an existing component that the reader is expected to know; the glossary defines *trampoline* but not the linker.
- **prelude** (§6.7) — described only as "a library of common functions that every JavaScript world loads"; how or when it is compiled and how the result is shared is not stated.
- **counting model** (§6.6) — the whole recommendation not to build mixed mode rests on it, and the only explanation is "Article 5's counting model"; what it counts is left to the other article.

## Claims I could not verify from the article itself

- "a peak of 1.5 MB for Editor's WebAssembly build and 2.5 MB for its native build" — no statement of how peak was measured, whether it includes the "temporary interpreter", or where the figure comes from.
- "43 kB of JavaScript source for the typed compiler, against about 660 kB for the CJI tool" — no provenance: minified or not, and what counts as part of "the tool".
- "The estimate of 1.2 s is the device's native compile time minus its WebAssembly compile time, 3.14 − 1.99 s." — this subtraction is only valid if both builds share everything except the RV32 translation and both were measured the same way; the article asserts the comparison but does not show that the frontend is identical in the two paths.
- "This project's measured ratio is inside that range: 4.76 bytes of RV32 code per byte of WebAssembly function body for Editor." — the two module sizes and the function count are given, but not the per-function byte totals, so I could not reproduce 4.76 from anything on the page.
- "The compiler uses no clock and no randomness, so the same inputs should give the same bytes" — determinism is asserted; the very next clause says byte equality "remains to be checked", so the article is citing the check it has not done.
- "It is now compiled once per boot and the result shared, which reduced that work from 627 ms to 198 ms." — unclear whether 627 ms is one compile or eleven, and no measurement setup is described.
- "For their object-tracking program, interpretation became more expensive than native loading only after about 40,000 to 80,000 iterations." — no cost model and no working, so the break-even cannot be reproduced or checked.
- "Editor has 120 functions." — the counting rule is missing (declarations only? nested functions? generated helpers?), and the 17 ms / 26 ms per-function figures depend on it.
- "the firmware partition is 8 MiB and the firmware image occupies about 4.2 MiB of it" — no source, and no statement of how many cached native modules fit in the remainder.
- "Compiling it during boot took 7,028 ms. With a stored module, reuse took 20 ms on a system that was already running; during a boot, the world was ready about 1,450 ms after the start of the boot" — the three figures are not tied to a common time origin, so the speedup can be quoted but not checked.

## Section scores

- **6.1 Four moments — 5.** The four-row table plus one sentence per compiler places both CJI and the typed compiler on the map unambiguously.
- **6.2 What compilation buys and costs — 4.** The three gains and three costs are clearly enumerated, but "temporary interpreter" is unexplained and the memory figures have no provenance.
- **6.3 A cache keyed by content — 4.** The five-input key table and the CJI field-mapping table are the clearest pages in the article; the per-function grain is asserted rather than derived, and 4.76 is quoted here-before-its-inputs are given in 6.6.
- **6.4 Shipping a checked intermediate form — 3.** The three-row storage comparison is genuinely useful, but the 1.2 s estimate rests on an unstated assumption, "exactly one thing" overclaims, and the jump from sensor-node systems to "QuickJS and WebAssembly remain the right engines" is not argued.
- **6.5 Break-even arithmetic — 5.** Every number is on the page, both divisions are written out, and I could redo them and get the stated results.
- **6.6 Tiers and mixed mode — 4.** The two ratios, the memory limits and the recommendation follow each other in order; the objection is only that the decisive "counting model" prediction is taken on trust.
- **6.7 Doing the work before the device boots — 3.** Moddable and MicroPython get one sentence each with no numbers, and the prelude paragraph uses a term it does not define.
- **6.8 A combined design — 4.** The flow chart states both paths and their merge point clearly, but it introduces the undefined label "import table".
- **6.9 Key points — 4.** The summary is faithful to the sections; "2.0 to 3.1 seconds" rounds 1.99 and 3.14 in a way that hides the 1.15 s gap the article spends a section computing.
- **6.10 Check your understanding — 5.** All six questions are answerable from the text; two of them require joining two separate paragraphs, which is fair for a review section.

## Questions that the article did not let me answer

None were unanswerable. Two were strained:

- **Q4** required reading the slim-binary paragraph carefully to separate the *portability* motive from the *speed* report, because the paragraph leads with numbers and states the motive only afterwards; and the following Franz 1994 sentence reads as a contradiction.
- **Q6** required combining the §6.6 parenthetical ("each module also contains its reactor, which is the same C code in both") with the two ratios, one of which (4.76) has no visible derivation. A reader who did not notice the parenthetical could only guess why 2.7 and 4.76 differ.

## One thing to add and one thing to cut

**Add.** A short definition, early in §6.3, of the reactor's function table — the thing the §6.8 diagram calls the "import table" — with a two-line example showing that compiled code calls reactor function *k* through the *k*-th entry, so that inserting a reactor function shifts every later entry and invalidates the key. This is the one cache-key input the article never makes concrete, and it is also the only input whose staleness cannot be caught by a compiler change alone.

**Cut.** The sentence "Franz's dissertation, on a different processor, reported that loading with code generation required 'little more time than the input of equivalent native code' [Franz 1994]." It muddies the point it is attached to: it appears to contradict the "almost twice as long" figure immediately before it, its wording ("the input of equivalent native code") does not say what was measured, and the Franz & Kistler report already carries the argument.
