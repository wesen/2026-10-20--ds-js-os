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

## Step 5. Fit the compiled modules into the existing flash layout

Commit 2fe06a1 put Files and Editor on the native path. Their first uncompressed image used 0x3941a0 bytes of the 4 MiB application partition. I compressed the immutable CJI ELF files at bundle time. The loader still receives their original ELF contents and byte length.

### Prompt Context

See step 4. The complete workflow set must fit the installed board.

### What I did

- Added a deterministic zlib packing step for each compiled ELF.
- Used the P4 ROM decompressor when copying a packed module from the firmware bundle.
- Installed the packed image and exercised Files and Editor through the keyboard event path.

### Why

Keeping the partition table avoids moving the user's filesystem and NVS configuration. Flash compression saves space without changing load-time memory accounting.

### What worked

The packed image used 0x2fd500 bytes, leaving 25% of the application partition free. After a monitored application-only flash, Files opened a new p3-checkpoint.txt through Editor. Typing “Native note 73” and pressing F2 produced those exact bytes in the physical console's cat output. Both worlds were idle with no last error. The board reported 227.4 KiB for Files and 275.9 KiB for Editor. I captured the editor framebuffer before changing the compositor.

### What didn't work

No packing or decompression errors were observed. The original uncompressed layout left just 11% free before adding the compositor and Agent.

### What I learned

The ELF file lengths remain the loader's input for memory checks. The lengths used by the generated flash table can instead describe compressed data. The two quantities have different lifetimes.

### What was tricky to build

The trailing NUL appended by the bundle generator is outside the compressed byte count. The unpacker allocates space for the original image and its trailing NUL, requires the exact decompressed length, and then publishes that original length.

### What warrants a second pair of eyes

Review the trusted-bundle-only path and compare the packed file's original size against the loose module. The regular source and manifest entries continue through the plain copy path.

### What should be done in the future

Measure final image and heap sizes after all phase 3 modules are present.

### Code review instructions

Read pack_elf.py, the native module build loop in main/CMakeLists.txt and port_read_file in port_p4.c. Rebuild with the optional ELF configuration. Boot the physical image and check the engine and memory fields in worlds.

### Technical details

The packed entry starts with CJIZ, then the original 32-bit little-endian length and a zlib stream. The ROM helper verifies the stream during expansion. Partition layout and the SDK ELF relocation routines are unchanged.

## Step 6. Run the full graphics and Agent workflows in compiled worlds

The P4 now builds the application logic for compositor, display and Agent from their shipping JS sources. The compositor and display use the existing graphics and SPI functions, and the QuickJS and compiled Agent call the same request lifecycle. I used opt-in diagnostic worlds to exercise real capabilities without giving the test access to a provider or the user's conversation record.

### Prompt Context

See step 4. The preceding firmware storage checkpoint was 07def4d. The remaining implementation needed observable rendering, cancellation and resource-lifetime behavior.

### What I did

- Added native framebuffer drawing, dirty rectangle commit, font metrics, SPI command and pixel transfer, handle attenuation, system enumeration, store status and model transport operations.
- Extracted request ownership and cancellation into nucleus/agent_transport.c. Both bridges capture the same world ID, epoch and monotonically increasing request ticket.
- Promoted the existing compositor, display and Agent modules in the P4 manifest. The fixture gives the same compiled Agent the name agent-probe so it reads a separate store key. A test Chat world drives its normal message API.
- Tested the compositor using a QuickJS-rendered reference and three P4 captures. Tested the Agent against an intentionally delayed local transport, including a real device_status tool continuation.

### Why

Separate modules need to share the kernel's front-buffer pin while queued SPI requests finish. Likewise the Agent service needs the kernel's request lifetime across many scheduled turns. Treating the first completed promise as the end of an async draw can leave the front buffer invalidated even though its world appears idle.

### What worked

Three native captures matched the QuickJS compositor reference exactly over the 320-by-298-pixel application and hints area, including after separate display and compositor restarts. The full native screenshots had the same CRC 65031729. Native Editor reopened the previously saved file after the new image booted. The isolated filesystem probe rejected an unclaimed root, an escaping relative path and a revoked file read.

