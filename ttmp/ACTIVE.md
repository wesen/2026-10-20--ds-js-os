# Active tickets

The tickets still open, oldest first, with the open tasks each records (generated from docmgr by
PICOCALC-REPO-LAYOUT Phase I; regenerate rather than edit). A ticket whose tasks are all done was closed.
Tickets with no tasks are listed without any; read their index to see what they are waiting on.

## [PICOCALC-P4-PORT](2026/10/24/PICOCALC-P4-PORT--port-picocalc-os-to-the-real-picocalc-esp32-p4-hardware/index.md)

Port picocalc-os to the real PicoCalc ESP32-P4 hardware. 7 tasks done, 1 open.

- Confirm physical key presses on the real keyboard (Keys app shows STM32 events)

## [PAPERS3-PORT](2026/10/26/PAPERS3-PORT--port-picocalc-os-to-the-m5stack-papers3-e-paper-touch-mquickjs/index.md)

Port picocalc-os to the M5Stack PaperS3 (e-paper, touch, mquickjs). 6 tasks done, 3 open.

- P4: port/esp32s3-papers3 builds; flash; console + tools/s3cap.py shots on device
- P5: device measurements (calibration, refresh timings, memory); tune budgets
- Device access: needs sudo modprobe cdc_acm (USB device not writable, no ttyACM)

## [PAPERS3-OFF](2026/10/28/PAPERS3-OFF--power-off-when-idle-on-the-papers3-suspend-persistent-state-rtc-wake/index.md)

Power off when idle on the PaperS3: suspend, persistent state, RTC wake. 5 tasks done, 1 open.

- P6: device validation on battery with the user

## [PICOCALC-FS](2026/10/31/PICOCALC-FS--files-on-the-picocalc-a-filesystem-file-handles-and-a-file-service/index.md)

Files on the PicoCalc: a filesystem, file handles and a file service. 5 tasks done, 1 open.

- F6 diary, report, reMarkable

## [PICOCALC-AGENDA-COMPILER](2026/11/18/PICOCALC-AGENDA-COMPILER--compile-agenda-on-the-picocalc-with-wasm-and-rv32/index.md)

Compile Agenda on the PicoCalc with Wasm and RV32. 5 tasks done, 2 open.

- Measure cold build, memory, turn and key-to-frame latency on assembled hardware
- Publish the completed typed Agenda parity and assembled-device qualification report

## [PICOCALC-AGENDA-STARTUP](2026/11/18/PICOCALC-AGENDA-STARTUP--shorten-the-powered-agenda-startup-dispatch-path/index.md)

Shorten the powered Agenda startup dispatch path. 2 tasks done, 1 open.

- Compare powered control and candidate images and record keyboard-to-panel evidence separately

## [PICOCALC-TYPED-APPS](2026/11/18/PICOCALC-TYPED-APPS--port-the-picocalc-app-catalog-to-typed-javascript/index.md)

Port the PicoCalc app catalog to typed JavaScript. 1 tasks done, 1 open.

- Port the rest of the app catalog and verify observable behavior per app

## [PICOCALC-TYPED-WORLDS](2026/11/18/PICOCALC-TYPED-WORLDS--run-complete-typed-javascript-applications-on-picocalc/index.md)

Run complete typed JavaScript applications on PicoCalc. 1 tasks done, 1 open.

- Move the full Editor app into typed JavaScript and qualify behavior on both handheld backends

## [PICOCALC-AGENDA-TYPED-WORLD](2026/11/19/PICOCALC-AGENDA-TYPED-WORLD--move-agenda-application-policy-into-typed-javascript/index.md)

Move Agenda application policy into typed JavaScript. 0 tasks done, 0 open.

## [PICOCALC-COMPILER-INTEGRATION](2026/11/19/PICOCALC-COMPILER-INTEGRATION--integrate-qualified-compiler-optimizations-into-the-picocalc-toolchain/index.md)

Integrate qualified compiler optimizations into the PicoCalc toolchain. 4 tasks done, 1 open.

- Deliver the intern guide to the specified reMarkable cloud folder upon confirmed upload authorization.

## [PICOCALC-COMPILER-ISSUE](2026/11/19/PICOCALC-COMPILER-ISSUE--a-special-issue-on-compiler-design-for-the-picocalc-analysis-code-generation-isolation-and-types/index.md)

A special issue on compiler design for the PicoCalc: analysis, code generation, isolation and types. 9 tasks done, 2 open.

