---
Title: Frontend factorial investigation diary
Ticket: PICOCALC-FRONTEND-FACTORIAL
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T21:53:37.958641729-05:00
WhatFor: ""
WhenToUse: ""
---

# Frontend factorial investigation diary

## Step 1. Specify the intervention before implementing it

I mapped the frozen frontend and the prior cursor variant onto the two requested experimental axes. The existing cursor path reused the token object on its own success path, but its regular-expression fallback retained the original fresh-record behaviour. The new comparison defines lifetime for every emission, including fallback and EOF.

### Prompt context

The user-authored study specification in the supplied eight-study brief reads:

> Find a faster frontend that fits the existing heap. Cross two choices on the P4: regex versus cursor scanning, and fresh versus reused token records. That gives four builds and identifies which change saves time and which raises the peak. Then test whether the parser can read token kind and source offsets directly, materializing text only when needed. Require identical diagnostics and app output.

The supervising assignment additionally requests an intern design committed before implementation, an investigation diary, reproducible ticket-local scripts, independent research advice, physical board measurements coordinated by the supervisor, and a committed and pushed newcomer article and figures. The intended endpoint is an attributable comparison under the real app compile budgets, with heap/time tradeoffs permitted within those budgets.

### What I did

- Inspected `Lexer`, its consumers in `FunctionEmitter`, and the existing cursor stager.
- Verified that the lab control and frozen compiler have identical checked-in compiler sources.
- Located the prior generic balanced runner and the current Files, Agenda and Editor compile limits.
- Created the ticket and wrote the [pre-implementation design](../design-doc/01-measuring-scanning-and-token-lifetime-independently-on-the-picocalc.md).

### Why

The first physical study compared regex/fresh with cursor/reused. A two-by-two experiment can recover the effects at both levels of the other factor. A fifth arm with a shared eager cursor reference can quantify the cost of offset-only parser access.

### What worked

The previous lab stages at most four compiler pairs per physical image and already validates complete full-ELF hashes against the host. Two images with shared controls support both questions using that runner.

### What did not work

No experiment or build was run at this design checkpoint.

### What I learned

The sticky regex can interpret terminal comment punctuation by backtracking. A cursor fallback must retry at the prior offset, and the mode-specific token writer must cover both its success and rejection paths.

### What was tricky to build

The parser reads token values in both demand sites, such as identifier bindings, and probes, such as checking whether a statement ends. Span comparison will avoid extracting text at probes. The EOF/error column must still follow the frozen scanner, including the offset before skipped trivia.

### What warrants a second pair of eyes

Verify that the record-identity checks include fallback, that the lazy parser actually avoids punctuation and keyword slices, and that all aggregate timings can be traced to matched blocks.

### What should be done in the future

Implement and validate the five staged compiler pairs, then run the two board images.

### Code review instructions

Read the design alongside `picocalc-os/compiler/typed-wasm.js`, `typed_p4.c`, and the previous compiler lab’s `scripts/01-stage.py` and `scripts/04-board.py`.

### Technical details

The lab control is `dbe26be` and the frozen compiler revision is `40bcf850a5809ef6d839127869faa952596ed157`. The two physical images will share identical baseline and cursor-reuse source files. The design records timer and heap boundaries and the directional convention for both measurements.
