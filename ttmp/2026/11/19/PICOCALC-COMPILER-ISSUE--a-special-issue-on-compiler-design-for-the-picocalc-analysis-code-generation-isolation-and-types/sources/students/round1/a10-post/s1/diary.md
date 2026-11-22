# Investigation entry

## Step 1: Reading "10. Architecture and a Roadmap" and the session rules

I read `TASK.md` to fix the deliverable list (answers, feedback, diary, final `DONE`), then read
`diary-format.md` so the diary would match the required headings, then read `article.md` straight
through once without note-taking to see the shape of it: an inventory, four proposals, a
consolidation table, a roadmap, a falsification table, key points, six questions. Only after that
first pass did I go back section by section to check the arithmetic in the inventory and the
citations in the prediction table.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task file, obey its four numbered instructions, and end with the single line `DONE`.
**Inferred user intent:** An editor wants a genuine reader's test of a teaching article — where it fails to teach — produced in this directory only, without external sources.
**Commit (code):** not available (no repository state in this directory).

### What I did
- Read `TASK.md`, `diary-format.md`, and `article.md` in that order.
- On the second pass, worked the inventory numbers arithmetically rather than trusting them: 1,730 ÷ 316 ≈ 5.5 for Editor; (468 + 869) ÷ 307 ≈ 4.4 for Agenda; 17 × 49 = 833 characters for the screen example.
- Listed every acronym and coined term in the article and checked against the rest of the text for a definition; kept only the ones with no definition anywhere.

### Why
- The task explicitly asks the reader to be honest about failure to teach, so the second reading was targeted at the article's own numbers and at its undefined vocabulary, not at its argument.
- Reading the diary format before writing prose avoided reformatting work later.

### What worked
- The second pass caught the one arithmetic claim in the article that its own table refutes: "five to six times longer" holds for Editor (5.5) but not for Agenda (4.4).
- Building the list of undefined terms mechanically (every capitalised acronym, every quotable technical noun) produced a much longer list than memory would have.

### What didn't work
- My first attempt to write feedback went section by section in reading order, which duplicated the "passages I had to read twice" section and the "section scores" section. Restructured to quote-first, per the required section headings.

### What I learned
- This article is a synthesis chapter and the majority of its load-bearing numbers (593 vs 1,529 instructions, under 10 percent, 2.7 times smaller, 2–3 s per boot) are borrowed from other articles without being restated. That is legitimate for a chapter in a series, but it makes a large part of the article unverifiable from the article itself, which is what the editor asked about.

### What was tricky to build
- Separating "terms never explained" from "terms explained elsewhere in the issue". A term like *fuel* may well be explained in Article 7; I only recorded terms whose explanation is absent from *this* text, and said so in the feedback preamble.

### What warrants a second pair of eyes
- Whether the Agenda multiplier (4.4) is a genuine error or whether the per-application reactors should be counted differently for Agenda, whose 869 C lines hold logic not yet typed. My arithmetic treats the C as part of "the typed version".

### What should be done in the future
- N/A for this session; the editor's revision pass is out of scope here.

### Code review instructions
- Start with `answers.md` (answers plus confidence), then `feedback.md` (six required sections), then this diary.
- Validation: confirm `answers.md` has six numbered sections each ending in a `Confidence: N` line.

### Technical details
- Numbers checked: 316 JS → ~1,730 typed (Editor); 307 JS → 468 typed + 869 C (Agenda); 17 × 49 = 833 characters; 28 reactor functions declared in three files; 660 kB CJI tool; 16 KiB message cap; 2⁵³ precision limit; 71 state fields.

## Step 2: Answering the six questions in 10.9

I answered the questions in `answers.md`, numbered to match, two to six sentences each and in my own
words, with the confidence line required by the task. Where a question asked for a list or a
translation I showed the working: naming steps 1, 2 and 4 for the screen update, and giving the
`(a + b) | 0` and `Math.imul(a, b)` rewrites with their reasons for the annotation question.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer the article's own quiz as a student, without help.
**Inferred user intent:** Test whether the article teaches what it claims to teach; unanswerable questions are themselves the finding.
**Commit (code):** not available.

### What I did
- Wrote six answers into `answers.md`, then assigned a confidence from 1 to 5 to each.

### Why
- I gave confidence 5 only where the text states the answer outright (questions 2, 3, 4, 5) and 4 where an inference is needed (1, 6). Nothing got below 4, which I take as evidence the article is answerable but not always explicit.

### What worked
- Question 3 was the easiest, because the rewrite table is a lookup: two rows plus the required JavaScript replacement.
- Question 5 was fully supported by one sentence of section 10.1 plus one sentence of 10.6.

