---
Title: Board and display qualification diary
Ticket: PICOCALC-MOBILE-PAINTER
DocType: reference
Status: active
Topics:
  - picocalc
---

# Board and display qualification diary

## 1. Establishing the control

The director assigned the handheld and the old-renderer control to one operator. The original user request is held in the director's diary. The delegated objective was to qualify live application rendering on the board, distinguish real input hardware from substituted input, and leave qualified ordinary firmware installed. I used the existing device lock and build receipt.

The isolated shell returned `no ports found` for `python3 -m serial.tools.list_ports -v`. Approved enumeration on the host found the CH343 on `/dev/ttyACM0`. ESPTool verified the installed application at 0x10000 and the partition table at 0x8000. The normal input preflight failed. I²C0 grew from 189 transfers and 189 errors to 212 transfers and 212 errors. The display had finished 66 transactions at boot with zero SPI errors. The board driver documents that an interrupted STM32 requires a full handheld power cycle. An ESP32 reset restarts only the application processor.

I used the prior Snake experiment's memory-key measurement image. The test set its temporary flag, sent the launch shortcut h, then Up and Right, collected the pictures, and restored the release. The cursor borders appeared at (168,210), (168,184) and (194,184). A separately compiled Wasm game using the release renderer matched every pixel below row 21 at all three states. The first comparison attempt incorrectly treated a 640 × 640 host rendering as the 320 × 320 source. The fourfold cursor count exposed the 2× display scaling. The comparator now checks each 2×2 block before inverse scaling. [Raw comparisons](../various/device/previous-control-pixels.json) · [Normal control failure](../various/device/normal-control.json)

## 2. Independent review and transfer observation

I sent a generic pixel-equivalence question from an empty temporary directory to Claude Code with `--model opus --effort high --tools "" --strict-mcp-config --disable-slash-commands --no-session-persistence`. The returned model was claude-opus-5-5. The reviewer distinguished memory, transfer counts, completed payloads and optics, and proposed several stronger controls. Our fixed mask covers the 22 dynamic system rows. We retain full screenshots, compare the application bytes literally, and separately reconstruct the panel payloads. The work uses neither an optical sensor nor a blinded run order. The retained review records the exact input digest, CLI version and method. [Prompt](../scripts/device/methods.txt) · [Methods review](../various/device/opus-methods.json)

I staged small hooks in private copies of bus_p4.c and main_p4.c. The first hook observes each returned DMA transaction before its bounce buffer can be overwritten. The second queries the accumulated logical panel pixels. It was important to capture the small unaligned tail of a transaction as well as each full DMA chunk. Both enter the comparison, in completion order. The release image contains neither hook.

## 3. Verifying completed writes in the control

The independently built control image (SHA-256 prefix 79faa875) combined the original release's renderer with the count-register substitution and the SPI observer. ESPTool verified its flash contents. The three application-region CRCs were e7f6b2d0, ac694560 and 478e7dea in order. Each matched the UART screenshot. At the checkpoints the observer had consumed 561,666, 563,970 and 566,370 pixel bytes across 20, 22 and 23 completed windows since boot. All windows ended on the expected last pixel. The observer and bus fault counts stayed at zero. Checkout, compilation, flashing and return to the release are separate from these observation windows. [Control receipt](../various/device/observed-control.json) · [Immutable source and binary digests](../various/device/control-build.json)

The first candidate build stopped while generating its shared CJI unit with `the world runtime's export list (src/prelude-exports.js) is not the runtime's: run node tools/gen-prelude-exports.mjs`. The director regenerated the shared export list. A subsequent review identified that the ESP-IDF loader disables cache while relocating its program. The compiler moved this step from the PSRAM-backed worker stack onto the existing internal kernel stack. The producer also removed a freestanding 64-bit shift helper that the reactor's native resolver could not supply. No image containing these problems ran on the board.

I checked the Ninja compilation log after re-staging changes. It had rebuilt the game reactor but omitted the kernel service object even though its implementation had changed. Copying a workspace source with its original timestamp after compiling an older copy can cause this. The staging script now compares content and timestamps changed copies at staging time. I invalidated the experimental project's old C objects once. The subsequent incremental build explicitly compiled the service, installer and kernel, as well as the reactor. The build integration and original qualification harness are in commit `6175ede`.

## 4. The compiler succeeded while the compositor failed

The first physical candidate built the 50,370-byte Chess source in 2,316,713 µs and dispatched its painter to the background compiler. The compiler succeeded in 1,186,403 µs with a reported peak QuickJS heap of 537,704 bytes. Its linked image occupied 17,456 bytes. During startup the compositor exceeded its 80 ms draw deadline and restarted. The boot health check rejected the candidate before key injection. Successful compilation did not qualify this firmware. The script verified its rollback to the old release. [Failure trace](../various/device/first-candidate-trace.json) · [Exact failed build](../various/device/first-candidate-build.json)

The log establishes the overlap. The logger prints the function-mode line after evaluating the compiler frontend and before invoking its entry, so even a draw fault printed before that line can overlap the compiler. The failed capture did not record the compositor callback's exact duration or sample a bus-contention counter. Shared-memory contention was a hypothesis. To test scheduler isolation, the director selected the kernel's own core for the lower-priority compiler task and kept the compositor deadline intact.

## 5. Qualifying the revised scheduler, restart and release pair

The second candidate ran the compiler worker at priority two on core one. The kernel runs at priority five on that core. The eight-second wall bound includes time the worker yields to the application. The unchanged 80 ms limit on compositor turns still governed every normal draw.

The received painter compiled in 1,029,397 µs including the outer setup and relocated in 721 µs. The one packet at boot yielded one execution. Opening Chess on e2 yielded one rasterization. The two arrows each yielded one more packet, execution and rasterization. The native times were 192 µs at e3 and 189 µs at f3. Both matched the original screenshots and completed SPI checksums. The intentional compositor restart requested the source and state again. It retained the same program and command list and repainted f3 without another cursor key. All four screenshot checks passed with one compile and zero rejections. The runner then restored the verified old image. [Physical candidate receipt](../various/device/observed-mobile.json) · [Exact host pixel checks](../various/device/mobile-pixels.json)

I used the same private build directory to produce the ordinary firmware. Only bus_p4.c and main_p4.c were recompiled. These removed the count-register substitution, display observer and observer console command. The compiled world, reactor, ELF painter slot, manifest and partition hashes all matched. I archived the ordinary image under `/tmp/mobile-painter-production/build` and used the accepted physical receipt as the prerequisite for final installation. [Observed build](../various/device/observed-build.json) · [Ordinary build](../various/device/ordinary-build.json)

## 6. Ordinary installation and board handoff

ESPTool verified the entire 4,254,720-byte application against flash at 0x10000 and its 3,072-byte partition table at 0x8000. The ordinary painter compiled once in 1,022,094 µs, relocated in 872 µs, and executed one state in 133 µs. The foreground launcher had yet to paint Chess. The eight checked native worlds all had zero restarts and empty last-error records. SPI2 had completed 66 transfers with zero errors. The physical keyboard preflight recorded another 24 failed transactions. The retained ordinary image and receipt are in `/tmp/mobile-painter-production`. I handed the board lock to the subsequent PIE study operator and identified this copy as the verified image to restore. [Ordinary installation receipt](../various/device/ordinary-install.json)
