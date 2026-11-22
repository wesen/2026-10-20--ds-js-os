# Diary: student reading of Article 7, "Safety by Construction"

## Step 1: Reading the article against the glossary

I read `TASK.md` first, then `article.md` from the first line to the references, keeping
`glossary.md` open beside it and looking up every term the article used as if it were new to me. I
marked, as I went, the passages where I had to stop and re-read, the terms I could not resolve in
either file, and the claims that rest on a citation rather than on something shown in the article.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** The task file asks for four sequential steps: read the article with the
glossary, answer the six quiz questions into `answers.md`, write `feedback.md` in the given sections,
and write this diary in the format of `diary-format.md`.
**Inferred user intent:** The editor wants an honest pre-publication test of whether the article
teaches, from a reader who has only the article and the glossary and no access to the web or the
repository.
**Commit (code):** N/A — documentation work only, no repository commit.

### What I did
- Read `TASK.md`, `article.md`, `glossary.md`, `diary-format.md` in full, in that order.
- Cross-checked every bolded or italicised technical term in the article against the glossary
  entries, noting which ones had no entry and no in-text definition.
- Collected candidate "read twice" passages and candidate unverifiable claims while reading, into
  running notes rather than reconstructing them afterwards.

### Why
- Reading the glossary after the article would have hidden exactly the defect I was asked to look
  for: terms that the glossary covers but only *after* the article has already used them.
- Collecting notes during the read is more honest than recalling difficulties later; several of the
  items in `feedback.md` (the mermaid diagram, the `mask = size − 1` gap) are the kind of thing that
  becomes invisible once you have understood the section.

### What worked
- The article is short enough to read once, carefully, in a single pass, and its section order
  (problem → mechanisms → source guarantee → stack → time → verification → hardware) is easy to hold
  in mind.
- The three tables in 7.1, 7.2 and 7.6 carried most of the argument for me; noting them as anchors
  made the prose between them easier to place.

### What didn't work
- I tried to enumerate the directory by reading `.` and got `EISDIR: illegal operation on a
  directory, read`. I could not list the folder, so I worked only from the four files named in
  `TASK.md` and did not look for earlier-round material that may exist beside it. If such material
  exists (for example an earlier reader's feedback), my report may duplicate it.
- I could not verify any of the article's cross-references: Article 1, 5, 6, 8, 9 and 10 are not in
  this directory, so every "Article N describes…" claim is recorded in `feedback.md` as something I
  took on trust.

### What I learned
- The article's own frame — trust moves to a component, and the size of that component is the size
  of the risk — is a genuinely useful reading key; once I had it from 7.2, the rest of the article
  became a sequence of applications of it.
- Several apparent difficulties were vocabulary, not argument: RV32, WAMR, linear memory, soundness
  and `sp` are all used as if known, and the glossary covers none of them.

### What was tricky to build
- Judging the boundary between "explained by the article" and "the reader should know this". I
  resolved it by the rule that a term counts as explained only if this article or the glossary says
  what it means; that rule puts RV32, WAMR, linear memory, soundness, `sp`, supervisor mode and
  sandbox on the list.

### What warrants a second pair of eyes
- My reading of `address = base + (address AND mask)` as requiring `mask = size − 1` and the input
  address to be an offset within the region. If the intended reading is different, item 3 of the
  "read twice" list and question 5's answer are both wrong.
- My claim that reactor-internal loops are unbilled under the decrement-by-1 fuel scheme. The
  article may intend that reactor functions are all straight-line; it does not say so.

### What should be done in the future
- Ask the editor for Articles 1, 5, 6 and 10 alongside Article 7 next time, so the cross-references
  can be checked rather than trusted.

### Code review instructions
- Compare `feedback.md` against `article.md` section by section; every quote in the first three
  sections should be findable verbatim, and every score in "Section scores" should be traceable to a
  passage named above it.

### Technical details
- Files read: `TASK.md`, `article.md` (~1,600 words of body plus references), `glossary.md`,
  `diary-format.md`.
- Files written: `answers.md`, `feedback.md`, `diary.md`.
- Article under review: section 7, "Safety by Construction: Running Native Code Without Trusting It",
  sections 7.1–7.9 plus references.

## Step 2: Answering the six quiz questions

I answered the six questions in 7.9 without looking at anything but the article and the glossary, and
wrote each answer to `answers.md` with a confidence number. Where a question asked for a definition I
quoted the article's own wording before paraphrasing it, so that the editor can see whether my
reading matches the intended one.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer the "Check your understanding" questions in the article, 2–6
sentences each, numbered like the questions, with `Confidence: N` after each.
**Inferred user intent:** Test whether the article actually supports the answers it sets as exercises,
and expose the questions that need more than the text provides.
**Commit (code):** N/A.

### What I did
- Wrote `answers.md` with six numbered answers, each 4–6 sentences and each followed by a
  `Confidence:` line.
- Worked question 4's arithmetic explicitly (charge of 43 instructions per iteration; 100,000 / 43 ≈
  2,325 iterations; 100,000 instructions ≈ 1 ms at 100 million instructions per second).
- Worked question 5 as a concrete case: a faulty compiler passing an integer where a `buffer`
  reference belongs.

