# Investigation entry

## Step 1: Reading the article and looking terms up in the glossary

I read `TASK.md`, then `article.md` in one pass from the opening to the references, then `glossary.md`,
then went back through the article with the glossary beside it to check every bolded or technical term
as a reader would. I deliberately did not open anything outside this directory, so any claim that the
article supports only by naming a file (`worlds/editor/editor.typed`, `worlds/editor/find.typed`) or a
design note stayed unverified, and I recorded it that way.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read `article.md` end to end, use `glossary.md` as a reader would, then produce three files: answers, feedback, diary.
**Inferred user intent:** The editor wants an honest pre-publication teaching test, especially a list of places where the prose stops teaching.
**Commit (code):** n/a — this directory is not a git repository that I touched.

### What I did
- Read `TASK.md`, `diary-format.md`, `article.md` (all 9 sections plus references), `glossary.md`.
- Built a term list from the article and checked each against the glossary: `world`, `nucleus`, `turn`, `turn budget`, `reactor`, `split-phase operation`, `token`, `continuation`, `defunctionalization`, `stack ripping`, `liveness`, `frame`, `fuel`, `slot`, `handle`.
- Noted terms with no glossary entry and no in-text definition: `scalar field`, `kind 4`, `WorldEvent`, `step`, `caller position`, the `0` argument of `typedSdkBuffer`.

### Why
- Reading with the glossary open is the only way to separate "the article assumes this" from "nothing explains this", which is what the feedback section asks for.
- I checked terms after the first pass rather than during it so that the first pass would reproduce a real reader's experience of hitting an unexplained word in context.

### What worked
- The glossary covers essentially all the system vocabulary (`nucleus`, `turn budget`, `token`, `split-phase`, `stack ripping`, `continuation`, `defunctionalization`, `liveness`) and even disambiguates `frame` into "stack frame" and "Article 8 persistent frame", which spared me a false complaint.

### What didn't work
- My first attempt to verify the phrase "71 state fields" was to look for a listing in the article; there is none, and I have no shell tool in this session to search sibling directories, so the claim had to go into the unverifiable list instead of being confirmed or refuted.

### What I learned
- The article is unusually citation-dense; almost every strong claim either quotes a paper or names a project file, which made the few claims with neither (the "The editor is saving." string, the 71/80 field numbers) stand out sharply.

### What was tricky to build
- Nothing was built. The tricky part of reading was 8.3: the mapping from "two waits → two continuations → a tag" onto the concrete fields `readToken` and `reading` needs one inference (that `readToken` is non-zero during *both* waits) that the surrounding sentences do not supply.

### What warrants a second pair of eyes
- Whether `readToken` still holds the read's token during the yield wait is a factual question about the Editor's code that the article leaves open; a reader answering quiz question 3 has to guess.

### What should be done in the future
- Add the hand-written open handler as a listing so that `reading` and the token lifecycle can be read instead of inferred.

### Code review instructions
- Read `article.md` §8.3–8.6 against `glossary.md` entries *Continuation*, *Defunctionalization*, *Stack ripping*, *State machine*, *Frame*.

### Technical details
- Article scope: 8.1 split-phase, 8.2 hand-written stack ripping, 8.3 continuations/defunctionalization, 8.4 liveness, 8.5 generated frame + `start`/`resume`, 8.6 static frames, 8.7 explicit waits, 8.8 summary, 8.9 quiz.

## Step 2: Answering the "Check your understanding" questions

I answered all six questions in `answers.md`, in my own words, keeping each to a few sentences and showing
working where a question asked for a justification. Question 2 got a per-variable table because the
liveness judgement for `stop` only becomes convincing if the order of statements around the yield is
written out; question 3 needed the reader-side inference that the tag's third state is "token zero".

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Answer the six numbered questions from the article alone, number them the same way, and add `Confidence: N`.
**Inferred user intent:** Test whether the article actually supports the answers it expects, with confidence values as a signal of where it does not.
**Commit (code):** n/a.

### What I did
- Wrote `answers.md` with answers 1–6 and a `Confidence:` line after each.
- For question 2 I reconstructed liveness from the definition in 8.4 and cross-checked against the frame table in 8.5, which stores exactly `length`, `read`, `written`.
- For question 4 I used both the 8.5 listing and the dispatcher paragraph in the same section.

### Why
- Confidence values were assigned by asking "could another careful reader reach a different answer?": 5 for question 6 (the reason is stated in one paragraph), 3 for question 3 (needed an inference).