The first corrected Agent fixture run reported start 1, cancel 1, start 2, late completion 1 while polling 2, start 3 for the device_status continuation, and replacement true. A second run also passed. Tracing measured 30.135 and 33.441 ms for its two submit turns after speeding up the compiled regex scan. The host application, clock, filesystem, system, native and Agent suites passed. The local TLS suite ran all 23 cases. The shared-unit RV32 emulator gate passed four worlds, isolated an out-of-memory fifth, and produced its expected failing state-sharing control.

### What didn't work

- The first compiled preview had inverted colors. The RGB values were exact complements. gfx_invalidate intentionally stores the complement in the front buffer, so I traced the flush promise. The original compiled prelude returned DONE on the first settlement while the async handler was still waiting on other jobs. Keeping the turn open until its outer promise resolves fixed the rendering.
- Kernel lifecycle messages use a null sender in the application API. The native wire uses an empty string. Normalizing it at the prelude boundary fixed the compositor's authenticated restart handler.
- The initial fixture reported “agent-probe crashed handling agent.submit: ran past its turn budget of 100 ms”. Its ASCII classification regex allocated capture state at every character position. A single-range scan now avoids that work. The original turn budget is preserved.
- The first mock success response lacked the required status and message role. The real Agent correctly reported “Provider returned an invalid or failed response.” I corrected the fixture and verified that its continuation actually contained results from the board.
- One diagnostic boot exceeded the compositor's 80 ms draw allowance. Packing four coordinates directly in the runtime and reusing gfx_color removes repeated short string construction and color parsing from each primitive. The latest device run checks this change and the final DMA and transport probes.

### What I learned

A screenshot's color difference can identify a protocol failure. Every inverted pixel pointed to a specific assignment in gfx_invalidate. A healthy-looking world listing could not prove that the display had accepted the flush.

### What was tricky to build

A 65,536-byte model response exceeds the ordinary native reply buffer. The kernel returns bounded metadata, retains the completed body for this world and transfers it synchronously through a separately sized buffer in the same turn. Disposal frees any unconsumed body. The raw document is converted to a JS string once, without escaping it inside a larger JSON envelope.

### What warrants a second pair of eyes

Review callback ownership in agent_poll and the CJI poll/body sequence. Inspect the optional diagnostic link wrappers separately from production drivers. The hardware stress probe intentionally drops its own framebuffer handle between SPI submission and completion.

### What should be done in the future

Finish the release-image boot audit with test fixtures disabled. Compare screenshots again after the coordinate optimization and check the boundary and DMA probes.

### Code review instructions

Trace compositor.js attach/draw into world-native.js, cji_graphics and bus_p4.c. Trace agent.js startRequest through agent_transport.c. Read tests/fixtures/cji-phase3 to see the exact stale-result and permission cases.

### Technical details

The reference images are under various/editor-quickjs-compositor.png and various/editor-cji-compositor.png. Capture dimensions are 640 by 640 at two host pixels per device pixel. Comparisons exclude the top 44 host rows because the status clock advances. The hardware test for provider replacement uses an isolated world name and a local fixture with no external account.

## Step 7. Restore a saved Agent conversation within the P4 turn budget

The fixture exercised submissions and cancellation. The normal image added a different workload when Agent opened the conversation already saved on the physical device.

### Prompt Context

The user asked “the quickjs agent is fast enough, but not the compiled one?” Earlier QuickJS firmware restored the conversation and remained idle. We had no paired QuickJS timing trace. I measured the compiled startup directly before and after changing it.

### What I did

- Timed native startup, removed a redundant JSON round trip in the compiled store wrapper and built display entries in one pass from validated history.
- Added cooperative scheduling points during restoration. Chat receives state after startup has restored the saved record.
- Added a 12-entry UTF-8 history regression and flashed only the application partition. Collected timings and world state without recording conversation contents.

### Why

The scheduler budgets each uninterrupted turn. Decoding the record, validating its bounds, rebuilding display history and publishing the snapshot had all run together. Each stage has a natural boundary where the scheduler can run another world.

### What worked

