---
Title: Splitting long files and a file-length check
Ticket: PICOCALC-SPLIT-FILES
Status: active
Topics:
    - os
    - testing
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Split the long source files no other ticket rewrites, finish the layout moves left from PICOCALC-REPO-LAYOUT, and add a file-length check to make test."
LastUpdated: 2026-11-22T19:30:09.388273025-05:00
WhatFor: ""
WhenToUse: ""
---

# Splitting long files and a file-length check

## Scope

Files of 400 lines or more at `7ba124c`, excluding generated and vendored code, cji (exception: the book's compiler) and `calc.js` (to be ported, not split), and excluding files other tickets rewrite (`typed-wasm.js`, `typed-async.js`, `rv32/*`, `emu.c`, Agenda's `wasm-world.c`, the P4 `main/CMakeLists.txt`):

| File | Lines | Split by |
|---|---:|---|
| `pkg/traceapi/query.js` | 2,545 | namespace (compiler, rv32, stats, results, repo, archive…) as goja modules |
| `firmware/nucleus/vm.c` | 1,266 | runtime setup, bindings exposed to JS, messages and channels, heaps |
| `firmware/nucleus/kernel.c` | 1,117 | lane and scheduling, mailboxes and channels, deferred effects, supervision |
| `firmware/nucleus/vm_mqjs.c` | 1,039 | as `vm.c` |
| `firmware/nucleus/native.c` | 836 | per engine (host process, Wasm, ELF) and system calls |
| `tools/gen/candela/translator/lower.js` | 914 | by construct |
| `cmd/trace-repl/main.go` | 701 | one file per command |
| `apps/js/picocalc/system/compositor.js`, `apps/js/papers3/system/compositor.js` | 641 / 693 | layout, drawing, focus, ray tracer and painters (check the JS bundling: worlds load one file; use the prelude's module mechanism if there is one, else a build step) |
| `firmware/port/esp32p4/main/agent_p4.c` | 648 | transport, TLS, provisioning |
| `pkg/tracerepl/service.go`, `pkg/tracesimd/study.go`, `pkg/tracearchive/archive.go`, `pkg/tracerepo/repo.go` | 483–559 | responsibility |
| `firmware/sdk/typed/world.c` | 528 | dispatch, SDK imports |
| `bench/host/replays/agenda-wasm-world.mjs` | 440 | workflow |
| `firmware/tests/test_native_worlds.py` | 418 | world |
| `firmware/port/esp32p4/compiler/install.c` | 465 | steps |
| `firmware/nucleus/candela_world.c`, `firmware/port/esp32p4/main/candela_gallery_p4.c` | 469 / 415 | only if CANDELA-TYPED will not replace them; otherwise leave |

## Leftover layout moves (PICOCALC-REPO-LAYOUT design, Section 10)

- `cmd/trace-repl` and `pkg/trace*` → `tools/trace-repl/` (Go module paths, `go test ./...`, docs);
- `firmware/tests` → `tests/native` and `tests/apps` where that separation is real;
- `firmware/tools/{p4cap,p4put,s3cap,provision_agent}.py` → `tools/device/`.

## The check

`tools/check-file-length` (Node or Python), run by `make test-generated` or its own `make` target inside `make test`: fails on a tracked source file over 500 lines unless listed in `tools/file-length-exceptions.txt` with a reason (generated, vendored, cji, a table). Files other tickets are splitting go on the list with the ticket name and come off when that ticket lands.

## Gates

Pure moves: `make test`, the host gates, `make -C firmware shots` byte-identical, the trace REPL's tests, the firmware builds for every profile. Splitting C files changes the link order, so the firmware digest changes; that is expected and recorded. One probe boot of an experiment image (health) after the nucleus split, then `make restore-playable`.

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
