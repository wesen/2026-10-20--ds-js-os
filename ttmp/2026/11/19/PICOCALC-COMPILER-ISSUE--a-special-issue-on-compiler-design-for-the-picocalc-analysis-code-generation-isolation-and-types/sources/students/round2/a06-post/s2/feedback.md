# Reader feedback on "6. When to Compile: Caches, Load-Time Generation and Tiers"

Read as a student reader, start to finish, with `glossary.md` open for terms.

## Passages I had to read twice

- "The estimate of 1.2 s is the device's native compile time minus its WebAssembly compile time, 3.14 − 1.99 s." — Why is the difference between two full builds equal to "translate to RV32 and link only"? The step assumes that the frontend costs the same in both builds, so subtracting cancels it exactly; that assumption is never stated. Also the subtraction gives 1.15 s, yet the table row says "about 1.2 s", so I could not tell whether 1.2 was a rounded 1.15 or a separate measurement.

- "The project has already built this once, for CJI. … A small record, kept in the device's non-volatile settings storage, says which slot is active and holds the engine, the hash of the source, the hash of the compiled module, and the identity of the firmware build." — The record apparently holds no compiler version and no reactor version, and the earlier section insists the key must cover all five inputs, so this looked like a contradiction until the next sentence explained the firmware identity stands for three inputs at once. The order (claim from a different compiler, then the resolution) made me back up.

- "It occupies memory while it runs: a peak of 1.5 MB for Editor's WebAssembly build and 2.5 MB for its native build. This memory belongs to a temporary interpreter that exists only for the duration of the compile; it is separate from the memory limit of the world being compiled." — Nothing earlier says the typed compiler itself runs under an interpreter, so "temporary interpreter" arrived unexplained. Which interpreter, and why does the native build need 1 MB more of it?

- "Compiling it during boot took 7,028 ms. With a stored module, reuse took 20 ms on a system that was already running; during a boot, the world was ready about 1,450 ms after the start of the boot, a figure that includes the startup of all the other worlds." — Three different measurements (boot-time compile, warm reuse, time-to-ready in a boot) are given without saying what each includes, so 20 ms and 1,450 ms look contradictory at first. Later, "in the project's test this took 7,047 ms", a rebuild after a damaged module, is only 19 ms away from the 7,028 ms cold compile; I could not tell whether those are two measurements or one repeated.

- "For their object-tracking program, interpretation became more expensive than native loading only after about 40,000 to 80,000 iterations." — Expensive in what currency (energy, time, memory?) and "iterations" of what loop? The paragraph's conclusion depends on the answer, and neither is given.

- "If the compile happens at every boot, native code is a loss in any session shorter than 160 key presses." — The 160 was computed in *turns*; the sentence switches to *key presses*. Whether one key press produces one turn, or several, decides whether the number means anything, and the article does not say.

- "The second remains useful as the form in which an application is *distributed*, because a module in that form can be given to either engine." — I had to reread which "second" and which "third" the sentence means, since the rows were just called "middle row" and "third row". Naming the rows (checked WebAssembly / native module) would fix it.

- "Article 5's counting model predicts native code 2.66 to 3.32 times smaller than today's. … at which point the whole application fits comfortably as native code and the selection machinery is unnecessary." — "Fits comfortably" is a memory claim, but the 2.66–3.32 factors are about code size only; I had to reason on my own that the code portion, not the whole 710 KiB, is what shrinks.

## Terms used before they were explained, or never explained

- **Import table** — appears only in the diagram in 6.8 ("Compute key: source, compiler, reactor, engine, import table"). The prose calls this the "reactor's function table"; neither phrase is in the glossary, and "import table" is never defined anywhere.
- **Link / link step / reactor linker** — used in 6.3 and 6.4 as if known; the glossary defines *lowering* and *trampoline* but not linking, and the article never says what the reactor linker does.
- **Frontend** — used in 6.4 after an inline gloss, but only in passing; there is no glossary entry, and "backend" is used in 6.6 ("A better backend") with no definition at all.
- **Flash / firmware partition / firmware image** — used throughout as background knowledge; the glossary has nothing on storage, and only 6.4's table hints at what flash is.
- **RV32** — explained only inside the *Engine* entry of the glossary ("native (RV32 machine code)"), never in the article; a reader who does not know RISC-V has to infer that RV32 means 32-bit RISC-V.
- **Experiment 3** — cited twice ("Experiment 3's workstation profile", "the harness built for Experiment 3") with no statement of what the experiment is or where it is described.
- **The project's device-language document / device-language study** — cited as the source of the per-function cache design and of the 140.6 s CJI figure; neither is identified by article number or title, unlike other references.
- **Well-formedness** ("checked for well-formedness in one forward pass") — no glossary entry; the *Verifier* entry is the nearest thing, but it is about machine code, not WebAssembly validation.
- **Hash** — used from 6.3 onward ("cryptographic hash", "recompute the hash"); the glossary's *Content key* entry mentions hashes but neither defines hashing nor says which algorithm is meant.
- **Turn (used as the unit of session length)** — the glossary defines a turn as handling one event, but 6.5 converts turns into "key presses" and into "the first few minutes of use" without a stated events-per-second figure.

## Claims I could not verify from the article itself

