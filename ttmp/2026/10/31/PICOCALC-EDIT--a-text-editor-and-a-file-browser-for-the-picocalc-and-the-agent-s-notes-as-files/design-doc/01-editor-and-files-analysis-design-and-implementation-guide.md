---
Title: 'Editor and Files: analysis, design and implementation guide'
Ticket: PICOCALC-EDIT
Status: active
Topics:
    - picocalc
    - editor
    - filesystem
    - ui
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/editor.js
      Note: the editor
    - Path: repo://picocalc-os/js/apps/files.js
      Note: the file browser
    - Path: repo://picocalc-os/js/system/agent.js
      Note: notes as files
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: textarea node
ExternalSources: []
Summary: 'A text editor and a file browser for picocalc-os, built on PICOCALC-FS''s file handles: how screens, keys and the compositor work, the textarea node, the editor''s text model, the open-a-file protocol with revocation, and moving the agent''s notes into files.'
LastUpdated: 2026-10-31T23:30:00-04:00
WhatFor: Onboarding to the editor and the file browser, and the plan PICOCALC-EDIT follows.
WhenToUse: Before changing js/apps/editor.js, js/apps/files.js, the compositor's textarea node, or the agent's note tools.
---

# Editor and Files: analysis, design and implementation guide

This ticket gives the PicoCalc its two most basic tools: a **text editor** for plain text and Markdown, and a
**file browser** that opens files in it. It builds directly on PICOCALC-FS, which added files and file
handles. It also moves the agent's notes out of its small private record and into files, so the notes the
agent saves can be read and edited like any other document.

Section 2 explains how an app draws and receives keys, which the editor and browser depend on. Sections 3
to 6 are the design; section 7 the plan; section 8 the tests.

## 1. What this ticket delivers

- A compositor node **`textarea`**: rows of monospaced text drawn as given, with a cursor and highlighted spans.
- **Editor** (`js/apps/editor.js`): soft-wrapped editing with arrows, Home/End, PgUp/PgDn, Backspace/Del,
  Enter, Tab; save (F2); find and find-next (F3, F4); a Markdown preview (F6); per-line colouring of Markdown
  headings, lists, quotes and code blocks; it holds no file claim and edits only files it is handed.
- **Files** (`js/apps/files.js`): directory browsing with sizes and free space; open a file in the editor;
  new file, new folder, rename, delete; holds `fs:/`.
- **The open protocol**: Files narrows its root handle to the one file and *asks* the editor to accept it; the
  editor refuses if it has unsaved changes; on acceptance Files revokes the handle it gave before.
- **Agent notes as files** under `/notes`; the agent's tools list, read and save files there, with the same
  physical approval for writes. Existing notes migrate from the agent's record on its first start.

## 2. How an app draws and hears keys

### 2.1 Screens are data

An app never draws pixels. After each of its turns the nucleus calls the app's `screen(state)` function and
publishes the returned tree on the `frames` channel if it changed. The tree is plain objects made with the
prelude's `ui` helpers:

```js
app("files")
  .state({ path: "", items: [], sel: 0 })
  .screen((s) => ui.col({ gap: 4 },
    ui.text("/" + s.path, { font: "s", color: "muted" }),
    ui.list(s.items.map((e) => ({ label: e.name, right: e.dir ? "dir" : e.size + " B" })), s.sel, { grow: 1 }),
  ));
```

The **compositor** world (`js/system/compositor.js`) owns the framebuffer. For the focused app it measures the
tree (`measure`), lays it out in the 320×320 screen below the title bar and above the hint bar, and paints it
(`draw`). Node types today: `col`, `row`, `box`, `text`, `gap`, `sep`, `bar`, `spark`, `canvas`, `input`,
`kv`, `grid`, `list`, `lines`, `table`.

### 2.2 Keys

The keyboard driver publishes every key event on `keys`: `{code, key, ch, state}` where `state` is `down`,
`hold` or `up`, `key` is a name (`enter`, `left`, `f2`, `a`) and `ch` the character. The compositor accepts
these only from the keyboard world, handles F1 (home) itself, and sends the rest to the focused app as a `key`
message. Modifier keys (Shift, Ctrl, Alt) arrive as their own events; letters already carry their shifted
character in `ch`. Apps in this OS use function keys for commands (the chat app: F2 new, F3 retry, F4 allow).

### 2.3 Fonts and the screen budget

