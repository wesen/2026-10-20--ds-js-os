# Feedback on "6. When to Compile: Caches, Load-Time Generation and Tiers"

## Passages I had to read twice

- "The middle row is the slim-binary design: it removes the frontend, which Experiment 3 found to be about 58 percent of the native compile path, and keeps the stored form portable across engines."
  Unclear because the two numbers in play do not obviously agree. 58 percent of the native path (3.14 s) is about 1.82 s, which would leave about 1.32 s, yet the table says "about 1.2 s" and the text elsewhere calls the WebAssembly compile 1.99 s. I could not tell whether the frontend percentage is measured from the WebAssembly build or the native build, nor whether "lowering" was part of the 58 percent.

- "The module and the source are written to storage first, and the record is updated last. A power loss in between leaves the old record pointing at the old, intact module."
  Unclear because the same section says the installer stores the module "in one of two slots". If the new write overwrites the slot the old module was in, the old module is not intact, and the old record would point at garbage. The passage only works if writes always alternate slots, which is never said.

- "The same reasoning applies on the handheld to code that changes with every keystroke of an edit session, and it is why QuickJS and WebAssembly remain the right engines for code under development."
  Unclear because Maté's argument is about the energy cost of transmitting programs over radio, and nothing is transmitted on the handheld. The step from "shipping tiny programs over a radio" to "keeping an interpreter for code being edited" is asserted, not argued.

- "It follows from local checking with no further analysis."
  Unclear: which property follows, and what "analysis" would otherwise have been needed? Article 4 is credited with local checking, but I cannot see from this article alone why index renumbering at link time is analysis-free.

- "This project's measured ratio is inside that range: 4.76 bytes of RV32 per byte of WebAssembly function body for Editor."
  Unclear at first because earlier the article compares whole modules (240 kB native versus 88 kB WebAssembly, a ratio of 2.7). Only after noticing the words "function body" did the two ratios stop conflicting. The reader is not warned that the numbers measure different things.

## Terms used before they were explained, or never explained

- *reactor* — used in the introduction and in every cache-key table; "uses the terms from Article 1" is all the explanation given.
- *engine* — same: named in the introduction, never defined here.
- *turn* — used in the break-even calculation ("7.2 ms of processor time per turn") with no definition in this article.
- *CJI* — never expanded or explained, yet it is one of the two compilers the whole article compares.
- *typed compiler* — never defined; the reader must infer it is the compiler producing WebAssembly and RV32.
- *lowering* / "lower" — appears in the 6.4 table ("Lower and link only") with no explanation of what lowering is.
- *frontend* — used once as if the reader already knows the phase split.
- *world* — "Every world has a memory limit"; what a world is is not stated here.
- *reactor linker* — referred to as an existing thing the reader should know about.
- *non-volatile storage* — used without saying what it is on this device or how it differs from the file system slots.
- *import table* — appears in the 6.8 flowchart ("Compute key: source, compiler, reactor, engine, import table") but section 6.3 called the same input "the table of functions the reactor offers"; two names, one explanation, no cross-reference.
- *QuickJS prelude* — "the JavaScript prelude" is introduced in passing in 6.7 with no definition.
- *confined world* / "unconfined native code" — the confinement idea is used as an argument in 6.6 but never explained.
- *firmware partition* — used ("8 MiB and holds about 4.4 MB") without saying what it contains or why size is measured both in MiB and MB.

## Claims I could not verify from the article itself

- "a peak of 1.5 MB for Editor's WebAssembly build and 2.5 MB for its native build"
  Missing: the measurement conditions (what counts as peak, whether this is heap, stack or total RSS) and how it relates to the 768 KiB world memory limit used later. The two numbers look inconsistent with the 528/710 KiB figures unless the reader guesses that one is compile-time memory and the other is the loaded world.

- "Experiment 3 found [the frontend] to be about 58 percent of the native compile path"
  Missing: Experiment 3 is not in this article, and Article 2 is referenced but not summarised. No breakdown of the compile phases is given, so the percentage cannot be checked.

- "about 0.01 s to load, plus hashing"
  Missing: the hashing cost for a 240 kB module on this device. Since hashing is precisely what makes the native row slower than "0.01 s", leaving it unquantified means the comparison with the 1.2 s row is not fully supported.

