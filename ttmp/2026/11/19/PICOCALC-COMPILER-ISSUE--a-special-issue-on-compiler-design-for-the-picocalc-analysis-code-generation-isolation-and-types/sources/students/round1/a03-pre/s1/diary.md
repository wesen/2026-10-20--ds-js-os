## Step 1: Answering a six-question quiz about an article I was not given

I read `TASK.md`, `quiz.md` and `diary-format.md`, then wrote `answers.md` in this directory. I had no article, and I deliberately did not look outside the working directory. So every answer was built two ways: from general compiler knowledge I do have (fixed-point dataflow analysis and widening, whole-program type inference vs. separate compilation, JS `+` semantics, Self's baseline-plus-optimizing compiler pair with type feedback and on-stack replacement), and from internal evidence in the questions themselves — the section numbers 3.1, 3.2, 3.3, 3.5 imply a running argument that gets from "one edit changes another function's code" to "the residual cost is still minutes" to "Self solved this with two compilers".

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow `TASK.md`: read `quiz.md`, answer all questions into `answers.md` with a `Confidence:` line each, write one `diary.md` step in the `diary-format.md` shape, reply `DONE`.
**Inferred user intent:** The editor wants to know, before publishing, where a reader lands with no article in hand — which questions are self-explanatory and which are unanswerable without the text.
**Commit (code):** N/A — no repository, no git.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in this directory.
- Wrote `answers.md` with six numbered answers, two to five sentences each, each followed by `Confidence: N`.
- Wrote this `diary.md` as a single step.

### Why
- The task explicitly forbids the web and restricts me to this directory, so the only honest method was to separate what I *know* (general compiler theory) from what only the article can supply (the concrete ranges, the concrete measurement, the concrete hardware component).
- I used the required sentence "I cannot know this without the article" wherever the answer turns on a specific number, name, or figure, then still gave the reasoning-based reconstruction so the editor learns where my confusion would set in.

### What worked
- Questions 2, 3 and 4 were answerable in substance: the shape of a monotone interval iteration with later widening, the reasons JS `+` cannot be a bare integer add, and the reason specialization cascades (each round exposes new monomorphic call sites) follow from general knowledge plus the question's own wording.
- Question 1 was partly answerable: the "adding `half` changes `scale`" fact pins the mechanism (whole-program inferred types crossing function boundaries, hence no separate compilation) even without the article's example.

### What didn't work
- Question 5: I could not identify the specific measurement in section 3.5. Any answer I gave would be a guess about which numbers the section prints (range analysis on vs. off, round counts, or per-value type-object costs). I answered with the structure the measurement must have and flagged the guess.
- Question 6: I could not name the existing handheld component that plays Self's fast first compiler. I do not know what the PicoCalc platform provides, and inventing a name would be worse than saying I do not know. Confidence 1.
- General blocker: all six questions cite section numbers of an article that is not in this directory, so no answer could be verified against the text.

### What I learned
- The quiz is a good instrument for the editor's purpose: three of six questions are answerable from prior knowledge, which means the article's payload there is *illustration and evidence*, not new concepts; two are unanswerable, which means the article's payload there is *specific facts*. That split is the useful output of this exercise.
- Question 6 presumes familiarity with the Self literature (two compilers, compile pause). A reader without that background would fail it for reasons unrelated to the article's quality.

### What was tricky to build
- Keeping two registers in one answer — "I cannot know this" and "here is what it would have to look like" — without letting the second swallow the first. I resolved it by putting the disclaimer first in every uncertain answer and keeping the reconstruction explicitly conditional (`"the shape such an example always has is..."`).
- Not fabricating plausible-sounding specifics. The temptation in Q2 is to invent exact bounds and in Q5 to invent exact timings; I used generic placeholders and marked them as such.

### What warrants a second pair of eyes
- Whether my Q1 reconstruction matches the article's actual point: I assumed the mechanism is inferred operand types forcing promotion, but the article could instead be making a point about *inlining* or about *identical code folding*. If the article's example is about overflow bounds rather than float promotion, my answer is right in shape and wrong in detail.
- Q4: I assumed "specialization rounds" are rounds of whole-program re-analysis to a fixed point, not rounds of a suspension-based partial evaluator. If Agenda's specialization is per-call-site and demand-driven, "another round" means something different.

### What should be done in the future
- N/A for me (no follow-up work in this directory). For the editor: consider whether Q6 should carry a short primer on Self's two-compiler design, since it is the only question that requires outside reading.

### Code review instructions
- Files produced: `answers.md` (six numbered answers, six `Confidence:` lines), `diary.md` (this file).
- Check: `answers.md` has exactly six `##` answer headings numbered 1–6 and exactly six `Confidence:` lines; every answer touches 2–5 sentences; every answer that depends on article-specific facts opens with the required disclaimer.

### Technical details
- Confidence distribution: 1×1 (Q6), 4×2 (Q1, Q2, Q4, Q5), 1×3 (Q3). Nothing at 4 or 5, which is the expected ceiling when the source text is absent.
- Concepts invoked: monotone framework with widening to $\top$; separate compilation vs. whole-program closure over the call graph; JS `+` overload (string concat, double arithmetic, `ToPrimitive` coercion); inline caching as the runtime counterpart to static type inference; Self's baseline compiler, type feedback, recompilation, and on-stack replacement.