Fonts are monospaced: `s` (small) gives about 52 columns and 22 rows of text area, `m` about 39 columns. The
editor uses `s`; at 2 pixels of leading it shows 18 rows above a status line.

### 2.4 Turns, segments and promises

A handler that returns a promise keeps its world in that turn until the promise settles. A handler that starts
a promise and returns without awaiting it ends its turn at once; the promise's callbacks run later as their own
segment, and the world can take other messages meanwhile (the kernel delivers a settlement to any idle world,
in a turn or not). Both forms are used below: the editor awaits a save inside its F2 turn (nothing else should
happen to the text meanwhile); the agent starts file operations from its 100 ms tick without awaiting them.

## 3. The textarea node

`lines` wraps text itself and has no cursor; `input` is one line. The editor needs neither behaviour: it
wraps text itself (it must know where each character lands to move the cursor) and needs a cursor and
highlights. So the compositor gains a node that draws exactly what it is given:

```js
ui.textarea(rows, { cursor: [row, col] | null, marks: [[row, col, len, color]], font: "s", lead: 2, grow: 1 })
// rows: [{ s: "text", color: "ink" | "accent" | "blue" | "muted" }]   already wrapped to the visible width
```

```text
draw textarea(n, x, y, w, h):
  for i, r in rows: text(x+4, y+2 + i*rowH, r.s, font, color(r.color))
  for [row, col, len, c] in marks: fill(x+4 + col*cw, y+1 + row*rowH, len*cw, rowH, tint(c)); redraw that text
  if cursor: fill(x+4 + col*cw, y+1 + row*rowH, 2, rowH, accent)
measure: height = rows.length * rowH (it grows to fill the column)
```

It also reports its width in columns through the layout: the editor needs to know how many columns a row has.
Rather than a round trip, the editor uses the font's fixed metrics (`gfx.fonts()` gives each font's cell size)
and the known content width.

## 4. The editor

### 4.1 Text model

```text
state:
  name           shown name (the file handle's path)
  file           the Handle (type fs, file: true) or null
  lines          array of strings, one per logical line, never containing "\n"
  row, col       cursor: logical line and column (in characters, counting astral characters as one)
  top            first visible display row
  dirty          changed since load or save
  find           { query, hits: [[line, col]], at }  or null
  mode           "edit" | "find" (typing goes to the query) | "preview"
  wraps          cache: number of display rows per logical line, recomputed for edited lines only
```

**Soft wrap.** A logical line longer than the width `W` (columns) is shown as several display rows, broken at
the last space before `W` or hard at `W`. The cursor's display position is found by walking the wrap of its
own line. Only the visible display rows are produced for `screen()`, so a 64 KB file costs the same per frame
as a short one; the per-line wrap counts are cached and updated for the lines an edit touched.

```text
displayPos(line, col):            # where the cursor is on screen
  r = sum(wraps[0..line-1])
  for seg in wrap(lines[line], W): if col <= seg.end (or last seg): return (r + seg.index, col - seg.start)
visible(top, H):                  # rows for screen()
  find line L and segment k such that the display row index == top
  emit segments forward until H rows
```

**Editing.** Characters insert at the cursor; Backspace joins with the previous line at column 0; Del joins
with the next at the end; Enter splits and keeps the line's leading spaces (and a list marker `- ` or `1. ` in
Markdown); Tab inserts two spaces. Up/Down move by display row and keep a goal column; PgUp/PgDn move by a
screen; Home/End go to the start/end of the display row.

