---
Title: 'Compiling on a Handheld: index to the special issue'
Ticket: PICOCALC-COMPILER-ISSUE
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: RV32 lowering measured and modelled in Article 5
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Frontend and WebAssembly emitter examined in Articles 4, 5 and 7
    - Path: repo://apps/typed/editor/editor.typed
      Note: Hand-written continuations discussed in Article 8
ExternalSources: []
Summary: Index to the ten articles, back matter, experiments and reader-study records of the special issue on compiler design for the PicoCalc.
LastUpdated: 2026-11-19T13:50:06.607488548-05:00
WhatFor: Finding any part of the special issue and the evidence behind it
WhenToUse: Before reading, extending or re-testing the issue
---

# Compiling on a Handheld: index to the special issue

*Compiling on a Handheld* is a special issue of ten articles on what to build next for the two compilers that run on the PicoCalc: CJI, which compiles unannotated JavaScript by whole-program inference, and the typed compiler, which compiles a small typed language one function at a time. The issue is written in textbook style for a reader who programs and has not studied compilers. The published copy is in the Obsidian vault under `Research/2026/11/19/compiling-on-a-handheld/` (vault commit `37d4459`). The working copies are in this ticket under `sources/`, which the documentation tool does not validate; that is where the article texts, the student-session records and the quiz keys are kept.

## The issue

| Document | Words |
| --- | ---: |
| [Editorial and Reading Guide](../sources/issue/00-editorial-and-reading-guide.md) | 1,216 |
| [1. The Machine, the Mission and the Vocabulary](../sources/issue/01-the-machine-the-mission-and-the-vocabulary.md) | 2,964 |
| [2. Measuring Before Optimizing](../sources/issue/02-measuring-before-optimizing.md) | 2,894 |
| [3. Why Whole-Program Inference Costs Minutes](../sources/issue/03-why-whole-program-inference-costs-minutes.md) | 3,158 |
| [4. Making Inference Affordable, or Avoiding It](../sources/issue/04-making-inference-affordable-or-avoiding-it.md) | 3,691 |
| [5. Code Generation: From a Stack Machine to a Register Machine](../sources/issue/05-code-generation-for-a-stack-machine-on-a-register-machine.md) | 5,662 |
| [6. When to Compile: Caches, Load-Time Generation and Tiers](../sources/issue/06-when-to-compile.md) | 3,897 |
| [7. Safety by Construction: Running Native Code Without Trusting It](../sources/issue/07-safety-by-construction.md) | 4,699 |
| [8. Asynchrony as a Compiler Transformation](../sources/issue/08-asynchrony-as-a-compiler-transformation.md) | 3,911 |
| [9. Types That Pay for Themselves](../sources/issue/09-types-that-pay-for-themselves.md) | 4,372 |
| [10. Architecture and a Roadmap](../sources/issue/10-architecture-and-a-roadmap.md) | 3,719 |
| [Glossary](../sources/issue/11-glossary.md) | 1,656 |
| [References](../sources/issue/12-references.md) | 2,561 |
| [Answers to the Exercises](../sources/issue/13-answers-to-the-exercises.md) | 2,121 |
| [The Reader Study](../sources/issue/14-the-reader-study.md) | 2,514 |
| [Bibliography Verification Notes](../sources/issue/15-bibliography-verification-notes.md) | 17,478 |

Figures are in `sources/issue/_assets/`. The texts exactly as each round's student readers saw them are in `sources/issue-round1/` and `sources/issue-round2/`; `sources/issue/` holds the published text, which includes the corrections made after round 2.

## Evidence produced for the issue

| Path | Contents |
| --- | --- |
| `scripts/01-rv32-instruction-mix.mjs`, `various/01-*` | Classification of every RV32 instruction the typed compiler emits for Editor, Agenda and Files |
| `scripts/02-disassemble-example.mjs`, `various/02-*` | WebAssembly and disassembled RV32 for `countUnit` and `bump` |
| `scripts/03-register-cache-model.mjs`, `various/03-*` | Counting model of a backend with a compile-time operand stack; reproduces today's output for all 161 functions |
| `scripts/04-compile-phase-timing.*`, `various/04-*` | Phase timing of the typed compiler under QuickJS on the workstation |
| `scripts/make_figures.py` | Draws the five figures from the outputs above and from the quiz grades |
| `sources/bib-01` to `bib-03` | Verification notes for 107 bibliography entries, with DOIs and corrections |
| `scripts/build_references.py` | Builds `sources/issue/12-references.md` from the articles' reference sections and the verification notes |

## The reader study

| Path | Contents |
| --- | --- |
| `sources/students/round0/` | Three readers on a dense brief: pre-test, reactions, proposed teaching order, diaries, transcripts |
| `sources/students/round1/`, `sources/students/round2/` | Sixty sessions each: one directory per article, condition (`pre` or `post`) and reader, with `answers.md`, `feedback.md` (post only), `diary.md`, `session/*.jsonl` and `transcript.md` |
| `sources/students/roundN/audit.md` | Reasoning level, turns, tool calls and tokens per session, and any read outside the session's directory |
| `sources/students/roundN/grades/`, `grades-summary.md` | Every graded answer with a reason; summary tables |
| `sources/students/roundN/synthesis/` | Confirmed defects and merged feedback per article |
| `sources/quizzes/` | Answer keys for both rounds and the instructions given to the graders |
| `scripts/run_students.py`, `run_round.py`, `render_sessions.py`, `summarize_grades.py`, `publish_to_vault.py` | The programs that ran the sessions, rendered the transcripts, summarized the grades and published the issue |

## Results in brief

- Experiments: 50 to 55 percent of the emitted RV32 instructions are loads and stores of operand-stack slots; the counting model predicts native code 2.6 to 2.8 times smaller with a compile-time operand stack and 3.2 to 3.3 times smaller with locals in registers; the typed compiler's native path is 58 percent frontend and 41 percent lowering.
- Bibliography: 111 sources cited; of 107 entries checked, 4 corrected and 1 claim dropped as unconfirmed.
- Reader study: mean quiz score before reading 7.6 of 12 in round 1 and 6.0 in round 2; after reading 11.9 and 12.0. The graders confirmed 68 defects in round 1 and 42 in round 2, all corrected in the published text.

The chronological record, including what failed, is in `reference/01-investigation-diary.md`.
