---
Title: Independent device measurement review diary
Ticket: PICOCALC-LEXICAL-INDEX
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:57:18.97667481-05:00
WhatFor: ""
WhenToUse: ""
---

# Independent device measurement review diary

**Prompt context.** I received physical ESP32-P4 measurements for four compilation arms (manual control, async control, index, index-reuse), a correctness-testing summary, and a scientific review letter requesting specific corrections to a prior draft. I did not touch the board or run any measurements. All numbers below are from the provided data.

**Interpretation of the task.** The task is a staged experiment report for an intern audience. The editor's review letter corrected several errors from a prior draft. My job was to incorporate those corrections precisely.

**What I did and why.**

1. I restructured the article to separate measured facts from hypotheses throughout. The review letter emphasized this distinction.

2. I added a concrete example for symbol identifiers: two distinct lexical scopes both using the spelling `i` receive the same symbol ID because the spelling matches, but binding identity is determined separately. I explained why a stored token cannot share the parser's mutable current-token object: the parser overwrites that object on each advance, so any retained reference would observe corrupted fields.

3. I corrected the description of token reuse. The prior draft conflated token reuse with spelling interning. Token reuse borrows one mutable current-token object per eligible cursor at two non-retaining parser sites, reusing storage across successive occurrences regardless of spelling. This is distinct from the spelling table's interning of symbol identifiers.

4. I corrected the memory arithmetic. 428,588 bytes = 418.54 KiB and 429,484 bytes = 419.42 KiB (dividing by 1024, not 1000). The manual-to-async peak difference is 763,132 bytes = 745.25 KiB. The reuse arm leaves 4,194,304 − 2,686,260 = 1,508,044 bytes ≈ 1.44 MiB of headroom.

5. I corrected the output description. The device produces a native linked RV32 Editor executable, not Wasm. The measured output size (240,452 bytes) includes a fixed reserved code slot. Equal sizes are expected and do not establish identical contents. Host byte-equality verification covered nine app/target-mode combinations across Files, Agenda, and Editor for the staged async compiler arms, with negative-input comparisons reported separately. I avoided any universal claim about all programs.

6. I corrected the correctness-testing section. The prior draft may have implied that the 12 declines out of 2,519 sources constituted a decline rate. These are deliberately constructed test inputs. I listed the counts with their distinct units (observations, traces, compiler inputs, sample sources, token records, deliberate unsupported inputs, deliberate allocation failures) and stated explicitly that they do not estimate prevalence.

7. I described the 84,444 µs gap correctly as the distance between the index-reuse median (2,994,557 µs) and the gate (2,910,113 µs), not as a separately observable compiler pass.

8. I noted that the manual control uses a different compiler and source and therefore sets the qualification threshold but is not a direct comparator for indexing overhead.

**Failed draft findings I corrected.** The key errors in the prior draft (as identified by the review letter) were: (a) describing the output as Wasm rather than native RV32; (b) claiming byte equality proves identical contents rather than noting it is expected and was separately verified on the host; (c) computing KiB incorrectly (using 1000 instead of 1024); (d) presenting decline counts against a denominator as if they estimated real-world prevalence; (e) conflating token reuse with spelling interning; (f) describing the 84,444 µs as a compiler pass; (g) omitting why a stored token cannot share the parser's mutable current-token object.

**What worked.** Structuring the article around the measurement table and then interpreting each dimension (time, memory, correctness) separately kept claims close to their evidence. The intern-oriented example (two scopes, same spelling `i`, same symbol ID, different bindings) concretely grounds the abstraction.

**Tricky parts.** The distinction between "peak allocation during compilation" and "retained heap after compilation" required careful wording. The review letter correctly noted that peak figures cannot establish post-compilation retained state. Similarly, distinguishing the constructed correctness suite from any real-world sampling claim required deliberate phrasing to avoid implying generalization.

**Independent review.** A reviewer should verify: (a) all microsecond and byte figures match the provided JSON exactly; (b) percentage changes match the provided `change_from_async_percent` fields; (c) KiB conversions divide by 1024; (d) no claim implies production deployment; (e) the correctness counts use their correct units and no decline rate is implied; (f) the 84,444 µs is described only as a distance from the gate; (g) no claim is made about Wasm targets or universal program equivalence.

**Review instructions.** Check each numeric claim against the source JSON. Confirm that every hypothesis is labeled as such and every measurement is labeled as measured. Verify that the token-reuse description matches the review letter's specification (one mutable object, two non-retaining sites, spelling-independent). Confirm the article does not imply I operated the hardware.

**Next steps.** The index-reuse arm is 84,444 µs from the gate. Closing this gap may require profiling the JavaScript-side compilation pipeline to identify whether the remaining overhead is in parsing, semantic analysis, or code generation. The approximately 419 KiB memory penalty also warrants investigation, particularly whether the native index's temporary state can be released earlier in the pipeline. These are predictions about where effort might yield returns, not measurements.