### What worked
- Question 2 is well supported: 8.4's table, the definition of liveness, and 8.5's frame layout all agree, so the answer could be checked three ways.

### What didn't work
- Question 4 could not be answered in full from the listing alone: `frame.state = 0` never appears as a `switch` case, so I had to take the "not running" behaviour from the dispatcher paragraph instead. That is recorded in `feedback.md`.
- My first draft of question 5 said "one frame per function is not enough because of recursion"; that is wrong and I deleted it — 8.6's point is the *absence* of recursion plus the possibility of the same function being suspended in two concurrent tasks, which are different reasons.

### What I learned
- The article's static-frame argument has two halves that are easy to confuse: no recursion makes a frame fixed-size, and multiple concurrent tasks make one frame *per function* insufficient. Only the second half explains why storage is per task.

### What was tricky to build
- Nothing built. The tricky part was question 3: the question presupposes that two named fields *are* the tag, and the article does say so in one sentence, but nothing shows `reading` being set or cleared, so the answer rests on a single declarative sentence plus a guess about the zero case.

### What warrants a second pair of eyes
- Whether `length` at wait 2 is genuinely live or merely rematerializable from `state.sourceLength`: the article calls it live and saves it, and the code reads it from the frame, so I answered "live", but a compiler writer would note it could be refetched.

### What should be done in the future
- Say explicitly in 8.5 what `frame.state = 0` means for a `resume` call, or add it as a case in the `switch`.

### Code review instructions
- Open `answers.md` beside `article.md` §8.4 and §8.5 and check that each answer can be traced to a sentence.

### Technical details
- Confidence values used: 4, 4, 3, 4, 4, 5.

## Step 3: Writing the feedback

I wrote `feedback.md` in the six requested sections, quoting one or two sentences per complaint and keeping
each term or claim to one line. The hardest part was resisting the temptation to write a general review:
the editor asked for specific places where teaching fails, so I tried to make every item something the
editor could act on by editing one paragraph, adding one listing, or cutting one paragraph.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Six fixed sections, quotes included, one-line entries for terms, a score per numbered section, an assessment of which quiz questions were answerable, and one addition plus one cut.
**Inferred user intent:** A publishable defect list, not a rewrite.
**Commit (code):** n/a.

### What I did
- Wrote `feedback.md` with the sections *Passages I had to read twice* (7 items), *Terms used before they were explained, or never explained* (9 items), *Claims I could not verify from the article itself* (10 items), *Section scores* (table, opening + 8.1–8.9), *Questions that the article did not let me answer*, and *One thing to add and one thing to cut*.
- Scored 8.1 and 8.7 highest (5) and 8.3, 8.5, 8.6 lowest (3).

### Why
- I scored on "could I recover the intended meaning without guessing", which is why 8.3 loses a point despite being conceptually the most interesting section: its central identification of the tag is declared, not shown.
- I chose the per-task frame model as the single addition and the comparison-with-other-systems paragraph as the single cut because those are the two edits with the largest teaching yield per line.

### What worked
- Quoting the article exactly made the complaints self-evident; the "`goto loop_test` with the label below the switch" item and the "`read < stop` with an elided increment" item needed no argument beyond the quote.

### What didn't work
- My first draft of the section scores gave 8.5 a 2 on the strength of the `goto`/`switch` listing alone; I raised it to 3 because the frame table above the listing is clear and the algorithm sketch at the end is usable. No diagnostic output was involved in any of this; this is a reading task.

### What I learned
- The single most load-bearing unverified number in the article is 71: it is a claim in 8.2, a limit comparison in 8.6, and a test criterion attributed to Article 10, and none of the three offers evidence.

### What was tricky to build
- Nothing built. The tricky judgement was distinguishing "used before explained" from "explained later, adequately": `fuel` and `frame` look like candidates but the glossary covers both, so they were left out, while `step` and `kind 4` stayed in because no amount of glossary reading settles them.

### What warrants a second pair of eyes
- Whether "caller position" in 8.6 is a real mechanism in the Editor or a place where the prose outruns the design; if it is the latter, that paragraph needs rewriting rather than expanding.

### What should be done in the future
- Add the variable → hand-written field → frame field table and the full open handler, and drop or compress the protothreads/Céu/Embassy paragraph.

### Code review instructions
- Read `feedback.md` top to bottom beside `article.md`; every quoted item should be findable in the article with a text search for the quoted fragment.

### Technical details
- Files written this session: `answers.md`, `feedback.md`, `diary.md`. No file outside this directory was read or modified.
