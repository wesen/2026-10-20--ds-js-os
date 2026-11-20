---
Title: "Opus High design and results diary"
Ticket: PICOCALC-PSIX-STAGING
Status: complete
Topics: [picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20
WhatFor: ""
WhenToUse: ""
---

# Opus High design and results diary

## Step 1: Design before seeing measurements

The following is the investigator’s original notebook accompanying the source-blind design. The director supplied an abstract description and performed the hardware work.



**2026-11-20, design session. No code was run. No files were read. No measurements exist.**

**Inferred from the problem statement:**

- I1. With string values in the dictionary, key-slot payloads are "static rank + dynamic shift." Key order, entry order, entry counts, and fixed-record directory ordinals stay static.
- I2. Key presence depends on optional fields and on whether arrays are empty. Prefix-popcount ranks avoid 2ⁿ code.
- I3. Acyclic record type graphs make cycle checks removable.
- I4. Deduplication must be on encoded UTF-8 bytes. The expansion-time sort must use UTF-8 byte order, not UTF-16 order (U+E000 versus U+10000).
- I5. The serializer has no effects before it returns, so fallback is a restart, not state reconstruction.
- I6. Without on-device code generation, runtime-new shapes can only be served by plans or by G.
- I7. The plan interpreter, sharing `sercore` with the compiled code, isolates the contribution of compilation from that of precomputation.

**Evidence needed before the experiment:**

- E1. **A2:** does the dictionary include string values? This has the largest effect on the possible gain.
- E2. **A1:** are offsets section-relative or absolute?
- E3. **A3–A6:** exact slot fields, tag set, and how keys are stored in directories.
- E4. **A8:** number-area order and deduplication.
- E5. **A9:** −0, NaN, ±Infinity behavior. **A10:** lone-surrogate behavior.
- E6. **A11:** sharing and cycle semantics, and G's error for cycles.
- E7. G's current error precedence, and whether it checks bounds per write.
- E8. Whether the dialect runtime has shape identifiers, and whether shapes encode field representation. **A13:** do accessors exist?
- E9. Whether the compiler runs on the handheld (affects Phase 1 placement).
- E10. Which Wasm engine is used on the device, and whether it supports bulk memory and instruction counters. Whether the RV32 core has Zicntr and native misaligned access. Whether read-only data lives in flash.
- E11. Recorded application traffic: shape distribution, string contents, churn. Needed for P6, P7, P11.
- E12. Preregistered θ, failure thresholds, `R`, `M`, written here before the first timed run.

**Status:** design only. Predictions are untested.
