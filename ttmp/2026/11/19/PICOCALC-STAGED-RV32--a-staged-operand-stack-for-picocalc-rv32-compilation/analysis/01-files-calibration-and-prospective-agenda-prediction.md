---
Title: Files calibration and prospective Agenda prediction
Ticket: PICOCALC-STAGED-RV32
Status: active
Topics:
    - picocalc
    - native
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:32:59.987482102-05:00
WhatFor: ""
WhenToUse: ""
---
# Files calibration and prospective Agenda prediction

The finalized staged compiler emitted **593 instructions** for Files. The earlier fusion compiler emitted 738 and the frozen production control 804. The old Stage 3 Model A predicted 593. Each of the seven individual functions also matches. The output images were identical between buffered and streamed compilation within each lane.

| Function | Control | Fusion | Short branches | Lazy operands | Leaf frames | Lazy returns | Model A | Residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `filesSpace` | 116 | 112 | 100 | 100 | 98 | 98 | 98 | 0 |
| `filesAlnum` | 51 | 45 | 40 | 40 | 38 | 38 | 38 | 0 |
| `filesName` | 261 | 238 | 217 | 194 | 194 | 192 | 192 | 0 |
| `filesCompare` | 107 | 98 | 89 | 80 | 78 | 78 | 78 | 0 |
| `filesSelect` | 48 | 45 | 42 | 38 | 36 | 36 | 36 | 0 |
| `filesPromptAction` | 46 | 40 | 35 | 31 | 29 | 29 | 29 | 0 |
| `filesAction` | 175 | 160 | 140 | 124 | 124 | 122 | 122 | 0 |
| Total | 804 | 738 | 663 | 607 | 597 | 593 | 593 | 0 |

The first two functions have little work between comparison and branch, so most of their savings come from removing the jump in the long pair and removing `ra` save/restore. `filesName` has 23 words removed by direct materialization and immediate forms, including loop increments and UTF-16 index scaling. It retains the frame's saved return address because it calls another function. `filesCompare` repeatedly increments the index for two string reads. `filesSelect` benefits from placing chosen values directly at expression joins. The action functions compare small constants and return several of them. `filesAction` also calls the prompt action helper. The last stage removes two words in each of the two calling functions. These changes are sequential ablations in this order, so each difference measures what that stage adds to the preceding stages.

## Forecast frozen before the first Agenda candidate compilation

The old Agenda count model emits a prediction from the frontend's operations and describes 34 functions. With Files-calibrated scale `593 / 593 = 1.0`, the central Agenda prediction is **2,789 words**, or **11,156 bytes**. The acceptance band is **2,649–2,929 words** inclusive, or **10,596–11,716 bytes**. This band rounds the lower and upper endpoints of ±5% outward. The uncalibrated model has the same center and band because the Files ratio is one. This is a prespecified tolerance, with no statistical coverage claim.

Run the [accounting script](../scripts/04-account.mjs) on Agenda after this document is committed. Record observed total and percentage error, per-function residuals, streamed and buffered equality, and behavioural results. Proceed to Editor only if the total is in the band and the modeled decisions preserve behavior. The model per function and the compiler identity are frozen with this forecast. The separate model invocation ran `--model-only`, which does not load an RV32 lowerer.

- [Files counts and image hashes](../various/files-account.json)
- [Agenda predictions by function](../various/agenda-model.json)
- [Control and candidate backend hashes](../various/compilers.json)