- Follow-up: implement the compile-time operand stack for Files and compare with the model's 593 instructions
- Follow-up: measure key press to changed pixels on the device

## [PICOCALC-NATIVE-NEXT](2026/11/19/PICOCALC-NATIVE-NEXT--a-smaller-rv32-backend-a-module-cache-safety-checks-and-await-for-typed-picocalc-worlds/index.md)

A smaller RV32 backend, a module cache, safety checks and await for typed PicoCalc worlds. 11 tasks done, 30 open.

- A0: Host harness: staged model library, per-function instruction-count check, RV32 interpreter and differential fixtures (S)
- A1: Register lowering with a compile-time operand stack, lazy constants and locals, flush and pending-read rules; Files at 732 instructions, tolerance 5% (M; needs A0)
- A2: Pending comparisons fused into branches; Files at 668 (S; needs A1)
- A3: Short branches with fix-up; Files at 593 (model A), Files switched to the new lowering, Files device run (S; needs A2)
- A4: Agenda on the new lowering at 2,789 instructions; 3,924 cross-target cases agree (S; needs A3)
- A5: Editor on the new lowering at 16,544 instructions with frame slots for deep stacks; all 13 Editor replays (M; needs A4)
- … and 24 more (`docmgr task list --ticket PICOCALC-NATIVE-NEXT`)

## [PICOCALC-RV32-COMBINED](2026/11/19/PICOCALC-RV32-COMBINED--qualify-branch-fusion-with-compact-output-in-the-streamed-picocalc-compiler/index.md)

Qualify branch fusion with compact output in the streamed PicoCalc compiler. 3 tasks done, 1 open.

- Deliver exact guide/report bundle to the reMarkable cloud if the requested destination is approved

## [PICOCALC-LEXICAL-INDEX](2026/11/20/PICOCALC-LEXICAL-INDEX--index-typed-source-once-for-the-cold-picocalc-compiler/index.md)

Index typed source once for the cold PicoCalc compiler. 0 tasks done, 0 open.

## [PICOCALC-RAYTRACE](2026/11/20/PICOCALC-RAYTRACE--a-playable-packet-ray-tracer-for-the-esp32-p4/index.md)

A playable packet ray tracer for the ESP32-P4. 0 tasks done, 0 open.

## [PICOCALC-RENDER-NEXT](2026/11/20/PICOCALC-RENDER-NEXT--bounded-screen-snapshots-and-compiled-layouts-for-the-picocalc-compositor/index.md)

Bounded screen snapshots and compiled layouts for the PicoCalc compositor. 8 tasks done, 6 open.

- M0/M1: freeze frames, paired traces, oracle and stage instrumentation. 453 host command observations and 44 Editor rasters reproduced; comparable cross-boot A/A and tracing overhead through the full producer-to-SPI path 
- M2/M3: lock corpus split, live memory ledger and acceptance rules. Keys and Editor split and single-lane caps frozen; complete live allocation ledger under replacement, queue pressure and restart fanout remains.
- R2: verify acceptance limits, authentic replay and last-good restart. Generic host model and authentic Chess ingress tested; integrated generic-widget admission with idle restart and exact cap boundaries remains.
- T2/T3: freeze rules, evaluate Keys, price flash/compile cost and run paired P4 trial. Frozen Keys and isolated P4 arms complete; deployed link-size/cold compile with real catalog negotiation and replay remains.
- D0/D1 (gated): measure redundant paint and compare clipped tile repair with full paint. Snake cell repair and single-rectangle Chess qualified in their scopes; generic clipped tiles versus fast full redraw with overlays 
- P4: independent held-out Editor qualification, interactions, reporting and disposition. Editor host pixels and isolated board-reader results complete; integrated interactions, live limits and independent Editor endpoint 

## [PICOCALC-SNAKE-INTEGRATION](2026/11/20/PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/index.md)

Ship semantic Snake snapshots and changed-cell painting on the PicoCalc. 3 tasks done, 1 open.

- After a full PicoCalc power cycle, verify keypad steering, autopilot and return home on the ordinary release, then close the ticket

## [PICOCALC-CANDELA-CPU-KERNEL](2026/11/21/PICOCALC-CANDELA-CPU-KERNEL--candela-s-fixed-path-tracing-kernel-as-firmware-c-on-the-esp32-p4/index.md)

Candela's fixed path-tracing kernel as firmware C on the ESP32-P4. 9 tasks done, 2 open.

