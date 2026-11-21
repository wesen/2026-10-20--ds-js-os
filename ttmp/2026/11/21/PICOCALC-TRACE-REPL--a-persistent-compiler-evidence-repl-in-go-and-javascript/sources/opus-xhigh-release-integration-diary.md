# Diary: release integration, 2026-11-21

- Grepped for markers and found three blocks. Two are in `describe()` (2-combined vs treatment
  candidate) and one is in the help alias tables. That last one was carried from the 1-combined vs
  usability-fix merge, already unresolved in `2-combined.js`. From the marker paths, the merge order
  was language+coverage → +materialization → +treatment.
- `describe()`: the union was straightforward. The one real choice was `_eagerArm` over
  `findArm(this.name)`, because the treatment side would turn a param arm into a confusing
  unknownArm. Kept every treatment field inside `markMaterialized(...)`.
- Aliases: took both sides. They touch different maps (TOPIC_ALIASES vs KIND_TOPICS).
- Saved the checkpoint, then audited the semantic overlaps the markers can't show.
  - `assignLoopScopes` gave bare loops `function: anchor.fn` from proximity alone. The brief calls
    this guesswork. Moved it to `ownerHint` (tentative, with provenance) and set `function: null`.
    `covers()` already keeps null-owner loops in every timeline, so that path was there. Updated
    `confirmLoop` so it annotates the hint instead of the scope.
  - `changeRow` judged "known" by timeline position only, and that holds in all four precursors. Added
    the consecutive-original-ordinal requirement and `skippedOrdinals`, so gaps keep the ordinals in
    between.
- Help audit:
  - The compare example used a nonexistent `total()`; rewrote it as a defined lambda.
  - The errors list was missing eight thrown codes.
  - Updated the loop and change wording to the new rules.
- Descriptor: made the 40-key `sampleKeys` cap visible, added units, and stopped `verifiedBy` naming
  an absent field.
- Checked top-level declarations for duplicates after the merges and found none.
- Considered copying `e.totals` defensively, and skipped it as outside merge scope.
- Wrote `release_test.go`. Each check returns "ok" or a diagnostic, so it doesn't depend on what
  `value()` returns.
- Nothing was run. No shell was available and the director runs the suites.
