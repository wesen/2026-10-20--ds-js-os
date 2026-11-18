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

## Step 13. Verify live recovery, reboot policy and deliver the hardware guide

I ran the complete procedure against the final compiler-enabled application on the connected PicoCalc. The independent caller received the expected result after editing, both failure modes, fallback and reboot. The test left the compiled service idle and stopped its polling caller.

### Prompt Context

See step 8 for the implementation/design request and step 10 for the diary-format reminder. The preceding hardware and exception-containment checkpoint was 95c7442.

### What I did

- Rebuilt and flashed the operator firmware, then observed it recompile an already installed source when the firmware build identity changed.
- Changed the acceptance procedure to position the Editor cursor explicitly. Verified the saved bytes, sent requests from a separate QuickJS app, rejected a syntax error, triggered a candidate boot failure and tested unsupported Proxy source under automatic policy.
- Damaged the active artifact, rebooted and verified the regenerated host-equivalent ELF. Changed the saved source and checked that restore refused it. Reinstalled the original source explicitly, tested a concurrent request, rebooted and checked the caller's result again.
- Checked the on-device world listing and bus counters, ran the compiler-off firmware build, host regressions and both RV32 gates. Added sanitized hardware evidence to the ticket, related its sources, checked off all phases and delivered the final guide edition.

### Why

The installer must validate both its artifact and its saved source snapshot. Reinstalling a good source when its saved snapshot has been altered should repair the inactive slot and publish a new valid record. Reusing only the otherwise valid ELF would leave the next boot unable to recover.

### What worked

The native build of the edited file took 5,907 ms and the peer received pong-two. The invalid source produced “Uncaught Error: 1:16: expected an expression, found ;”. The intentionally throwing native candidate failed during boot and the same peer received pong-two afterward. Valid Proxy source produced the expected CJI rejection, booted in QuickJS and returned fallback-pong. Returning to native took 6,025 ms and produced the host digest.

The original native install survived reboot with zero compiler scratch. Damaged native bytes were rebuilt in 7,047 ms. An altered saved source was refused. The authorized reinstall produced the reference SHA-256 and a simultaneous submission returned busy. A final reboot hit cache in 1,450 ms and the peer received pong. The final independent world listing showed dev-cji native idle with zero restarts and u-0-cjicheck stopped. I2C reported 4,875 transfers and SPI 258, both with zero errors.

### What didn't work

One intermediate acceptance run timed out waiting for the saved line matching ^"pong-two"\);$. Reading just the disposable test file showed the expected two-line source followed by a new line containing -two. Editor had restored its previous cursor. From a known top line and Home position, the same keys reliably edited the string and the final test checked the stored text before compiling.

### What I learned

Cache latency at normal boot includes other worlds' startup. A hot cache hit on a running board took 20 ms and the same verified native artifact reached ready in about 1,450 ms during system boot. Neither measurement includes frontend work. A separate firmware identity forced a rebuild without any change to the authorized source bytes.

### What was tricky to build

The source snapshot on FAT can change independently of the editable source presented by an operator. The repair path verifies the saved source as well as the cached artifact before reusing a previous record. A physical firmware update, an ordinary reboot, a corrupted artifact and a damaged source each have a distinct expected outcome.

### What warrants a second pair of eyes

Review the source and artifact comparisons inside begin, and the candidate boot confirmation before port_store_set publishes the active slot. The final receipt distinguishes timing under load from the compiler scratch allocation counter.

### What should be done in the future

A deployment that needs larger worlds or more than one development slot should measure representative sources before changing capacity or cache policy. The current three implementation phases are verified for the documented single-slot design.

### Code review instructions

Start with the Phase 4–6 guide and various/phase-4-6-p4-acceptance.txt. Compare the reviewed logic with the acceptance runner's replies and reboot tests. For an independent test, use the board instructions in the guide. The test intentionally replaces the operator development slot.

### Technical details

Final application SHA-256 65cd0cc230a1797cf9c508e1e7c3e6e0a92e8d56e0a4d032c846faa175a19390. Compiler-enabled size 0x3d79f0, compiler-disabled size 0x332a00. Host applications, filesystem and native suites passed. The RV32 board-emulation gate matched SLIR, ELF and calls for all four available fixtures. The shared-runtime gate passed four worlds, isolated the over-budget heap case and observed three incorrect worlds in the deliberately broken state-swap control.

