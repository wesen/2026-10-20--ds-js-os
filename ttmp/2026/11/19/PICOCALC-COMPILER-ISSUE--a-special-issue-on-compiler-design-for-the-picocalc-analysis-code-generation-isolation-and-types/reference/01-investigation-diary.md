---
Title: Investigation diary
Ticket: PICOCALC-COMPILER-ISSUE
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of how the special issue was researched, measured, written and tested with student readers."
LastUpdated: 2026-11-19T00:00:00-05:00
WhatFor: "Reproducing or reviewing the issue's evidence and method"
WhenToUse: "Before changing an article, rerunning an experiment, or repeating the reader study"
---

# Investigation diary

## Step 1: Scope, workspace and tools

The request was to turn a chat-length answer about what to build next for the PicoCalc compilers into a detailed, pedagogical "special issue", tested on weak student readers. I created this ticket, checked how to run the student agents, and fixed the working method before writing anything.

### Prompt Context
**User prompt (verbatim):** "write this all up in a detailed report. textbook authoring style, pedagogical approach (you can have a couple of "stupid" deepseek-4.1-flash pi coding agents run to validate and respond to quizzes and give feedback, in order to understand how to best structure the "special issue on compiler optimization", it's more than just a report). Make sure to cite and reference all you can, and be detailed. Save transcripts of the student subagents, have them write a diary using the diary skill format, you can use various levels of thinking)."
**Assistant interpretation:** Produce a multi-article issue in textbook style with full citations; use `pi` agents on `deepseek-4.1-flash` at several thinking levels as readers who take quizzes and give feedback; keep their transcripts and diaries; let their feedback shape the structure.
**Inferred user intent:** A document set that teaches the compiler-design choices facing the project to a newcomer, with claims that can be checked, and evidence that the teaching works.

### What I did
- `docmgr ticket create-ticket --ticket PICOCALC-COMPILER-ISSUE ...`; added this diary; created `issue/`, `sources/`, `scripts/`, `students/`, `quizzes/`, `various/`.
- `pi --list-models` showed `lunaroute/deepseek-4.1-flash`. A first smoke run with `--no-extensions` failed: `No API key found for lunaroute.` The provider is registered by the `@lunaroute/pi-extension` package, so the working invocation keeps that one extension: `pi -p --provider lunaroute --model deepseek-4.1-flash --no-extensions -e ~/.pi/agent/npm/node_modules/@lunaroute/pi-extension --no-mcp --no-context-files --no-skills --session-dir ./session --tools read,write,edit`.
- Extracted the text of *Engineering a Compiler* (3rd edition, 2023) from the local PDF to quote sections accurately.

### What worked
- The smoke run wrote the expected one-word answer in 16 s and left a JSONL session file.

### What didn't work
- `--thinking off` and `--thinking minimal` are both recorded by the session as `low` for this model. The three student configurations are therefore effectively low, medium and high.

### What I learned
- The session JSONL records `thinking_level_change`, every tool call with its path, and token usage, which is enough to audit what a student read.

### What should be done in the future
- N/A.

## Step 2: Bibliography verification

Every reference had been cited from memory in the earlier chat answer. Three research agents checked 107 numbered entries (about 130 works) against Crossref records, paper texts and official documentation, and wrote `sources/bib-01` to `bib-03`.

### Prompt Context
**User prompt (verbatim):** see Step 1.

