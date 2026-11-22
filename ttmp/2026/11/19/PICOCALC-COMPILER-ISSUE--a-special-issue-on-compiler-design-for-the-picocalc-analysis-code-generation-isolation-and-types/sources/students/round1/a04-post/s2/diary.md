# Investigation entry

## Step 1: Reading the article from start to finish

I read `article.md` once straight through without notes, then a second time with the task's four
deliverables in mind, marking passages that stopped me and claims whose evidence was outside the
text. The article is short enough to hold in one sitting but dense: it summarizes five analysis
techniques in about three paragraphs each, and most of its evidence is a citation plus one number.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Work through the five numbered steps of `TASK.md` inside the current
directory: read the article, answer its quiz, write structured feedback, write a diary, reply DONE.
**Inferred user intent:** The editor wants an honest first-reader report on whether the article
teaches what it claims to teach, produced by an agent that has only the article and no web access.
**Commit (code):** none — this directory is not a git repository and no code was changed.

### What I did
- Read `TASK.md` first, then `diary-format.md` to learn the output format before writing anything.
- Read `article.md` in full (references included) in one `read` call; it fits in a single response.
- Noted the structure: §4.1 five wastes + remedies, §4.2 declared boundaries, §4.3 where they meet,
  §4.4 key points, §4.5 six quiz questions, then a 20-entry reference list.

### Why
- Reading `diary-format.md` first avoided rewriting the diary at the end.
- Reading references mattered because several quiz answers depend on whether evidence is in the
  body or only behind a citation, which is exactly what the feedback section asks about.

### What worked
- The §4.1 table could be read as a map of the whole article; after reading it I could predict the
  shape of the next four subsections.
- The §4.4 key points served as a checklist: each of the six quiz questions maps onto one bullet,
  so I could confirm that every question had a corresponding body passage.

### What didn't work
- My first pass mis-read the 11,760 function visits as pure waste. §4.1 later reuses the same
  number to show that 9,019 visits were *skipped*, i.e. that CJI already avoids most of the
  revisiting. I had to subtract (11,760 − 9,019 = 2,741) before the summary section made sense.
- I initially assumed "CJI" and "the typed compiler" were the same system, since both are called
  "of this project". §4.3 makes clear they are two: CJI is the JavaScript compiler that infers in
  comments, the typed compiler is the small one-pass language.

### What I learned
- The article's two families are not alternatives that compete: §4.1's remedies keep whole-program
  inference and make it cheaper, §4.2 removes the need for it. §4.3's rule is the boundary between
  them, and §4.1's closing paragraph insists the first family cannot reach interactive speed.
- Number reuse across subsections is the main source of confusion in this text, not missing
  explanation of the techniques themselves.

### What was tricky to build
- Nothing was built. The only structural difficulty was keeping the feedback sections disjoint:
  quotes that belong under "read twice" also tend to be the ones whose evidence is unverifiable.
  I resolved it by reserving "read twice" for passages where the *prose* was unclear on a first
  pass and "could not verify" for passages where the prose was clear but the evidence absent.

### What warrants a second pair of eyes
- My score of 5 for §4.2 and 3 for §4.3 is a judgement about pace, not correctness; an editor may
  reasonably weight the design rule in §4.3 higher.
- My reading of "45 percent of executed bounds checks" as an execution-weighted figure is an
  inference from the word "executed", not something the article states.

### What should be done in the future
- If the article is revised, re-run this quiz against the revision, particularly question 1, whose
  ambiguity about free variables in a jump function is the one place a reader can produce a
  defensible wrong answer.

### Code review instructions
- Read `answers.md` against §4.5 of `article.md`, and `feedback.md` against the quoted passages;
  every quote in `feedback.md` is copied verbatim from `article.md` and can be grepped to confirm.

### Technical details
- Files produced: `answers.md` (six numbered answers, each with a `Confidence: N` line),
  `feedback.md` (six required sections), `diary.md` (this file).
- No files were modified, and no commands were run beyond reading files.

## Step 2: Answering the quiz