Remarquee receipt: OK: uploaded PICOCALC-CJI-PORT - Phases 4 to 6 hardware implementation.pdf -> /ai/2026/11/17/PICOCALC-CJI-PORT. The earlier design edition remains available. The physical device retains apps/cjiprobe.js, apps/0-cjicheck.js and the verified dev-cji installation for reproduction.

## Step 14. Run the real compiler against the bundled catalog

The production manifest names 22 JavaScript sources. I used those paths to drive a serial sweep on the ESP32-P4. A successful check must produce ELF bytes on the board, and the source hash in each receipt must match the checkout.

### Prompt Context

User prompt (verbatim): “run compiler on device across the whole catalog”. I interpreted the catalog as all 15 application sources and all seven driver and system sources in system.json.

### What I did

- Added the operator command cji check BUNDLED.js. It reads a source from the immutable firmware bundle and runs the existing frontend and assembler.
- Added a serial runner and built host reference modules with the firmware's export list. The runner compares source digests and records the board's terminal result for each input.

### Why

The ordinary operator build activates a world, and some catalog entries drive shared hardware or depend on manifest claims. A catalog compile needs neither activation nor a claim change. Reading the immutable sources also lets Calc and Agent reach the compiler even though they exceed the 32 KiB editable-file limit.

### What worked

The application-only flash completed. The first three board outputs (Keyboard, Power and Display) matched the host ELF digests. Keyboard took 16,313 ms.

### What didn't work

The first serial run stopped on “unknown command � (try help)”, a stale console byte. I narrowed command-error recognition to the requested cji command and restarted the sweep.

### What I learned

Existing host-generated ELF modules are reference artifacts. A board-side source digest, elapsed time and output digest identify an actual fresh compilation.

### What was tricky to build

The module lives in the tool's private allocation list. The check hashes it while the worker owns that memory, then publishes the small result through the existing completion queue. A check bypasses cache lookup, filesystem staging and world activation.

### What warrants a second pair of eyes

Compare each successful receipt with the host bytes and check that the runner covers the full source manifest exactly once.

### What should be done in the future

Record the completed sweep and any exact refusal diagnostics.

### Code review instructions

Follow compiler_console into begin, build_one and compiler_tick in compiler/install.c. The serial driver is scripts/07-check-bundled-catalog.py.

### Technical details

The application image SHA-256 for this sweep is 0fb80be375d0f90c1c9b634f8be751a9c17d1fa06c0af14862afc7d52e78a78b. The frontend heap cap is 8 MiB and the private scratch limit is 18 MiB.

## Step 15. Distinguish the job quota from a failed PSRAM allocation

The initial catalog run produced successful native modules and several identical “compiler scratch limit” errors. The terminal scratch peak counts successful allocations only. It cannot identify which allocator branch refused the next request.

### Prompt Context

User prompts (verbatim): “what's the scratch limit? and how big is it set / can we make it bigger?”, “yes do that measurement if you can”, and “don't forget to write / backfill your diary, use the diary format from the diary skill”. I interpreted the measurement request as observing actual failing allocations while keeping both caps fixed. Catalog checkpoint 5c715b1.

### What I did

Read the worker's allocate and resize paths, the PSRAM wrapper and the private frontend's heap setup. Added a worker-local refusal record at the two possible rejection sites. Added decoding of that record to the catalog runner. Built the instrumented P4 application separately while the baseline firmware continued compiling.

### Why

Both the quota check and a NULL result from aligned PSRAM allocation reached the same failure callback. Increasing the 18 MiB job limit would affect only the quota check. A useful hardware observation compares the pending request plus allocation header with the held bytes, remaining quota, free PSRAM and largest free block at that instant.

### What worked

The first baseline results included a host-identical 102,280-byte Chat ELF in 122,793 ms. Compositor failed after 304,288 ms, Agent after 115,379 ms and Launcher after 163,527 ms. The instrumented firmware built successfully without changing either cap.

### What didn't work

The baseline diagnostic “compiler scratch limit” supplied no request size or allocator branch. Compositor's successful high-water count of 9,007,658 bytes could not distinguish the two causes. I retained the baseline results and arranged a hardware replay with instrumentation.

### What I learned

The 8 MiB frontend heap cap bounds one managed heap space. The 18 MiB scratch budget accounts for allocations by the entire compiler job. Copying collection and a growing realloc may need both old and new blocks at once.

### What was tricky to build