### What I did
- Gave each agent a numbered list with my recollection and asked for status VERIFIED / CORRECTED / UNVERIFIED, a DOI or URL, and the core result in one to three sentences.
- Verified five further references myself against the Crossref API (Georges 2007, Mytkowicz 2009, Maranget 2007) or the source (Waterman 2011, the textbook's ISBN).

### What worked
- 103 entries verified, 4 corrected, 1 partly unverified.
- Corrections that changed the text: Su and Wagner's conference title differs from the journal title; the Hume level between FSM-Hume and PR-Hume is HO-Hume; the 1974 Pascal-P report has four authors; Static Hermes says sound types are required "for performance", not for ahead-of-time compilation as such; slim-binary loading was reported as almost twice as slow as native loading, described as competitive; the Tock paper covers ARM only.
- New facts used in the articles: ESP32-P4 main cores implement machine and user modes with up to 32 PMP entries (reference manual); ESP-TEE does not support the P4; Erlang's budget is 4,000 reductions; Wahbe et al. measured 4% overhead; Takikawa et al. measured up to 105x.

### What didn't work
- The size of the 1983 Turbo Pascal executable and its single-pass design could not be confirmed from a primary source. Turbo Pascal is not cited in the issue.
- DBLP, ACM DL and Springer refused scripted access; bibliographic data comes from Crossref.

### What warrants a second pair of eyes
- Abstracts seen only through a search index: Bell, Dewar, McKeeman, Sethi and Ullman, Consel and Noël, Tanenbaum 1982. The issue cites these for the existence and subject of the work only.

## Step 3: Four experiments on the typed compiler

The earlier answer asserted that the RV32 lowering is wasteful. I measured it, built a counting model of the proposed fix, and timed the compiler's phases.

### What I did
- `scripts/01-rv32-instruction-mix.mjs`: compiles Editor, Agenda and Files with the repository's compiler under Node and classifies every emitted instruction by decoding its fields. Output in `various/01-*`.
- `scripts/02-disassemble-example.mjs`: compiles one function and disassembles it with the ESP toolchain's objdump. Outputs for `countUnit` and `bump` in `various/02-*`.
- `scripts/03-register-cache-model.mjs`: walks each WebAssembly body and counts instructions under today's rules and two alternative rule sets. Output in `various/03-*`.
- `scripts/04-compile-phase-timing.{c,js,sh}`: links the repository's QuickJS objects into a small harness and times tokenizing, the frontend, the WebAssembly link and RV32 lowering for Editor.

### What worked
- Agenda's RV32 output is 30,840 bytes, the figure in the project's own diary, so the Node run reproduces the device artifact.
- The model's count for today's scheme equals the emitted count for all 161 functions (0 mismatches), which validates the walk.
- Editor: 43,965 instructions today; 55.3% are operand-stack loads and stores; 7,490 store-then-load pairs; 1,008 of 1,009 branch-over-jump pairs within short range; model A 16,544 and model B 13,255 instructions.
- The QuickJS harness produces an 88,255-byte Editor module, the device's size. Tokenizing 8.0 ms, frontend 28.5 ms, lowering +20.2 ms, link +1.3 ms on the workstation.

### What didn't work
- First run of script 01: `SyntaxError: 21:26: unknown function decimal`. `entry.typed` depends on `reminder.typed`; Agenda must be compiled as their concatenation.
- No prebuilt typed ELF reactor was available on the host, so the ELF slot link is not timed.

### What warrants a second pair of eyes
- Model B's register budget (10 locals for a leaf, 11 otherwise) and its assumption that a temporary is always free. The deepest operand stack is 8.

## Step 4: Round 0, and a correction to how I run things

Three students read the dense chat-length brief after a pre-test, listed what they could not explain, and proposed a teaching order.

### What I did
- Materials in `students/round0/materials/`; three students at requested thinking levels minimal, medium, high.

### What didn't work
- My first launch used a zsh loop `for s in "s1 minimal" ...; do set -- $s`. zsh does not word-split unquoted variables, so it created directories named `s1 minimal`. I then ran `pkill -f deepseek-4.1-flash`, which matched and killed its own shell (exit 144), and proposed `rm -rf` and `find -exec rm -rf` to clean up.
- The user rejected that command and wrote "write python not bash", then "well not all, but for dangerous commands". I replaced the shell runner with `scripts/run_students.py`, which deletes only direct children of a round directory whose names match a student pattern.

### What worked
- All three students finished in 104 to 135 s. None read outside its directory (`students/round0/audit.md`).
- They agreed on the structure: device and vocabulary first; measurement second; whole-program inference with one worked example before any names; declared boundaries as its own lesson; code generation shown by hand before the technique; a threat model before the verifier; `await` shown as source, state machine and hand-written version; a cost and benefit table at the end.
- They flagged the same unsupported claims: "the cost difference comes from inference, not JavaScript semantics" (no isolating measurement given), "write to memory only at calls and joins" (no invariant), "native code is larger, so mixed mode" (no budget), and "a checker confirms jumps" (stores not mentioned).

### What I learned
- The reordering is theirs. The issue has ten articles in that order, and each of the flagged claims now has a table or an argument.

## Step 5: Drafting, and one factual correction

I wrote ten articles in `issue/`, then the glossary and the answer key.

### What worked
- About 27,000 words, each article with objectives, a worked example from the repository, key points and six questions.

### What didn't work
- Articles 1 and 2 first said the compositor is a JavaScript world in the slowest engine. `port/esp32p4/CMakeLists.txt` sets `CJI_WORLDS snake flaky keyboard power settings files editor compositor display agent`: in the measured firmware the compositor is CJI-compiled native code. Both articles were corrected, and the argument in Article 2 now rests on the work the compositor does per message.
- Article 8 first said the project's diaries "record the defects" of hand-written continuations. They record tests and design rules for those hazards; the sentence was rewritten.

### What warrants a second pair of eyes
- The key-press model in Article 2 combines a 35.6 ms trace from one application with a per-turn average from another. It is labelled as a hypothesis.

## Step 6: Round 1, sixty sessions

Each of three students took each article's six questions twice: once seeing only the questions, and once after reading the article, when it also wrote feedback and a diary. Five grader agents then scored all 360 answers against `quizzes/answer-key.md` and condensed the thirty feedback files into one synthesis per article.

### Prompt Context
**User prompt (verbatim):** see Step 1.

### What I did
- `python3 scripts/run_round.py --round round1 --student s1:minimal --student s2:medium --student s3:high --workers 10` (about 25 minutes).
- `python3 scripts/render_sessions.py --round round1`: a readable `transcript.md` beside each session's JSONL, and `students/round1/audit.md`.
- Five grader agents following `quizzes/grading-instructions.md`; outputs in `students/round1/grades/` and `students/round1/synthesis/`.
- `python3 scripts/summarize_grades.py --round round1`.

### What worked
- 60 of 60 sessions produced answers and a diary; all 30 post-reading sessions produced feedback. No session read a path outside its own directory.
- Mean score before reading 7.6 of 12; after reading 11.9 of 12. By student: before 71, 80 and 77 of 120; after 119, 120 and 119.
- The graders confirmed 68 errors, inconsistencies or ambiguities across the ten articles, each quoted from the text.

### What didn't work
- The quiz is at its ceiling after reading, so it cannot rank the articles, and 24 of the 60 questions were answered correctly before reading. Several questions stated their own premise.
- The round-1 key for Article 5, question 1 contradicted itself (it accepted "6 or 7 instructions" and required 10).
- Students read one article at a time without the glossary, so many "undefined term" reports were for terms defined in an earlier article.

### What I learned
- The value of the weak readers was in the feedback, and the value of the graders was in checking each complaint against the text. Examples of what they found: a per-token cost that divided the whole compile by the token count while calling it the tokenizer's (Article 2); 84 + 146 written as 235 because a 5 ms term was dropped (Article 2); "three orders of magnitude" where the only whole-application row shows two (Article 1); a power-loss argument that needed the unstated fact that a new module goes to the inactive slot (Article 6); a fuel rule that is only an upper bound when a loop body branches (Article 7); a state-machine outline that used a variable it had no access to (Article 8); "five to six times longer" where the second example is 4.4 (Article 10).

### What warrants a second pair of eyes
- Grading was done by language-model agents against a written key. I read a sample of answers for Article 5 and agreed with the scores; I did not regrade all 360.

## Step 7: Revision after round 1

I revised all ten articles from the syntheses and replaced or reworded 30 questions so that they need the article.

### What I did
- Kept the round-1 texts in `issue-round1/` and the revised texts in `issue-round2/`.
- Every confirmed error was fixed in the text. Where a number came from the project's records, the article now says which record. Each article now restates in its opening paragraph the terms it borrows.
- Checked three facts in the repository before writing them: the installer alternates slots (`candidate.slot = active.version ? !active.slot : 0` in `compiler/install.c`); the 20 ms and 1,450 ms cache figures and what the second includes (the port's design document); the Editor's hand-written state for opening a file is `readToken` plus a boolean `reading` (`worlds/editor/editor.typed`).
- Wrote `quizzes/answer-key-round2.md`.

### What didn't work
- I had written in Article 8 that the Editor "refuses to open a second file while an earlier open is unfinished". The code refuses an open while a save is in progress. Corrected.

### What should be done in the future
- Round 2 gives the students the glossary, so that a term defined once in the series is not reported as missing in every article.

## Step 8: Round 2, a stalled batch, and the second revision

Round 2 repeated round 1 with fresh sessions on the revised articles and questions, and gave the after-reading students the glossary. The first launch hung; the relaunch completed, the graders scored it, and their findings drove a second, smaller revision.

### Prompt Context
**User prompt (verbatim):** see Step 1.

### What I did
- `python3 scripts/run_round.py --round round2 --student s1:minimal --student s2:medium --student s3:high --workers 10 --with-glossary < /dev/null`
- `python3 scripts/render_sessions.py --round round2`, five grader agents following `quizzes/grading-instructions-round2.md`, `python3 scripts/summarize_grades.py --round round2`.
- Applied the confirmed round-2 corrections to all ten articles and to `quizzes/answer-key-round2.md`.

### What didn't work
- The first launch produced nothing for four minutes: ten `pi` processes, no session files, no answers. A single probe session run from my shell finished in 26 s, so the model was responsive. `ls -l /proc/<pid>/fd/0` showed `0 -> socket:[...]`: the background runner had handed its children a socket as standard input, and `pi -p` reads piped standard input and waits for its end. Round 1 had not hit this. I stopped the batch with a Python script that first checked that the parent's command line was the round-2 runner and that every child was named `pi`, and added `stdin=subprocess.DEVNULL` to `run_students.py`.
- One session (`a04-pre/s3`) called `read` on `../`. The tool returned `EISDIR: illegal operation on a directory, read`; nothing outside its directory was seen.

### What worked
- 60 of 60 sessions complete. Mean before reading 6.0 of 12 (round 1: 7.6); after reading 12.0 (360 of 360). Questions answered correctly before reading fell from 24 to 11.
- The graders confirmed 42 further items (round 1: 68). Those of substance: the "under 5 percent" key-press share holds only for native code, and is 20 percent for WebAssembly by the article's own numbers (Article 2); 2^53 - 1 was called the largest exactly representable integer (Article 3); the 88 and 94 percent figures describe the same build and overlap (Article 3); a pending read of a local must be resolved before the local is assigned (Article 5); the verifier's branch check allowed a jump past a bounds check (Article 7); the example for `await` held a buffer reference across a wait, against its own rule (Article 8); "any call discards the fact" discarded it at the access it protects (Article 9).

### What I learned
- After two rounds the open-book quiz is still at its ceiling. Its useful output is the before-reading score, which shows whether a question needs the article.
- The second round found fewer and smaller defects than the first, and still found real ones. I stopped at two rounds; the published text contains the round-2 corrections and has not been read by a third set of readers.

### What warrants a second pair of eyes
- The round-2 corrections themselves, since nothing has tested them. The ones that changed reasoning and not just wording are in Articles 3 (section 3.5), 7 (sections 7.5 and 7.6) and 8 (sections 8.5 and 8.6).

## Step 9: Publication

### What I did
- Wrote the editorial, glossary, reader-study appendix and answers; `python3 scripts/build_references.py` (111 entries, 103 with a DOI or URL attached from the verification notes); `python3 scripts/make_figures.py --round round2`.
- `python3 scripts/publish_to_vault.py` wrote 16 notes and 5 figures to `Research/2026/11/19/compiling-on-a-handheld/` in the go-go-parc vault, with frontmatter and navigation links. Vault commit `37d4459`, pushed.

### What should be done in the future
- Implement the compile-time operand stack for Files first and compare with the model's 593 instructions. That is the cheapest test of the issue's one numerical prediction.
- Take the key-press-to-pixel measurement that Article 2 calls for.

## Step 10: Moving the working material under sources/

`docmgr doctor` reported 1,035 frontmatter errors: it validates every Markdown file in a ticket, and the article texts, quiz keys and student-session files carry no docmgr frontmatter. Its `--ignore-dir` and `--ignore-glob` flags did not suppress them for a single-ticket run. The tool skips a ticket's `sources/` directory by default, so I moved `students/`, `issue/`, `issue-round1/`, `issue-round2/` and `quizzes/` under `sources/` with a script that checked each source and destination first, and updated the path constants in the scripts. Paths written in earlier steps of this diary, and the working-directory paths recorded inside the session transcripts, refer to the layout before the move.
