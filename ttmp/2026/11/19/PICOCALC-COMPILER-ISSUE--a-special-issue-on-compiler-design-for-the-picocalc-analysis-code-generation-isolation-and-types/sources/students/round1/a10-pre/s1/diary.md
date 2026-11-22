## Step 1: Answering a blind quiz on "Architecture and a Roadmap"

This step was a blind read of a quiz: `quiz.md` poses six questions about an article titled "10. Architecture and a Roadmap" that I was not given, and I answered all six from general compiler and systems knowledge. The answers went to `answers.md` with a `Confidence: N` line after each; this diary entry records which answers were genuine reasoning and which were reconstructions of a document I could not see.

### Prompt Context
**User prompt (verbatim):** "Read TASK.md and carry out every step in order."
**Assistant interpretation:** Follow the four instructions in `TASK.md`: read `quiz.md`, answer it in `answers.md` with per-answer confidence, write this diary in the `diary-format.md` format, and reply `DONE`.
**Inferred user intent:** The editor wants a measurement of how much a reader can infer about an article from its questions alone, and where the questions leak or fail to leak enough context.
**Commit (code):** N/A — no repository commits in this directory.

### What I did
- Read `TASK.md`, `quiz.md`, `diary-format.md`.
- Wrote answers to questions 1–6 in `answers.md`, each 2–5 sentences, each followed by `Confidence: N`.
- Wrote this entry in `diary.md` using the full investigation format.

### Why
- The task forbids reading the article and forbids the web, so reasoning from general knowledge was the only permitted source; guesses were labelled as such rather than dressed up as facts.
- Per-question confidence was kept honest instead of uniform, since the questions vary a lot in how much they constrain the answer.

### What worked
- Q1 (table-order mismatch) and Q3 (why annotation stripping is insufficient) I could answer substantively: both rest on well-known failure modes — position-keyed parallel tables drifting, and `enum`/parameter properties/`namespace` being runtime constructs, not just syntax.
- Q2 (text round-trip in a screen update) I answered structurally, listing the serialise/parse/validate stages that only exist to cross the boundary.
- Q4 (differential JS emitter as an oracle) I answered from the standard differential-testing argument: shared semantics are comparable, target-specific contracts are not.

### What didn't work
- Q5 and Q6 rest on the article's own roadmap ordering and on predictions in its section 10.7. I could only give the plausible general argument (do the port once, against the final async model) — not the article's stated reason or the actual prediction. Q6 is therefore close to a guess and got `Confidence: 1`.
- No commands were run and no failures occurred; the limitation was missing source material, not tooling.

### What I learned
- Question wording leaks a lot: "table of reactor functions", "trampoline table", "application and compositor exchange text" tell me the article is about a small OS/hosted runtime with an actor- or message-style compositor, which shaped every answer.
- A quiz designed as a teaching-article check probes understanding of mechanisms, so most of it is answerable in outline even blind; only the editorial claims (orderings, predictions) are truly unreachable.

### What was tricky to build
- The hard part was separating "what must be true of any answer" from "what this article says". I handled it by stating the mechanism generically and explicitly flagging where the article's specifics are required (Q2, Q5, Q6).

### What warrants a second pair of eyes
- Whether Q1's proposed "interface description" is really a single-source-of-truth codegen mechanism or something narrower; my answer assumes the former. If the article means a hand-written ABI/IDL, the answer's second half is off.
- Q3's choice of constructs: `enum` and parameter properties are safe guesses, but the article may have picked different ones (e.g. `namespace` and decorators), which would make my pairing only partly aligned.

### What should be done in the future
- If a second pass is allowed, re-answer Q5 and Q6 against the actual section 10.7 text; those are the two answers most likely to be wrong.

### Code review instructions
- Read `answers.md` and check each `Confidence` line against how much the question actually constrains; Q1 and Q3 should read as reasoning, Q2/Q5/Q6 as reconstructions.
- Validation: confirm six answers are present, numbered 1–6, each 2–5 sentences, each followed by exactly one `Confidence:` line.

### Technical details
- Files written: `answers.md`, `diary.md`. Files read: `TASK.md`, `quiz.md`, `diary-format.md`.
- Confidence distribution: 3, 2, 3, 3, 3, 1. Two answers contain an explicit "I cannot know this without the article" hedge as the task requires where article facts are needed.