The final release boot showed Agent and Chat idle with zero restarts. Two deliberate Agent restarts produced four startup turns each. Their durations in milliseconds were 22.100, 55.087, 19.417, 10.839 and 20.027, 58.508, 20.424, 11.294. Chat received Agent state. Both buses reported zero errors. The 31 Agent unit cases, combined host gate and shared-unit emulator gate passed.

### What didn't work

Before the fix, five startup turns took 147.065–159.763 ms each under a 100 ms budget. Removing the extra copying alone brought one warm restart down to 96.300 ms but cold retries persisted.

### What I learned

A short submit turn says little about startup with existing data. Counting unexpected restarts on a normal boot catches failures that isolated fixtures miss.

### What was tricky to build

The persisted record and published display have different size limits. Validation bounds history before the one-pass conversion. Text clipping can only shorten each restored entry. A missing key still returns an independent copy of its caller-provided default.

### What warrants a second pair of eyes

Review initialize in agent.js together with its async test harness. Check where each sleep resumes and where Chat gets the first restored snapshot.

### What should be done in the future

A paired QuickJS and native timing study would be appropriate if selecting engines on performance grounds. This verification covers the shipping workload and the board's existing conversation.

### Code review instructions

Compare the compiled store wrapper with the per-read record parser, then follow validHistory through initialize into publish. Run make -C picocalc-os test-agent. Prior checkpoint 5c00850 contains the graphics, transport and diagnostic changes.

### Technical details

The final fixture-disabled P4 application SHA-256 was 2e3130435cff840b6280c3a5bbda5accf554a332ef498082b89bf6d6911d153e. The transport suite used local TLS and diagnostic responses. No paid provider request was needed.

Release checkpoint e6dee4e contains the Agent changes and regression. All six ticket tasks are checked and docmgr doctor passed. Remarquee confirmed upload of “PICOCALC-CJI-PORT - Phase 3 hardware implementation.pdf” to /ai/2026/11/17/PICOCALC-CJI-PORT. The board retains the diagnostic note p3-checkpoint.txt used to verify Editor persistence.

## Step 8. Trace the self-hosted compiler and define hardware acceptance

I followed the compiler input from the host CMake recipe into the emulator firmware and the real ELF loader. The new guide gives the intern one example to follow across the entire port. The existing Phase 3 ticket now includes three implementation tasks.

### Prompt Context

User prompt (verbatim):

> ok, create a design doc for phase 4 + 5 + 6. Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
>
> The document is detailed, but the design is simple streamlined composable on point, no bullshit.
>
> implement the ticket and commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

The deliverables now include working firmware in addition to the design and delivery.

### What I did

- Read the stage-1 build rules, board compiler, assembler, production loader, kernel spawn and P4 firmware layout.
- Restored tools/bundle.mjs and tools/jstok.mjs from the original Downloads archive and started the native stage-1 bootstrap.
- Added the design guide and reopened the implementation checklist. Verified the serial device exists outside the sandbox.

### Why

The emulator already tests compiler output against the host. The earlier import built shipping worlds using stage 0 and omitted the bundler required for stage 1.

### What worked

The corrected stage-1 target generated the bundled JS and entered frontend compilation. The source import is limited to two build tools.

### What didn't work

The command make build/rv32/stage1/stage1-rv32.o reported “No rule to make target”. The named make target is stage1-ilp32.o. That target initially reported “No rule to make target 'tools/bundle.mjs'”. Restoring only the bundler produced ERR_MODULE_NOT_FOUND for tools/jstok.mjs. Restoring its tokenizer allowed bundling to finish.

### What I learned

The production loader receives the same class of ELF module as the emulator. Its ABI checks, allocator, symbol resolver and real-world lifecycle are separate verification points.

### What was tricky to build

The compiler needs several megabytes of code before its scratch heap can be allocated. Keeping its image outside the factory partition avoids moving the existing files and records.

### What warrants a second pair of eyes

The trust boundary on source authorization and cached native bytes, and cleanup on failed activation.

### What should be done in the future

Implement the device path, measure it on hardware and fill in receipts for each phase.

### Code review instructions