Free-space samples taken after the private tool unloads do not describe the failure. The new record samples PSRAM directly on the worker before returning NULL. It prints the measurement after the tool returns, while the worker still owns its state.

### What warrants a second pair of eyes

Check the requested number of bytes, 16-byte allocation header, remaining quota, and largest contiguous PSRAM block separately. Replay conditions can differ between consecutive jobs and a fresh boot.

### What should be done in the future

Finish the physical sweep, replay failed jobs and compare matching input hashes. Record the measured branch before proposing a budget change.

### Code review instructions

Follow record_refusal in compiler/install.c into build_one. Inspect the allocation_refusal fields in the serial runner. The initial baseline rows intentionally have no such fields.

### Technical details

SCRATCH_LIMIT is 18,874,368 bytes, the frontend cap is 8,388,608 bytes and its initial heap is 4,194,304 bytes. These are firmware build settings. No scratch or heap setting was increased in this investigation.

## Step 16: Measure Agent's live heap and reserve a workspace for the device frontend

The baseline P4 compiler refused Agent after 114.911 seconds. The allocator receipt located the refusal in PSRAM. I ran the compiled stage-1 frontend on the host to determine a heap size that could carry the same source through all frontend passes, then built firmware that reserves that space before loading the compiler ELF.

### Prompt Context

**User prompts (verbatim)**

> isit memory fragmentation? how is this differing from the host compiler version ?

> what do we need to do to make the failed ones work?

> Ok, compile Agent

**Assistant interpretation.** Produce Agent's native ELF on the physical P4 and compare it to the independently built host module. The catalog command compiles without activating a world.

**Inferred user intent.** Establish whether the full Agent source fits on the handheld and measure the actual compile.

**Prior instrumentation commit** 7e5af30.

### What I did

- Compared the allocation refusal with the job limit and largest available block. Checked the independent host frontend errors for Calc and Sandbox.
- Ran host slas on build/rv32/stage1/stage1.slir with Agent and --world-unit. With -C -g -h 10485760 -H 10485760, cmp verified the emitted SLIR against the Node frontend's 1,236,326-byte output.
- Added a job-owned heap for bundled inputs above the existing editable-source limit. The worker allocates it before materializing the compiler image. The frontend passes it into the runtime's first heap allocation and releases it before assembly.
- Built using ESP-IDF 5.4.2 and idf.py -B build-elf build. Extended the catalog observer to accept a per-world deadline and print compiler phase samples.

### Why

Agent's rejection requested 8,388,608 payload bytes plus a 16-byte header. The worker held 4,299,573 bytes against an 18,874,368-byte limit. PSRAM had 15,803,180 bytes free across blocks, with 5,767,168 bytes in the largest. Raising the job quota alone could not satisfy that allocation. A single fixed space avoids both heap doubling and the copying collector's second space.

### What worked

The compact host run finished in 4.08 seconds, performed 252 collections and reported 8,737,136 bytes live at peak. The existing host ELF reference is 750,832 bytes, digest b92e5d7f1146db7f5b44ec9c42f962618a09a93b2ebfad0322ec793318b7e179.

### What didn't work

- The baseline console reported “compiler scratch limit” for Agent. Only the instrumented firmware distinguished the PSRAM refusal from a quota refusal.
- The original Editor observer timed out at 360 seconds. A passive reader recovered the terminal receipt. A host session interruption later disconnected the Agenda observer. A tmux reader recovered Agenda's terminal receipt at 425,984 ms. Agenda requested a 4,194,304-byte payload with a 16-byte header when the largest reported block was 4,194,304 bytes.
- Paused the catalog reader during Settings to use the board for Agent. Settings requires a fresh receipt.

### What I learned

Node runs the frontend under V8. The handheld executes a compiled copy of the frontend with a CJI-managed heap. Running the same stage-1 SLIR on host slas isolates the collector and heap-size choice from board relocation and PSRAM layout. Calc also has a host type error involving assignment to .size. Sandbox uses indirect eval syntax rejected by the host frontend.

### What was tricky to build

Both the inflated compiler image and its relocated segments must fit while loading. Reserving the frontend space first changes where both can land. Worker cleanup must reclaim the reservation on relocation failure as well as after an assembler or compiler exit.

### What warrants a second pair of eyes

Check that rt_initialize requests its data heap first and that the allocator hook restores malloc before the root stack allocation. The source-length threshold only selects a policy. It does not predict the live set for every world.

