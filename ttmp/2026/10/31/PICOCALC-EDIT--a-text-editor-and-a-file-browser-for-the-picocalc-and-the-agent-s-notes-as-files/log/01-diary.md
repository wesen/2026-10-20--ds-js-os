---
Title: Diary
Ticket: PICOCALC-EDIT
Status: active
Topics:
    - picocalc
    - editor
    - filesystem
    - ui
DocType: log
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/editor.js
      Note: the editor
    - Path: repo://picocalc-os/js/apps/files.js
      Note: the file browser and the open protocol
    - Path: repo://picocalc-os/js/system/agent.js
      Note: note tools on files, migration
    - Path: repo://picocalc-os/port/esp32p4/main/fs_p4.c
      Note: fs worker placement and slow-op log
    - Path: repo://picocalc-os/tests/agent.test.mjs
      Note: agent tests with a fake notes folder
    - Path: repo://picocalc-os/tests/editor.test.mjs
      Note: editor tests
ExternalSources: []
Summary: 'Chronological record of PICOCALC-EDIT: a text editor, a file browser that hands out one file at a time, and the agent''s notes moved into files; host and ESP32-P4.'
LastUpdated: 2026-11-01T00:20:00-04:00
WhatFor: Following how the editor and Files came to picocalc-os and why each decision was made.
WhenToUse: When resuming the ticket or reviewing one of its commits.
---

# Diary

## Goal

Give the PicoCalc an editor for plain text and Markdown sized for its 320×320 screen, a file browser that opens
a file in the editor by handing it a handle to that one file, and move the agent's notes out of its 3 KB session
record into files that the user can see and edit. Everything builds on PICOCALC-FS (commits `e16fa7d`,
`6f12990`).

## Step 1: The design and the guide

Before writing code I read the parts the editor would rest on: how an app returns a screen tree and how the
compositor lays it out (`js/system/compositor.js`), how keys reach an app (`msg.from === "compositor"`), the font
cells (`s` is 6×12 pixels, so 49 columns and about 18 rows fit under the title and status lines), and the file
handle methods PICOCALC-FS had added to the prelude. The two design questions were how to draw an editable text
area at all (no existing node had a cursor) and how one app hands another a file.

The answers went into the intern guide: a new `textarea` node (rows of text, a cursor, highlighted ranges), an
editor that keeps logical lines and wraps only what is on screen, and an open protocol in which Files narrows its
root handle to one file, asks the editor to take it, and revokes the handle it gave before.

### Prompt Context

