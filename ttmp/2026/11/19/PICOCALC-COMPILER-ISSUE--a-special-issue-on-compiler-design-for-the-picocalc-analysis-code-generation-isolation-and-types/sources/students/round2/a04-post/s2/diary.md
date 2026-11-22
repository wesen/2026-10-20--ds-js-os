# Work diary — student read of article 4

## Step 1: Reading the article against the glossary

I read `article.md` start to finish in one sitting, without stopping to check references, then re-read it section by section with `glossary.md` open beside it, looking up every term that carried weight: summary, jump function, dense and sparse, SSA form, strongly connected component, widening, demotion, range. My aim was to separate two failures that feel identical while reading: a term the article explains a paragraph too late, and a term nothing in the package explains at all.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order." (see TASK.md, step 1: read the article and report only terms that neither the article nor the glossary explains)
**Assistant interpretation:** Read the article critically as a student, not as an editor, and keep a list of the places where comprehension broke.
**Inferred user intent:** The editor wants to know where the teaching actually fails, before publication, from someone who has not seen the material before.
**Commit (code):** N/A — no repository changes, only documents written in this directory.

### What I did
- Read `article.md` in full (sections 4.1–4.5 plus references).
- Read `glossary.md` in full, then re-read article sections 4.1 and 4.2 with the glossary alongside.
- Read `diary-format.md` before writing this entry.
- Kept a running list of unclear passages and of terms to check, marking each term as "explained in article", "in glossary" or "neither".

### Why
- I checked the glossary before flagging any term, because the task says to report only terms that *neither* the article nor the glossary explains; flagging a term that has a glossary entry would be a false complaint.
- I read the article once quickly before the careful pass because a first reading reproduces what a student actually experiences: the places that snag are the ones worth quoting.

### What worked
- The "does the answer change?" column in the 4.1 table turned out to be the article's best teaching device: it gives the reader a question to hold while reading each subsection.
- The `nextIndex`/`clamp` example and the π example are self-contained enough that I could check my understanding without leaving the article.
- The glossary is genuinely usable: *jump function*, *summary*, *strongly connected component* and *demotion* were all there, so the article's dense table rows were recoverable.

### What didn't work
- My first pass flagged *widening* as "used before explained", but the article's third sentence explains it and the glossary defines it. I withdrew that item. Same for *demotion*, which the table only gestures at ("provisionally compiled as integer arithmetic") but the glossary covers — I demoted it from "never explained" to a note about the table's density rather than keeping it as a failure.
- I could not check any of the numeric claims (11,760 visits, 2,741 bodies, 62 percent, 15.9 million dispatches) because the article reports them without method, and the task forbids going to the web. That limit is recorded in `feedback.md` rather than papered over.

### What I learned
- The article distinguishes "explained late" from "never explained" implicitly and inconsistently: *widening* has a glossary entry and *narrowing*, its partner, has only a parenthesis in the text. An inconsistency like that reads to a student as an omission even though the information is technically present.
- Several of my "had to read twice" passages were dense *verdict* sentences ("It can only become more precise", "It does, on one condition") placed before the mechanism that justifies them. That pattern is worth reporting as a pattern, not as isolated sentences.

### What was tricky to build
- Deciding the boundary between "I could not verify this" and "this is false". The memory figure (4.5 MB to 7.3 MB inside an 8 MiB heap, given as the reason for rejecting the cache) does not by itself explain the rejection, but it is not contradicted by anything in the article; I recorded it as a missing step, not as an error.
- Judging section 4.3 was the hardest call of the read: it is short, clear in wording, and central to the article's argument, yet it demonstrates nothing. I scored it 2 on the ground that clarity of wording cannot compensate for an unsupported claim.

### What warrants a second pair of eyes
- The claim that "the type annotations already present in the source do the work that inference and optimization do elsewhere", supported only by a comparison against interpreters. A reader who knows the Static TypeScript paper may judge whether the article overstates the citation.
- The rejection reason for the experimental cache; if `feedback.md` is wrong about that figure needing a further step, the criticism should be dropped before publication.

### What should be done in the future
- When quoting this article again, keep a small table of numeric claims with their source (Article 3, profiling record, cited paper) so that verification does not require re-reading the series.

### Code review instructions
- Start with `answers.md` question 4 and question 5 to see the calculation and the one question I answered partly by inference; then read `feedback.md` sections "Terms used before they were explained" and "Claims I could not verify" against `glossary.md` and `article.md`.

### Technical details
- Numbers used from the article: 11,760 function visits, 9,019 skipped, 2,741 bodies analyzed, 62 percent of those avoided by the experimental cache, 29 percent compile-time cut, 4.5 MB → 7.3 MB peak memory inside an 8 MiB heap, 78.3 percent of 11.7 million joins with identical inputs, 39.6 percent of writes redundant, 95 whole-program passes, 170 seconds with range analysis removed, 15.9 million dispatches removed by one annotation, 25 local annotations removed for a byte-identical build, 22 existing programs.
- Files written: `answers.md`, `feedback.md`, `diary.md`.

## Step 2: Answering the quiz

I answered the six questions in section 4.5 in my own words, showing the arithmetic where a number was asked for and writing out the π example in my own notation where a mechanism was asked for. I attached a confidence number to each answer so that the editor can see which answers the article supported and which I had to infer.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Answer all six questions from the article alone, two to six sentences each, with a `Confidence: N` line after each.
**Inferred user intent:** The editor wants a test of whether the quiz is answerable from the article, and a record of where an honest reader hesitates.
**Commit (code):** N/A.

