---
Title: Implementation diary
Ticket: PICOCALC-CJI-PORT
Status: active
Topics:
    - picocalc
    - native
    - esp32-p4
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T20:08:57.470855748-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1. Build and exercise the shared unit

I moved the common JavaScript prelude into the firmware and selected Snake and Flaky in a derived copy of the shipping manifest. Both ran on the physical board with their existing names, quotas and claims.

### Prompt context

> Ok, create a ticket to do 1 . 2. 3. Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
> Document is detaied, design is on point.
>
> implement, and commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

The numbered stages refer to Snake, shared-world packaging and workflow migration. I kept separate tasks for each workflow so the hardware demonstration cannot accidentally close the entire port.

### What I did

Generated one ilp32f unit.o and its export list, included that same object in the resolver and final link, built per-world ELF modules and compared the physical Snake game with a pre-flash QuickJS capture. Published the intern guide to /ai/2026/11/17/PICOCALC-CJI-PORT. The uploader returned OK: uploaded.

### Why

Each world's identity and claims must stay attached to the same manifest record. Reusing the original source records avoids drift and supplies a control build.

### What worked

The P4 showed Snake as native with 113.2 KiB charged, versus 230.9 KiB observed for QuickJS. Flaky used 48.3 KiB. Its replies were pong 1, pong 2 after Snake's restart, and pong 1 after its own restart. Both game captures show the same score, food, GAME OVER dialog and four-cell body. The physical write completed with the serial interface present.

### What didn't work

The two physical captures differ in the status clock and the horizontal position of the snake by one cell. UART key scheduling against a live 110 ms timer makes the steering tick nondeterministic. These captures establish visual behavior but do not establish byte-for-byte frame equality.

### What I learned

The firmware holds one 189,390-byte block of prelude code. A module's file size and its total world memory answer different questions. toplog shrank from 199,616 to 3,680 loaded bytes while retaining its own heap and root stack.

### What was tricky to build

Both components need the same unit generation. The build declares the generated object and export list as outputs and establishes an explicit target dependency before assembling individual worlds.

### What warrants a second pair of eyes

Check CMake regeneration on source edits, world budgets under autopilot, and the physical behavior of asynchronous I2C before migrating both input drivers.

### What should be done in the future

Follow the open tasks in order of their capability dependencies and record workflow acceptance separately.

### Code review instructions

Start with the optional component CMake file, then the main component's manifest generation and module loop. Inspect the two PNG files in various and the imported Snake fixture.

### Technical details

The first mixed candidate was 0x2eb400 bytes. Flaky's counter test used kernel restart commands and ordinary REPL asks. These exercise the native loader and its state across independently scheduled worlds.

## Step 2. Move keyboard, power and Settings onto the native path

After the first checkpoint (58e27b9) I checked bus units, extended the kernel operations for Settings and ran the applications on the handheld. The driver asks and screenshots exercised the real firmware message path.

### Prompt context

See Step 1. I treated clock and network configuration as privileged device operations and reused the existing claim, validation and port functions.

### What I did

Converted the I2C read gap from milliseconds in the JS API to microseconds in the native ABI. Selected keyboard and power in the manifest. Added claim-checked network operations and wall-clock/time-zone bindings, rebuilt prelude exports and selected Settings. Captured the original time zone before changing it through the actual Settings UI.

### Why

Keyboard and power share the same chip and must keep the bus locked across the write, delay and read. A factor of a thousand matters even if an emulator fixture answers immediately.

### What worked

Physical driver stats showed 1,081 keyboard polls and 104 events, with zero keyboard or power errors. The sandbox's unauthorized backlight request returned null. The native Settings menu changed Eastern to Atlantic and back to Eastern, verified with the firmware console. A repeated Snake capture matched the QuickJS frame pixel for pixel below the status bar after shifting the injected steering key by one tick. One traced input took 35.642 ms from compositor receipt to Snake dispatch and 7.623 ms inside its machine-code key handler. These are traced inputs, not a measurement of LCD scanout. A framebuffer capture after compositor restart verified the retained power indicator.

### What didn't work

Two short screenshot runs ended during framebuffer transmission. I repeated the capture with extra time for the serial transfer. The original physical Snake trace also had one cell of steering jitter, resolved by comparing the same game state.

### What I learned

Sharing the prelude changes the cost per additional world. A complete future image still needs a flash budget. Even before adding capability code, agent.elf alone was approximately 726 KiB.