**User prompt (verbatim):** the ticket series prompt is recorded verbatim in the PICOCALC-FS diary, Step 1
("Alright do all --- [pasted list: Productivity ...] 000 System and Development. Create a new docmgr ticket per
chunk that makes sense, ..."). PICOCALC-EDIT is the second ticket of that series.

**Assistant interpretation:** Ticket EDIT covers the text editor, the file browser, and the agent's notes as
files; guide first, uploaded, then implementation, diary and report.

**Inferred user intent:** A PicoCalc that is useful for writing, with the agent's notes in the same place as the
user's own.

**Commit (docs):** the ticket and guide were uploaded before implementation (reMarkable,
`/ai/2026/10/31/PICOCALC-EDIT`, "PICOCALC-EDIT intern guide") and committed with the code in `23fc2f7`.

### What I did

- Created the ticket with docmgr, wrote `design-doc/01-editor-and-files-analysis-design-and-implementation-guide.md`
  (screens as data, keys, fonts, turns and promises; the textarea node; the editor's text model, commands,
  Markdown and persistence; Files and the open protocol; notes as files; plan E1–E6; tests; API and file
  references) and uploaded it.
- Added tasks E1–E6.

### Why

- Wrapping only what is on screen keeps a 64 KB file as cheap as a short one: the world's turn budget is 80 ms on
  the host model and JavaScript runs about 14 times slower on the P4 while Wi-Fi is up.
- The open protocol uses the handle machinery PICOCALC-FS already tested (narrowing, passing, revocation), so the
  editor needs no file claim at all.

### What worked

- The existing grant rule ("a handle may be passed by a holder with the grant right or by the world that
  narrowed it") was exactly what Files needs: it can give the editor a read-write handle the editor cannot pass on.

### What didn't work

- Nothing at this step.

### What I learned

- `handle_release` frees a slot only when no holder remains; every open makes a new handle, and the table has 128
  slots, so both sides must release what they no longer use (see Step 3).

### What was tricky to build

- Deciding where the cursor lives. A cursor in display rows would make every edit re-wrap the whole file; a
  cursor in logical (line, column) needs a mapping to the screen. The guide chose the second, with a per-line
  cache of row counts.

### What warrants a second pair of eyes

- The guide's limit for the agent's note text (4,096 characters) against the chat's approval view, which was
  sized for 1,536; see Step 4.

### What should be done in the future

- Nothing beyond the plan.

### Code review instructions

- Read the guide sections 3–6 before the code.

### Technical details

- Guide: `ttmp/2026/10/31/PICOCALC-EDIT--.../design-doc/01-editor-and-files-analysis-design-and-implementation-guide.md`.

## Step 2: The textarea node and the editor (E1, E2)

The compositor gained a `textarea` node and the prelude `ui.textarea(rows, opts)`. `js/apps/editor.js` (312
lines) is the editor: soft wrap at 49 columns, a cursor that moves by display rows with a goal column, find and
find-next with wrap-around, Markdown colours and a preview, list continuation, save through its one handle, and
the cursor position remembered per file. Ten Node tests cover it (`tests/editor.test.mjs`).

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement E1 and E2 of the guide.

**Inferred user intent:** An editor that feels like one on a small screen.

**Commit (code):** `23fc2f7` — "picocalc-os: a text editor and a file browser (PICOCALC-EDIT E1-E3)"

### What I did

- `js/system/compositor.js`: `measure` gives a textarea `rows × (font height + lead) + 4` and `grow: 1`;
  `drawTextarea` fills the find marks (`[row, col, len]`) in a soft tint, draws the rows in their colours and a
  2-pixel cursor in the accent colour.
- `js/apps/editor.js`:
  - `edWrap(line, cols)` returns segments `[start, end)` in characters, breaking at the last space that fits or
    hard at the width; `s.wraps[i]` caches each line's row count; `edRecount` rebuilds it after a load.
  - `edDisplay(s, line, col)` and `edFromDisplay(s, row, dcol)` map between the logical cursor and display rows;
    a column at a break belongs to the next row.
  - `edEdited(s, from, removed, added)` updates `lines` and `wraps` for the lines an edit touched, marks the
    buffer dirty and clears the armed Esc.
  - `edInsert`, `edNewline` (in Markdown files continues `-`, `*` and `+` items and numbered items, counting
    up; an empty item ends the list), `edBackspace`, `edDelete`, `edFindNext`, `edColors` (headings accent, fenced code blue, quotes muted),
    `edView` (the 18 rows on screen, the cursor and the marks), `edPreview`.
  - `edRemember`/`edRestore`: the store key `pos` holds up to 20 `{name, row, col}`.
  - Keys: F2 save, F3 find, F4 next, F5 top/bottom, F6 preview, Esc back (a second Esc discards changes).
  - `open` handler: refused while the buffer is dirty (`{ok: false, why}`), otherwise reads the file (a missing
    file opens empty and the first save creates it).
- `tests/editor.test.mjs`: the app runs in a Node `vm` context with a fake builder and fake file handles.

### Why

- Keys are accepted only from the compositor (`msg.from === "compositor"`), like every other app; the test
  checks that a key sent by another world is ignored.

### What worked

- `node tests/editor.test.mjs`: 9 of 9 at this commit (10 after Step 5 added one).
- A host script, `scripts/files.txt`, drives Files and the editor and writes captures `out/50-…` to `out/59-…`.

### What didn't work

- The first test run failed on objects made inside the VM: `assert.deepStrictEqual` compares prototypes, and an
  array created in the `vm` context does not have the outer realm's `Array.prototype`. Fixed with
  `plain = x => JSON.parse(JSON.stringify(x))` around values read back from the VM.
- One wrap expectation was wrong in the test, not the code: 49 columns of `"word "` break after nine words, at
  the last space inside the row, so the first row is `"word ".repeat(9)` (45 characters).
- The first host captures showed the free space of the disk the tests ran on ("239714.6 MB free"); fixed in
  Step 4 by making the host report a volume the size of the P4's partition.

### What I learned

- A Markdown list continuation surprises a script that types the bullet itself: `- an agenda` after Enter becomes
  `- - an agenda`. The script was wrong; editors that continue lists behave the same way.

### What was tricky to build

- Up and down move by display rows but the cursor is logical. Each move converts the cursor to a display row,
  moves, and converts back with the goal column; the goal survives across short rows and resets on any horizontal
  move or edit.

### What warrants a second pair of eyes

- `edWrap` counts code points with `Array.from`, and `nucleus/gfx.c` draws one cell per code point (a code point
  without a glyph draws as `?`), so the columns agree. Combining characters would break that; the font has none.

### What should be done in the future

- Undo. The editor has none; Esc-Esc discards to the last save.

### Code review instructions

- Start at `edKey` in `js/apps/editor.js`, then `edEdited` and `edView`. Run `node tests/editor.test.mjs`.

### Technical details

```text
logical lines   ["# Title", "word word ... (149 chars)", "short"]
wraps           [1, 4, 1]                  (only lines that changed are re-wrapped)
cursor          {row: 1, col: 50}  ->  display row 1 + 1 = 2, column 1
view            rows top..top+17, each {s, color}; cursor [r, c]; marks [[r, c, len], ...]
```

## Step 3: Files, and the open protocol (E3)

`js/apps/files.js` (107 lines) is the only world with the claim `fs:/`. It lists a folder (folders first), enters
and leaves folders, makes files and folders, renames, and deletes with a second F5 as confirmation. Opening a file
narrows the root to that file with `rw`, asks the editor to take it, and revokes and releases the handle it gave
the editor before. Files (key `d`) and Editor (key `e`) joined the manifest and the home screen, which is now a
3×3 grid.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement E3.

**Inferred user intent:** "File browser that opens a file in another app by handing it a handle to that one
file, not general file access."

**Commit (code):** `23fc2f7` (with Step 2).

### What I did

- `fiOpen(s, path)`:
  ```text
  h = root.at(path, "rw")                      // a child handle; Files is its minter
  r = await ask("editor", "open", {file: h, name: path}, {timeout: 3000})
  if r.ok:  if given: given.revoke(); given.release()
            given = h; send("compositor", "open", {app: "editor"})
  else:     h.revoke(); h.release(); note = "Editor: " + r.why
  ```
- The editor releases a file it refuses, and releases the file it held when it accepts a new one.
- Names: `^[A-Za-z0-9](?:[A-Za-z0-9 _.-]{0,62}[A-Za-z0-9_-])?$` (the trailing-dot rule came in Step 4).
- `fiSize` prints B, KB, MB or GB; the header shows the path and the free space from `root.info()`.
- Manifest: `files` with claim `fs:/` (384 KB), `editor` with no claim (512 KB). Launcher entries and icons.

### Why

- Revoking the previous handle when a new file is opened means the editor can only ever touch the file the user
  chose last. Releasing on both sides keeps the 128-slot handle table from filling up over a long session: a slot
  is freed only when its last holder releases it.

### What worked

- The host script runs the whole path: Files at the root, into `notes/`, open `welcome.md`, type, find, preview,
  save (195 bytes on disk), back to Files with the new size, a new file `ideas.md` that the first save creates.

### What didn't work

- The hint line was cut off ("F2 new F3 dir F4 re…", then "F5 d…"): 44 characters fit after "F1 home". It is now
  `⏎ open F2 new F3 dir F4 rename F5 del`; the empty-folder text mentions Backspace.

### What I learned

- `ask` takes `opts.timeout` (default 2,000 ms); the open ask uses 3,000 ms because the editor reads the file
  before it answers.

### What was tricky to build

- The order of revocation. Files revokes the old handle only after the editor accepted the new one; revoking
  first would leave the editor with a dead handle if it refused (for instance with unsaved changes).

### What warrants a second pair of eyes

- If the ask times out after the editor accepted, Files revokes a handle the editor holds. The editor then sees
  "revoked" on its next save. That is safe (no access beyond the user's choice) but would surprise the user.

### What should be done in the future

- Folder-aware opening for other apps (the calculator's history, the agenda) through the same ask.

### Code review instructions

- `js/apps/files.js` from `fiOpen`; `js/apps/editor.js`, the `open` handler.

### Technical details

- Captures: `picocalc-os/out/50-files.png` to `59-editor-new.png` (host).

## Step 4: The agent's notes as files (E4)

The agent's notes moved from its session record (8 notes, 1,536 characters each, 3 KB total) into `notes/`. The
agent claims `fs:/notes`; `list_notes`, `read_note` and `save_note` keep their names and work on files through
promises; a note can be 4,096 characters; notes still in an old record move into files at start. The agent's
unit tests were rewritten around a fake notes folder (30 tests) and the integration tour now checks the file
`notes/next` and runs a migration.

### Prompt Context

**User prompt (verbatim):** see Step 1 ("It also becomes where the agent's notes live: today they are capped at 8
notes and 3 KB in total.").

**Assistant interpretation:** Implement E4 as the guide describes.

**Inferred user intent:** The user and the agent share one place for notes.

**Commit (code):** `42693d7` — "picocalc-os: the agent's notes are files (PICOCALC-EDIT E4)"

### What I did

- `js/system/agent.js`:
  - `noteOp(s, work, done)` sets `s.toolBusy` to a fresh token, waits for a migration in progress, runs `work`,
    and calls `done(error, value)` only if the token is still current; `cancel`, `failRun` and a new chat clear
    it, so a result for a cancelled run is dropped. `tick` does not start the next tool while one is busy.
  - `save_note` first checks whether the file exists (the approval says "Save" or "Replace"), then waits for
    approval; on F4 it writes the file and reports success only after the write's promise settles.
  - `read_note` clips to 6,000 bytes and says `clipped: true`; `list_notes` lists files whose names the tools
    accept, at most 64, with `more`.
  - The session record is version 2; its `notes` field holds only notes not yet moved. `migrateNotes` writes each
    to `notes/<name>` (trailing spaces and dots trimmed) unless a file of that name exists, then persists the
    record without them; a failure keeps them and retries at the next start.
  - `/notes` lists the folder.
- `js/apps/chat.js`: the approval view holds 4,200 rows (a 4,096-character note of newlines fits).
- `nucleus/fs.c` and Files: a trailing dot is refused, since FAT drops it (`a.` and `a` would be one file on the
  device and two on the host).
- `host/port_host.c`: `fs.info` reports the P4 partition's size (11,956 KB) less the files in the root counted
  in 4 KB clusters, so captures no longer depend on the host's disk.
- `system.json`: the agent claims `fs:/notes`.

### Why

- Tool names and schemas stay the same so the model's behaviour carries over; only the limits changed.
- A file the user already made wins over a migrated note of the same name: the user's file is the newer intent.

### What worked

- `node tests/agent.test.mjs`: 30 of 30. `make test-agent`: all suites pass, including the integration tour
  ("approval -> note file -> read"), the Chat Completions tour, the reboot run and the new migration run.
- `make test-fs`: 9 of 9 with the two new bad paths (`dot.`, `space `).

### What didn't work

- Two test failures on the first run, both real:
  - `Cannot read properties of undefined (reading 'parsed')` in "a note too long to review is refused before
    approval": the response validator rejected tool arguments over 4,096 bytes
    (`utf8Bytes(item.arguments) > 4096`), so a 4,000-character note of `é` never reached the tool. The limit is
    now `AGENT_LIMIT.argumentBytes` = 16,384.
  - The migration test expected an empty store after a failed move, but the fake store starts with the old
    record; the assertion now checks that the record still holds its three notes.

### What I learned

- An escaped review copy can be much longer than the note: every non-ASCII character becomes `\u{…}`. The agent
  refuses a note whose review copy exceeds 12,000 characters before asking for approval, so the model gets an
  error instead of the user getting a review screen that cannot show it.

### What was tricky to build

- Making asynchronous tools fit a loop that was synchronous. The run's state machine (`requesting`, `tools`,
  `approval`) stays; `tools` simply waits while a token is busy, and every place that ends a run clears the token.
  The test "cancel while a write is in flight" checks that the write completes but the cancelled run reports
  nothing late.

### What warrants a second pair of eyes

- `noteOp` waits for `s.migration`. If a migration hangs (a file operation that never settles), note tools wait
  until the run's 3-minute deadline. File operations always settle on both ports today.
- Names are compared case-sensitively by the agent, while FAT is case-insensitive: `Todo` and `todo` are one file
  on the device. The approval then says "Replace", which is correct.

### What should be done in the future

- A tool to append to a note, so a long list does not need the whole text in one call.

### Code review instructions

- `js/system/agent.js`: `noteOp`, `noteTool`, `approve`, `migrateNotes`, `initialize`. Tests:
  `tests/agent.test.mjs` from `notesDir`, then `tests/agent-integration.py`.

### Technical details

```text
save_note(n, t)
  tick: nextTool -> noteTool: noteOp(stat n) ............ toolBusy, phase "tools"
  later segment: exists? -> approval "Save|Replace note 'n'"
  F4: approve -> noteOp(write n, t) ..................... toolBusy
  later segment: ok -> toolResult {ok: true, saved: true}; tick -> next request
```

## Step 5: On the ESP32-P4 (E5), and a turn stretched by a flash write

The firmware went onto the PicoCalc's P4 three times. The editor, Files and the agent's notes work on the device:
a file made in Files, typed in the editor and saved, survives a reboot with its cursor position; the live model
(deepseek-4.1-flash through lunaroute) saved `notes/groceries` after F4, and Files shows it next to three notes
that had moved there from the old session record at first boot. Two defects came out of it: the editor
mishandled Esc pressed while a save was still being written, and a flash write could stall a kernel turn past
its budget.

### Prompt Context

**User prompt (verbatim):** see Step 1. Standing instruction from the earlier agent ticket: "in case the uart
disappears oddly during flashing or so, stop, the USB port might be bust".

**Assistant interpretation:** Run E5 on the device, holding the keyboard bus before every reset.

**Inferred user intent:** Features that work on the real device, not only in the host model.

**Commit (code):** `8238911` — "picocalc-os p4: file writes no longer stretch turns; Esc after F2 waits for the
save (PICOCALC-EDIT E5)"

### What I did

- Before each flash: `tools/p4cap.py --no-reset -s 1 -c "0.2 hold"` ("i2c0 held between transactions"), then
  `idf.py -B build-agent ... build flash` with ESP-IDF 5.4.2. The UART stayed up every time.
- Boot: 0 crashes, the agent's claim created `notes/`, Files showed "11.7 MB free".
- First editing run: `plan.md` through console `key`/`type`. The text came out as
  "- he d-e vriecbeoot and read this again": two `type` commands interleaved. The console schedules one character
  every 90 ms (`press(now + MS(90) * i, ...)`), so 32 characters take 2.9 s and my next command started before
  the first finished. Later runs spaced commands by that.
- The same run showed Esc after F2 warning "Unsaved changes": `edSave` cleared `dirty` only after the write
  settled, and Esc came first. A second Esc in that window would have reloaded the old text on screen while the
  new text was being written. Now `s.saving` is explicit: a second F2 waits, edits during the write keep the
  buffer dirty, and Esc during the write sets `leaveAfterSave` and leaves when the write lands. New test: "a save
  in flight".
- Second run (`device.md`, Esc right after F2): the file was right, but the log showed
  `compositor crashed handling draw: ran past its turn budget of 80 ms` at 23.8 s, while a screenshot was being
  streamed, and the crash lines broke the screenshot's base64 so `p4cap` failed to parse it.
- Bisecting: six saves in a row without screenshots, 0 new crashes; eight screenshots with navigation and no
  saves, 0 crashes. The compositor's average turn was 6–12 ms.
- Cause, by ESP-IDF's design: while it erases or writes flash, the flash cache is off and the *other* CPU is
  parked for the operation. The `fs` worker ran on core 0 and the kernel on core 1, so a save could freeze a turn
  in progress. Fix: the worker runs on core 1 at priority 4, below the kernel's 5, so it only runs while the
  kernel task is blocked between turns. A flash operation can delay the next turn but not stretch one. Operations
  of 20 ms or more are logged.
- Third run: six saves, each with a screenshot 50 ms after F2: 0 crashes. Saves measured 543, 592, 536, 611, 520
  and 597 ms (`I (25834) fs: op 3 on device.md took 543 ms` and so on); the agent's note write took 333 ms.
- Reboot through the console's `reboot` (which holds the bus): `device.md` reopened at 2:51, where the cursor was.
- Agent: "Save a note called groceries with the text: eggs, milk, bread." The approval read "Save note
  'groceries': eggs, milk, bread"; after F4, "save_note: saved", and Files showed `bike`, `groceries`, `shop`,
  `todo` in `notes/`.

### Why

- Moving the worker instead of extending budgets keeps the budget meaning "time this world's code ran": the
  kernel never charges a world for time it was frozen by flash.
- Flash auto-suspend (`CONFIG_SPI_FLASH_AUTO_SUSPEND`) is supported by the P4 chip in IDF 5.4.2 but depends on
  the flash part on the module, which I could not verify, so it stays off.

### What worked

- The open protocol, the editor, saves and the agent's tools behaved on the device as on the host.
- The migration ran unattended at first boot and kept the three notes from the agent ticket's device runs.

### What didn't work

- `compositor crashed handling draw: ran past its turn budget of 80 ms` (once, before the fix).
- `binascii.Error: Invalid base64-encoded string: number of data characters (5) cannot be 1 more than a multiple
  of 4` in `p4cap` when log lines landed inside a screenshot stream.
- `W (43822) HTTP_CLIENT: Connection timed out before data was ready!` once a second while the model thought;
  these are polls in streaming mode that found no data yet, not failures.

### What I learned

- A save on FAT with wear levelling costs about half a second here: the temporary file, its sync, removing the
  old file and the rename each rewrite directory and FAT sectors, and every rewrite is an erase.
- Six clean runs do not prove the hazard is gone; the argument is the scheduling one above. The overrun was rare
  (once in about eight saves) because most of the lane's time is idle.

### What was tricky to build

- Telling a measurement artefact from a defect: the overrun coincided with a screenshot, which reads 200 KB of
  PSRAM on core 0, so the screenshot was the first suspect. Testing each factor alone (saves only, screenshots
  only) and knowing what IDF does during flash writes pointed at the worker's core.

### What warrants a second pair of eyes

- The `fs` worker now shares core 1 with the kernel. If the lane were busy all the time, file operations would
  wait; at 10–17% lane load they do not. A flash operation that starts just before a turn delays that turn by up
  to one erase (tens of milliseconds), which the keyboard driver absorbs.
- The console `type` command's 90 ms pacing makes device scripts slow; a script should wait `0.09 × length + 0.5`
  seconds after each `type`.

### What should be done in the future

- Consider writing small files in place instead of through a temporary file: fewer directory and FAT rewrites,
  so fewer erases, at the cost of the crash safety the temporary file gives.
- A per-world maximum turn time in `stats`, so overruns can be seen before they become crashes.

### Code review instructions

- `port/esp32p4/main/fs_p4.c` (the header comment and `p4_fs_init`), `js/apps/editor.js` (`edSave`, the Esc
  branch of `edKey`), `tests/editor.test.mjs` ("a save in flight").
- Device check: hold, flash, then `tools/p4cap.py --no-reset -s 25 -c "7 key d" ...` as in this step.

### Technical details

- Captures: `ttmp/.../PICOCALC-EDIT.../captures/p4-00-interleaved-typing.png` to `p4-07-files-notes.png`.
- Device stats after the save run: `t = 57374.6 ms, lane busy 6418.6 ms (11.2%), 4415 turns, ... 0 crashes`.

## Step 6: Documentation and delivery (E6)

The guide gained a section on what was built and measured; this diary, the changelog and the related files were
updated; the guide and diary were uploaded as one bundle; the report went into the vault.

### Prompt Context

**User prompt (verbatim):** see Step 1 ("write a detailed report after each ticket").

**Assistant interpretation:** Close the ticket with documents that match the code.

**Inferred user intent:** A record others can read and continue from.

**Commit (docs):** recorded in the ticket's changelog.

### What I did

- Guide section 11, "As built and measured"; diary Steps 1–6; changelog; `docmgr doc relate`.
- Upload: "PICOCALC-EDIT guide as built and diary" to `/ai/2026/10/31/PICOCALC-EDIT`.
- Vault report: `PROJ - picocalc-os - PICOCALC-EDIT - Editor, Files and Notes on the PicoCalc.md`.

### Why

- The guide was written before the code; the as-built section records where the code differs.

### What worked

- See the changelog for the upload result.

### What didn't work

- Nothing.

### What I learned

- Nothing new.

### What was tricky to build

- Nothing.

### What warrants a second pair of eyes

- None.

### What should be done in the future

- Next ticket: PICOCALC-CALC.

### Code review instructions

- Read the report, then the guide's section 11.

### Technical details

- None.