- "For Editor that is 1.99 seconds for WebAssembly or 3.14 seconds for native code, paid each time the device starts" — the numbers are attributed to Article 2, which is not reproduced; no run count, variance, device, or method for timing is given, and every later calculation (1.15 s, 1.2 s, 160 turns, 17/26 ms per function) inherits them.
- "The compiler occupies flash: 43 kB of JavaScript source for the typed compiler, against about 660 kB for the CJI tool." — Two figures with no definition of what is counted (source only? minified? including library?), and the fifteenfold difference is left without comment.
- "For the typed Editor one should expect the loading time measured in Article 1, 14 ms for the native module, plus the time to hash about 240 kB, which has not been measured and should be tens of milliseconds." — The 14 ms comes from another article, and "tens of milliseconds" for 240 kB admits it is an estimate; nothing here lets me check it, and the total predicted boot cost inherits the estimate.
- "Experiment 3's workstation profile agrees roughly: it puts translation to RV32 at 41 percent of the native path, which would be 1.3 s on the device." — The multiplication (0.41 × 3.14 = 1.29 s) works only if 41 percent is of the same native total and if the workstation's proportions transfer to the device; neither premise is argued, and the result is then called "rough" agreement with 1.15 s.
- "This project's measured ratio is inside that range: 4.76 bytes of RV32 code per byte of WebAssembly function body for Editor." — No statement of how the ratio was measured (which sections of the modules were compared, whether headers/data/reactors were excluded).
- "The study illustrated the scale with an assumed saving, not a measured one: if native code saved one millisecond on every call … about 140,000 calls." — Honestly flagged as assumed, but the 140.6 s and 0.082 s figures beside it have no measurement conditions either.
- "It is now compiled once per boot and the result shared, which reduced that work from 627 ms to 198 ms." — No indication of how the 627 ms was distributed over eleven worlds, or whether the 198 ms includes the cost of sharing.
- "The compiler uses no clock and no randomness, so the same inputs should give the same bytes" — asserted from reading the compiler; the article itself then says "Equality of the bytes between a workstation build and a device build remains to be checked", so the claim is open.
- "Article 5's counting model predicts native code 2.66 to 3.32 times smaller than today's." — The model is in another article and the range is quoted without its source assumptions; the mixed-mode recommendation rests entirely on it.

## Section scores

- **6.1 Four moments — 5.** The table is the clearest thing in the article; moment, location, frequency and who waits are separated, and the two compilers are placed in named rows.
- **6.2 What on-device compilation buys and costs — 3.** The three-gains/three-costs structure is easy to follow, but "temporary interpreter", the unexplained CJI 660 kB contrast, and the unstated relation between compiler memory and world memory left the section half-understood.
- **6.3 A cache keyed by content — 4.** The five-input table and the record-to-input mapping are convincing and self-checking, though the trace vocabulary is dense and the per-function subsection's link-step argument is thin.
- **6.4 Shipping a checked intermediate form — 3.** The storage comparison is the useful part, but the 1.2 s derivation is a subtraction presented as a measurement, the slim-binary speed evidence is hedged in two directions, and the Contiki/Maté digression takes two paragraphs to make one point.
- **6.5 Break-even arithmetic — 5.** Every number is shown being subtracted and divided, the result (~160 turns) is stated, and both the boot-time and the cached interpretation of the answer are given.
- **6.6 Tiers and mixed mode — 4.** The 4.76 / 2.7 distinction and the three costs of mixed mode are clear, but the 2.66–3.32 prediction and the phrase "fits comfortably" carry more weight than the text supports.
- **6.7 Doing the work before the device boots — 3.** Two systems I cannot look up are described in a paragraph each, and the project's own 627 ms → 198 ms gain has no method; the actionable proposal at the end is clear but arrives late.
- **6.8 A combined design — 3.** The flowchart is helpful, but its "import table" label contradicts the prose's "reactor's function table" and is the only place that term appears.
- **6.9 Key points — 4.** An accurate and compact summary of the sections, though it repeats the 160-turn figure without the turn-versus-key-press caveat.
- **6.10 Check your understanding — 4.** Every question is answerable from the article, and the questions target real content rather than trivia; question 3 is the only one needing an unstated unit assumption.

## Questions that the article did not let me answer

All six were answerable, with two qualifications:

- **Question 3** could not be answered *precisely* because the article mixes turns and key presses in its conclusion. I computed 160 turns and then had to assume the intended reading ("a session of fewer than about 160 turns loses") without being told how many turns a key press generates.
- **Question 4** asked why Franz and Kistler considered the design worthwhile. The article gives the answer in one sentence ("They judged that an acceptable price for a single file that runs on every processor"), but it gives the *size* of the penalty only for the fastest machine and for a whole suite, so the answer can be repeated but not weighed.

Everything else — the firmware-identity mapping, the two-slot write order, the memory limit and the 4.76/2.7 distinction — was stated plainly enough to answer with the text closed. Question 1 was the one that came closest to being unanswerable: the reader must accept that compiler, reactor and function table are "all part of the firmware image" without any description of that image.

## One thing to add and one thing to cut

**Add:** a short "measurements used" box at the start of 6.5 (or at the head of the article) collecting the raw figures every calculation depends on — 1.99 s and 3.14 s compile, 8.8 ms and 1.6 ms per turn, 528 and 710 KiB, 768 KiB limit, 88 and 240 kB — each with the article and experiment it came from and a one-line note on what was timed. Nine of the article's conclusions are arithmetic on numbers that live outside the article, and a reader cannot reproduce a single one.

**Cut:** the Maté paragraph in 6.4 (and, with it, most of the Contiki paragraph). "A tiered system … the reasoning has the same shape" is the point; two paragraphs of sensor-network history delay it, and the Maté paragraph ends in a claim about QuickJS and WebAssembly that the paragraph does not actually establish.
