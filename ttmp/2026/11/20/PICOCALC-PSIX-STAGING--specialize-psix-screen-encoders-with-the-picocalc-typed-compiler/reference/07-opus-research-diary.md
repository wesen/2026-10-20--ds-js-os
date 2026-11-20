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

## Step 2: Review the returned measurements

**Division of work.** The operator and the lab designed the implementations, built them, ran every test and measurement, and carried out the independent counterexample check. My contribution was to propose the comparison between a precomputed layout table and generated native code, and to write this interpretation. I did not run any code, access any files, or observe any measurement. Every number above comes from the operator's report.

**Entry: on the counterexample.** The operator's `zz`→`aa` result is the finding I weight most heavily. A valid header paired with a stale body passed admission and decoded `label = 524287`. My reading is that canonical-format guarantees only hold for complete re-encoding. Any patching design must treat the sorted string table as a dependency of the whole body.

**Entry: on the timings.** The operator measured 24.713 µs for the table interpreter and 78.245 µs for the generated function. I proposed this comparison expecting generated code to win at steady state. It did not, on this setup. I do not conclude that tables are inherently faster. The operator's own caveats about toolchains, code placement, and the missing per-instruction attribution prevent that conclusion. My working hypothesis is that the 16-bit-unit write path and the size of the generated code account for some of the roughly 21,496 guest instructions per call. That hypothesis is untested.

**Entry: on the decision.** The operator showed that the compiler's record table already contains the schema for flat scalar records. Together with the setup cost of about 604 ms, that supports making the descriptor the reference form and keeping generated native code as a research path. I agree with the lab's decision as stated, and I make no claim beyond it.

## Step 3. Operator’s curatorial audit

This entry was written by the project reviewer. Steps 1 and 2 preserve Opus’s own notes. Opus received an abstract design commission and, later, a factual results brief. It had no source or device access for either response. The director’s first diary entry preserves the original user request. [User request and context](01-director-investigation-and-reading-diary.md) · [Design commission](../scripts/01-opus-design-brief.txt) · [Results commission](../scripts/03-opus-results-brief.txt)

### What was checked

The review compared the proposed design’s A1–A14 with the unchanged PSIX encoder and admission routine, checked the stale-body control and its four affected IDs, read the first physical test harness at revision `d8f9810`, and recalculated medians directly from its receipt. The reviewer also checked the full cross-target case count against the host qualification and verified the separate derived-source experiment. A fresh probe confirmed that the reader accepts a dictionary entry unreferenced by the decoded value. Its complete 18-byte packet, in hexadecimal, is `50 53 49 58 01 00 12 00 01 00 00 00 00 11 00 12 00 78`. The canonical null packet is 15 bytes. [Codec](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js) · [Measured evidence](../various/physical.json)

### Findings, chronology and remaining questions

The published corrections explain the different ownership models, rank and width dependencies, early capacity checks and the scope of the single-evaluation claim. The reader accepts several valid inputs that are outside a particular specialization, and its validation contract differs from the writer’s canonical-output contract. The first-window native and QuickJS table values reproduced from the recorded block sums after dividing by the appropriate frame counts. Training medians belong to setup. The 47 recorded states are part of the 121 host vectors. In this first window tooling, placement and algorithms changed together. The comparative explanation remains open, and the director’s later controls are a distinct experiment. The reviewed article carries the operator’s findings after the original text.

For reproduction, run the previous binary ticket’s `scripts/02-binary-screen.js` through Node, then call `binaryScreen.admit(Uint8Array.from(...)).view()` on the listed bytes. For native timings take the median of `encodeUs / count` by arm in `various/physical.json`. For observed times divide each median `encodeUs` by frame count and by 1,000. Reassembling the authored article and Step 2 with a blank line, the original `## Research diary` marker and another blank line reproduced the import SHA-256. The [audit receipt](../various/opus-results.json) preserves both that digest and separate article/diary digests.

### Verified source links for the original article

The two original Opus documents cite works as text and contain zero external hyperlinks. The reviewer supplied the following destinations for the results article and checked their titles and authors or standards bodies. The earlier design remains a proposal. Its bibliography includes additional print citations. The primary sources on benchmarking explain experimental controls and give no estimate of a PicoCalc-specific effect.

- **Specialization and staging.** Futamura identifies the 1999 publication as a revised version of his 1971 paper. Rice’s bibliography identifies the PEPM 1997 item separately from Taha and Sheard’s expanded journal work. [Futamura, revised paper](https://fi.ftmr.info/PE-Museum/PE-Revised1999.pdf) · [Jones, Gomard and Sestoft](https://raspi.itu.dk/people/sestoft/pebook/pebook.html) · [Taha and Sheard, PEPM listing](https://www.cs.rice.edu/CS/PLT/Publications/MultiStage/)
- **Binding, dispatch and interpreters.** [Kohlbecker and colleagues](https://scholarworks.iu.edu/dspace/items/7ed37558-9472-4143-9076-10e2f7136252) · [Deutsch and Schiffman](https://web.stanford.edu/class/cs343/resources/smalltalk-80.pdf) · [Hölzle, Chambers and Ungar](https://bibliography.selflanguage.org/_static/pics.pdf) · [Ertl and Gregg](https://jilp.org/vol5/v5paper12.pdf)
- **Measurement.** [Mytkowicz and colleagues](https://john.cs.olemiss.edu/~hcc/researchMethods/notes/localcopy/mytkowicz-wrong-data.pdf) · [Georges, Buytaert and Eeckhout](https://biblio.ugent.be/publication/417084) · [Kalibera and Jones](https://kar.kent.ac.uk/33611/45/p63-kaliber.pdf)
- **Formats and instruction sets.** RFC 3629 defines UTF-8. The CBOR and JSON publications give examples of deterministic formats, each with its own ordering rules. The frozen WebAssembly version and the ratified RV32I chapter supply target context. [UTF-8](https://www.rfc-editor.org/info/rfc3629/) · [CBOR §4.2](https://www.rfc-editor.org/rfc/rfc8949.html#section-4.2) · [JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html) · [W3C WebAssembly Core 1.0](https://www.w3.org/TR/2019/REC-wasm-core-1-20191205/) · [RISC-V RV32I](https://docs.riscv.org/reference/isa/v20260120/unpriv/rv32.html)

One publisher endpoint returned HTTP 403 for the Taha and Sheard paper. The accessible Rice research group bibliography identifies the conference version. The journal's first-page PDF and the authors' publication sites provided working alternatives where references redirected.