### What should be done in the future

Capture the P4 terminal receipt and compare the module identity and size. Resume catalog cases interrupted during the firmware change.

### Code review instructions

Read compiler/install.c build_one, compiler/tool.c compiler_entry and the allocation order in sources/cji/runtime/runtime.c rt_initialize. To reproduce the board check, run the ticket's scripts/07-check-bundled-catalog.py --timeout 7200 agent with the board connected.

### Technical details

The 10 MiB reservation uses the existing tracked job allocator and counts toward the 18 MiB worker limit. The host stage-1 timing excludes RV32 assembly and device I/O. Agent was measured on its complete 34,596-byte bundled source.

## Step 17: Reuse the frontend heap while loading the compiler

The first board trial of the reserved heap failed while loading the compiler. I removed the overlap between the decompressed compiler file and the unused frontend heap. The second trial reached the frontend on the physical P4.

### Prompt Context

**User prompt.** See Step 16, “Ok, compile Agent”.

**Assistant interpretation and inferred intent.** Finish the compile on hardware using the original Agent source and verify the output.

**Prior code commit** e46c655.

### What I did

- Flashed the application partition and ran scripts/07-check-bundled-catalog.py --timeout 7200 agent.
- Added a caller-supplied destination and capacity to the P4 immutable-bundle reader. The normal port_read_file entry point still allocates its result. The compiler worker lends its reserved heap to the decompressor and reuses it after synchronous relocation returns.
- Rebuilt, held the keyboard bus, wrote the app partition, verified the flash hash and restarted the physical check.

### Why

The ELF loader reads a complete 4.6 MiB input image while constructing independent executable segments. The reserved heap can hold that input until relocation completes. The frontend starts after the kernel signals the worker.

### What worked

The second run reported 24,997,100 bytes free at entry, with an 18,874,368-byte largest block. It reached “relocated” at 525 ms, with 9,620,740 bytes free after charging the frontend reservation and loading the tool. Independently, assembling the compact host run's exact SLIR with the device's prelude-call insertion and unit.list produced the reference 750,832-byte ELF byte for byte.

### What didn't work

The first firmware returned “compiler relocation -12” at 401 ms, with a 10,485,776-byte scratch peak. The worker never entered stage 1. Retaining separate buffers for the decompressed image and the future frontend heap exhausted the available contiguous space during relocation.

### What I learned

The loader's input buffer becomes reusable as soon as relocation returns. ELF execution subsequently reads the separate relocated code and data.

### What was tricky to build

The two buffer paths have different owners. The kernel frees the ordinary file allocation. The worker keeps the borrowed input as a tracked heap allocation and frees it after the frontend or during job cleanup.

### What warrants a second pair of eyes

Check the terminating byte against destination capacity in the packed and plain file paths. Verify short input and decompression failure leave caller-owned storage for the worker to release.

### What should be done in the future

Collect the terminal receipt from the worker, compare the ELF digest and record scratch use and elapsed time.

### Code review instructions

Follow p4_bundle_read in main/port_p4.c through build_one and the LOADING branch of compiler_tick. Review the host ELF comparison using slas-rv32 -c agent.elf --module --extern unit.list with the linked SLIR.

### Technical details

The second firmware ELF SHA-256 is e72bc108aa7a5dfefae43a684492fab8c49225b73407a6de3947757c5d600000. The application binary uses 0x3d7f50 bytes of the 0x400000-byte app partition.

## Step 18: Verify the full Agent module on the physical PicoCalc

The P4 compiled the complete bundled Agent source into a 750,832-byte RV32 module. Source selection through the terminal SHA-256 receipt took 906,400 ms. The device ELF digest matched the independent host reference.

### Prompt Context

**User prompt.** See Step 16. The requested result was a physical compile of Agent.

**Code commit** 1e3e157.

### What I did

- Ran the compile-only check for system/agent.js, captured various/agent-on-device.jsonl and compared its source and ELF hashes to the local source and reference ELF.
- Checked the generated build-elf/esp-idf/main/system.cji.json manifest to identify the running configuration.

### Why

A completed frontend alone cannot prove that the RV32 assembler, linker inputs, and output buffer produced the correct module. The device hashes the assembled bytes before releasing the worker's allocations.

### What worked

The device reached assembly completion at 906,377 ms and cleanup at 906,396 ms. Peak job scratch was 13,736,837 bytes. PSRAM free after release was 24,999,416 bytes. The terminal receipt matched both the 34,596-byte source and the host ELF.

