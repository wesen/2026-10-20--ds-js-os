---
Title: Catalog migration and Files implementation guide
Ticket: PICOCALC-TYPED-APPS
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/files.js
      Note: Observable Files behavior
    - Path: repo://picocalc-os/js/system.json
      Note: Shipped app inventory
    - Path: repo://picocalc-os/nucleus/fs.c
      Note: Capability-checked filesystem work
    - Path: repo://picocalc-os/worlds/agenda/compile.js
      Note: Existing typed ABI
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T23:03:47.914151766-05:00
WhatFor: ""
WhenToUse: ""
---

# Catalog migration and Files implementation guide

The PicoCalc manifest registers named worlds for hardware drivers, shared services, and applications. This migration covers all 15 shipped entries backed by `picocalc-os/js/apps/` in `picocalc-os/js/system.json`. QuickJS still provides the runtime for unported worlds. Some apps already have native CJI builds. Those builds remain useful as comparisons, and each catalog entry needs evidence from the typed compiler to count toward this ticket. Agenda supplies the existing example of a typed program linked to a shared reactor and executed on Wasm and RV32.

## Identify each workflow before replacing it

| App | Work to preserve and exercise |
| --- | --- |
| Agenda | Task display, reminders, stored edits, calendar prompts, diagnostics, and Editor handoff. The existing typed implementation is the starting evidence. |
| Files | Directory navigation, selection restoration, scrolling, creation, rename, confirmed deletion, and handing Editor one file. |
| Editor | Text and Markdown editing, cursor and selection behavior as implemented, search, preview, save and file capability ownership. |
| Launcher | App discovery, focus transitions, shortcut dispatch, and presentation metadata. |
| Settings | Wi-Fi scanning and joining, zone changes, and the exact permission boundary for administration. |
| Logs | Cursor-based log reads, filtering and display. |
| System monitor | World and resource reporting. |
| About | System details and app presentation. |
| Keys | Read-only display of key events under its current claim. |
| Snake | Movement, collisions, scoring and timer behavior. |
| Chat | Messaging, turn and status handling, and the agent boundary. |
| Calculator | Expression evaluation, history, plotting, scientific functions and help. |
| REPL | User input and interaction with the existing sandbox world. |
| Loader | Storage app discovery and lifecycle, with the generated Hello example as part of that workflow. |
| Faults | The existing controlled fault demonstrations and system administration requests. |

Read each original app and its tests before defining parity. The catalog excludes the separate keyboard, display, and power drivers and the compositor, agent, sandbox, and flaky fixture services. Apps that call those worlds keep exercising the existing interfaces. User-installed apps retain their existing loader path. The catalog boundary does not remove any app or capability from the shipped configuration.

## Follow Files from a key to the device

Files is a good next port because Agenda already exercised the `nw_fs_at` and `nw_ask_file` APIs. Files owns the directory capability `fs:/`. Editor receives a single child capability for the selected file. The kernel checks that the sending world holds the handle, the path is inside the directory and the requested operation has the required rights. The filesystem worker returns a settlement with the original token. A reactor consumes only the settlement belonging to its pending operation. Returning focus to Files triggers a fresh list and restores the selected entry by name when it still exists.

```mermaid
flowchart LR
    K[Compositor key] --> R[Files reactor]
    R --> P[Typed Files policy]
    P --> R
    R --> S[Native SDK calls]
    S --> F[Checked filesystem worker]
    S --> E[Editor single-file grant]
    F --> R
    R --> V[Files view]
```

The typed source owns input validation, selection and command rules. The reactor owns capability handles, asynchronous operations, JSON conversion, and the UI transport. Text crosses the typed ABI as a length followed by UTF-16 code units. Directory listing and filenames arrive as UTF-8 in JSON from the worker. Preserve the original directory-first order and compare names in UTF-16 order when the filesystem order is insufficient. A bounded renderer can use the existing compositor list window, while the selection model retains all entries returned by the filesystem. Avoid substituting a direct file syscall or sending a root handle to Editor.

```text
on compositor key:
    ask typed policy for action using key, selection and modal state
    if action changes the selection, update the view
    if action needs a normalized name, validate it using typed policy
    if action requests I/O, record the returned token

on matching settlement:
    apply the list result or keep the error message
    if Editor accepted the file, revoke the previous grant and open Editor
    otherwise revoke the attempted grant and retain the previous one
```

Open a file with Enter and a directory with Enter or Right. Backspace and Left go to the parent. F2 opens a new file through Editor. F3 creates a folder. F4 renames the selected entry. F5 requires two presses on the same selection and disarms on intervening input. Filenames accepted from the prompt have 1–64 characters after trimming, use the exact ASCII character class in the original app, and reject trailing spaces or dots after normalization. Existing directory entries may have names outside that input class and still need to open and navigate correctly.

## Build, verify, and commit in app-sized steps

Start at `picocalc-os/js/apps/files.js` and `picocalc-os/tests/sysapps.test.mjs`. Consult `worlds/agenda/compile.js` for checked signatures and slot binding, `sdk/nw.h` and `nucleus/native.c` for public world calls, and `nucleus/fs.c` for worker operations and permissions. Add the smallest SDK surface required by each app, and exercise authorization with the original claims. Keep caller-visible results and custody of transferred handles the same. For new shared compiler features, include the program that requires the feature and check output on both backends.

First compare pure behavior against the original JavaScript. Then load the actual compiled Wasm module through the manifest and drive realistic UI actions. Repeat representative cases with the generated RV32 code and on the target device. A linked ELF size or successful standalone parser call alone cannot qualify an app. Record the manifest entry, actual backend, fixtures, behavioral evidence, and any separately pending device checks. Commit an app when its implementation reaches a coherent checkpoint and preserve commands and decisions in the diary. Keep the remaining apps listed until their corresponding integration checks pass.