Start at the guide's toplog example. Compare board_main.c with the P4 ELF backend and kernel_spawn_loaded.

### Technical details

The application partition is 4 MiB. The compiler alone exceeds its remaining space. Chapter 35's timing and memory numbers come from the emulator.

## Step 9. Build the compiler as a private firmware tool

Stage 1 bootstrapped from the restored source. I combined it with the assembler in one relocatable RISC-V tool. Measuring the packed size changed the storage decision in the guide.

### Prompt Context

See step 8. Design and bootstrap checkpoint 7f5a751.

### What I did

Built a private PIC tool with its own CJI runtime, memory streams and allocator callbacks. Added the operator build/install path, an isolated development identity, a two-slot FAT cache and trusted NVS activation. Published the first guide edition to the ticket's reMarkable folder.

### Why

A freshly relocated instance resets every assembler static between runs. The packed compiler fits in the application image. Binding it to firmware eliminates a separate provisioning mechanism and removes writable compiler files from the trust boundary.

### What worked

The host build generated 4,239,912 bytes of stage-1 code. The shared tool had only R_RISCV_RELATIVE relocations. The firmware linked at 0x3d7410 bytes, fitting its 4 MiB partition. Host filesystem/native regressions passed. Remarquee confirmed delivery of PICOCALC-CJI-PORT - On-device compiler phases 4 to 6.pdf.

### What didn't work

The initial IDF build stopped with “fatal error: esp_app_desc.h: No such file or directory”. I added the SDK app-format component dependency. The next compile found conflicting types for read_file. Naming the bounded storage reader separately fixed the collision.

### What I learned

The measured compressed image is approximately 645 KiB. The initial guide's separate compiler-file recommendation added avoidable installation work. I replaced it with the existing firmware bundle mechanism.

### What was tricky to build

Stage 1 and live worlds have separate globals. Only the kernel task activates worlds. Worker-owned allocations must outlive the module copy and be released even when stage 1 exits early.

### What warrants a second pair of eyes

Execution on both cores, soft-float callback calling conventions and rollback after a partially initialized candidate.

### What should be done in the future

Run physical cold compile, replacement, fallback and reboot acceptance checks. Include these results in the final guide edition.

### Code review instructions

Start with compiler_job.h and compiler/tool.c; follow install.c into kernel_develop and the existing ELF world backend. Inspect build-tool.sh for the no-undefined link.

### Technical details

Frontend source limit 32 KiB, compiler scratch limit 18 MiB, candidate module cap 384 KiB. The cache compares source hash, firmware build identity, policy and artifact hash.

## Step 10. Separate compilation from cache-sensitive ELF relocation

The first physical compile request returned before starting its worker. The second reached the ELF loader and triggered an SDK assertion. I traced both failures to stack placement and split the job at the point where the SDK changes cache state. The next board run must demonstrate that execution reaches stage 1.

### Prompt Context

See step 8 for the implementation request. The user added “don't forget to write / backfill your diary, using the format from the diary skill”. The implementation baseline is 04b5a91, “Compile and install a trusted development world on the ESP32-P4”.

### What I did

- Flashed only the application partition after the keyboard bus acknowledged hold. Monitored serial-device identity throughout each flash. Both writes finished with “Hash of data verified.”
- Transferred the original 268-byte toplog.world.js to apps/cjiprobe.js and issued the physical operator command cji build apps/cjiprobe.js.
- Sampled internal memory and PSRAM. After the internal allocation failure, created a persistent task with an explicit PSRAM stack. After the cache assertion, moved esp_elf_relocate to the existing internal-stack kernel task. The worker still expands the bundle, compiles and assembles the source, copies out the result and releases its allocation list.
- Added a serial observer that logs compilation events without logging unrelated world state. Added a QuickJS caller fixture that asks dev-cji for a ping reply using the normal message API.
- Added per-job measurements for the largest contiguous PSRAM block and free PSRAM. Extended dependency tracking for changes to the frontend, assembler, runtime, headers and build tools.

### Why

The boot log alone cannot distinguish a host-built toplog already bundled into the firmware from the new dev-cji world. The acceptance run must identify the latter, match the hash of its produced bytes and verify a reply after initialization. A cache flush performed on external RAM also needs a different stack than ordinary generated code does.