### What didn't work

I initially described the live Agent as QuickJS in a status update. The generated firmware manifest maps Agent to the native engine and natives/agent.elf. I corrected that report. The compile-only check did not activate the freshly produced bytes.

### What I learned

The physical device can compile this complete application with the original job quota. Compile latency and runtime request latency are different measurements.

### What was tricky to build

The worker has to keep the immutable source, loaded compiler and frontend workspace simultaneously, then release the frontend heap before assembling. The digest check comes before releasing the module itself.

### What warrants a second pair of eyes

The physical receipt proves byte identity. Inspect the generated manifest separately when reporting which runtime the operator is using.

### What should be done in the future

Complete the outstanding catalog measurements on this firmware.

### Code review instructions

Compare the ELF SHA-256 in various/agent-on-device.jsonl with the output of sha256sum on the reference ELF. See Steps 16 and 17 for the allocator and loader changes.

### Technical details

Source SHA-256 is 6cb57edc021bea33953fa89a70573c5c7cf905a9d0a0077ec1d2a31cd94d3d5f. ELF SHA-256 is b92e5d7f1146db7f5b44ec9c42f962618a09a93b2ebfad0322ec793318b7e179. The firmware uses the 18 MiB per-job cap and the 10 MiB upfront frontend reservation for this run.

## Step 19: Complete the physical catalog sweep

Every original world in picocalc-os/js/system.json now has a board receipt. Fifteen of the 22 produced a host-matching native ELF on at least one attempt. Four of the earlier memory refusals were queued for replay after the final catalog input.

### Prompt Context

**User prompt.** See Step 14 for the original full-catalog request and Step 16 for the Agent follow-up.

**Assistant interpretation and inferred intent.** Exercise each bundled source through the physical stage-1 frontend and RV32 assembler and distinguish failures by observed phase and diagnostic.

**Agent verification commit** afea912.

### What I did

- Resumed the serial sweep after Agent. Compiled Settings, Logs, Loader, Sysmon, REPL, Sandbox, Snake, Faults, Flaky, Keys and About.
- Merged completed attempts from the baseline, allocator-instrumented and two workspace-reservation builds into various/device-catalog-results.json. Verified every source digest against its catalog file and every successful ELF digest against the host reference.

### Why

A host build or bundled native module only supplies a comparison artifact. Each catalog entry needs a terminal response with the digest of the input the physical worker actually read.

### What worked

The final eleven inputs yielded ten host-matching modules and a source diagnostic for Sandbox. Loader took 455,890 ms. About took 12,954 ms. The lasting evidence records repeated attempts per world and the firmware used for each.

### What didn't work

At first full coverage, Compositor, Launcher, Files, Editor, Calc and Agenda had only memory-related physical failures. Sandbox reached the parser and reported “Uncaught Error: 15:13: expected ), found ,”. The host also refused that syntax. The Calc host reference separately failed on a .size assignment.

### What I learned

The source alone does not determine whether a multi-megabyte contiguous allocation succeeds. Agenda had enough total free memory for its request, but its largest available block matched only the payload size before the allocation header.

### What was tricky to build

The catalog sweep spanned firmware changes and a host observer interruption. Matching full SHA-256 input digests prevents an unrelated asynchronous terminal message from being attributed to the next input.

### What warrants a second pair of eyes

Compare individual attempts under the firmware labels in the JSON. Only runs with an ELF digest establish native output parity. An earlier configuration's memory result remains evidence for that run.

### What should be done in the future

Capture the queued Compositor, Launcher, Files and Editor replays on the current firmware to put physical allocation metrics beside their first results.

### Code review instructions

Compare the world names and source paths against picocalc-os/js/system.json. For each successful receipt, recompute SHA-256 over the host's uncompressed RV32 ELF. See scripts/07-check-bundled-catalog.py for the terminal receipt parser.

### Technical details

The sweep used immutable bundled JavaScript. cji check bypasses the development-slot cache and discards its output after hashing. Measurements cover compile and assembly on the running system and exclude activation and application interaction.

## Step 20: Compare the replay results and check the running board

Three of the four memory-failure replays completed on the physical P4. The final catalog contains 18 worlds with verified host-matching native modules and four with outstanding failures. The live board reported Agent and dev-cji both native and idle with zero restarts.

### Prompt Context