### What didn't work
- Question 4 resisted: the article says what the reference *cannot* do ("cannot reveal an error in the source's logic") but never positively names the class of error it *can* detect. I had to compose the answer from "a second, independent implementation of the language's semantics" plus "needs no hand-written original". This is recorded in `feedback.md` under "Questions that the article did not let me answer".

### What I learned
- The quiz is better aimed than I expected from the prose; only question 6 is genuinely soft, because two rows of the section 10.7 table give a conclusion rather than an action in their "If it fails" cell.

### What was tricky to build
- Question 2's boundary. Neither the article nor the question settles whether step 3 (the 16 KiB queue copy) counts as text-only overhead, so I answered with the article's own phrasing, then flagged the ambiguity rather than hiding it.

### What warrants a second pair of eyes
- Any answer involving a number (question 6's 100 ms / 2–3 s) is quoted from a prediction table that this article does not derive.

### What should be done in the future
- N/A.

### Code review instructions
- Read `answers.md` against section 10.9 of `article.md`; the question text should match one to one.

### Technical details
- Confidence assigned: Q1 4, Q2 5, Q3 5, Q4 5, Q5 5, Q6 4.

## Step 3: Writing the critical feedback

I wrote `feedback.md` with the six required sections. The hardest section to write honestly was
"claims I could not verify", because most of the article's precise numbers are legitimately cited
to other articles of the same issue; I tried to distinguish "sourced elsewhere, acceptable in a
series" from "unsourced even within the issue", and the latter turned out to be a short list: the
"design notes" budget, the 28 functions, the 2 kB screen, and the twelve remaining applications.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Give sectioned, quoted criticism aimed at making revision possible.
**Inferred user intent:** Concrete, locatable complaints rather than overall praise or blame.
**Commit (code):** not available.

### What I did
- Quoted six passages that cost me a second reading, each with a one- or two-sentence reason, and suggested the fix where it was a one-word fix.
- Listed fifteen terms that appear without definition in this article.
- Quoted nine unverifiable claims with the missing evidence named.
- Scored all nine numbered sections with one sentence of reason each.
- Answered the "questions the article did not let me answer" section, which forced me to admit that no question was strictly unanswerable but two were only answerable by inference.
- Chose one addition (a worked trace of the table-order failure) and one cut (step 11, user mode under PMP).

### Why
- I scored 10.1 and 10.8 at 5 and 10.4, 10.5, 10.7 at 3. The 3s share a cause: each is telegraphic and depends on vocabulary or numbers the article does not supply, so the reader is asked to accept rather than to follow.
- I picked step 11 for the cut because it is the only roadmap row with no dependency edge in the graph, no mention in the ordering prose, and no key point, while carrying the highest stated risk.

### What worked
- The diary format's "Claims I could not verify" analogue in the task instructions pushed me to attach each quote to the specific missing evidence, which turned vague unease into a fixable list.
- Quoting rather than paraphrasing made the "read twice" section sharp; three of the six quotes turned out to be pronoun-reference or naming ambiguities that are cheap to repair.

### What didn't work
- My first draft of the section scores was a paragraph of prose with numbers embedded. Split into one bullet per section, as the task asks.
- I nearly listed *world*, *reactor* and *nucleus* under "claims I could not verify" as well as under "terms never explained". Removed the duplication; undefined vocabulary is not an unverified claim.

### What I learned
- The article's biggest teaching risk is not error but aggregation: precise borrowed measurements (593, 1,529, 2.7, 10 percent, 2–3 s, 100 ms, 71 state fields) arrive without their derivations, so a chapter with no working shown still reads as if it had proved something.

### What was tricky to build
- Deciding whether the Agenda ratio (4.4 versus the claimed five to six) is an error or a definitional difference. I recorded it as an unverifiable/possibly overstated claim and stated my arithmetic openly in both `feedback.md` and the Step 1 diary entry so the editor can judge, rather than calling it an error outright.

### What warrants a second pair of eyes
- The Agenda line-count comparison, since the 869 C lines hold logic that is not typed yet and might reasonably be excluded.
- The choice of step 11 for the cut; if a later article owns that experiment, the row belongs and my criticism is misdirected.

### What should be done in the future
- If the editor accepts the worked example in section 10.2, it should be built from the real file contents so the trace is checkable.

### Code review instructions
- Read `feedback.md` top to bottom against `article.md`; every quotation should be findable verbatim in the article, and every section score should have a reason.
- Validation: six headings present, nine section scores, one addition and one cut.

### Technical details
- Sections scored: 10.1 = 5, 10.2 = 4, 10.3 = 4, 10.4 = 3, 10.5 = 3, 10.6 = 4, 10.7 = 3, 10.8 = 5, 10.9 = 4.
- Arithmetic used against the article: (468 + 869) ÷ 307 ≈ 4.4; 1,730 ÷ 316 ≈ 5.5; 17 × 49 = 833.