I answered all six questions in `answers.md` in my own words, showing working where a calculation
or a translation into an interval was asked for, and ending each answer with a confidence number.
Question 1 needed arithmetic on an interval, question 5 needed a definition plus consequences drawn
from two different sections, and question 6 needed the article's two quoted sources to be combined.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Step 2 of the task: answer each "Check your understanding" question,
2–6 sentences each, own words, with working, plus `Confidence: N`.
**Inferred user intent:** Test whether the article alone is sufficient to reconstruct its main
results, and expose which questions need information the article does not give.
**Commit (code):** none.

### What I did
- Wrote six answers numbered to match §4.5, each 4–5 sentences, each followed by `Confidence: N`.
- Question 1: took `J₁ = i + 1` from the text, applied `[5, 7] + 1` to get `[6, 8]`, and added the
  one-line justification that translating an interval translates both endpoints.
- Question 2: reproduced the article's distinction between a summary as a *dependence* and the
  facts as its *arguments*, then added the "unknown" fallback to show why the cheap answer is never
  a wrong answer.
- Question 3: used the article's own `while (i < n)` example, argued that a name holds one range,
  and named π renaming as what extended SSA adds.
- Question 4: split iteration into "inside a cyclic component, with widening then narrowing" and
  "never between components in topological order".
- Question 5: defined local checking with its three stated properties and derived two consequences
  (`answers.md` picked incremental rebuild and per-function memory/parallelism, citing the
  4.5 MB → 7.3 MB heap figure).
- Question 6: attributed the missing information to the declared type annotations, quoting the
  Static TypeScript and Static Hermes lines the article provides.

### Why
- Kept to the article as the only source; where I could not derive something from the body I said
  so in `feedback.md` under "Questions that the article did not let me answer" instead of importing
  outside knowledge.
- Confidence numbers were assigned per answer rather than uniformly: 5 where the answer is a direct
  restatement of an explicit passage (questions 1, 2, 4), 4 where I had to combine two passages or
  resolve a small ambiguity (questions 3, 5, 6).

### What worked
- Each of the six answers had a corresponding §4.4 bullet, which made checking coverage mechanical.
- Question 1's arithmetic is small enough to show in one line, so the "show working" requirement
  cost nothing in length.

### What didn't work
- Question 5 asks for "two practical consequences" but the article states three *properties* and
  spells out only one consequence (rebuild independence). My second consequence is a derivation
  from §4.1's heap numbers rather than a sentence in §4.2; I flagged this in `feedback.md`.
- My first draft of answer 2 was one sentence too long (seven); I cut the sentence about
  invalidation into the same sentence as recomputation to get within the 2–6 range.

### What I learned
- The quiz is well matched to the text except for question 5, which is answerable only if the
  reader connects §4.2 to §4.1's memory figures.
- Confidence numbers were more useful than expected: the two answers I could not raise above 4 are
  exactly the two that needed cross-section synthesis.

### What was tricky to build
- Judging when a "consequence" counts as given by the text versus derived by me. I settled on the
  rule that a consequence counts as given only if the article mentions the words (compile time,
  memory, order, parallelism) in the same paragraph as the definition of local checking.

### What warrants a second pair of eyes
- Answer 1 depends on my convention that a jump function's free variables are the *enclosing*
  function's parameters. The article implies this ("in terms of the enclosing function's own
  parameters") but the quiz's wording ("at some call of `nextIndex`") pulls the other way.
- Answer 5's memory consequence rests on the assumption that no whole-program tables are built at
  all under local checking; the article does not say what the typed compiler keeps in memory.

### What should be done in the future
- If the editor wants question 5 to test a pure comprehension skill, §4.2 should state the two
  consequences it expects explicitly.

### Code review instructions
- Compare each answer in `answers.md` against §4.5 and §4.4 of `article.md`; question 1's arithmetic
  is the only place where a numeric error would matter.

### Technical details
- Output: `answers.md`. Format: `## N. <question restated as a title>` then 4–5 sentences then
  `Confidence: N`. No external sources used.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six sections the task asks for, quoting eleven passages I had to read
twice or could not verify, listing thirteen undefined terms, scoring all five numbered sections, and
naming one addition and one cut. The hard part was separating "unclear prose" from "unsupported
claim", and being specific enough that the editor could act on each item.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Step 3 of the task: produce `feedback.md` with the six named sections,
quoting where asked, and scoring every numbered section from 1 to 5 with one sentence of reason.
**Inferred user intent:** Give the editor a defect list, not a summary; the editor needs to know
where teaching fails, so vague praise is worth nothing here.
**Commit (code):** none.