**User prompts and interpretation.** See Steps 14 and 16. This closes the catalog measurements that were running when the user prioritized Agent.

**Previous evidence commit** 4ed32fb.

### What I did

- Replayed the original Compositor, Launcher, Files and Editor bundled sources after the 22-world sweep.
- Matched the successful module hashes against the independent references. Queried worlds and stats after the serial worker finished.

### Why

Repeated runs distinguish input identity from allocation layout. A terminal failure without allocator metrics cannot identify whether the job cap or a particular PSRAM allocation was responsible.

### What worked

Compositor, Launcher and Editor matched the host ELF after failing on earlier attempts. Editor took 425,289 ms. SPI and I²C reported zero errors after the run.

### What didn't work

Files failed again after 327,220 ms. It requested 8,388,608 bytes plus its 16-byte header while holding 8,465,202 bytes. Total free PSRAM was 11,672,524 bytes and the largest free block was 4,849,664 bytes. The requested allocation fit the job quota.

### What I learned

Files is only 5,873 source bytes and still issued an 8 MiB allocation. The large-source policy used by Agent is sufficient for its measured workload, while file length alone cannot select the best policy for every world.

### What was tricky to build

These replays occurred on a live OS after earlier jobs had changed allocation placement. The evidence file keeps every attempt so readers can see how outcomes varied with the same source.

### What warrants a second pair of eyes

Avoid attributing the three recovered results to the 10 MiB collector. All three sources were below the threshold and used the ordinary frontend policy.

### What should be done in the future

For Files and Agenda, measure stage-1 live data and test an appropriate upfront reservation. Calc also needs its host type error resolved. Sandbox uses indirect eval and remains a QuickJS workload.

### Code review instructions

Read the runs array for each world in various/device-catalog-results.json. Filter on result and compare the ELF hashes with host_elf_sha256. The Agent-only receipt is in various/agent-on-device.jsonl.

### Technical details

Every original catalog source received a physical result. Across the recorded builds the four worlds without a verified physical ELF are Files, Agenda, Calc and Sandbox.

## Step 21: Measure Files and Agenda and reserve the ordinary frontend heap

Both sources produced their expected intermediate representation on the host with a fixed 8 MiB mark-compact heap. I changed the ordinary compiler path to claim its existing heap cap as one block while the block is still available. The physical trial checks Files first and allows Agenda to start only after the Files ELF matches the reference.

### Prompt Context

**User prompts (verbatim)**

> ok, do files and then agenda

> commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

**Assistant interpretation.** Compile the original bundled sources on the P4 and verify both complete modules. **Inferred intent.** Recover two catalog failures within the worker's existing memory budget.

### What I did

- Ran host slas with `-C -g -h 8388608 -H 8388608`, stage1.slir and each original source followed by --world-unit. Compared stdout with the independent host frontend output using cmp.
- Made the reserved size explicit in compiler_job_t. For ordinary jobs, the worker now attempts to acquire 8 MiB after the kernel releases the temporary compiler image and before stage 1 performs small allocations. If that attempt fails, the worker uses the existing growing heap. Agent-sized jobs still request their 10 MiB block before relocation.
- Added the actual reservation size to the serial receipt parser. Built the compiler and application with ESP-IDF 5.4.2.

### Why

The previous Files run had 11,672,524 bytes free when an 8 MiB payload plus header was refused. The Agenda run could not allocate a second 4 MiB space. An upfront reservation gives the collector room to compact existing objects and eliminates the need for a second space.

### What worked

Both host outputs matched byte for byte. Files reported 80 collections, 3,973,240 peak live bytes and 151,459,216 bytes copied. Agenda reported 424 collections, 4,491,400 peak live bytes and 1,434,574,696 bytes copied. Both completed without spilling.

### What didn't work

See Step 20 for the prior physical Files refusal and Step 16 for Agenda. The host comparison and firmware build completed successfully in this step.

### What I learned

Agenda's peak live set exceeded the original 4 MiB initial heap. Files' sampled live set remained below that size in this host run. Both fit the fixed ordinary cap.

### What was tricky to build

The kernel thread owns relocation and frees the temporary image. Ordinary jobs must reserve after that handoff. The tool restores its normal malloc callback before allocating the root stack. The worker's allocation list owns the reservation until stage 1 frees it or job cleanup releases it on error.

### What warrants a second pair of eyes

