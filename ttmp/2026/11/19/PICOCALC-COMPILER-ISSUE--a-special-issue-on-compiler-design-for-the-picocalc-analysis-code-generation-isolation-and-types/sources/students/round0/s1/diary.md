# Work diary — student read of the PicoCalc compiler brief

## Step 1: Pre-test, answered before reading the brief

I read `TASK.md` and then `pretest.md` and `diary-format.md`, and deliberately did not open `dense-brief.md`. I wrote fourteen answers to `pretest-answers.md` from prior knowledge only, each with a confidence number, so that gaps later in the session can be attributed to the brief rather than to my starting state.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Execute the four steps of `TASK.md` in order, including the ordering constraint that the pre-test must be answered before `dense-brief.md` is read.
**Inferred user intent:** Produce an honest, evidence-bearing reader report for an editor planning an eight-part teaching series, where the value is in what a reader did *not* understand, not in a flattering summary.
**Commit (code):** n/a — prose artifacts only, no repository commits in this directory.

### What I did
- Read `TASK.md`, `pretest.md`, `diary-format.md` (the diary format).
- Created `pretest-answers.md` with answers to all 14 pre-test questions plus `Confidence: N` per answer.
- Did not read `dense-brief.md` at this point.

### Why
- The pre-test is only worth anything as a baseline if it is uncontaminated; reading the brief first would have let me echo its vocabulary back and inflated every later confidence score.
- Answering all fourteen, including the ones I was unsure of, gives the editor a per-topic readiness map rather than a general "student found it hard".

### What worked
- All fourteen questions were answerable in some form; none required "I do not know", though four were answered at confidence 2 (whole-program inference, SFI, defunctionalization/await, and the stack-machine translation).