### What I did
- Computed question 1's range explicitly: `J₁ = i + 1`, substituting the ends [5, 7] gives [6, 8].
- Computed question 4's subtraction explicitly: 11,760 − 9,019 = 2,741, and explained why the smaller number is the honest denominator.
- Wrote out the formula-versus-result argument for question 2 in my own words rather than reusing the article's sentence.
- Answered question 5 in two parts and marked in the answer itself that the second consequence (reuse of compiled output across builds) is my inference.

### Why
- I wrote the working into the answers because the task asks for it, and because a wrong answer with visible working tells the editor more than a wrong answer without.
- I set confidence for question 5 to 3 rather than 4 because half of it came from my own reasoning about the stated properties, not from the text.

### What worked
- Questions 1, 3, 4 and 6 were answerable from the text directly; for those I am confident at 4 or 5.
- Keeping the answer to question 2 in the article's own vocabulary (*formula*, *inputs*, *computed once per function text*) let me check it against the paragraph about "A natural objection is that facts flow from callers into callees".

### What didn't work
- Question 5's second half could not be answered without extending the article: section 4.2 lists properties of local checking and never converts them into consequences for the handheld. I answered with one consequence the article does state (interactive compile times, in 4.4) and one I inferred, and said so.
- I could not check question 1 against any independent source for the jump-function convention (whether `J₁` is written in terms of the caller's parameters or the callee's); I followed the article's own worked example, which is the only definition available here.

### What I learned
- A quiz question whose premise is stated in a different section ("A classmate says...") is harder than it looks: whether it is answerable depends on whether the reader remembers a two-sentence argument from 4.1, and the quiz does not point back to it.

### What was tricky to build
- Staying inside the two-to-six-sentence bound while showing arithmetic and a mechanism in the same answer; question 3 needed the most compression, and I chose to keep the π example and drop the discussion of joins.

### What warrants a second pair of eyes
- My answer to question 5 should be compared with the editor's intent: if the article was supposed to support two consequences, section 4.2 needs a sentence that draws them.

### What should be done in the future
- N/A.

### Code review instructions
- `answers.md`, questions 4 and 5, for the arithmetic and the flagged inference.

### Technical details
- Confidence assigned: Q1 5, Q2 5, Q3 4, Q4 5, Q5 3, Q6 4.

## Step 3: Writing the feedback

I turned the reading notes and the quiz experience into `feedback.md`, in the six sections the task asks for. The passages I quoted are ones I actually stopped at, and for each I wrote what specifically was missing — a mechanism, an antecedent, or a bridge between a verdict and its justification.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Produce the review with the six named sections, quoting short passages, scoring each numbered section, and naming one thing to add and one to cut.
**Inferred user intent:** The editor needs actionable, honest criticism graded by section, not a general impression.
**Commit (code):** N/A.

### What I did
- Quoted seven passages I had marked during reading, each one or two sentences, with the reason for the second reading.
- Cross-checked every term in the "never explained" list against `glossary.md`; excluded *widening*, *demotion* and the other glossary-covered terms and said so explicitly.
- Listed ten claims with the specific evidence or step that is missing from each.
- Scored sections 4.1–4.5 (4, 4, 2, 4, 3) with one sentence of reason each.
- Named the quiz questions the article did not fully support, and chose the addition (a worked boundary example in 4.3) and the cut (the Su & Wagner sentence).

### Why
- I scored 4.3 lowest because it is the article's thesis and the least demonstrated, and 4.1 highest because it is where the article genuinely teaches.
- I chose the Su & Wagner sentence as the cut because it is self-contained, unsupported by anything later, and sits at the point where the dependency-order argument needs the reader's attention.
- I chose the worked example as the addition because the article's central claim ("the two families meet") is the one claim a reader cannot check.

### What worked
- The "had to read twice" quotes were easy to write because I had written them down as they happened rather than reconstructing them afterwards.
- Separating "terms used before explained" from "terms never explained" produced a short, defensible second list and made clear that the glossary is doing real work.

### What didn't work
- I could not verify any of the numeric claims, since the sources are papers and reports named only in the reference list and the task forbids the web. Rather than guess, I recorded each as unverifiable with the missing step named.
- My first draft of the section scores included sub-scores per subsection; I dropped them because the task asks for one score and one sentence per numbered section.

### What I learned
- The article's weaknesses concentrate in its verdict sentences, not its explanations: wherever it states a conclusion compactly ("It can only become more precise", "The evidence says otherwise"), the reader is asked to trust rather than follow.

### What was tricky to build
- Distinguishing "the article says something I doubt" from "the article does not let me check something". Only the second belongs under "Claims I could not verify", and keeping that line clean took a second pass over my notes.

### What warrants a second pair of eyes
- The claim about the 4.5 MB → 7.3 MB memory figures is the one criticism most likely to be a misreading on my part; a reader who knows how much headroom a 360 MHz device compiler actually needs should confirm before the editor acts on it.

### What should be done in the future
- If the article is revised, the two additions with the highest teaching value are the ones named in the feedback: a worked boundary example in 4.3, and a stated consequence of local checking for the handheld in 4.2.

### Code review instructions
- `feedback.md`, in order; then compare its "Terms" list against `glossary.md` to confirm that no flagged term already has an entry.

### Technical details
- Scores: 4.1 → 4, 4.2 → 4, 4.3 → 2, 4.4 → 4, 4.5 → 3.
- Files written: `feedback.md`.