### What worked

The P4 reported 25,340,092 bytes of free PSRAM and a largest PSRAM block of 24,641,536 bytes before the first request. The joined firmware fit the existing partition. The independent host and emulator references produced the same 3,704-byte toplog module, SHA-256 4a3cb25deb8a4c8860148b39361bb4efb3528e29e456c62f9d051f0b8e526d14. The host Files and native regression suites passed following the world-slot refactor.

### What didn't work

The first command cji build apps/cjiprobe.js printed “cji: cannot allocate compiler task” twice. The internal heap had 29,007 bytes free and its largest block was 25,600 bytes. The requested ordinary stack was 65,536 bytes. After moving the stack to PSRAM, the same command printed “cji: compiling source on device” followed by “assert failed: spi_flash_disable_interrupts_caches_and_other_cpu cache_utils.c:152 (esp_task_stack_is_sane_cache_disabled())”. The device rebooted. The greeting from bundled toplog after that reboot is unrelated to dev-cji.

### What I learned

On this ESP32-P4 configuration esp_elf_arch_flush writes back cache and calls spi_flash_disable_interrupts_caches_and_other_cpu. That function checks the current stack pointer. Enough physical memory for compilation and a legal stack for relocation are distinct requirements.

### What was tricky to build

The completion queue now has two synchronization points. The worker publishes the decompressed image and waits. The kernel relocates it, frees the serialized ELF and wakes the worker. The worker can then execute without calling the cache-disabling loader. Only the final completion can reach world activation.

### What warrants a second pair of eyes

Check task notification ordering, unconsumed completion messages and the lifetime of module output during cleanup. Check the fallback path when a candidate throws during boot.

### What should be done in the future

Verify the split on physical hardware, then check repeated edits, invalid input, fallback and cached launch after reboot. Report measurements and failures from those runs separately.

### Code review instructions

Read compiler/install.c from build_one through compiler_tick. Compare the ESP-IDF elf_loader esp_elf_arch_flush implementation with cache_utils.c. Follow the operator's file through the kernel-owned activation step.

### Technical details

The persistent compiler task requests a 128 KiB external stack. The physical kernel task already has an 80 KiB internal stack. World ELF activation continues to use the existing production backend. Neither the application partition layout nor the world turn budgets were changed.

## Step 11. Follow the first physical frontend run into the prelude linker

With relocation moved to the kernel task, the compiler returned control cleanly and the board accepted a key while the job ran. It then reported a missing world entry. I compared the precise host SLIR with the scanner used by the new tool and corrected the scanner before retrying the hardware gate.

### Prompt Context

See steps 8 and 10. The worker/relocation checkpoint is ca473e1.

### What I did

Ran scripts/04-observe-compiler.py with “cji build apps/cjiprobe.js”. Compared the reported failure to the main declaration in build/rv32/nw/toplog.own.slir and the pattern used by tools/link-units.mjs. Built an end-to-end acceptance script which checks the exact host module digest, boots a second world to ask for a reply, edits the source in the board's Editor, and checks recovery and cached reboot.

### Why

A linker that assumes an exact empty header discards the frontend's valid register/frame layout metadata. The stage boundary should accept the same SLIR syntax the host linker consumes.

### What worked

At 533 ms the tool was relocated. The board acknowledged a key during compilation. At 6,292 ms the failing job released its memory and reported its error without resetting the device. Free PSRAM was 25,213,288 bytes before the job and 25,213,124 after it. The largest free block fell from 24,641,536 to 14,942,208 bytes, which is why subsequent runs must check contiguous capacity too.

### What didn't work

The serial observer exited with “cji: build failed: missing world entry”. The scanner expected function main/0 immediately followed by a newline. The host emits “function main/0 scratches=4 saveds=2 local=0”, then a start label on the next line.

### What I learned

A successful return from the worker is a lifecycle observation. The module hash and the independent peer's ping are the functional acceptance evidence.

### What was tricky to build

The register counts vary with the source. The corrected insertion point matches the named function, skips its header through the newline and verifies the start label before inserting the prelude call.

