---
Title: Indexed binary screens researcher diary
Ticket: PICOCALC-RENDER-BINARY
Status: active
Topics:
    - picocalc
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

# Indexed binary screens researcher diary

## Step 1: Register the blind protocol

Opus High designed a protocol without access to the source or measured traces. The public laboratory notebook registers the proposed arms, hypotheses P1–P3, and the evidence needed to assess them. The implementation exercised a revised format, so the notebook continues to document the conditions attached to the original hypotheses. [Blind design and notebook](../various/01-opus-blind-design.md).

## Step 2: Interpret the host results

My work in this step was to turn the host evidence into the host chapters of the publication article. Three people's work feeds those chapters. The JS experiment operator ran the QuickJS trials and the fuzzer. The independent native reader engineer from the Snake group built the C receiver control. The native sender engineer from the System group built the C encoder control.

The operator and native comparison engineers supplied the host runs. I interpreted their aggregate evidence and checked the derived quantities. The physical chapters will be commissioned separately, so the draft stops at the question the host evidence leaves for the board.

## Prompt Context

The request asked for host chapters written for a capable intern. The chapters had to open with a user-visible frame, follow one concrete access through the PSIX byte layout and compare what the three controls do with that access. The style rules called for plain prose and one compact table, with no analogies, slogans, semicolons in prose or explanatory colons. The article also had to credit all three contributors, avoid presenting the UITB predictions as if they had been tested, show that transport armor outweighs the raw savings, and stop short of a recommendation.

## What I did

I began with the worked example because it fixes the byte layout that every later section relies on. I checked that the offsets 39, 46, 48, 51, 54, 61, 63 and 65 and the 73-byte total are consistent with u16 counts, 5-byte object pairs and 3-byte array slots. Next I described P, G and B in terms of the kids[1].h access. Then I separated PSIX v1 from the blind UITB proposal. After that I placed the wire and timing figures in one table and wrote separate sections for the QuickJS, native reader and native sender evidence. The draft ends with the board question.

## Why

Following one access from root reference to inline integer shows the intern what the index actually is before any timing appears. Putting the proposal next to PSIX v1 stops the reader from treating the proposal's predictions as confirmed or refuted. A single combined table keeps the numbers compact, and the prose carries the qualifications attached to each measurement.

## What worked

The arithmetic is internally consistent. The 87,449,600 compared bytes equal 427 frames of 320×320×2 bytes. Base64 expands raw PSIX by a factor of 1.33 to 1.34 in all four workloads. The B allocation peaks in the native sender control are exactly twice the representative wire sizes, and the native reader's B peaks equal the wire sizes.

## What didn't work

Listing every measurement in prose pushed the article past the word limit, so most timings moved into the table. The memory figures from the three trials do not share a baseline, so I could not present one memory comparison across them. They are reported separately.

## What I learned

The host evidence splits by language and integration. Native C PSIX admission and walking was 3.1 to 3.9 times faster than cJSON with roughly one allocation. QuickJS B was faster than G at admission but 2.5 to 3.0 times slower than G for the full frame. The raw wire saving disappears under base64 in every workload.

## What was tricky to build

The hardest part was writing the preorder rule's consequences without overreaching. I stated that validation is a single forward pass and that no two references can share a body, and I tied this only to the stated absence of shared subtrees. The host verification receipt attributes the independent pixel comparison to the operator.

## What warrants a second pair of eyes

Several points in the draft are my own derivations rather than direct readings of the evidence.

- The 42-byte JSON length of the worked example is my own count.
- The claim that the tag distinguishes inline values from body offsets is inferred from the phrases "inline integer" and "noninline child".
- The statement that 87,449,600 bytes equals 427 full frames is derived arithmetic.
- The reading of the B peak as sender packet plus receiver copy is an inference from the doubling and the single receiver allocation.
- Crediting the fuzzer to the JS experiment operator rests on it being described as the JS fuzzer.

## What should be done in the future

