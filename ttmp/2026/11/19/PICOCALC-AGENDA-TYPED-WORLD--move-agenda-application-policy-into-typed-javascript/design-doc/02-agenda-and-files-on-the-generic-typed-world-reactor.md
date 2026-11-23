---
Title: Agenda and Files on the generic Typed world reactor
Ticket: PICOCALC-AGENDA-TYPED-WORLD
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Move Agenda's and Files' application logic off their app-specific C reactors onto the generic Typed world reactor that Editor and Chess use."
LastUpdated: 2026-11-22T19:30:10.776897756-05:00
WhatFor: ""
WhenToUse: ""
---

# Agenda and Files on the generic Typed world reactor

## Where they are

Editor and Chess are complete Typed worlds: their sources link against the generic reactor `firmware/sdk/typed/world.c` through `compiler/typed/typed-world.js` (two entry points, `typedWorldMeta` and `typedWorldEvent`, and the SDK imports in trampoline order). Agenda and Files are not: Agenda's policy lives in `apps/typed/agenda/wasm-world.c` (869 lines of C) with `wasm-slot.c` and `rv32-slot.S`, wired by `firmware/port/esp32p4/main/agenda_p4.c` (258); Files uses `apps/typed/files/world.c` (334) with `files_p4.c`. Only their compute functions are Typed. The earlier design (`01-…`) of this ticket was a scaffold.

## Design

- Port the C reactor logic (event dispatch, file reads, screens, prompts, reminders for Agenda; listing, selection, prompts, handing a file to Editor for Files) into Typed sources in `apps/typed/agenda/` and `apps/typed/files/`, using the SDK imports `typed-world.js` declares; add SDK imports only when the platform must provide something (and then in `world.c`, `typed-world.js` and `rv32-slot.S` together).
- Use PICOCALC-TYPED-APP-MANIFEST's manifests (this ticket starts after it lands) so no app-specific C remains in the port; delete `wasm-world.c`, `world.c`, the slot files and the per-app port files through a checked script.
- The JavaScript apps (`apps/js/picocalc/apps/agenda.js`, `files.js`) stay as fallbacks and as the behavioral oracle.

## Gates

- The Agenda and Files replays in `bench/host/replays` (rewritten for the new worlds where they drove the C reactors), with the JavaScript app as the oracle on generated inputs as in AGENDA-PARITY.
- Board: boot compile within 75 % of each deadline; Agenda's cold boot to first notes-backed frame no worse than the 1.897 s median; the device workflows (add, edit, reminder; browse, open in Editor).

## Rules every ticket follows

- **The goal (AGENTS.md).** Typed first, QuickJS only as a fallback, C only when unavoidable or as a benchmark. A missing Typed feature is compiler work.
- **No backwards compatibility.** Change any interface; tests and pins are tools, not promises.
- **Gates.** A change states its gate before it is made and records the result in the diary:
  - `make test` (Node, generated files, Go, the host binary's Python tests, cji);
  - `make test-host` and `make test-host OPTIONS='{"policy":"kernel"}'` (ray digest `430f0d50…`, Chess oracle 6,981 words, 24/24 replays);
  - *byte identity*: `tests/compiler` pins the image digest of each policy; a refactor that claims "no output change" must leave every pinned digest and every replay image unchanged;
  - *board*: a timing claim needs a paired study (`make bench-board STUDY=…`, `docs/measuring.md`).
- **The handheld.** One board, one serial lock (`bench/board/device.py`). A ticket may flash experiment images only through `bench/board` tools and must leave the playable image installed (`make restore-playable`). Only the program's coordinator installs a new playable firmware and rewrites `firmware/PLAYABLE.json`. The keyboard and display may be switched off by the user (`PERIPHERALS=off-by-user`); never debug them.
- **Generated files.** Edit `compiler/typed/rv32/*.js`, never `typed-rv32.js`; run `node compiler/typed/rv32/build.mjs`.
- **Moves and deletes** go through checked Python scripts in the ticket's `scripts/` (dry run, asserted counts), never shell one-liners.
- **Diary.** Each ticket keeps `reference/01-diary.md` in the investigation format (Prompt Context, What I did, Why, What worked, What didn't work with exact errors, What I learned, What was tricky, What warrants a second pair of eyes, Future work, Code review instructions, Technical details), one step per milestone, with commit hashes.
- **Commits** are focused, at validated boundaries, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
