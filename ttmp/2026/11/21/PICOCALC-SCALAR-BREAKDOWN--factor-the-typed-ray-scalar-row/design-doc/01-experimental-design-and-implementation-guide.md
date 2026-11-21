---
Title: Experimental design and implementation guide
Ticket: PICOCALC-SCALAR-BREAKDOWN
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T00:24:59.487544799-05:00
WhatFor: ""
WhenToUse: ""
---

# Experimental design and implementation guide


The ray renderer clears row storage, visits each sphere, tests each horizontal position and updates the nearest depth and ID. Its earlier specialized scalar implementation changed several costs at once. The experiment holds the Typed source, row semantics and loop domain fixed across a two-factor comparison. One factor admits checked accesses once per region, the other retains local values in registers. Compare a common-admission control, guards only, registers only, and both. Measure empty-row rejection in a separate comparison. Preserve the default compiler control to account for the common admission cost.

    ordinary backend -> common control -> guards only     -> both -> both + row skip
                                       -> registers only  -> both

Render the twelve frozen poses. Compare every visible pixel, winning object and depth, padding and failure behavior. Report guest instructions as counts, target primary and clean frame times in milliseconds, and compile costs separately. The row timing includes work outside the optimized loop. A hardware result must identify its firmware. Use compiler inspection to explain which actual operations changed, including checks retained in guard paths. A null or interaction result is a publishable result.
