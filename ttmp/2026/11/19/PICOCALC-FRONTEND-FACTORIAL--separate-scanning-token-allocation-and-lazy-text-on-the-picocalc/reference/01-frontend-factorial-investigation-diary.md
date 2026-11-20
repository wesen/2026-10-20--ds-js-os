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

## Step 2. Stage the four cells and the source-span parser

I generated the four treatments from the exact compiler archived at `40bcf85`. Reuse is handled in both the cursor's normal success path and the regex fallback. I staged the fifth parser with same-image baseline and eager-cursor controls. The host checks established identical trace results and full application outputs before the serial owner started the board run.

### Prompt context

See Step 1. The supervisor sent the independent Opus 5.5 High review before the physical measurements. [Review receipt](../various/opus-design-review.json).

### What I did

- Added `01-stage.py` with exact replacement checks and verification of the reused lab scripts against `dbe26be`.
- Added `02-lazy-parser.js.inc` and rewrote the actual parser's eager probes. The lazy parser reads offsets in keyword and punctuation matching and returns canonical operator keys for precedence lookup.
- Added `03-differential.mjs` for token lifetimes, parser demand, instruction bytes, metadata and diagnostics. Added `04-verify-images.mjs` for full linked byte identity and firmware preflight.
- Staged two IDF images with the verified build flags. The first contains four factorial lanes. The second holds the original regex/fresh and eager cursor/reuse controls beside the lazy variant.
- Added the matched contrast and figure scripts before examining physical results.

### Why

The only numeric output path change is the frontend feeding the frozen backend. Fresh and reused treatments use the original eager payload and field order. Both lazy controls are staged from exactly the same bytes as their first-image counterparts.

### What worked

All five variants passed 69,643 token cases and 318 compiler cases in Node 24.18.0 and vendored QuickJS. Each compiler case was exercised through Wasm, buffered RV32 and streamed RV32. There were 136 matching error cases per route. The lazy probe observed nine text requests from a complete parse of a function with a typed parameter, a local binding and integer addition. A text request was recorded for each semantic spelling used by that example. Keyword, punctuation and operator recognition never called the text method. [Differential receipt](../various/frontend-differential.json).

Both IDF 5.4.2 images built. The complete linked RV32s were byte-identical across treatments and buffering modes. The linked Wasm outputs were byte-identical across treatments and passed module validation. The preflight matched each firmware’s embedded compiler bytes and ESP32 partition table to the factory backup. [Image and full output identities](../various/verified-images.json).

### What did not work

The initial scoped `git add` returned `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. The approved Git write produced the design commit `b6a29e1` before implementation.

The first `python3 -B scripts/01-stage.py /tmp/p4-frontend-factorial` stopped at `ValueError: expected one staging anchor '        this.offset = 0;\n'`. The offset initializer also occurred in another class. Including the adjacent Lexer source assignment disambiguated the substitution. The verified images use the corrected script.

The default sandbox prevented `node scripts/03-differential.mjs /tmp/p4-frontend-factorial /tmp/p4-frontend.20261119/front-quickjs` from spawning the local executable with `spawnSync /tmp/p4-frontend.20261119/front-quickjs EPERM`. The approved replay succeeded using the same command and corpus.

A shell glob for the lab directory briefly matched both the original and new supervisor tickets. That invocation returned `MODULE_NOT_FOUND` before reading the generated files. Anchoring the old ticket's `--` suffix produced both verified host oracles.

### What I learned

Record reuse changes JavaScript object identity on failed cursor matches too. The differential explicitly checks fresh or reused identity from one successful token to the next, on repeated EOF, and on error after an earlier token. For the lazy path the checker sees only kind and offsets until it requests a slice.

The independent review suggested broader JavaScript grammar features. The shipped typed grammar has a single lookahead and no templates, ASI, BigInt or division-versus-regex-literal context. The corpus tests matching and rejection under the shipped grammar. The review's point about phase-dependent setup is directly relevant. Both cursor variants still load the fallback regex and additional helpers. The timed interval includes that startup cost. The earlier phase trace measured aggregate setup and scanning separately. This run preserves the clean outer timer and attributes changes to the treatments.

### What was tricky to build

The same scanner must record either an eager value or an end offset. The easiest source of semantic drift is operator lookup after parsing a single operand. Returning the canonical key from a validated operator span avoids materializing text in the common no-operator case too. Arithmetic conversion and JSON literal decoding retain their existing behavior by using the lazy string when needed.

### What warrants a second pair of eyes

Audit the cursor fallback's position and token writes, and the three local replacements for declaration and return probes. The equivalence cases include both accepted and rejected source. App equality adds large valid inputs but cannot by itself qualify diagnostics.

### What should be done in the future

Check two complete captures per image, verify restoration and produce within-block contrasts. Evaluate the largest measured heap peak against each configured compile limit.

### Code review instructions

From the repository root assign the new ticket directory to `ticket`, the previous frontend ticket directory to `previous`, and the original compiler lab directory to `lab`. Use a fresh `work` scratch directory. The board run is coordinated through the supervisor's serial owner.

```sh
python3 -B "$ticket/scripts/01-stage.py" "$work"
bash "$previous/scripts/05-build.sh" "$work/factorial" /home/manuel/esp/esp-idf-5.4.2/export.sh
bash "$previous/scripts/05-build.sh" "$work/lazy" /home/manuel/esp/esp-idf-5.4.2/export.sh
node "$lab/scripts/03-oracle.mjs" "$work/factorial"
node "$lab/scripts/03-oracle.mjs" "$work/lazy"
node "$ticket/scripts/03-differential.mjs" "$work" "$quickjs_runner"
node "$ticket/scripts/04-verify-images.mjs" "$work" picocalc-os/build "$backup"
```

The QuickJS runner is built as in the previous frontend study’s `scripts/09-host.py` from that ticket’s `08-quickjs.c` and the vendored engine. The Wasm validation takes the parent directory of the three built reactor modules.

### Technical details

The factorial firmware SHA-256 is `b81057334aff0d6790b7759bff634670cd737fb83a8c7970223343beff0bfed4`. The lazy image is `af350950dab0eb7880dbf4c0abaca8302911d34fec6954953f20083cf2d6017d`. Both use the same embedded RV32 backend SHA-256 `64d5c1550442c161887d29982605cddac7e13237eb3259a5ccd1f3ca03834f38`. The independent review predates the UART measurements. Its suggestions about matched layouts, setup costs and diagnostics are addressed in the report's method.

The checkout check flagged a blank line at the end of the injected lazy include. Moving that line to the stager left the generated sources byte-identical when restaged in a fresh scratch directory. This formatting correction did not require new firmware.

For the app demand probe I ran `node "$ticket/scripts/07-count-text.mjs" "$work"`. The first run stopped on `AssertionError [ERR_ASSERTION]: 3 !== 2` in the instrumentation's substitution because another class also assigns the same offset. Anchoring the end of the cursor method to the following `legacyNext()` definition fixed the probe. It records 700 eager versus 255 lazy source slices for Files, 4,158 versus 1,584 for Agenda, and 16,792 versus 6,496 for Editor. Both copies produced the verified native ELFs. Those host counts measure source-slice operations and do not serve as a board allocation counter. [App token demands](../various/app-text-demands.json).
