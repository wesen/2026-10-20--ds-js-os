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

## Refinements (2026-11-22)

Checked against the code at `6195cab` (main after TYPED-APP-MANIFEST, TYPED-FRONTEND and SPLIT-FILES) before
implementing.

**What was there.** APP-MANIFEST had already deleted the per-app port files (`agenda_p4.c`, `files_p4.c`): both apps were
rows of the generated table, and only their reactors were C. Agenda's C (`wasm-world.c`, 869 lines) held the whole app
except the parser and the entry grammar: reading and splitting the file, the sorted task index, grouping and the 25-row
window, the screen, prompts and diagnostics, the four file changes, reminders and the `fired` store, the editor hand-off,
and an `agenda.parse` ask that only a replay used. Files' C (`world.c`, 334 lines) held listing, sorting, sizes, the
prompts and every filesystem operation; `files.typed` had four helpers. `compile.js` in each app checked those helpers'
slot signatures.

**What the platform must provide, and nothing else.** The generic reactor had no filesystem directory calls, no
editor hand-off, no clock beyond a timestamp and no timer. The new SDK imports, added in `world.c`, `typed-world.js` and
`sdk/typed/rv32-slot.S` together (the trampoline table grows from 30 to 39), are:

| Import | Platform call |
|---|---|
| `typedSdkFsOpen(claim, n)` | `nw_fs_open` |
| `typedSdkFsAt(dir, path, n, rights)` | `nw_fs_at` (rights 1 r, 2 w, 3 rw) |
| `typedSdkFsOp(handle, op, n, path, n, arg, n)` (awaitable) | `nw_fs_op` (a negative argument length passes none) |
| `typedSdkAskFile(to, n, type, n, file, name, n, timeout)` (awaitable) | `nw_ask_file` |
| `typedSdkRevoke(handle)` | `nw_revoke` |
| `typedSdkClock(field)` | 0 `nw_clock_today`, 1 wall seconds since 2000 (i32 until 2068), 2 seconds since boot |
| `typedSdkClockOffset(epochMinutes)` | `nw_clock_offset` in minutes (-100000 unknown) |
| `typedSdkClockZone(buffer)` | `nw_clock_zone` |

and three small extensions of what existed: `typedSdkEventText` field 4 returns the payload's JSON text (Files parses
directory listings and `info` replies in Typed); `typedSdkEventInt` reads `true`/`false` as 1/0 (the editor's
`{"ok":true}`); a world declares one timer through `typedWorldMeta(5)` (its period in ms), because the kernel accepts
`nw_every` only during `nw_init`; its ticks arrive as kind 1 with token 0 (the timer's index). A timer import
(`typedSdkEvery`) was tried first and dropped for that reason.

**Typed has no local records and no arrays**, so the design changed in three places:

- `parseTask` and `normalizeEntry` write their results into `WorldState`, whose first eleven fields are the task (in the
  old `Task` order) and the next two the entry error; `record Task` and `record EntryError` are gone. The parser replays
  compile `state.typed` before `reminder.typed`; the RV32 parser and entry runners read the same offsets.
- All memory is the runtime's buffers (`typedSdkBuffer`), each with a fixed role per app (listed at the top of
  `apps/typed/agenda/text.typed` and `apps/typed/files/listing.typed`). Agenda's task index is five units per task in
  buffer 10 (at most 12,000 tasks; the C used `malloc`), kept sorted by binary insertion while the file is parsed.
  Files' entries are 104 units each in buffer 0, sorted the same way.
- Every text an SDK call reads starts at offset 0 of a buffer, so lines are copied (`typedSdkCopySpan`) into a line
  buffer before parsing, and the pieces of one call (`to`, `type`, `name`) sit in different buffers.

**Edits happen in buffer 0.** The C edited a fresh copy of the file. Agenda now reads the change's fresh copy into
buffer 0 (the display snapshot), edits it there and re-indexes it without publishing, so the list never points into
text that has changed; the write's settlement re-reads the file and publishes, as before. When a change cannot be saved,
the world empties the index and re-reads the file.

**Behavior changes, all toward the JavaScript Agenda:** without its `fs:/notes` claim the world shows the reason
(`agenda has no claim on fs:/notes`) instead of publishing nothing; the `agenda.parse` ask is gone. Lines over 2,048
units are still not tasks; files over 65,536 UTF-16 units cannot be read (the C limit was 65,536 bytes). Reminder keys
over about 2,000 units cannot be recorded and do not ring.

**Deadlines.** Agenda's source grows from 470 to about 1,500 lines (71 KB, Editor's size): the host compiles it in 0.7×
Editor's time, so on the P4 it needs about 2 s with `interactive`. Its deadline goes from 1,700 to 4,000 ms and Files'
from 1,700 to 3,000 ms. On the P4 (merged with PIPELINE): Agenda 2.516 s (63 %), Files 1.391 s (46 %). Every boot
app's first frame waits for all boot compiles, so Agenda's first frame moves 2.8 s later; the diary has the numbers.

**Gates as implemented.** `agenda-wasm-world.mjs` and `files-wasm.mjs` now run the Typed worlds on the generic Wasm
reactor and keep every JavaScript-oracle comparison (Files gained sorting and size cases). `files-rv32.mjs` and the new
`agenda-rv32.mjs` run one scripted session on both the RV32 ELF (rv32emu) and the Wasm build against the same scripted
kernel (`typed-world-transcript.mjs` and its C driver) and require byte-identical system-call transcripts, plus checks
on the writes, sends and frames. The replay count becomes 25.