**Limits.** 64 KB per file (the file layer's limit) and lines of at most 4,000 characters; typing beyond them
is refused with a status message.

### 4.2 Commands

| Key | Action |
|---|---|
| F2 | save (writes the whole text through the file handle; status shows bytes) |
| F3 | find: typing goes to the query, Enter jumps to the first hit after the cursor, Esc leaves |
| F4 | next hit (wraps around) |
| F5 | go to the top / bottom (toggles) |
| F6 | Markdown preview on/off |
| Esc | back to Files; with unsaved changes the first Esc warns and a second one discards |

### 4.3 Markdown

In edit mode each display row is coloured by its logical line: headings (`#`) in the accent colour, list items
and quotes in the normal ink with the marker muted, fenced code blocks (between ```` ``` ```` lines) blue. The
preview (F6) renders the text read-only with the existing nodes: headings as `text` in fonts `l`/`mb`, other
paragraphs as wrapped `text` in `s`, list items with a bullet, code blocks in a `lines` node with a tinted
background. It is a reading aid, not a full CommonMark renderer.

### 4.4 Opening, saving, persistence

```text
on "open" {file, name} (an ask from Files):
  if dirty: answer { ok: false, why: "unsaved changes" }        # Files tells the user
  text = await file.read()  (missing file -> "")                  # a new file: created by the first save
  lines = text.split("\n"); row = col = top = 0; dirty = false
  store.set("pos:" + name, ...) remembers the cursor per file; restore it
  answer { ok: true }
on F2: await file.write("", lines.join("\n")); dirty = false
```

The editor's own store record keeps the cursor position of recent files (at most 20 entries), not the text.

## 5. Files, and the open protocol

### 5.1 The browser

```text
state: path (relative, "" is the root), items [{name, dir, size}], sel, free, mode: browse | name-prompt | confirm
start: root = hw.fs("fs:/")   (claim "fs:/" in the manifest), list(path), info()
keys:  up/down select; Enter on a folder enters it, on a file opens it; Backspace or Left goes up;
       F2 new file (prompt), F3 new folder (prompt), F4 rename (prompt), F5 delete (confirm with F5 again)
```

### 5.2 Opening a file in the editor

```text
Files                                         Editor (no file claim)
  h = root.at(path, "rw")      # minter: Files
  r = await ask("editor", "open", {file: h, name: path})
                                 ───────────>   dirty? -> {ok:false}
                                                 text = await h.read(); show it
                                 <───────────   {ok:true}
  if r.ok:
     previous?.revoke()        # the handle the editor had before stops working
     previous = h
     send("compositor", "open", {app: "editor"})
  else: status "Editor has unsaved changes"; h.revoke()
```

The editor can use `h` for this one file only. It cannot pass it to another world: the handle has no grant
right and the editor did not narrow it. Revocation means a file handle never outlives the user's choice.

## 6. The agent's notes as files

Today notes are an array in the agent's store record: at most 8, 1,536 characters each, 3 KB in total. They
move to files:

- The agent's manifest entry gains the claim `fs:/notes`; at start it opens `hw.fs("fs:/notes")`.
- **Migration**: notes still in the record are written to `notes/<name>` (if no such file exists) and removed
  from the record once every write has succeeded.
- **Tools** keep their names and schemas: `list_notes` lists the directory, `read_note` reads a file (text
  clipped to 6,000 bytes for the model), `save_note` writes one after physical approval. The note text limit
  rises to 4,096 characters. Names keep the pattern `^[A-Za-z0-9][A-Za-z0-9 _.-]{0,31}$`, minus a trailing
  space, which is also a valid file name.
- File operations are promises. The agent's tick starts one and marks the tool busy; the result arrives in a
  later segment and becomes the tool's output, so no turn is held open and Esc still cancels.

```text
nextTool(call):
  read_note: s.toolBusy = true; dir.read(name).then(t => result({ok, name, text: clip(t)}), e => result({ok:false}))
  save_note: approval as before -> on F4: s.toolBusy = true; dir.write(name, text).then(ok -> "saved", err -> "failed")
tick: if s.toolBusy: return
```

## 7. Implementation plan

| Step | Work | Check |
|---|---|---|
| E1 | Compositor `textarea` node; `ui.textarea` in the prelude | a host script screenshot |
| E2 | `editor.js`: model, wrap, keys, save, find, Markdown colours and preview; Node unit tests of the model | `tests/editor.test.mjs` |
| E3 | `files.js`: browse, open protocol, new/mkdir/rename/delete; manifest and launcher entries | host script + captures |
| E4 | Agent notes as files: claim, migration, async tools; update `agent.test.mjs` and the integration tour | `make test-agent` |
| E5 | Device: open, edit, save, reboot, reopen; the agent saves a note that Files shows | P4 captures |

## 8. Tests

- `tests/editor.test.mjs` runs `editor.js` in a Node VM with a fake builder (as `chat-ui.test.mjs` does):
  insert, split and join lines; wrap and cursor positions at wrap boundaries; up/down with a goal column;
  find with wrap-around; Markdown colours; dirty tracking; refusing an open while dirty.
- `scripts/files.txt` (host): open Files, enter `notes`, open `todo.txt`, type, save, find, preview, back.
- The FS native tests already cover passing and revoking a handle between worlds.
- `make test-agent`: the agent's tests with a fake `hw.fs`, and the integration tour with notes in files.

## 9. API reference

```js
ui.textarea(rows, { cursor, marks, font, lead, grow })       // new node (section 3)
// editor messages
ask("editor", "open", { file: Handle, name: "notes/todo.txt" })  -> { ok: true } | { ok: false, why }
// files messages: none (it is driven by keys)
// agent tools (unchanged names): list_notes {}, read_note {name}, save_note {name, text}
```

## 10. File reference

| File | Role |
|---|---|
| `picocalc-os/js/system/compositor.js` | `textarea` measure and draw |
| `picocalc-os/js/prelude.js` | `ui.textarea` |
| `picocalc-os/js/apps/editor.js` | new: the editor |
| `picocalc-os/js/apps/files.js` | new: the file browser |
| `picocalc-os/js/apps/launcher.js` | entries and icons for Files and Editor |
| `picocalc-os/js/system.json` | `files` (claim `fs:/`), `editor`; `agent` gains `fs:/notes` |
| `picocalc-os/js/system/agent.js` | note tools on files, migration |
| `picocalc-os/tests/editor.test.mjs`, `tests/agent.test.mjs` | unit tests |
| `picocalc-os/scripts/files.txt` | host script and captures |
| `picocalc-os/port/esp32p4/main/fs_p4.c` | the `fs` worker's core and priority (section 11) |

## 11. As built and measured

The plan above was followed; this section records where the code differs from it and what the device measured.
Commits: `23fc2f7` (E1–E3), `42693d7` (E4), `8238911` (E5).

### Differences from the plan

| Topic | Planned | Built |
|---|---|---|
| Note names | `^[A-Za-z0-9][A-Za-z0-9 _.-]{0,31}$`, no trailing space | any name Files accepts: up to 64 characters, not ending in a space or a dot, because FAT drops a trailing dot (`a.` and `a` are one file on the device and two on the host). `nucleus/fs.c` refuses the trailing dot too |
| Tool arguments | unchanged (4,096 bytes) | 16,384 bytes (`AGENT_LIMIT.argumentBytes`); a 4,096-character note does not fit in 4,096 bytes |
| Approval review | unchanged | the chat holds 4,200 review rows; the agent refuses a note whose escaped review copy exceeds 12,000 characters before asking |
| Session record | notes removed | version 2; `notes` keeps only notes not yet moved, so a failed migration retries at the next start; a file of the same name wins |
| `save_note` approval | "Save note" | "Save" or "Replace", from a `stat` before the approval |
| Editor save | write, then clear `dirty` | explicit `saving` state: a second F2 waits, edits during the write keep the buffer dirty, Esc during the write leaves once it lands |
| Host `fs.info` | the host disk (statvfs) | the P4 partition's size (11,956 KB) less the root's files in 4 KB clusters, so captures are reproducible |
| P4 `fs` worker | core 0 | core 1 at priority 4, below the kernel (5) |

### The `fs` worker and flash writes

While ESP-IDF erases or writes flash it turns the flash cache off and parks the other CPU for the operation. With
the worker on core 0, a save could freeze a kernel turn running on core 1; on the device the compositor once
overran its 80 ms budget this way. On core 1 below the kernel, the worker runs only while the kernel task is
blocked between turns:

```text
core 1:  kernel turn | idle -> fs worker: erase (scheduler off) | kernel turn (starts late, runs whole) | ...
core 0:  bus workers, Wi-Fi, console, shot .......... parked during the erase ..........................
```

A flash operation can delay the next turn by one erase; it can no longer stretch a turn. Flash auto-suspend
would avoid the parking altogether but depends on the module's flash part and stays off.

### Measurements on the device (ESP32-P4, Wi-Fi up)

| What | Result |
|---|---|
| A save of a 54–66 byte file (temp file, sync, unlink, rename) | 520–611 ms (six saves) |
| The agent's `save_note` write | 333 ms |
| Mount after the first boot | 3 ms (PICOCALC-FS) |
| Lane load during editing | 10–17% |
| Turn-budget overruns in six saves with screenshots, after the fix | 0 |
| Notes moved from the old session record at first boot | 3 (`bike`, `shop`, `todo`) |

### Tests

| Suite | Result |
|---|---|
| `node tests/editor.test.mjs` | 10 pass |
| `node tests/agent.test.mjs` | 30 pass |
| `make test-agent` (unit, chat UI, compositor auth, integration with migration, native) | pass |
| `make test-fs` | 9 pass (two more bad paths: `dot.`, `space `) |
| `make shots` | captures `out/50-…` to `59-…` for Files and the editor |