The physical component receipts will measure the individual QuickJS and native routes. An end-to-end trial with raster, channel and SPI is a separate future test. Widget-level limits, a real ownership ledger and typed transport remain open. Any later comparison with UITB's predictions needs a dictionary arm and a memory baseline that match the prediction's definitions.

## Code review instructions

Start with `scripts/native` and `reference/03-native-measurement-diary.md` for the reader control. Confirm the inclusive admit, walk and release window and the 12×64 alternating blocks there, then check the allocation figures against `various/native-host.json`. For the sender control, use `scripts/producer`, `scripts/producer/results` and `reference/04-native-producer-diary.md`. Confirm that the four specimens are byte-identical to the JS packets and that the scratch buffers are released before admission. Finally, check the 73-byte worked example against the encoder's output.

## Technical details

**Wire ratios against JSON.**

| App | Raw PSIX | PSIX base64 + envelope |
|---|---|---|
| System | −8.7% | +25.8% |
| Chess | −21.2% | +6.8% |
| Snake | −1.9% | +39.3% |
| Editor | −20.3% | +9.7% |

**QuickJS full-frame ratios.** B takes 4.32 to 5.17 times as long as P and 2.52 to 3.05 times as long as G.

**Native reader.** G takes 3.05 to 3.88 times as long as B.

**Native sender matched path.** G takes 1.84 to 3.39 times as long as B. Sender-only, B is slower only for System, at 18.94 against 12.59 microseconds.

**Representative frames.** The Snake representative is 8 bytes larger in PSIX than in JSON.

## Step 3: Interpret the physical receipts

The experiment operator, two native engineers and the director supplied the device receipts. My job was to read those results, interpret them within their stated boundaries, check them against my earlier predictions, and write the physical-results and closing chapters.

The entry follows the order in which I worked. I started from the design and receipt counts. Then I moved through the QuickJS, native reader and native sender families, then the director's disposition, and finished with the prediction review.

## Prompt Context

I was asked to continue the article "What an index on the wire buys a PicoCalc renderer" from the point where the host chapter ends. I was to cover the four frozen specimens on the actual P4, credit each contributor by role, propose a usable Chess integration gate, and avoid claims the receipts do not support. The measurements were supplied as summarized medians and boundary statements. I had no raw per-block files in front of me.

## What I did

1. **Design and counts.** I read the design first. It has seven interleaved blocks per family, one JavaScript run or eight native cycles per block, and two board images. The receipts total 84, 56 and 56, with zero failures and the same witnesses throughout.
2. **QuickJS family.** I put the stage medians next to the route medians. I computed the G minus P admit gaps as a way to price the interpreted cap walk.
3. **Native reader family.** I compared admit, walk and release against walk-only and lookup-only timings to locate where the saving comes from.
4. **Native sender family.** I separated encoder cost from route cost, and I kept the paired ratios distinct from ratios of medians.
5. **Disposition and gate.** I turned the director's disposition into a numbered gate.
6. **Prediction review.** I reviewed my original predictions against what was and was not tested.

## Why

The host chapter already argued the design. The board chapter has to say which parts of that argument survive real hardware and which parts remain unmeasured. A reader acting on the gate needs to know exactly what each clock contained.

## What worked

**Stage medians point to where the cost sits.** In QuickJS, B admits faster than G on all four screens and loses the route through encode and Proxy paint. In native C, walk and query times are nearly equal between arms, so the order-of-magnitude reader saving sits in materialization and ownership.

**The matched sender result is internally consistent.** B's encoder is slower everywhere, yet the paired route ratios are 0.287, 0.120, 0.200 and 0.121.

## What didn't work

**Route totals cannot be decomposed.** Route totals are medians of per-block means, so I could not add stages to rebuild a route. The supplied extract omitted P first-paint figures. The full receipts provide them for separate analysis.

**The 15% prediction is untestable.** I had predicted a tag-check share of about 15%. No disaggregated tag-check timing exists, so I left that prediction untested.

## What I learned

**Prediction review.** My original design was UITB, which differs materially from PSIX. It used eight-byte slots, a resident dictionary arm, typed vectors and optional subtree dedup. Its byte-inflation and dictionary-ablation claims were never tested on that encoding, and I should not count them as confirmed or refuted.

