# Feedback on Article 6, "When to Compile: Caches, Load-Time Generation and Tiers"

## Passages I had to read twice

1. "This memory belongs to a temporary interpreter that exists only for the duration of the compile; it is separate from the memory limit of the world being compiled."
   *Unclear:* why an **interpreter**? The typed compiler was described as a compiler that emits WebAssembly/RV32. I only guessed that the compiler is itself written in JavaScript running on QuickJS. If so, say it here in one clause.

2. "The firmware identity stands for three of the five inputs at once: the compiler, the reactor and the reactor's function table are all part of the firmware image, so if any of them changes, the identity changes."
   *Unclear:* it took me a moment to trust that this is sound, because "identity of the firmware build" is a loose name for a hash. It becomes clear only in the following table; the sentence would be safer if it said "because the identity is a hash of the firmware image, which contains all three".

3. "The estimate of 1.2 s is the device's native compile time minus its WebAssembly compile time, 3.14 − 1.99 s."
   *Unclear:* the stated estimate and the stated arithmetic disagree (1.15 s, not 1.2 s). Which is the number I should use, and does the 1.2 s include the link step that section 6.3 says is needed?

4. "Native module | Verify the hash and load | about 0.01 s to load, plus hashing | 240 kB"
   *Unclear:* does loading native code involve no verification beyond the hash? Article 7 (per section 6.2 and 6.6) has a verifier for machine code, so I could not tell whether boot cost here is understated.

5. "Dividing today's ratio of 4.76 by those factors gives between 1.4 and 1.8 bytes of RV32 per byte of WebAssembly function body."
   *Unclear:* "native code 2.66 to 3.32 times smaller than today's" — smaller than today's *native code*, presumably; the wording makes it sound as if a different language or engine is being compared.

6. "the same kind of patching the reactor linker already performs" (section 6.3)
   *Unclear:* "reactor linker" is never named or described in this article; the glossary has *trampoline* and *slot* but no *linker*. I inferred it from the trampoline entry.

## Terms used before they were explained, or never explained

- **import table** — the flowchart in 6.8 keys on "source, compiler, reactor, engine, import table", but the text everywhere else calls this the "reactor's function table". Neither the article nor the glossary says these are the same thing; I only inferred it.
- **frontend** — used in the coloured phrase "The middle row is the slim-binary design... removes the **frontend**"; the definition arrives only in the same sentence's relative clause. Not in the glossary.
- **capsule** — "its programs were capsules of at most 24 one-byte instructions"; "capsule" is never defined, and the glossary has no entry.
- **hash / cryptographic hash** — the *content key* entry in the glossary mentions hashes but no entry defines what a hash is or why "cryptographic" matters here (the text does say implicitly that equal keys mean equal inputs, but collision resistance is never named).
- **prelude** — used in 6.7; glossed there as "a library of common functions", so borderline, but it is not in the glossary and carries weight in the 627 ms → 198 ms claim.
- **confined / not confined** — section 6.6 says native code "is not confined and can affect anything in memory". The glossary's safety entries explain confinement, but the adjective is used here without a pointer, and I had to go hunting.
- **ELF object files** — "a loader for standard ELF object files"; never explained, and not in the glossary.
- **flash partition / MiB** — "the firmware partition is 8 MiB and the firmware image occupies about 4.2 MiB": no explanation of what a firmware partition is, and it is the basis of the "flash is not scarce" argument.

## Claims I could not verify from the article itself

1. "a figure that includes the startup of all the other worlds" and "the world was ready about 1,450 ms after the start of the boot".
   *Missing:* what the boot-until-offer time of the same system is, so that the reader cannot tell how much of the 1,450 ms is the cached module and how much is other worlds. The 20 ms figure is also "on a system that was already running", which is a different measurement from a boot.

2. "for the typed Editor one should expect the loading time measured in Article 1, 14 ms for the native module, plus the time to hash about 240 kB, which has not been measured and should be tens of milliseconds."
   *Missing:* the measurement the estimate rests on. The article admits this one, honestly, but the estimate is then used to compare against 1.2 s and 3.1 s.

