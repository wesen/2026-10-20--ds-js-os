---
Title: Lower async as a tape transformation instead of rewriting source text
Ticket: PICOCALC-TYPED-ASYNC-TAPE
Status: active
Topics:
    - compiler
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "No-go for async as a tape transformation (study); typed-async.js split into compiler/typed/async/ and its error path made single-compile, images unchanged."
LastUpdated: 2026-11-22T19:29:54.315637874-05:00
WhatFor: ""
WhenToUse: ""
---

# Lower async as a tape transformation instead of rewriting source text

## Overview

The [study](design-doc/01-async-as-a-tape-transformation.md#study-2026-11-22) decided **no-go** for lowering
`async` as a tape transformation. Editor's 70-field layout is minimal, so any new lowering would have to reproduce
today's tape byte for byte. A streaming front end needs the whole-program pre-pass anyway. Text generation is about
6 % of the rewrite's cost, and on the P4 the C lexical index reads the generated text.

What the ticket did instead:

- `typed-async.js` is built from `compiler/typed/async/` (eight modules).
- Diagnostics in lowered code are mapped to original positions without a second compile.
- `tests/compiler/typed-async.test.mjs` pins 18 diagnostics exactly.

Images are byte-identical (125 digests), and the host gates pass. The [diary](reference/01-diary.md) has the
evidence.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- compiler

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