Check the firmware/tool ABI on both sides of the callback. An optional reservation failure should select the original growing path and should not be reported as a terminal allocator refusal. All actual failures in the subsequent compile still go through the measured allocator.

### What should be done in the future

Capture each board receipt in order and update the catalog only after checking its source hash, module length and ELF digest.

### Code review instructions

Follow build_one in compiler/install.c through compiler_entry and use_reserved_heap in compiler/tool.c. Compare the reserved byte count with the scratch peak in the board receipt. Reproduce the physical trial with the ticket's scripts/07-check-bundled-catalog.py --timeout 7200 files, then agenda.

### Technical details

There are no app-specific heap settings and the job scratch cap stays at 18 MiB. The ordinary reservation and fallback growth cap are both 8 MiB. The reserved block is charged, including its allocation header, to the job.

## Step 22: Verify Files before starting Agenda

The physical board compiled apps/files.js into a 193,896-byte ELF in 329,116 ms. The ELF matched the host reference. The serial runner then issued the Agenda command on the same boot.

### Prompt Context

**User prompt and inferred intent.** See Step 21. The acceptance condition for Files was a full on-device compile whose output matches the host.

**Code commit** 6160410 — Reserve the ordinary PicoCalc frontend heap after compiler relocation.

### What I did

Flashed the application partition after receiving the keyboard-bus hold acknowledgement. The flash tool reported “Hash of data verified.” Ran the ticket's 07-check-bundled-catalog.py --timeout 7200 files. Compared source hash, ELF size and hash, then appended the physical attempt to various/device-catalog-results.json.

### Why

The same source had previously failed after about 327 seconds when the collector attempted to obtain an 8 MiB block. Recording the actual reserved byte count distinguishes the new collector path from a successful retry on the original path.

### What worked

The worker reserved 8,388,608 bytes, reached assembly completion at 329,099 ms and reported a 9,251,666-byte scratch peak. ELF SHA-256 matched bad610f6574efa4e5bcb588f7c53d114236db672b49cdb786f10531884426797. The catalog reached 19 verified worlds.

### What didn't work

The prior two failures remain under Files in the catalog evidence. This run completed without a reported error.

### What I learned

A single 8 MiB space accommodates the actual Files frontend workload on this board. Ordinary jobs can claim the block after relocation while leaving the workspace used for inflation available to the allocator.

### What was tricky to build

The serial checker gates the second compile on successful comparison against the first host ELF. Merely receiving a successful compiler status would omit that identity check.

### What warrants a second pair of eyes

Review the input digest against the bundled source and the recorded module digest against the uncompressed host output. Free PSRAM is sampled on a live system and varies between measurements.

### What should be done in the future

Finish the already-running Agenda check and capture its independent receipt.

### Code review instructions

Inspect the Files runs under the ordinary-reservation firmware label in various/device-catalog-results.json and compare against the shared-firmware refusal recorded in Step 20.

### Technical details

Source size was 5,873 bytes. Free PSRAM was 20,135,180 bytes after relocation and 25,028,120 bytes after cleanup. The compile-only path released the output after hashing.

## Step 23: Trace the board allocator through ESP-IDF and the compiler runtime

While Agenda compiled, I followed a worker allocation down to ESP-IDF and traced the lifetimes back up through the frontend and assembler. The intern guide now includes the algorithms, ownership boundaries, timing of the reservation and the Files fragmentation example.

### Prompt Context

**User prompts (verbatim)**

> how does memeory alloation and PSRAM management work?

> what algorithm does ESP-IDF use?

**Assistant interpretation and inferred intent.** Identify the allocator actually linked on this board and explain which layer can move memory. See Step 21 for the ongoing hardware work.

**Previous verification commit** 33e4a5e.

### What I did

Read the 5.4.2 SDK checkout's heap_caps_base.c, multi_heap.c, tlsf.c and tlsf_control_functions.h. Checked the P4 firmware linker map for tlsf_memalign_offs, tlsf_free and tlsf_malloc. Added the verified path to the phases 4–6 design guide.

### Why

The worker's refusal message spans three distinct concerns. Its scratch limit is a quota, TLSF hands out external RAM blocks, and CJI reclaims JS objects inside one such block. Understanding which addresses can move explains why allocation order affected Files.

### What worked

The map attributes the aligned allocator and free functions to esp-idf/heap/libheap.a(tlsf.c.obj). Source shows heap capability and priority selection, two-level bitmap lookup, block splitting and coalescing with adjacent free neighbors.

