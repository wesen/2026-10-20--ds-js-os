---
Title: Pattern researcher implementation diary
Ticket: PICOCALC-CANDELA
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
LastUpdated: 2026-11-20T23:47:13.23492668-05:00
WhatFor: ""
WhenToUse: ""
---

# Pattern researcher implementation diary

## Step 1. Bind the staged expression without allocating a closure

The commission requested “Implement a narrow pattern(p => …) with a known callback target and read-only captures.” The language already typechecks ordinary expressions while emitting code, which allows a callback body to reuse lexical bindings during one immediate evaluation.

### Prompt Context

The original assignment is preserved in sources/commission.txt. The director operated the isolated callback implementation; the Opus High researcher supplied the independent design and educational article. These roles are recorded separately.

### What I did

Created a detached frontend worktree, targeted the call checker, added expression-only parsing and synthetic SurfacePoint binding, and assembled the captured tile at 5b0602f. Added cross-target error checks, invocation and lexical shadowing tests. Checked all assembled scene builders and parameter updates via Wasm execution and a separate RV32 instruction model.

### Why

Escaping closures introduce an environment lifetime problem. Construction-only callbacks can reuse ordinary binding lookup without extending those lifetimes. Shared builder functions can append graph nodes in the same order as a manually expanded implementation.

### What worked

The two-call test produced the expected count in memory. After integration the compiled hand and callback tile produced the same 303 graph cells and preserved every byte outside the edited parameter slot. Three weights exercised endpoint and internal tile boundaries.

### What didn't work

The first design/implementation worktrees touched the same call entry as the static receiver feature. The integration retained both paths and replayed their behavioral checks. The standalone research design used hypothetical Q16.16 and a reserved zero handle. Production uses Q8 weights and permits node zero per the frozen contract.

### What I learned

A fixed staging rule is enough for an author to capture the identity of a parameter slot. Changing its value during a later frame requires no callback invocation or reconstruction of its tile nodes.

### What was tricky to build

The lexer uses streaming tokens, indexed tokens and ranged source checking. Looking ahead from the current identifier's actual source span avoids assuming all lexer cursors have the same offset representation.

### What warrants a second pair of eyes

A named direct function should retain its ordinary calling rules. A callback parameter must shadow its namesake only within the body. Future escaping callback forms would need separate capture and lifetime rules.

### What should be done in the future

Measure application startup and render time independently of host tests. Extend callback syntax only when a new material requires it.

### Code review instructions

Inspect FunctionEmitter.patternBody, call and want; run scripts/callbacks/verify.mjs and scripts/director/check-stages.mjs. The compact research identity is various/callbacks/research.json.

### Technical details

Both backends receive the same emitted expression sequence. The current point is represented by a distinct SurfacePoint zero sentinel. Expression nodes remain in the caller-owned graph. The try/finally in the compiler restores local bindings even when a type error aborts compilation.