### What was tricky to build

Clock.wall needs a distinct unset sentinel and the OS's current time zone. The device runtime consults the kernel for Date.now while the host and emulator retain their existing virtual clock behavior. Scan results may exceed the small string buffer used for most syscall replies.

### What warrants a second pair of eyes

The remaining file and framebuffer workflows cross the native ABI's explicit prohibition on passing handles. I requested the interface-scope decision required by the repository instructions. A JSON string containing an integer must never grant authority by itself.

### What should be done in the future

Verify the chosen transfer design against both positive delegation and negative ownership tests. Qualify agent cancellation with deterministic transport.

### Code review instructions

Compare the keyboard and power source to NW_I2C in nucleus/native.c. Inspect the new native claim checks against the QuickJS bindings in vm.c. See various/hardware-checks.txt for serial evidence.

### Technical details

The installed Settings image took 0x323820 bytes. Filesystem, system, clock and agent host regression targets were also run; the host agent tests skip cases requiring a live transport configuration.

The shared-unit emulator gate also ran with UNITS=1 MULTI=1. Four worlds matched their traces, a fifth exhausted its own 320 KiB budget after three asks, and the negative control that omits the state swap produced wrong output for three of four worlds. The physical image preserved both the original time zone and network credentials.

## Step 3. Pass checked capabilities between QuickJS and bundled CJI worlds

The question about QuickJS led me to trace a real delegated resource through both engines. QuickJS already sends the kernel a list of handles along with its JSON. The ordinary native API explicitly rejects the same marker. I added a firmware-selected CJI path at the existing message boundary and used a physical framebuffer handle to exercise it.

### Prompt context

> why are the quickjs fine?

> yes, do it

I interpreted the approval as applying to the proposed scope of firmware-bundled CJI worlds. The implementation shares the delegation check with QuickJS.

### What I did

- Generated the list of eligible ELF paths from the P4 build lists. The loader enables transfers per native instance.
- Extended the bounded native JSON parser to recognize a complete, single-key marker and collect up to eight distinct IDs. Each ID undergoes ownership, revocation and delegation checks before enqueue.
- Added wrapper encoding and receiver-side metadata lookup to the shared prelude. An invalid CJI reply now rejects the ask.
- Added an opt-in two-world board test. The normal manifest excludes the fixture's DMA claim and both worlds.
- Extended the design guide with the wire representation, pseudocode, API/file map and board test instructions.

### Why

Files must delegate a child file capability to Editor. A framebuffer needs similar delegation before the display world can consume it. Both already use the nucleus message and delivery structures. Extending the checks there preserves the scheduler's delivery order and rights model.

### What worked

The first diagnostic boot exercised QuickJS minting a DMA handle, CJI receiving it inside an array and returning a wrapped handle. The kernel rejected the unknown ID, the attempted return of a read-only child by a non-minter, and a retained publication. A CJI-initiated ask also returned a usable wrapper.

### What didn't work

The first fixture reported false for send and publish. The sender awaited several replies in its startup turn. The kernel granted the handle when each message entered its mailbox, then the startup turn explicitly released the handle before either queued handler could inspect it. I changed the fixture to release its original handle before the compiled peer sends back a fresh grant. The first sandboxed host process run also reported errors. The native suite passed with its process sandbox available on the host.

### What I learned

Delivery and execution are separate events. The holder set has a bit per world. Delivering a handle already held by a recipient does not create a second reference for that world. This matters when an async handler releases a handle while other messages are queued.

### What was tricky to build

The filesystem and future framebuffer wrappers must survive a trip across engines as a marker nested in an application value. The compiled subset lacks a JSON replacer. Serialization therefore translates wrapper objects at message boundaries, and the kernel extracts the ID independently. A world which has never created or received a handle keeps its original serialization fast path.

### What warrants a second pair of eyes

Review the JSON parser's singleton-object rule and its overflow and unique-ID limits. Compare a plain integer to a marker and follow the separate paths for message grants, reply grants and retained messages.

### What should be done in the future

Wire the file operations and deferred worker completion into CJI before promoting Files or Editor. Implement framebuffer/SPI operations before promoting display. The grant test establishes cross-engine transfer and ownership, while each workflow still needs its own acceptance test.

### Code review instructions