### What didn't work
- No failures observed. The one honest self-report worth recording: my answer to the Wasm→RISC-V question (#5) was closer to a guess than a technique, and my `ABCD`-adjacent knowledge later turned out to be exactly the gap the brief hit.

### What I learned
- My weakest pre-test areas (register allocation for a stack machine, defunctionalization) are the same areas the brief treats most densely. That is a prediction I was able to test in Step 3.

### What was tricky to build
- Keeping the answers *from prior knowledge* while knowing that the brief had specific named systems it would want. I resolved this by refusing to name systems I could not gloss (e.g. I did not claim to know what Static TypeScript is in the pre-test).

### What warrants a second pair of eyes
- Nothing correctness-critical. The confidence numbers are self-assessments and should be read as such.

### What should be done in the future
- If this pre-test is reused, add a question on "what is a turn / a time budget" — it turned out to be the single most load-bearing undefined term in the brief.

### Code review instructions
- Open `pretest-answers.md` and check that every question is present with a confidence line; check that no answer shows vocabulary from `dense-brief.md`.

### Technical details
- Baseline confidence distribution: 4/5 on two questions (peephole, Amdahl), 3/5 on eight, 2/5 on four, 5/5 on none.

---

## Step 2: Reading the dense brief

With the pre-test written and closed, I read `dense-brief.md` once straight through, then re-read it section by section while logging undefined terms and unsupported claims.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Now read the expert brief as a student, tracking comprehension failures rather than building a summary of it.
**Inferred user intent:** The editor needs to know which parts of the brief are expert shorthand and which are genuinely compact-but-teachable.
**Commit (code):** n/a

### What I did
- Read `dense-brief.md` in full.
- Re-read by `##` section, logging: undefined abbreviations (CJI, reactor hash, turn, tickets, writeLiteral), named systems (Self, RPython, Shed Skin, Static TypeScript, Slim binaries, Liftoff, TCC, PMP), and named algorithms (jump functions, ABCD, Best's algorithm, destination-driven generation, copy-and-patch, Ertl's stack caching).

### Why
- I wanted the log to be exhaustive at the term level so that "terms I could not explain" is a mechanical checklist, not a memory test.

### What worked
- The brief's numbers (8 s–25 min vs 0.2–3.1 s; 52.9 ms over 33 turns; 235 ms of 462 ms) survived a first read, so the quantitative spine is legible even to a non-expert.

### What didn't work
- `ABCD` and `Best's algorithm` are used with no gloss and no expansion. I could not recover them from context, and per instructions I did not search the web. That gap is recorded in `brief-reactions.md` rather than papered over.

### What I learned
- The brief is written in a register where *naming a system* substitutes for *making an argument*. My pre-test prediction held: I understood the sections where a worked example appears (`charCodeAt`, peephole store-load) and lost the sections that are pure name lists (Code generation, Type system directions).

### What was tricky to build
- Distinguishing "term I cannot explain" from "claim I cannot follow" — several sentences are both. I resolved this by listing terms in section A with the sentence, and claims in section B with *what is missing*, so nothing is counted twice without saying which failure it is.

### What warrants a second pair of eyes
- Two of my "undefinable" terms may be common knowledge to the intended audience (`trampoline`, `lowering`). An editor should check whether those belong in the list or in a five-line glossary.

### What should be done in the future
- A one-line glossary at the top of the brief covering CJI, reactor, turn, tickets, and the two engine names would remove roughly a third of my "terms I could not explain" list without lengthening the brief.

### Code review instructions
- Compare `brief-reactions.md` section A against `dense-brief.md` and confirm every entry quotes a sentence that actually appears.

### Technical details
- Section count reviewed: 7 `##` sections plus the context paragraph; 36 terms logged; 12 claims logged.

---

## Step 3: Reactions, teaching order and diary

I turned the reading log into `brief-reactions.md` with all six required sections, then wrote this diary.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Produce the four required artifacts: `pretest-answers.md`, `brief-reactions.md` (six named sections), `diary.md`, and a final one-line `DONE`.
**Inferred user intent:** A reader-side evidence report the editor can act on structurally — which sections to rewrite, which examples to commission, what order to teach in.
**Commit (code):** n/a

### What I did
- Wrote `brief-reactions.md` with: **Terms I could not explain** (one line each, with its sentence), **Claims I could not follow** (12 quoted claims, each with what is missing), **Clarity by section** (all 7 `##` sections plus the context paragraph, scored 1–5 with one sentence of reason), **Questions I would ask the author** (18), **A teaching order** (8 lessons, each with what must be explained first), **What example would help most** (3 places, each with the specific figure I would want).
- Wrote `diary.md` in the `diary-format.md` layout, one step per activity.

### Why
- Scoring in the brief's own section order lets the editor map each score to a heading they can rewrite; a global score would be useless for planning.
- Each clarity score is anchored to a concrete failure (a name list, an undefined noun) rather than to taste, so the editor can disagree with the reason without discarding the score.
- The teaching order is derived from dependencies I actually felt: I could not read "Code generation" until I had a mental picture of stack-machine vs register-machine, so that must be lesson material, not assumed background.

### What worked
- Requiring "what must it explain first" per lesson forced the eight-lesson skeleton to be dependency-ordered rather than topic-ordered, and it surfaced that lesson 5 (the baseline backend, by hand) is the missing prerequisite for the whole code-generation half.

### What didn't work
- No failures observed. One limitation worth stating: my three "example would help most" picks are all places where *I* was lost, so they overweight the code-generation and type-system sections relative to the architecture section, which may simply be too short to judge.

### What I learned
- The brief's strongest writing is the isolation chain (no pointers → acyclic call graph → bounded stack → fuel → verify output). It is also the most compressed, at five sentences. Density and comprehensibility were not correlated in this document; name-count and comprehensibility were (inversely).

### What was tricky to build
- Keeping the term list honest. It is tempting to omit `trampoline` and `lowering` because I can nearly explain them, but the instruction was "could not explain to a classmate", and I could not. I flagged the borderline ones in this diary instead of silently dropping them.

### What warrants a second pair of eyes
- My lowest scores (Code generation 1/5, Type system directions 1.5/5) are judgements from one slow read. If the intended audience for the special issue already knows SSA and register allocation, those scores should be recomputed, since the failures would become style complaints rather than comprehension failures.

### What should be done in the future
- Commission the three examples named in `brief-reactions.md`; each converts a paragraph of names into a teachable unit.
- Split the "Type system directions" section into seven short subsections with one example each, since it is currently seven one-line proposals in one heading.

### Code review instructions
- Read `brief-reactions.md` against `dense-brief.md` section by section; confirm all 7 `##` sections are scored, at least 8 questions exist, exactly 8 lessons exist, and exactly 3 example requests exist.

### Technical details
- Deliverables in this directory: `pretest-answers.md`, `brief-reactions.md`, `diary.md`. Source read: `TASK.md`, `pretest.md`, `dense-brief.md`, `diary-format.md`. No web access used, per the standing constraint.