3. "Experiment 3's workstation profile agrees roughly: it puts translation to RV32 at 41 percent of the native path, which would be 1.3 s on the device."
   *Missing:* the profile itself, and any statement of why a workstation percentage transfers to the device. 41 percent of 3.14 s is 1.29 s, so the arithmetic works, but the transfer assumption is not argued.

4. "The compiler uses no clock and no randomness, so the same inputs should give the same bytes, and the harness built for Experiment 3 already produces a module of the same size as the device's. Equality of the bytes between a workstation build and a device build remains to be checked."
   *Missing:* the check itself. Same size is not same bytes, and the whole prebuilt-module design in 6.7–6.8 depends on byte equality.

5. "Article 5's counting model predicts native code 2.66 to 3.32 times smaller than today's."
   *Missing:* everything — this article gives no model, no assumptions, and no derivation, yet the recommendation not to build mixed mode rests entirely on it.

6. "a turn took 8.8 ms of processor time in the WebAssembly engine and 1.6 ms as native code"
   *Missing:* the article cites Article 2 §2.2 but does not say what the turn does or how many turns were measured. The whole break-even result of 160 turns hangs on these two numbers.

7. "Compiling it during boot took 7,028 ms" and "in the project's test this took 7,047 ms and required no user action".
   *Missing:* whether these are the same test program, and what was damaged to trigger the rebuild. The 19 ms difference is left unexplained.

## Section scores

- **6.1 Four moments** — 5. The table of moments is the clearest thing in the article, and it immediately situates both compilers.
- **6.2 What on-device compilation buys and costs** — 4. Gains and costs are balanced and concrete, but "temporary interpreter" is unexplained and the flash figures (43 kB vs 660 kB) are not compared to the later "flash is not scarce" argument.
- **6.3 A cache keyed by content** — 5. The five inputs, the table, the write order and the verification-on-read rule are all stated and justified; only the "reactor linker" reference is loose.
- **6.4 Shipping a checked intermediate form** — 3. The idea is good and the slim-binary history is well told, but the cost table mixes a measurement, an estimate and a subtraction, and the 1.2 s vs 1.15 s inconsistency is exactly where the reader needs precision.
- **6.5 Break-even arithmetic** — 4. Fully worked and checkable; it would be a 5 if the formula were stated once in symbols (compile cost ÷ saving per turn) and if the CJI example were labelled as an assumption more loudly.
- **6.6 Tiers and mixed mode** — 3. The 4.76 vs 2.7 distinction is explained only after it is used, the recommendation leans on an unshown model from Article 5, and "not confined" is dropped in without support.
- **6.7 Doing the work before the device boots** — 3. Two useful examples, but Moddable preload and MicroPython bytecode are named and not described, and the section ends on the one thing not yet verified.
- **6.8 A combined design** — 4. The flowchart is genuinely clarifying; it loses a point only for introducing the "import table" name for a thing called something else everywhere else.
- **6.9 Key points** — 5. A faithful summary; I could check every bullet against the body.
- **6.10 Check your understanding** — 4. All six questions are answerable from the text; question 3 duplicates the section's own worked example almost word for word, so it tests reading rather than understanding.

## Questions that the article did not let me answer

None of the six was unanswerable, but two were answerable only approximately:

- **Question 3** is answerable, but only by trusting section 6.5's own arithmetic; the reader is not asked to do anything the article has not already done, so it is weak as a test.
- **Question 6** is answerable, but the article never says where the 4.76 ratio comes from or how it was measured (function body bytes against function body bytes, as section 6.6 states in passing). A reader who only had the table in 6.4 could not reconstruct it.

## One thing to add and one thing to cut

**Add:** one short paragraph at the end of 6.4 that reconciles the numbers in the boot-cost table — state the estimate as ≈1.15 s (3.14 − 1.99), say explicitly whether it includes the link step and whether the 41 percent figure also includes it, and say what verification of a native module costs at load. That is the one place in the article where a careful reader cannot check the claim.

**Cut:** the Maté paragraph in 6.4 ("The Maté virtual machine took the opposite extreme deliberately..."). Its conclusion — code replaced after every edit should use the cheapest form to produce — is already the conclusion drawn one paragraph earlier from Dunkels et al., and the paragraph's own final sentence says "the reasoning has the same shape". Removing it would cost nothing and tighten the argument.
