# Feedback on "6. When to Compile: Caches, Load-Time Generation and Tiers"

I am a student reader with no access to Articles 1–5 or 7, to Article 2's measurements, or to the
project's source. I read the article as a standalone text, which is how I judged it.

## Passages I had to read twice

1. "Because the encoding was much smaller than native code, the time saved reading it from disk 'can almost compensate for the extra time' of generating code; on the fastest machine they measured, loading a suite of applications from slim binaries took about two seconds, almost twice the time of loading native binaries, which they judged competitive."

I could not reconcile the three halves of this sentence. If loading takes almost twice as long as
native, the disk saving did *not* compensate on that machine; "almost compensate" is doing a lot of
work. Then "which they judged competitive" attaches to a number I cannot evaluate — twice the load
time of what baseline, against what benefit? The paragraph needs to say plainly: on machine A the
load is 2× native, this is still competitive because X, and on machine B it is ~1×.

2. "The middle row is the slim-binary design: it removes the frontend, which Experiment 3 found to be about 58 percent of the native compile path, and keeps the stored form portable across engines."

I had to re-read this against the table because the arithmetic does not land. 58 percent of 3.14 s
removed leaves about 1.32 s, but the table says "about 1.2 s". The difference is small, but for a
reader trying to check the article's own numbers the missing 0.1 s is a distraction. Say "about
1.3 s" or explain what else the 1.2 s excludes.

3. "The record holds the hash of the source, the hash of the compiled module, and the identity of the firmware build. At boot the bytes are checked against the record, and a changed firmware identity discards the cached module."

Here the CJI record holds only *three* things, while 6.3 just argued the key must cover *five*
inputs. Is the firmware identity a stand-in for (compiler, reactor, import table)? If so, say so,
because otherwise the two paragraphs contradict each other and the reader is left unsure which
list is the real key.

4. "This project's measured ratio is inside that range: 4.76 bytes of RV32 per byte of WebAssembly function body for Editor. ... the native Editor uses 710 KiB of it where the WebAssembly Editor uses 528 KiB."

I had to work out why 4.76 does not match 240 kB / 88 kB ≈ 2.7. The answer seems to be that 4.76 is
per byte of *function body* while the module sizes include headers and data. That distinction is
never stated and it makes two nearby numbers look inconsistent.

## Terms used before they were explained, or never explained

- **reactor** — used in the introduction as if known ("the terms *reactor*, *engine* and *turn* from Article 1"); never defined here.
- **engine** — same; I inferred "WebAssembly or RV32" from the table, but only by guessing.
- **turn** — same; only reconstructable via "key presses" in 6.5.
- **CJI** — introduced cold in 6.1 ("CJI compiles at install time"); never expanded, never said what it is or why it has two compilers.
- **typed compiler** — contrasted with CJI throughout; what "typed" means is never stated.
- **world** — "when a world starts", "each world has a memory limit"; never defined.
- **lower / lowering** — appears in the 6.4 table ("emit, lower, link", "Lower and link only") with no explanation of what lowering is.
- **link / link step** — used in 6.3 and 6.4; the reader is told indices must be assigned, but "link" as a stage name arrives unannounced.
- **verifying trace / constructive trace** — defined by contrast in one sentence, but "trace" alone is never given a plain-language gloss.
- **frontend** — "the frontend" in 6.4; presumably tokenize+parse+check, but not said.
- **prelude** — "the JavaScript prelude"; a JavaScript reader can guess, a general reader cannot.
- **confined world / unconfined native code** — security/isolation vocabulary used once, in passing, with no explanation.
- **QuickJS** — named as an engine without introduction.
- **capsule** — Maté's unit; explained by its size, not by what it is.
- **non-volatile storage** — technical but standard; listed only because the article is careful elsewhere.
- **SSA-form** — appears inside a quotation, unexplained.

## Claims I could not verify from the article itself

1. **"a peak of 1.5 MB for Editor's WebAssembly build and 2.5 MB for its native build"** and **"43 kB of JavaScript source for the typed compiler, against about 660 kB for the CJI tool"** — no measuring method, no pointer to the experiment that produced them. Article 2 is credited for "the measurements" in general, but not for these.

2. **"Experiment 3 found to be about 58 percent of the native compile path"** — the experiment is never described here: what it timed, on what device, with what variance. I am asked to accept a percentage and then do arithmetic with it.

3. **"It saves 8.8 − 1.6 = 7.2 ms of processor time per turn"** — the two source numbers appear nowhere else in the article. Question 3 of the quiz depends on them, so they should carry a citation or a one-line derivation.

4. **"about 0.01 s to load, plus hashing"** — the phrase "plus hashing" hides an unknown. Hashing 240 kB may well dominate 10 ms, and that would change the comparison in the table's favour of the middle row. No figure is given.

