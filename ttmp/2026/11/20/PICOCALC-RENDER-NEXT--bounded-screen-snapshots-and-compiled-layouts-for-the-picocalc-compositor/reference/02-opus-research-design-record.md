---
Title: Opus research design record
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T10:30:50.715651648-05:00
WhatFor: ""
WhenToUse: ""
---

# Opus research design record

## Step 1: Draft the commissioned architecture and experimental plan

Opus returned this research record with its initial guide. The entries below preserve the author’s initial reasoning. The [independent review](../analysis/01-independent-astra-review.md) and [reviewed guide](../design-doc/01-a-bounded-screen-renderer-from-producer-to-panel.md) document the corrected pixel test, controls, allocation ownership and acceptance criteria.

### Prompt Context

The director asked for an intern-facing roadmap for PICOCALC-RENDER-NEXT, to be edited, cross-reviewed with Astra and then published. I worked only from the brief and its verified source facts. I had no repository or board access. I ran no code and fetched no URLs. I wrote the reference links from knowledge, so they need checking before publication.

### What I did

- Organized the guide around five invariants, a tour of the seven stages, four representations, two separately evaluated helpers, and one worked selection example that runs through every stage.
- Defined memory ledgers, tasks with dependencies, phase gates, benchmarks, falsification criteria and a retention policy.
- Labelled every new construct as NEW (proposed).

### Why

- The invariants are pass/fail gates, so they come before any optimization.
- Separating helpers E and F from the representations avoids confounding their effects.
- The selection example exercises geometry, damage and band commits with numbers a newcomer can check by hand.

### What worked

- The selection example yields a mechanical oracle: commit rectangles on the baseline path. That oracle turns early damage tiles into a test that can be falsified.
- The three-arm template comparison (unchanged frames, manual oracle, auto extractor) gives a clear attribution test for novelty.

### What didn't work

- I could not give illustrative byte sizes for template messages without the corpus, so I left them out rather than invent them.
- I could not confirm several points from the brief:
  - whether 768 KiB includes the framebuffer;
  - the exact call order around `strcmp` inside `eng_render`;
  - whether `gfx_commit` bands are aligned at y=0.

### What I learned

- The kernel's NUL-terminated messages and its `strcmp`-based unchanged-frame detection are coupled. CBOR therefore needs both a transport change and a change to how frames are compared.
- Replacing `W->frame` before validation directly threatens the last-good guarantee (I3).

### What was tricky to build

- Making templates compatible with complete snapshots. The answer was a complete value vector every frame.
- Expressing bounds on work, not just bytes.
- Designing fair paired trials with only one board.

### What warrants a second pair of eyes

- The proposed validate-before-retain reorder in `kernel.c`.
- Whether the `f.app === msg.from` check can be reproduced correctly in C ingress.
- What actually bounds JavaScript screens today.
- The band arithmetic in the worked example.
- Whether covering commit rectangles is a sufficient safety check when overlays and focus are involved.
- All reference URLs.

### What should be done in the future

- Derive the `RN_*` limits from T0 corpus maxima.
- Have Astra review the invariant tests.
- Revisit task priority after Phase 0 measurements.
- Write a T8 design document only if H-C survives.

### Code review instructions

No code was produced. Reviewers should:
- check every backticked existing name against the checkout;
- confirm that every new construct carries a NEW (proposed) label;
- confirm the document contains no performance claims;
- map I1 to I5 onto concrete tests.

### Technical details

- Frame size: 320 x 320 x 2 = 204,800 bytes.
- Commit bands: 20 bands of 16 rows, each 10,240 bytes.
- Retention limits: `RETAIN_MAX` 4096 bytes (excludes screens); `NW_SCREEN_MAX` 16384 bytes (native screens only).
- System limits and timing: 32 worlds; 500 ms sampling; 48 history points; 80 ms and 768 KiB compositor budgets.
- Public evidence used: RFC 8949 (definite-length and deterministic encoding), FlatBuffers internals (reading in place at offsets), Android's measure and layout passes (repeated measurement), and partial evaluation (static versus dynamic binding times).
- Recommendations:
  - Start with T0 and T1.
  - Keep CBOR host-only.
  - Treat a single missed damage rectangle as disqualifying for early damage tiles.
