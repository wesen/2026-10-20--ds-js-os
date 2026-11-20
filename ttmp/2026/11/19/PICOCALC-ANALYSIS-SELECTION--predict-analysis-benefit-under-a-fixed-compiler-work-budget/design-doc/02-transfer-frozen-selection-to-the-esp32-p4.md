---
Title: Transfer the frozen function selector to the ESP32-P4
Ticket: PICOCALC-ANALYSIS-SELECTION
Status: complete
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: ""
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Preregister the physical time and allocation comparison for the frozen selector.
LastUpdated: 2026-11-19T23:11:08.175336186-05:00
WhatFor: ""
WhenToUse: ""
---

# Transfer the frozen function selector to the ESP32-P4

The held-out study measured planning on Node and ran generated RV32 in an emulator. This follow-up measures the same algorithms inside QuickJS on the ESP32-P4. It uses previously evaluated inputs and does not change the held-out comparison or its report.

## The three arms and their expected output

Freeze the host policy lock `70c85541957a32e0f0764ab5e40f88608c62b5711827fa92332da269457eb7e1`. Stage source-order, literal-only, and estimated words per analysis cell. Reuse the exact selector source and analysis stager from the locked study. Move the host planner's callback into the native compiler’s existing call so it has the same imported function declarations and input length limit. Strip the module export syntax for the bundled QuickJS environment. The source-order arm does not load unused ranking helper code. All arms keep the same proof rules, production heap limits, timed compilation boundary and native backend.

The primary input is the unchanged Editor source `f37f60f3b0c646cd35f13c41bc893a136732ebe769e328cfb906b0fe7531a6ed` and reactor `16660a8ab3fb07d5e5d388c21d81868b3f71e325d3a9737dcefc095f7554feff`. All three lanes should spend 4,278 proof visits and omit 83 words. Their full linked ELF must hash to `06a85ff63c94a9d193a9136f92a2250e6725c5f9df830e9c00aa643d96503944`. The two ranked lanes should visit 2,139 feature cells and use 15 and 14 ranking comparisons respectively. The usual Files and Agenda compilations serve as checked secondary runs.

If the prepared physical slot supports an extra input, include the exact original order of `distributed-501`. It binds the primary budget and has known source hash `8bb87e4ce2541d8505d59931b6232b3612463285984896ed92c3a5901dfa7377`. The raw RV32 generation path bypasses the app ELF linker for this input and reports a raw image hash. Equal-proof expected word savings are 7,749, 7,407 and 10,107 for source order, literal only and words per cell, respectively. The expected raw images and charges are already recorded by the held-out compile checker. Both planners visit 24,692 feature cells. The raw synthetic compilation runs under the Editor limits of 4 MiB and six seconds. If the serial schedule or firmware capacity prevents an extra input, the Editor result is independently interpretable.

## Matched measurement and predictions

Use the previous physical runner’s three-arm rotations and reverse rotations. Two boots supply 12 comparisons per input and arm. The supervisor owns the single serial connection and verifies the original partition and restored app status. Each sample starts with input reads and a newly created QuickJS runtime. Phase calls record setup, dispatch, feature parsing, ordering and the remainder of native generation through teardown. Only ranked arms have the feature and ordering phases. The maximum reported allocator bytes remain the same usable-byte counter as production. Each phase additionally records its starting allocation, peak live allocation and successful allocation or resize count. Phase high-water figures can include data allocated earlier.

Before staging, the predictions for the Editor comparison are:

- Each ranked arm increases median paired full compile time by at least 400 ms compared with source order. The source-order median is expected between 2.45 and 2.65 s. Ranked arm medians are expected between 3.35 and 4.25 s.
- Feature parsing accounts for at least 70% of each ranked arm's added median time. Median ordering time stays below 20 ms.
- The ranked arm’s median setup difference is below 10% of its added full compile time. The median peak increase stays below 256 KiB and every sample remains below the existing 4 MiB limit.

For the binding synthetic input, the prediction is a positive median paired time increase for each ranker and verified output changes at the registered hashes. Because the density arm emits fewer native guards, its backend work may partly offset planner time. Analyze that input separately from Editor.

Treat these thresholds as forecasts. Preserve negative outcomes and complete physical receipts. The primary estimate uses within-block time and heap differences with separate boot summaries. Count allocation operations by phase separately from peak, and print the exact full linked or raw result hash after every compile.