- "Compiling Files with CJI took 140.6 seconds in the best case... If native code saved one millisecond on every call into the application, the compile would be repaid after about 140,000 calls."
  Partly checkable: 140.6 s / 1 ms = 140,600, so the arithmetic holds. Missing: whether one millisecond per call is a plausible estimate for this device, and whether CJI has any measured per-call cost at all.

- "The compiler is deterministic, and the harness built for Experiment 3 already produces a module of exactly the size the device produces."
  Missing: any evidence for determinism (same bytes, not just same size), and any statement of how "exactly the size" was established. Determinism is load-bearing, because the whole cache design depends on identical inputs meaning identical bytes.

- "the average function costs under 20 ms on the device"
  Missing: this is a division (about 2,000 ms / 120 functions) that silently assumes compile time is proportional to function count with no fixed overhead, and that function sizes are uniform. No per-function measurement is cited.

- "WebAssembly... can be checked for well-formedness in one forward pass"
  Supported only by the Haas et al. quotation, which speaks of validation in a single pass. Missing: what the device actually does with that pass, and whether the project's loader performs validation at all.

## Section scores

- **6.1 Four moments** — 5. The four-row table is immediately usable and the two compilers are placed in their rows with real numbers.
- **6.2 What on-device compilation buys and costs** — 4. The three gains and three costs are clean, but the memory figures here never connect to the memory-limit figures in 6.6.
- **6.3 A cache keyed by content** — 4. The five-input table and the write-order/verify-on-read rules are the clearest part of the article; the trace vocabulary paragraph is dense and the two-slot power-loss story is underspecified.
- **6.4 Shipping a checked intermediate form** — 3. The three-row storage table is useful, but the 58 percent figure does not reconcile with the table's own timings and the slim-binary and Maté material arrives as a literature tour rather than as an argument I could follow into the next section.
- **6.5 Break-even arithmetic** — 4. The calculation is shown step by step and I could reproduce it; only the CJI half rests on an assumed one millisecond.
- **6.6 Tiers and mixed mode** — 3. The size ratio, the memory figures and the three costs of mixed mode are given, but "confined world", "unconfined native code" and the throw-away policy's consequences are asserted rather than explained.
- **6.7 Doing the work before the device boots** — 3. Two outside systems are described in a compressed way and the one local instance (the prelude) is mentioned as an aside rather than as the worked example it could be.
- **6.8 A combined design** — 5. The flowchart plus two sentences ("a hash check and a load", "one compile, once") is the clearest statement of the design in the article.
- **6.9 Key points** — 5. It is an honest summary and I could check each bullet against a section.
- **6.10 Check your understanding** — 4. Every question is answerable from the text, though two of them (1 and 6) repeat sentences from 6.3 almost verbatim, so they test recall more than understanding.

## Questions that the article did not let me answer

All six questions were answerable, with two caveats.

- **Question 2** is answerable only at the level the article states it, and my answer carries a doubt I could not resolve: the text says a power loss "leaves the old record pointing at the old, intact module", but it never says the new write goes to a different slot, so I cannot tell whether the old module really is intact.
- **Question 4** asks why the design was "still considered worthwhile". The article gives portability and the "can almost compensate" quotation, but not the concrete cost the authors accepted, so I could only report their framing rather than judge it.

Nothing in the quiz required the missing Experiment 2/3 data, which is a point in the article's favour.

## One thing to add and one thing to cut

**Add:** a short table of the compile phases for Editor (tokenize, parse, check, emit, lower, link) with a measured millisecond figure for each phase in both the WebAssembly and the native build. That single table would let a reader verify the 58 percent claim, the "under 20 ms per function" claim and the whole of section 6.4's reasoning, instead of being asked to trust them.

**Cut:** the Maté paragraph in 6.4. It contributes one idea (small, frequently replaced programs favour interpretation) and one unearned sentence applying radio-energy reasoning to keystroke-rate editing. Keeping a single sentence, or moving the whole sensor-node comparison to a footnote, would cost the reader nothing and remove the place where the article most obviously argues by analogy.