**Results on PSIX.**

- PSIX beat raw JSON on aggregate byte count in every trace.
- Base64 wrapping lost.
- Host QuickJS live memory across two generations did not improve in every workload.
- Native owned bytes were much smaller than cJSON objects on host, with denominators and allocator boundaries stated.

**The paint-heavy claim.** My qualitative claim was that admission alone would not fix a paint-heavy route. The results are consistent with that claim. JSON paint is large relative to the Chess and Snake P routes, and B full paint is not competitive.

**Speed on the board.** Native built-in parsing can beat a bounded reader written in an interpreter.

## What was tricky to build

**Wording the gate.** Each gate item needed a clear pass condition, but I had no data to set numeric margins. I chose to require that thresholds be fixed before the run rather than invent numbers.

**Keeping paint terms apart.** I had to keep "whole paint into a checksum sink" separate from presented pixels everywhere it appears.

## What warrants a second pair of eyes

1. **Rounding.** I rounded native reader medians to three decimals. Check them against the receipts, especially 4.9295 to 4.930 and 0.36225 to 0.362.
2. **Admit comparison.** My statement that B admits faster than G should be checked against the per-block data, not only the medians.
3. **Gate fidelity.** The gate should be read by the director to confirm it matches their disposition.
4. **Unit of the transport figures.** The meaning of the counts 100, 236 and 47 in the transport experiments should be stated by the groups that ran them.

## What should be done in the future

1. **Run the Chess gate.** Use pre-registered margins and measure presented RGB565 on the board.
2. **Measure tag checks separately.** Add disaggregated tag-check timing if the 15% prediction is still of interest.
3. **Measure board memory and flash.** Take board-side measurements of pinned-copy memory and flash increment.
4. **Collect tail and boot data.** Gather p95 and repeated independent boots before any production claim.

## Code review instructions

1. **Native reader.** Check Table 2's reader columns against `scripts/native` and `reference/04-native-reader-evidence.md`.
2. **Native sender.** Check the sender columns and ratios against `scripts/producer/02-physical-appendix.md` and `various/device-native-route.json`.
3. **Route statistic.** Confirm that the route medians are computed as medians of per-block means.
4. **Ratio statistic.** Confirm that the paired ratio is a median of per-block ratios.
5. **Boundary statements.** Confirm that no table cell implies display transfer, event bus or production memory.

## Technical details

**QuickJS route, P/G/B (ms)**

| Specimen | P | G | B |
|---|---|---|---|
| System | 35.969 | 53.934 | 168.723 |
| Chess | 26.687 | 51.114 | 134.457 |
| Snake | 9.934 | 17.576 | 48.328 |
| Editor | 32.855 | 55.317 | 133.166 |

**G minus P admit gap (ms)**

| Specimen | Gap |
|---|---|
| System | 17.953 |
| Chess | 24.697 |
| Snake | 7.995 |
| Editor | 22.550 |

**Native reader admit, walk and release, G/B (ms)**

| Specimen | G | B |
|---|---|---|
| System | 4.930 | 0.495 |
| Chess | 13.203 | 1.815 |
| Snake | 2.481 | 0.362 |
| Editor | 11.428 | 1.445 |

**Native sender route, G/B (ms), with paired ratio**

| Specimen | G | B | Ratio |
|---|---|---|---|
| System | 5.175 | 1.484 | 0.287 |
| Chess | 16.915 | 2.027 | 0.120 |
| Snake | 2.619 | 0.525 | 0.200 |
| Editor | 14.021 | 1.703 | 0.121 |

**Native encoder, G/B (ms)**

| Specimen | G | B |
|---|---|---|
| System | 0.525 | 1.328 |
| Chess | 1.816 | 1.850 |
| Snake | 0.359 | 0.445 |
| Editor | 1.438 | 1.522 |

The native publications total 448. Body-only size changes in the raw transport experiments were -2.73% for System, +5.40% for Snake and +18.10% for Chess.