- Follow-up (FIRST-LIGHT): table-driven display pass, per-core kernel state
- Follow-up: -Os or hot-path placement to reduce L1 instruction misses

## [PICOCALC-CANDELA-FIRST-LIGHT](2026/11/21/PICOCALC-CANDELA-FIRST-LIGHT--first-candela-scenes-rendered-on-the-picocalc/index.md)

First Candela scenes rendered on the PicoCalc. 0 tasks done, 0 open.

## [PICOCALC-CANDELA-SECTIONS](2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/index.md)

Candela's generated WGSL sections as bytecode interpreted by the P4 kernel. 15 tasks done, 3 open.

- FIRST-LIGHT: build vm/ and ck/cdl_vm_sections.cpp into the firmware; time a board run
- Prepared (direct-threaded, pre-scaled) code form if SDF scenes need it
- Device-side translation time on the P4 (QuickJS); cache bytecode by WGSL hash

## [PICOCALC-COMPILE-BUDGET](2026/11/21/PICOCALC-COMPILE-BUDGET--fit-the-optimizing-typed-compiler-into-the-picocalc-s-on-device-compile-budgets/index.md)

Fit the optimizing Typed compiler into the PicoCalc's on-device compile budgets. 4 tasks done, 5 open.

- Compile-speed work with byte-identical output (inliner done: ~2-3%)
- Add the arms firmware as a gate to RAY-PARITY's qualification of any new default
- Tiered compilation design (ticket) if the budget policy costs too much generated-code speed
- Arms run on the smooth-chess configuration (3D Chess at 4.69 s = 78% of its deadline; Candela 2.00 s); choose their policies by measurement
- Persist the compiler bytecode cache in flash across boots, keyed by source digest (the boot's first compile still parses, ~0.5 s)

## [PICOCALC-RAY-PARITY](2026/11/21/PICOCALC-RAY-PARITY--make-typed-compiler-optimizations-cumulative-and-close-the-ray-tracer-s-gap-to-c/index.md)

Make Typed compiler optimizations cumulative and close the ray tracer's gap to C. 12 tasks done, 7 open.

- Phase 5: span and row-shadow algorithm in raytrace.typed, ported to C for the fair reference
- Phase 6: typed views of other element widths (i16/i32)
- Phase 3b: non-negativity facts for division and remainder by constants (loop counters, products of non-negative values)
- Phase 3c: reduce the compile cost of versioning (ray cold compile 1.45 s on the device)
- Phase 3d: hoist the per-pixel guard of the inlined sphere loop (count reloaded from work per pixel)
- Workbench: native RV32 interpreter global (I1), --arg channel (I2), result store (I5), per-block stats.paired (I6)
- … and 1 more (`docmgr task list --ticket PICOCALC-RAY-PARITY`)

## [PICOCALC-REPO-LAYOUT](2026/11/21/PICOCALC-REPO-LAYOUT--give-every-piece-of-code-one-home-and-keep-ttmp-as-the-work-log/index.md)

Give every piece of code one home and keep ttmp as the work log. 2 tasks done, 12 open.

- Phase A: promote the measurement harness into bench/ (host, board, reference) and reproduce current numbers
- Phase B: pin the playable firmware in the repo (profile, digests, stable artifact store) and make restore use it
- Phase C: move the Typed compiler to compiler/typed and the link adapters next to their worlds
- Phase D: move the firmware tree (nucleus, port, sdk, natives, host, sim, third_party, fs-seed) to firmware/
- Phase E: move apps (Typed worlds, JS worlds, simulator tours) to apps/
- Phase F: remove tracked build output and stale directories; fix .gitignore
- … and 6 more (`docmgr task list --ticket PICOCALC-REPO-LAYOUT`)

## [PICOCALC-TYPED-F32](2026/11/21/PICOCALC-TYPED-F32--a-single-precision-float-type-for-the-typed-compiler-with-rv32f-code-generation/index.md)

A single-precision float type for the Typed compiler with RV32F code generation. 0 tasks done, 0 open.

## [PICOCALC-CANDELA-GALLERY](2026/11/22/PICOCALC-CANDELA-GALLERY--a-gallery-of-candela-path-traced-scenes-on-the-picocalc-s-screen/index.md)

A gallery of Candela path-traced scenes on the PicoCalc's screen. 8 tasks done, 1 open.

- Milestone B: the Candela world's front end on the real renderer
