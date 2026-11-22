---
Title: Opening and searching a document across typed Editor turns
Ticket: PICOCALC-EDITOR-ASYNC
Status: active
Topics:
    - picocalc
    - editor
    - native
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://apps/typed/editor/document-view.typed
      Note: Frame rendering and Open reply
    - Path: repo://apps/typed/editor/editor.typed
      Note: Open task and world handler
    - Path: repo://apps/typed/editor/find.typed
      Note: Search ranges and result presentation
    - Path: repo://apps/typed/editor/positions.typed
      Note: Persistent cursor coordinate conversion
ExternalSources: []
Summary: Carry the complete Editor Open and Find workflows in generated typed continuations while preserving behavior on both targets.
LastUpdated: 2026-11-19T23:31:00.175982188-05:00
WhatFor: Implement and review the Editor migrations for language and continuation scopes E6, E7, G3, and G4.
WhenToUse: Before changing the Editor app or reproducing its continuation qualification.
---
# Opening and searching a document across typed Editor turns

Files sends Editor an Open request with a handle granting access to one file. Editor starts a read and returns control to the kernel. Later the kernel delivers a settlement, an event carrying the token returned by the read, a success flag and the result. Editor must finish preparing the document and publish its first screen before it reports success to Files. While a large file is being prepared, the same turn can return and resume several more times.

A typed `await` tells the compiler where this function can return to the kernel. The compiler assigns a program counter to the point after the wait and saves the local values the rest of the function can still read. On a matching settlement it loads those values and continues. The program counter, the current token and the saved values occupy fields appended to Editor's state record. The reactor supplies the current event, output and hint buffers each turn.

## Keep file ownership in the Open task

At revision `289281c`, `editorOpen` validates the request, saves the offered grant and title length, and starts the read. `editorReadDone` interprets its result. Four more functions split up conversion of line endings because each zero-delay timer can run only one slice. The task owns the grant from the successful request check through its terminal branch. Slot 2 holds the pending title in units 0 through 94 and its count in unit 95.

A successful read first remembers the previous document's position, while that document is still in slot 0. Reading the new text then overwrites slot 0. An absent file opens as an empty document. Any other filesystem error releases the offered grant and replies with the read error. An immediate negative token is distinguishable from a later failed settlement by the event kind. It releases the grant and replies with the existing startup error.

For long files, keep the initial yield before normalization and the yields between subsequent slices. Each slice examines up to 4,096 UTF-16 code units. A CRLF pair whose CR lies at the slice boundary consumes its LF in the same slice, leaving exactly one LF. The loop writes in place because the destination never advances beyond the source. Reacquire the document buffer inside each slice because a buffer alias cannot survive a wait. The title remains in slot 2 until it is copied to the active name slot. Suppress key input and rendering during preparation so they cannot read a partial document or overwrite the pending title.

After preparation, install the grant, capture the clean snapshot and reset cursor and view state. Large documents keep the existing first-frame delay. `editorShow` sends the Open reply after calling `typedSdkScreen`. The compiler owns the waiting token, while an application `opening` flag describes who can use the shared document and name buffers.

## Describe the four search ranges in document coordinates

Find visits the cursor line suffix, later lines, earlier lines, and the cursor line prefix. It then reaches either Found or NotFound. The intermediate language migration assigns those six names in a `FindPhase` enumeration and uses exhaustive `match` to decide whether searching can continue. The position migration gives persisted columns type `Point` and passes `Unit` offsets through explicit zero-cost conversions at the text SDK. An astral character represents one code point and occupies two UTF-16 code units, so these types protect a real distinction within a single cursor position.

The search task keeps the existing ASCII case-insensitive candidate filter and the special handling of U+0130 and U+212A. U+0130 contributes two units to the folded coordinate while consuming one UTF-16 input unit. A saved folded offset therefore measures a different quantity from the saved scan offset. Store both as absolute positions in the document. At a line start both begin at the line start. After a candidate, the input position advances by one and the folded position advances by one or two.

Save five scalar locals across the 1,024-work-unit yield: the current phase, the scan position, the folded position, the line end and the search anchor. The anchor is the original cursor position, advanced within the same line for Find Next. The prefix ends when the folded position reaches that anchor, while a match beginning before the anchor may extend beyond it. When the search wraps, a line whose physical end is at or beyond the anchor is the original line. This allows the search to find the prefix without retaining a second origin offset or rescanning the active line after a timer. On a match, clamp the folded position to the physical line end and avoid placing the cursor between surrogate halves.

Each task has one frame. An accepted Open cancels any Find before it can overwrite the document, and a new search cancels the previous search before it starts. Cancellation removes the waiting state so the old timer cannot advance the new search or draw a frame. A running Find delays rendering while its frame is pending. Its terminal settlement triggers the same display function that a search completed entirely inside a key handler uses.

## Implementation and qualification

| Checkpoint | Review and evidence |
| --- | --- |
| Distinct positions | Compare Wasm bytes and RV32 instructions against the same source without Unit and Point. Run the position replay, which restores a coordinate alongside a surrogate pair. |
| FindPhase | Keep the six phases visible in the typed source. Compare the emitted RV32 instruction count and run the find, dense search and tail search workflows. |
| Open | Preserve the observed startup, missing-file, permission-error and long-load event sequences. Inject an edit while 64 KiB normalization is pending, finish Open and compare the next saved snapshot with the expected normalized input. |
| Find | Compare a second Open during a pending Find with the same Open without Find. Deliver the stale timer before and after the second Open settles. Compare replies, grant releases and frames. |
| Complete app | Run the 13 Editor workflows and the 24-workflow cross-app suite, then collect paired device evidence for both execution engines. |

The existing host workflows use the real host kernel for Wasm and the real RV32 reactor under the RISC-V emulator. The targeted tests send events directly to both compiled reactors. In ordinary kernel operation a second mailbox message waits behind the pending asynchronous turn. The injected edit and replacement Open test what the app does if these events reach it before a settlement, including its behavior on stale and duplicate settlements.

The hand-written state has 71 fields. Open removes seven and adds one flag, two control fields and four saved scalars. Its pending title moves one count from a scalar field into the existing title buffer. Find removes eight and adds two control fields and five saved scalars, with pending status supplied by the compiler. The combined prediction is 70 fields. Count fields from compiled state records after each change.

[Language additions](../../PICOCALC-NATIVE-NEXT--a-smaller-rv32-backend-a-module-cache-safety-checks-and-await-for-typed-picocalc-worlds/design-doc/05-scope-e-language-additions.md) · [Production await scope](../../PICOCALC-NATIVE-NEXT--a-smaller-rv32-backend-a-module-cache-safety-checks-and-await-for-typed-picocalc-worlds/design-doc/07-scope-g-await-compiled-to-start-and-resume-state-machines.md) · [One-read pilot](../../PICOCALC-EDITOR-AWAIT--compile-editor-open-through-a-real-typed-await-and-native-resumption/design-doc/01-compiling-a-typed-editor-open-into-a-start-and-a-native-continuation.md)
