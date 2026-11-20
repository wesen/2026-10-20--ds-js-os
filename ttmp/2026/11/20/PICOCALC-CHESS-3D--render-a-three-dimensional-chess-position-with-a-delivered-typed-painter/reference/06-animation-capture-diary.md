---
Title: Independent observer diary for physical Chess camera animation
Ticket: PICOCALC-CHESS-3D
DocType: reference
Status: complete
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

## Step 4. Check negative controls and diagnose the first observed build

A native UBSan mock of the two actual observer includes exercised 33 ordered phases, a compositor epoch/handle, delayed first and final SPI windows and a partially transferred final window. The marker stayed unset until the final transaction. Deliberately skipping a phase stopped capture, and altering a reconstructed panel pixel caused the expected mismatch. I also inspected the full observed-image build failure. Its C compiler reported redeclarations of camera_painted and camera_panel_end_window. The wrapper then contained both a conditional invocation and a second invocation of the staging script. The owner removed the duplicate call, and I added a six-anchor preflight to make a complete repeated installation a no-op while rejecting partially applied hooks. The observation build runs against fresh private source copies.

## Step 5. Audit the real orbit on the PicoCalc

The first observed run read the painter service while a healthy asynchronous compilation was still underway. Its status showed one compilation, zero rejects, and installation pending. The raw UART subsequently recorded successful compilation. The director corrected both pre- and post-test readiness polling and ran the same observed image again. The second run captured all four real F4 turns under a single authorized compositor identity. Its state marker was CAMSTATE 33 0 0 0. World 3, epoch 0 and DMA handle 6 remained constant. Every expected panel window completed and every full-frame comparison succeeded.

I independently parsed the saved UART bytes after the observer state marker. All 33 shot payloads matched their run counts, CRC32 values and 204,800-byte RGB565 files. The host body-plus-hints reference matched every byte of phases 0 through 31 and the returned phase zero. After converting the original raw pixels, the full 320 × 320 PNGs and all 32 GIF frames reproduced their colors exactly. Each physical frame used at most 22 distinct colors. The resulting GIF SHA-256 is 8d626a9ca9b09abecb624d9899ca17cce43f4ef64c82a920df9958d88acdb4c6. The first review of the UART tail also found later screenshots from independent interaction checks. The offline decoder deliberately takes the 33 shot replies immediately following the completed observer state.

The elapsed times from the first painter entry in each quarter to its final completed SPI window were 528.919, 515.609, 523.726 and 545.951 ms. The 28 intervals between physically completed changes inside the four turns ranged from 58.057 to 91.870 ms with a median of 67.007 ms. The times include the instrumentation. The original application frames run continuously within each turn. Reading endpoint evidence introduces a gap between successive key presses; the exported looping GIF uses measured within-turn cadence at these boundaries.

The real capture is under /tmp/chess-camera-smooth-run2. The comparable host references are under /tmp/chess-camera-smooth-refs. A read-only audit can be reproduced without serial access:

```sh
python3 -B scripts/camera/07-physical-animation.py /tmp/chess-camera-smooth-run2 /tmp/chess-camera-smooth-refs
```

Implementation checkpoints d1c0a44 and 85b3453 cover the private capture, staging and collector. The director owns release restoration and archive publication.