### What didn't work

The earlier generic scratch error could not distinguish a quota failure from physical fragmentation. The current explanation uses the request, free and largest-block values recorded at refusal in Step 20.

### What I learned

TLSF can coalesce neighbors on release, but a live pointer between two free regions keeps them separate. Only the managed runtime has the object and root information needed to compact the compiler's JS objects.

### What was tricky to build

The job quota counts worker allocation headers, while the underlying allocator also applies its own alignment and size-class rules. The scratch peak additionally excludes the loaded tool and the separate FreeRTOS stack.

### What warrants a second pair of eyes

Keep claims about bounded bitmap lookup scoped to one TLSF heap. The capability allocator can try multiple regions, and resizing through the worker can copy a buffer.

### What should be done in the future

Finish the physical Agenda measurement and verify the module digest.

### Code review instructions

See “How the device allocates compiler memory” in the phases 4–6 design guide. Compare the linked tlsf symbols with heap_caps_aligned_alloc_base, search_suitable_block and tlsf_free in the SDK checkout used by this build.

### Technical details

The port requests MALLOC_CAP_SPIRAM and MALLOC_CAP_8BIT with 8-byte alignment. Freeing a tracked scratch block removes the worker's 16-byte RV32 header from its accounting, then returns the underlying block to ESP-IDF.

## Step 24: Publish compiler phases and periodic progress to the log ring

Agenda's serial reader disconnected during the first attempt. A retry reached relocation and then stayed silent during compilation. I added progress messages to the firmware so the operator can see the current phase and the worker's latest allocation activity through serial or the Logs app.

### Prompt Context

**User prompts (verbatim)**

> how are things going?

> is it still running?

> can we have the compiler maybe output progress or so? or send messages that a logging service can capture and forward / print out?

**Assistant interpretation and inferred intent.** Expose actionable progress during a long compile and make the same events available to existing logging clients. Preserve the original ordered Files and Agenda verification.

### What I did

- Verified Files before launching Agenda. The Agenda observer disconnected and the device later reported idle. Started a fresh Agenda check using the same USB identity and firmware.
- Added a small callback to the private compiler ABI for frontend, link and assemble phases. The kernel periodically reads a synchronized sample and emits elapsed time, allocation calls and scratch bytes. The worker emits phase changes immediately.
- Sent bounded lines to the existing kernel log ring and serial stdout. Updated the catalog checker to forward progress on stderr and added cji status for on-demand sampling. Added reader instructions to the intern guide.

### Why

A serial port with a blocked reader is insufficient evidence of compiler activity. A heartbeat from the kernel and an allocation count from the worker let an operator distinguish time elapsed from observed work. Reporting a percentage would require a calibrated denominator across different programs.

### What worked

The retry reached relocation in 702 ms. The firmware build with phase reporting linked successfully. The kernel log ring already supports concurrent writers and the Logs app already polls it using sys.log(after).

### What didn't work

The original Agenda reader failed in port.readline with “device reports readiness to read but returned no data (device disconnected or multiple access on port?)”. No terminal digest was recovered. During the retry, a status probe received no matching response in six seconds and a second received zero bytes in eighteen seconds. Those observations provide no proof of either successful completion or a compiler hang.

### What I learned

The existing kernel tick runs independently of the compiler worker. It can sample progress even while the worker is spending time inside one phase. A continuing heartbeat with unchanged counters only proves that the kernel is still reporting.

### What was tricky to build

The compiler ELF is unloaded at the end of every job. The firmware owns phase names, and the callback passes an enum across the ABI. A small critical section protects the copied snapshot. Formatting, ring writes and serial output occur outside that section.

### What warrants a second pair of eyes

Verify the ring's 120-byte line budget, scope the eight-hex-digit prefix to display, and keep the full digests for verification. Confirm an idle poll and a cache hit do not report stale work.

### What should be done in the future

Verify repeated heartbeat lines, terminal success and failure reporting, and byte identity on the physical board. Record an Agenda result only after checking its module digest.

### Code review instructions

Start at compiler/install.c report_progress, enter_phase and compiler_tick. Follow the tool callback in compiler/tool.c and the ring consumer in apps/logs.js. The ticket's catalog runner keeps progress output separate from its JSON receipt.

### Technical details

The reporting interval is ten seconds. The worker snapshots counters at its existing roughly 20 ms allocator yield points. Reports contain no source text, credentials or application payload.