### Why
- The task asks for working to be shown where a question asks for a calculation; only question 4
  calls for one, so only there did I invent numbers, and I flagged in `feedback.md` that the article
  supplies no example of its own to copy.

### What worked
- Questions 1, 3, 5 and 6 were answerable directly from single passages; confidence 5 on each.
- Question 2's first half ("a by-product of what?") is answered explicitly by section 7.4's second
  paragraph.

### What didn't work
- Question 4 defeated a clean answer. The article gives three charging rules in one dense bullet and
  never states the composite rule, so my answer has to say "taking the article's rules literally" and
  I marked confidence 4 instead of 5. This is the single weakest question of the six.
- Question 2's second half ("what is lost") is stated only as the last clause of section 7.4 ("the
  stack bound silently disappears"); I had to reconnect it to the loader's refusal decision myself.

### What I learned
- A quiz question can be answerable and still be badly served by the text. Question 4 is answerable,
  but only by stitching three sentences together.

### What was tricky to build
- Fixing the confidence scale honestly: 5 only where I could point at one passage that states the
  answer, 4 where I had to compose the answer from two or three passages.

### What warrants a second pair of eyes
- My answer to question 6 states one advantage each way, but the article gives three differences
  (per-access cost, per-call cost, coverage, chip dependence). If the editor intended a specific
  advantage, my choice of "reactor call cost" and "covers CJI output" may not be the one being tested.

### What should be done in the future
- N/A.

### Code review instructions
- Read `answers.md` beside `article.md` sections 7.1, 7.4, 7.5, 7.6 and 7.7; each answer should be
  traceable to one of those sections, and where it is not, that is the defect.

### Technical details
- Answer lengths: 5, 4, 4, 6, 4, 4 sentences. Confidence: 5, 5, 5, 4, 5, 5.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six sections the task names, quoting each passage I had to read twice and
naming what was unclear, listing terms unresolved by article or glossary, listing claims that rest on
citations, scoring each numbered section, recording which quiz questions the text did not support, and
proposing one addition and one cut.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce the editor-facing report in the exact structure given in `TASK.md`.
**Inferred user intent:** Give the editor actionable, specific criticism — quotable passages, line-level
term gaps, and a concrete suggestion — rather than a general impression.
**Commit (code):** N/A.

### What I did
- Wrote `feedback.md` with: 4 "read twice" passages, 8 unresolved terms, 11 unverifiable claims, a
  score table for sections 7.1–7.8, a "questions I could not answer" section, and one add / one cut.
- Quoted passages verbatim from `article.md` so each complaint can be located by search.

### Why
- Specific quotes and a score per section were the only way I could make the report checkable by
  someone who disagrees with me; a general verdict would be unfalsifiable.
- I scored 7.5 lowest (3) because it contains both the densest calculation and the one gap in its
  central claim, and 7.1, 7.2 and 7.8 highest (5) because they are pure exposition that worked on the
  first read.

### What worked
- The "terms never explained" list was mechanical once I had the rule from Step 1: check the article,
  then the glossary, and report only what neither covers.
- The add/cut pair came out of the two places I had struggled most: the missing worked example, and
  the drift to other chips at the end of 7.7.

### What didn't work
- My first draft scored sections by how much I had enjoyed them rather than by how clear they were;
  I discarded it and re-scored by asking "did I have to re-read, and did I end up believing the claim
  on evidence or on authority?".
- I could not test the strongest criticism I have (the unbilled reactor loop) against the article's
  intent, because the material that would settle it is in Articles 5 and 10, which are not here.

### What I learned
- The article is strong where it compares mechanisms in a table and weakest where it moves from a
  table into prose calculation — the same pattern in 7.4, 7.5 and 7.6.

### What was tricky to build
- Separating "read twice" from "could not verify". Several passages qualified for both (the masking
  formula, the 4 percent figure); I put the ones whose difficulty was *wording* in the first list and
  the ones whose difficulty was *missing evidence* in the third, and said so on each item.

### What warrants a second pair of eyes
- The claim in item 9 that a reactor function's internal loops are unbilled by fuel. This is my
  inference from the fact that decrements are emitted only in compiled typed code; if reactor
  functions are guaranteed straight-line, the item should be struck.
- The proposal to cut the ESP-TEE/CHERIoT sentences: the CHERIoT sentence may be a deliberate
  forward pointer to Article 9's handles, in which case it should be moved rather than cut.

### What should be done in the future
- If the missing worked example (my "add") is written, quiz question 4 should be rewritten to refer to
  it, since that is the question it would make mechanical.

### Code review instructions
- Spot-check three quotes from `feedback.md` against `article.md` to confirm they are verbatim, then
  read the section-score table against the article with the questions "was this clear on first read,
  and was the claim evidenced?".

### Technical details
- Sections scored: 7.1 (5), 7.2 (5), 7.3 (4), 7.4 (4), 7.5 (3), 7.6 (4), 7.7 (4), 7.8 (5); 7.9 is the
  quiz and is not scored.
- Counts: 4 read-twice passages, 8 unresolved terms, 11 unverified claims, 6 quiz questions of which 0
  were unanswerable and 2 were poorly served.