### What I did
- **Passages I had to read twice:** five quotes, each with a sentence on what was unclear — the
  "function of the facts" sentence, the demand-driven qualification clause, the reused 11,760
  figure, the "at some call of `nextIndex`" phrasing, and the `/*: Any[] */` example.
- **Terms:** thirteen lines covering CJI, Agenda, QuickJS, worlds, provisional integer operations,
  the companion report, widening, lattice, calling context, π, SSA edges, and the four named
  systems.
- **Claims I could not verify:** ten quotes with the missing evidence stated, e.g. the 62
  percent / 29 percent / 4.5 MB → 7.3 MB cache experiment, the 5–110× sparse-analysis result, the
  450× component-ordering result, the 45-percent bounds-check figure, and the "25 local annotations
  → byte-identical output" claim.
- **Section scores:** §4.1 = 4, §4.2 = 5, §4.3 = 3, §4.4 = 5, §4.5 = 4, one reason sentence each.
- **Questions the article did not let me answer:** wrote that none were unanswerable outright, but
  named questions 1, 5 and 6 as needing inference beyond the text, and question 3 as the nearest
  miss because π is never shown.
- **Add/cut:** add a worked jump-function example that includes a caller-side update and an
  "unknown" case; cut two of the four systems in the "How much language can a one-pass compiler
  carry?" list.

### Why
- Quotes were kept to one or two sentences each, as the task requires, and copied verbatim so the
  editor can grep them.
- Scores were given for the five *numbered* sections only, since the task says "for each numbered
  section" and the references list is not numbered.
- The add/cut pair was chosen to reinforce each other: the added example is what would let an
  editor delete hand-waving elsewhere, including two of the four system cameos.

### What worked
- The 11,760 / 9,019 tension turned out to be the single most valuable finding: it is a genuine
  self-contradiction in presentation, not merely a hard sentence.
- Scoring per section produced a clear pattern: the article is strongest where it defines
  (§4.2) and weakest where it compresses several ideas into one paragraph (§4.3).

### What didn't work
- I could not produce a "claims" section that was independent of the "read twice" section for
  every quote; two quotes appear in both registers in my notes, and I kept each in only one place to
  avoid double-counting. Choosing which was judgement, not procedure.
- My first list of terms ran to over twenty entries including ordinary words like "constraint
  graph", which the article *does* explain. I cut it back to terms that are either never defined or
  defined after first use.

### What I learned
- Most of this article's difficulty is compression, not missing content: nearly every claim has a
  citation, but the reader is given the conclusion and the citation without the intermediate step
  that would make the conclusion idle-proof.
- "Terms used before explained" and "claims unverifiable from the article" overlap heavily in a
  survey-style text, because both are symptoms of relying on references for the load-bearing steps.

### What was tricky to build
- Distinguishing an unverifiable claim from a merely unimplemented proposal. The article is honest
  about open questions ("Whether it fits in CJI's heap is an open, testable question"), so I did not
  list those under "could not verify" — only statements presented as established.

### What warrants a second pair of eyes
- The score of 3 for §4.3 is the most contestable item in `feedback.md`; the section contains the
  article's single most useful sentence (the design rule) but also its least explained example.
- My recommendation to cut Static Hermes and AssemblyScript would remove support for a claim I did
  not challenge (§4.2's "old idea that languages keep rediscovering"), so an editor who values the
  breadth may reasonably decline it.

### What should be done in the future
- Re-check the two reused numbers (11,760 visits; 22 worlds) after revision; both appear in more
  than one role and one of them is currently doing contradictory work.

### Code review instructions
- Every quotation in `feedback.md` can be verified with a text search in `article.md`; the section
  scores map to headings §4.1–§4.5; the add/cut section names the specific paragraph to delete.

### Technical details
- Output: `feedback.md`, six sections in the order the task specifies.
- Counts: 5 "read twice" quotes, 13 undefined terms, 10 unverifiable claims, 5 section scores,
  4 quiz-question notes, 1 addition, 1 cut.