5. **"loading with code generation required 'little more time than the input of equivalent native code' [Franz 1994]"** — quoted without the machine, benchmark or units, so it cannot be weighed against the 2 s figure from the 1997 report.

6. **"The compiler is deterministic, and the harness built for Experiment 3 already produces a module of exactly the size the device produces."** — determinism is exactly what the whole cache design rests on, and it is asserted in half a sentence. One line on *how* it is known (no timestamps, no hash-order iteration, stable index assignment) would be worth more than the harness aside.

7. **"the harness … produces a module of exactly the size the device produces"** — "exactly the size" is a strange proxy for "exactly the same bytes", which is what the cache needs. If only size is known to match, the cache argument is weaker than claimed.

8. **"reuse of the stored module took about 1,450 ms at boot"** — as a "measured effect … the one to expect for the typed compiler" this is compared with 7,028 ms cold, which is a 4.8× gain, but the article also predicts loading a native module is ~0.01 s. Why does reuse still cost 1.45 s? Is it verification, or hashing, or something else? Unresolved.

9. **"4.76 bytes of RV32 per byte of WebAssembly function body"** — as noted above, this contradicts the module-size ratio of about 2.7 and the article never reconciles the two.

10. **"Article 5 predicts that a better backend brings native code to between 1.4 and 1.8 times the size of the WebAssembly"** — a prediction used to justify not building mixed mode; nothing here lets me judge its basis.

## Section scores

- **6.1 Four moments — 5.** The table is the clearest thing in the article; who waits, and how often, is exactly the right frame, and the per-boot cost of Editor is stated immediately.
- **6.2 What on-device compilation buys and costs — 4.** Three gains and three costs in a clean pattern; only the unexplained 660 kB CJI figure and the undefined "CJI"/"typed" keep it from 5.
- **6.3 A cache keyed by content — 4.** The five-input table and the write-order/verify-on-read rules are genuinely teachable; the CJI record's three fields versus the five-input key is the contradiction I had to resolve myself.
- **6.4 Shipping a checked intermediate form — 3.** The idea is clear and the three-row table is good, but the slim-binary quotation is muddled, the 58 percent / 1.2 s arithmetic does not close, and the 4.76-versus-2.7 size ratio is left dangling.
- **6.5 Break-even arithmetic — 4.** The Editor calculation is fully worked and easy to follow; the 8.8 ms and 1.6 ms inputs appear from nowhere, and the CJI figure (140.6 s vs 0.082 s) is asserted rather than derived in the text.
- **6.6 Tiers and mixed mode — 4.** Smalltalk-80 as the earlier instance, throw-away code generation, and the three costs of mixed mode are all well put; "confined world" is jargon dropped without support.
- **6.7 Doing the work before the device boots — 3.** The examples (Moddable preload, MicroPython, the prelude going from 627 ms to 198 ms) are concrete, but the section is short and ends by asserting the compiler is deterministic without evidence.
- **6.8 A combined design — 5.** The diagram says in ten words what the rest of the article argued; the dotted build-time arrow into the "stored module?" test is the right picture.
- **6.9 Key points — 5.** Accurate and traceable back to the sections, which is more than most summaries achieve.
- **6.10 Check your understanding — 4.** Five of six questions are answerable from the text alone; question 4 asks about a paragraph I found internally confusing, so it tests the muddle as much as the idea.

## Questions that the article did not let me answer

None of the six was unanswerable, which is a point in the article's favour. Two needed repair work:

- **Question 4** is answerable only if I accept "can almost compensate" at face value and skip the tension with "almost twice as long". The article gives the reason (smaller file, portability) but never resolves why a 2× load penalty is called competitive, so my answer is a restatement rather than an explanation.
- **Question 3** is fully answerable only because the article supplies 8.8 ms and 1.6 ms in 6.5. Those two numbers are otherwise unsupported, so the arithmetic I performed is really the article's arithmetic handed to me, not a check of it.
- **Question 6** is answerable but I could not say *why* the renumbering is cheap, or how large the link step is relative to the 20 ms compile. The article says the link "is the same kind of patching the reactor linker already performs" without a cost.

## One thing to add and one thing to cut

**Add:** a two-sentence definition box, early in 6.1, for the vocabulary the article inherits —
reactor, engine, turn, world, CJI versus the typed compiler, and what "lower" and "link" mean as
stages. The article is well organised and its tables are excellent, but it repeatedly asks the
reader to hold a model built in Articles 1 and 2 that is never handed over. Six or seven lines,
placed once, would remove most of the double readings listed above.

**Cut:** the long slim-binary quotation paragraph in 6.4 as it currently stands. It stacks three
hedged numbers (a disk saving that "can almost compensate", two seconds versus native, "little more
time" on a different processor) into one sentence-chain, and a reader cannot extract a clean claim
from it. One sentence — "Franz and Kistler accepted a load time up to about twice native because the
file was portable and much smaller" — carries everything the section needs, and frees the space for
the definition box above.