Start with the two worlds under picocalc-os/tests/fixtures/cji-grants. Trace NW_SEND and NW_REPLY in nucleus/native.c through handle_may_grant in hw.c and delivery in kernel.c. Check the P4 loader's generated allowlist against the module packaging loop. Verify that the normal manifest excludes both test names.

### Technical details

The host command was make -C picocalc-os -j4 test-native test-fs test-sys. It passed all four Python suites (34 native, 20, 9 and 6 additional cases). The board used a monitored application-only write at 0x10000. The diagnostic flag is PICOCALC_TEST_CJI_GRANTS. Test output is intentionally limited to labels, booleans and error classifications.

The corrected diagnostic run produced the following serial evidence on the P4. Times are milliseconds on the board's kernel clock.

```text
[  2176.212] grant-test: CJI GRANT roundtrip ok
[  2200.013] grant-test: CJI GRANT denials ok
[  2213.881] grant-test: CJI GRANT send true
[  2223.058] grant-peer: CJI GRANT ask true
[  2229.536] grant-test: CJI GRANT publish true
```

Commit b2c196a contains the implementation and board fixtures. The uploader reported success for “PICOCALC-CJI-PORT - Porting workflows with checked handles.pdf” in the original ticket folder. I used a new document title to preserve any annotations on the first copy.

During the board check the user asked “what;s nat-import btw?” I traced the world to the separate system.elf.json manifest and natives/wimport.c. The loader deliberately refuses its unresolved path_open import during relocation. Its five startup failures were independent of the grant probe.

The normal application was rebuilt with the fixture flag off (0x326280 bytes, 21% of the app partition free). The application-only write verified its hash. The physical console then listed 27 worlds, no grant-test or grant-peer, and idle keyboard, power, settings, snake, flaky and toplog worlds with zero restarts. The diagnostic nat-import world was stopped as expected.

## Step 4. Connect native filesystem handles to the existing worker

I traced Files opening a new note, Editor saving it and Agent writing under its notes directory. All three need the same handle-relative filesystem operations. I moved the shared validation and deferred job construction into the filesystem layer, then connected both the QuickJS bindings and the compiled prelude to it.

### Prompt Context

**User prompt (verbatim)** “build phase 3 in its entirety. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”

The requested endpoint includes Files/Editor, compositor/display, Settings/Agent and their device acceptance checks. This checkpoint implements the file calls and produces the first two application modules for physical testing.

### What I did

- Extracted fs_open_claim, fs_at, fs_prepare and fs_defer from the QuickJS bridge into nucleus/fs.c.
- Added firmware-private open, derive, operate and revoke calls. The prelude exposes these as ordinary methods on a file or directory wrapper and obtains the path and file flag from the kernel.
- Enabled files and editor in the CJI build manifest while preserving their existing claims and sources.

### Why

Filesystem rights and path containment belong to the nucleus. The worker, the file byte limit, the atomic write implementation and the owner epoch for late completions already exist.

### What worked

The host command make -C picocalc-os -j4 test-fs passed all nine cases, including the restarted-world, delegation, containment and file-size cases. The ESP-IDF build produced a firmware image containing the Files and Editor modules.

### What didn't work

The first idf.py -B build-elf build failed at native.c with “format '%d' expects argument of type 'int', but argument 3 has type 'int32_t' {aka 'long int'}”. Casting the ID to the kernel's int type fixed the target build.

### What I learned

A file handle uses an empty relative path for reads and writes. A directory handle uses its own path as a prefix. Only write and append accept embedded zero bytes as data. The length-aware kernel boundary keeps those bytes distinct from path terminators.

### What was tricky to build

The worker accepts a promise token whose representation belongs to the requesting engine. Each bridge creates that token only after fs_prepare validates the job. fs_defer then captures the owning world ID and epoch for the worker.

### What warrants a second pair of eyes

Check full-size UTF-8 text, rejection of malformed relative paths and a revoked child in the native receiver. Watch the Editor's memory usage with the full compiled module loaded.

### What should be done in the future

Verify the note on flash after a reboot, then exercise repaint and agent cancellation against the complete mixed runtime on the board.

### Code review instructions

Start with fs_prepare in nucleus/fs.c. Follow ka_fs in vm.c and the corresponding native file operation in native.c down to fs_defer. Compare the wrapper in src/world-native.js against js/prelude.js.

### Technical details

The file transfer limit remains 65,536 bytes. File data stays in an owned worker job until submission. Reading and listing return JSON through normal promise settlements.
