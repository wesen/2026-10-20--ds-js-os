## Step 1: Reading the article from start to finish

I read `TASK.md`, `diary-format.md` and then the whole of `article.md` in one pass, taking notes on where I had to slow down. The article is a chapter on turning manual stack ripping into a compiler transformation, so I tried to hold two things at once while reading: the wished-for `async` source and the field-by-field hand-written version.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Read the task file, then do its four steps in order: read the article, answer the quiz into `answers.md`, write `feedback.md`, write `diary.md`.
**Inferred user intent:** The editor wants an honest student-level test of whether the article teaches what it claims to teach, before publication.
**Commit (code):** none — this session only produced Markdown files.

### What I did
- Read `TASK.md` and `diary-format.md`.
- Read `article.md` (sections 8.1–8.9 plus references) in full, twice over the code listings.
- Kept a scratch list of unclear passages, undefined terms and unverifiable claims as I went.

### Why
- The later steps quote passages exactly, so the quoting had to come from a genuine first reading rather than from reconstructed memory.

### What worked
- The liveness table in §8.4 and the frame table in §8.5 were easy to check against the code listing; the three saved scalars (`length`, `read`, `written`) fall out of the frame table directly.

### What didn't work
- I could not reconstruct the actual output code from §8.5: the outline mixes a `switch` on `frame.state` with a `goto loop_test`, and the WebAssembly paragraph says the jump becomes "one loop that dispatches on a state number" without showing it. Recorded in `feedback.md`.
- I could not check any of the numeric claims (71 state fields, five tokens, 1,024 units, six saved positions) because no file, test name or size is given.

### What I learned
- The chapter leans on Article 1 (`turn`, `turn budget`, `reactor`) and Article 7 (no recursion) for its load-bearing definitions. Reading it standalone, "nucleus", "world" and "fuel" are the terms that had no local explanation.

### What was tricky to build
- Nothing to build here; the tricky part was resisting the temptation to fill gaps with my own knowledge of `async`/`await` compilation instead of recording them as missing.

### What warrants a second pair of eyes
- The §8.3 sentence that maps `readToken > 0` to tag 1 and then names continuation 2's variables. It is either a numbering slip by the author or an implicit convention the reader is expected to infer; the editor should decide which.

### What should be done in the future
- Ask the author to include a field-role table for the hand-written routers, and the frame-size arithmetic, so the 71-field claim becomes checkable.

### Code review instructions
- Compare `article.md` §8.4 table against its §8.5 frame table; they should name the same three variables. Validate my reading of `stop` against the "recomputed on every outer iteration" note.

### Technical details
- Article sections read: 8.1–8.9; references cited in text: Gay 2003, Adya 2002, Reynolds 1972, Danvy & Nielsen 2001, Lauer & Needham 1979, Cooper & Torczon 2023 (§6.3, §9.2.2), Bierman 2012, Dunkels 2006, Sant'Anna 2013, Santos 2018, embassy.dev.

## Step 2: Answering the quiz

I answered the six questions of §8.9 in `answers.md`, numbered as in the article, each two to six sentences in my own words, with a `Confidence: N` line. Question 2 and question 4 needed written working, so I drew the liveness marking as a small table for Q2 and listed the three state values with their resume labels for Q4.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Answer the six quiz questions from the article alone, showing working, and rate my own confidence in each.
**Inferred user intent:** Find out whether the text alone is sufficient to answer its own questions, and where the reader had to guess.

### What I did
- Wrote `answers.md` with six numbered answers, each followed by `Confidence: N`.
- Q2: built a per-variable table (handle, ok, length, read, written, stop, text) with the reason for each verdict, then justified `stop` from the order of write and read in the loop body.
- Q3: defined tag and saved variables, then mapped them onto `readToken` and the `unitsRead`/`unitsWritten`/`sourceLength` group.
- Q4: enumerated `state` = 0/1/2 with the entry point and effect of each branch.

### Why
- The task asks for working where a calculation or translation is involved; Q2 is a liveness marking and Q3 is a translation between theory terms and field names.

### What worked
- Q1, Q2, Q4, Q5 and Q6 could be answered from the text with confidence 4–5.
- Q5's argument (acyclic call graph ⇒ at most one activation per function on a call chain ⇒ one static frame ⇒ one instance, with the "frames are busy" result made visible) is stated clearly enough in §8.6 to restate.

### What didn't work
- Q3 is only half answerable: the article names tag 1 and continuation 2's variables but never says which field is tag 2 or what continuation 1 saves. I marked it `Confidence: 3` rather than invent an answer.

