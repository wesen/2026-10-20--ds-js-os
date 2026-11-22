## Step 1: Answering a quiz about an article I was not given

I read `TASK.md`, then `quiz.md` and `diary-format.md`, and checked the directory for the article itself (`article.md`, `README.md` — neither exists). The task is a comprehension test of a section of an article ("4. Making Inference Affordable, or Avoiding It") that is deliberately withheld, so I answered from general compiler knowledge about abstract interpretation, jump functions, SSA/GSA/SSI and summary-based interprocedural analysis, marking the article-specific measurements and CJI details as unknown.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read `quiz.md`, write numbered answers with `Confidence: N` lines into `answers.md`, then write a single diary entry in the `diary-format.md` format into `diary.md`, and finish with "DONE".
**Inferred user intent:** Test whether a reader without the source article can be honest about the boundary between what is derivable and what is merely plausible, which is the point of a pre-publication teaching-article check.
**Commit (code):** N/A (no repository commit made).

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md` in this directory.
- Attempted `article.md` and `README.md` to see whether the source text was present; both returned ENOENT, so the article is genuinely absent.
- Wrote `answers.md` with six numbered answers, each 2–5 sentences plus a `Confidence:` line (3, 4, 4, 2, 4, 2).
- Wrote this entry in `diary.md`.

### Why
- Answering from first principles is the only option; inventing the article's numbers (the 11,760-visit breakdown, the CJI feature) would silently corrupt the editorial feedback the exercise is meant to produce.
- I gave mechanically derivable answers (jump function, SSA join loss) high confidence and article-dependent ones (Q4 count, Q6 CJI feature) low confidence, so the editor can tell the two apart at a glance.

### What worked
- Q1, Q2, Q3, Q5 are answerable without the article: jump functions for arithmetic, the summary-as-transfer-function argument, the phi-node information loss and what gated/sigma-node SSA restores, and the meaning of local checking with its time/memory/order benefits.
- For Q1 the computation is self-checking: shifting `[5,7]` by +1 gives `[6,8]`, and `clamp` can only intersect, not widen.

### What didn't work
- `read article.md` → `ENOENT: no such file or directory`, and `read README.md` → same. Recovery: proceed with the "I cannot know this without the article" formulation required by step 2 of `TASK.md`.
- I could not list the directory (no listing tool available), so I could not prove there is no other article fragment.

### What I learned
- The tasks are ordered so that the missing context is concentrated in two questions (Q4's split of 11,760 visits, Q6's CJI feature), which is a good property for a pre-publication test: it separates reasoning errors from missing-information errors.
- Q1's phrasing ("the first argument of `clamp`") assumes the reader can see `nextIndex`; without it I had to state my assumption explicitly (`i + 1`).

### What was tricky to build
- The main difficulty is calibration: writing answers that are useful even when the premise (the exact body of `nextIndex`, the exact CJI feature) is missing, by making the *shape* of the correct answer explicit — e.g. "a shift plus an overflow split", "an existing optional annotation that would have to become mandatory".
- Ordering mattered: I had to decide per question whether a confident answer or an explicit "cannot know" serves the editor better, rather than hedging uniformly.

### What warrants a second pair of eyes
- Q1: whether `nextIndex`'s first argument to `clamp` really is `i + 1`; if it is `i * 2` or `i` itself the numeric range changes.
- Q4: whether "analyzed a function body" in the article means the analysis cache-miss count or something narrower (e.g. only bodies with loops), which would change what the number is evidence for.
- Q6: whether the CJI feature is an annotation system, a module boundary, or something else, and whether "mandatory" refers to annotations or to summaries.

### What should be done in the future
- Re-run this step with the article supplied, then diff my answers against the text to see which of my confident answers (Q2, Q3, Q5) the article actually supports and which of my "cannot know" guesses (Q4, Q6) were close.

### Code review instructions
- Files to read: `answers.md` (six answers, confidence 3/4/4/2/4/2), `diary.md`, against the source `quiz.md` and format `diary-format.md`. No build or test commands apply; validation is a manual check that each answer is 2–5 sentences and carries a `Confidence: N` line with N in 1–5.

### Technical details
- Jump function used: `J(i + 1, [a, b]) = [a + 1, b + 1]`, applied to `[5, 7]` → `[6, 8]`; wraparound would require splitting the interval at the type maximum.
- Terminology relied on: phi nodes (plain SSA) versus gated SSA gates and SSI sigma/pi nodes (extended SSA); summaries as parameterised transfer functions rather than constants; local (compositional, per-unit) checking with order-independent, cacheable results.
- Constraint from `TASK.md`: work only inside this directory, no web access; unknowns must be labelled "I cannot know this without the article".
