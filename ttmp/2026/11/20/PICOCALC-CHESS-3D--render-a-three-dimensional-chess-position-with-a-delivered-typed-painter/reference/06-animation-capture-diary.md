---
Title: Independent observer diary for physical Chess camera animation
Ticket: PICOCALC-CHESS-3D
DocType: reference
Status: active
Topics: [picocalc, esp32-p4, chess, rendering]
---

# Independent observer diary for the rotating Chess board

## Step 1. Establish which pixels and which time to record

The director requested a private observer-only capture of all 32 displayed phases of a real four-key orbit. My lane owns the observer and host collector. The director owns the production UI, native camera and serial connection. The exact phase references cover RGB565 rows 22 through 319. The top 22 chrome rows contain live system information. They require comparison to the physical display stream instead of a static application reference.

I traced four source boundaries. The trusted CJI drawing path checks the compositor's world name and a writable H_DMA handle before it calls the native painter. Afterwards the compositor paints hints and overlays. gfx_commit compares the framebuffer's front and back arrays and installs the new front pixels. The display world submits one CASET/RASET/RAMWR window for each returned rectangle and its pixel transactions. The previous panel observer reconstructs the bus image only after the SPI HAL reports completed transmissions. Capturing inside the painter would miss both the hints and any top-bar changes. Capturing only on the serial console would miss intermediate frames.

## Step 2. Stage bounded observers and preserve exact committed images

The additive private staging script instruments only the staged copies of native.c, main_p4.c and bus_p4.c. After each accepted draw it records the actual phase, world, epoch, authorized handle, buffer and painter entry timestamp. A matching compositor commit supplies the final front image and the count of rectangles submitted to display. Starting at a stable phase zero checks the live writable handle's identity again. A single PSRAM allocation holds 33 exact 204,800-byte images, a total of 6,758,400 bytes. The last slot witnesses the return to the initial phase after four turns.

On each new phase the observer copies the complete committed front into its immutable slot. Under the existing panel mutex it arms the target window number. Once the final DMA transaction of that window completes, it compares all 204,800 reconstructed bus bytes with the saved slot, checks panel fault state and records the completion time. Screens are later exported using the existing asynchronous shot encoder. The device halts observation on a phase gap or framebuffer/epoch change. The console reader refuses an unverified sequence. No UART export occurs between the frames of a quarter-turn.

## Step 3. Validate staging, target syntax and collector

I staged the existing panel observer, then the additional animation observer, in /tmp/smooth-camobs-offline. The produced three C translation units passed target GCC syntax checks using the actual ESP32-P4 toolchain and staged IDF compile flags. The first attempted compilation database was an image-only artifact directory; the existing private source build supplied the required compile_commands.json.

The host collector checks the CJI/commit/SPI order, 32 consecutive phase advances, a stable world/epoch/handle and a physical SPI result for all 33 frames. It checks base64, RLE count/extent, CRC32 and every application pixel against phase-00.ref through phase-31.ref. It writes entire, native-resolution images to PNG and RGB565 and reopens the GIF to verify all 32 frame durations and colors. Each of four endpoint dwell times in the GIF is set to the median within-turn interval to exclude the operator's long pause while reading endpoint evidence. Raw SPI timing retains those pauses.

A mock UART replay using the real set of 32 phase references, controlled timestamps and a synthetic empty header passed the full host collector. Its 32 GIF frames reproduced all 20 reference colors exactly. This test covers transport, conversion, ordering, duration and reference checks. No synthetic PNG or GIF is used as a hardware result. Serial access and the first physical capture remain with the director.