### What I learned
- Answering Q2 myself exposed how much the §8.4 table leans on the reader knowing that `stop` is *written* at the top of each outer iteration before it is *read* — the table's phrase "recomputed on every outer iteration" is doing all the work.

### What was tricky to build
- Keeping the answers in my own words while staying faithful to the article's vocabulary (tag, saved variables, frame, split-phase). Where the article and my background disagreed, I followed the article.

### What warrants a second pair of eyes
- My Q2 verdict that `text` is not live at wait 2 because of the buffer rule rather than because of liveness. A stricter reading would say it *is* live but illegal; the article's "see below" does not settle whether the rule is a liveness exception or a separate typing restriction.

### What should be done in the future
- Add a quiz question about cancellation (setting `state = 0` so a late completion finds no match); it is described in §8.5 but never tested.

### Code review instructions
- Read `answers.md` beside `article.md` §8.4 and §8.5; confirm no answer uses facts that appear nowhere in the article.

### Technical details
- Answer lengths: 3–6 sentences. Confidence ratings: Q1 5, Q2 4, Q3 3, Q4 5, Q5 4, Q6 5.

## Step 3: Writing the feedback

I wrote `feedback.md` with the six required sections: passages I had to read twice, terms used before or never explained, claims I could not verify, section scores with one-line reasons, questions I could not answer, and one thing to add plus one thing to cut. I kept all quotes to one or two sentences, copied exactly from the article.

### Prompt Context
**User prompt (verbatim):** see Step 1
**Assistant interpretation:** Produce a structured critique in the prescribed section order, quoting exactly and stating what was missing rather than supplying the missing content myself.
**Inferred user intent:** Give the editor actionable, specific weaknesses, not a general impression.

### What I did
- Quoted five passages for "read twice", each followed by what specifically confused me.
- Listed thirteen terms as used-before-explained or never explained, one line each, with where it appears.
- Listed nine unverified claims, each with the evidence or step that is absent.
- Scored sections 8.1–8.9 (8.1: 4, 8.2: 3, 8.3: 3, 8.4: 4, 8.5: 3, 8.6: 3, 8.7: 5, 8.8: 4, 8.9: 3).
- Named Q3 (and partly Q2, Q4) as the questions the article did not fully support.
- Add: a worked dispatcher trace plus the frame-size arithmetic. Cut: the Protothreads/Céu/Embassy paragraph in §8.6.

### Why
- The task demanded those exact sections; I filled them with what I actually got stuck on rather than with a balanced review.
- I picked "add a worked trace and one number" because the article repeatedly asserts concrete quantities (71 fields, five tokens, 1,024 units, six positions) and never shows one of them being derived, which is the single biggest obstacle to trusting the argument.

### What worked
- The scored-section format forced me to separate "clear but under-sourced" (§8.2) from "genuinely hard to follow" (§8.5).

### What didn't work
- I could not judge the four texts cited for other systems (Adya, Protothreads, Céu, Embassy) beyond what the article quotes, since I was told not to use the web and the quotes are all I have. I flagged that as an unverifiable claim group rather than pretending to check them.

### What I learned
- The article is strongest where it puts numbers in a table that can be checked against code (§8.4) and weakest where it names a real project's internals (§8.2, 71 fields) or a foreign ISA (§8.5, WebAssembly table-jump) from memory.

### What was tricky to build
- Separating "I did not understand because I lack background" from "the article did not explain". I resolved each term question by checking whether the article's own text, or the stated earlier articles, contained the definition; "nucleus", "world" and "view" failed that check, "turn budget" and "fuel" only miss because they are delegated to Articles 1 and 7.

### What warrants a second pair of eyes
- My proposal to cut the related-systems paragraph. It may be load-bearing for a reader who wants to know this design is not unique; the editor should weigh that against its density.

### What should be done in the future
- Publish the article only after §8.3's tag mapping is fixed and at least one concrete frame-size number is computed, since Q3 depends on the first and the §8.6 claim depends on the second.

### Code review instructions
- Check every quotation in `feedback.md` against `article.md` for exact wording, and check that each of the six required sections is present and in order.

### Technical details
- `feedback.md` sections: Passages I had to read twice (5), Terms (13), Claims I could not verify (9), Section scores (8.1–8.9), Questions the article did not let me answer (Q3 partial; Q2, Q4 flagged as awkward), One thing to add / one thing to cut.