### What warrants a second pair of eyes

Compare the device insertion logic in tool.c with tools/link-units.mjs and the device ELF digest with the host's uncompressed module.

### What should be done in the future

Verify the corrected image on the PicoCalc and record every phase's hardware observations.

### Code review instructions

Read compiler_entry, then follow each assertion in scripts/06-exercise-device-compiler.py. The caller fixture uses the normal storage Loader and message path.

### Technical details

The first source used exactly the 268 bytes in the imported toplog fixture. Hardware with the fix was built using the same unit export list as the host reference.

## Step 12. Match host output on the P4 and exercise a failed revision

The PicoCalc compiled the original toplog source, ran its top-level log and returned pong to an independent QuickJS caller. The Editor then changed its reply and the peer received the new value during the same boot. The negative tests exposed a separate process-exit path in the CJI runtime.

### Prompt Context

See steps 8 and 10. Linkage and first acceptance harness checkpoint b2f6fe4.

### What I did

- Captured the protected stack bounds after the assembler started and collected Clang's stack-usage files for the tool image.
- Sized a 256 KiB PSRAM stack for the worker. Reset pending messages, priority and timer settings when replacing the operator revision. Built and flashed the application partition with the monitored serial link.
- Ran the original fixture, the host digest comparison, the independent IPC caller and an edit using Loader F3 and Editor F2. Verified the stored text before requesting recompilation.
- Tested syntactically invalid source and a valid program throwing during startup. Inspected rt_uncaught, the ELF world's fatal callback and the compiler tool's private callback.

### Why

The brief frontend result and a 128 KiB stack covered stage 1 but missed the assembler's simultaneous large C frames. The tests also need to distinguish compiler refusal, a world failing after producing valid machine code, and an actual device reboot.

### What worked

On the physical P4, build 1e8fa6d85a8fcda6baa46119f973a5186b1f896a1665e9094fcbf240a5660d8b produced a 3,704-byte module identical to the host reference. The device logged “dev-cji: hello from the top level” and acknowledged a key during compilation. Source to ready took 5,962 ms, including 524 ms to the end of tool relocation. Peak private scratch was 8,459,613 bytes. The peer received pong. After editing and saving the source, the second native module took 5,603 ms and the peer received pong-two. A parse error left pong-two working.

### What didn't work

The prior 128 KiB stack produced “Guru Meditation Error: Core 0 panic'ed (Stack protection fault)”. The captured stack pointer was 0x488093d0 and the lower bound 0x4880acdc, a 6,412-byte overrun. Clang reported 65,696 bytes in slas_main and 70,224 bytes in static_shape, which it calls. After fixing the stack, the intentionally throwing candidate restarted the board. The observer saw a cache hit for the previous 3,408-byte revision following reset. That proves persistence and also shows the requested live rollback had failed.

### What I learned

The standalone runtime handles an uncaught top-level exception by printing and calling exit(2). The physical firmware needs the existing world fatal callback for this path. The same distinction allows the private frontend to report unsupported JavaScript to the automatic installer.

### What was tricky to build

The ELF callback stores the error pointer and performs a nonlocal return. Its diagnostic must survive that return. The fix formats a bounded, persistent diagnostic and invokes the embedder's callback before reaching process exit. Out-of-memory failures remain separate from language rejection.

### What warrants a second pair of eyes

Review fault propagation in runtime.c, the compiler job's in_frontend state and rollback when the candidate has already replaced a running image. Check that the peer survives a failed candidate without reboot.

### What should be done in the future

Complete the live rollback, automatic fallback and post-reboot acceptance sequence with this runtime fix and record the final guide delivery.

### Code review instructions

Compare rt_uncaught with cji_elf.c's fatal and leave functions. Run scripts/06-exercise-device-compiler.py on compiler firmware and compare its evidence with the host-built toplog module.

### Technical details

The host/board module SHA-256 is 4a3cb25deb8a4c8860148b39361bb4efb3528e29e456c62f9d051f0b8e526d14. The physical second revision was f2723227fa8d198b38a5076110344b7ac66e5bdcda3be2a6e7e74c2607a88ce8.
