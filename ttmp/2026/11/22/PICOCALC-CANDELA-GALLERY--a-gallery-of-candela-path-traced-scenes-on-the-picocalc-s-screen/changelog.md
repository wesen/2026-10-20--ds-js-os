# Changelog

## 2026-11-22

- Initial workspace created

## 2026-11-22

Host preparation of 18 presets (CPU-KERNEL exportScene + SECTIONS translateProgram), vendored kernel and interpreter, renderer core; x86-64 frame-0 digests equal SECTIONS' for 9 scenes, RV32 B-01 equal rv32-nofma (2253ce7)

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a2a22bb8f46d24aa3/picocalc-os/nucleus/candela_gallery.c — renderer core
- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a2a22bb8f46d24aa3/ttmp/2026/11/22/PICOCALC-CANDELA-GALLERY--a-gallery-of-candela-path-traced-scenes-on-the-picocalc-s-screen/scripts/01-prepare-scenes.mjs — host preparation of the scene table

## 2026-11-22

Firmware integration behind PICOCALC_CANDELA_GALLERY; option-off build proven unchanged against main 5c01d81 (19 sources preprocess equal; compile commands, build.ninja, manifests equal) (f3ef8fa, 7e5d1ea)

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a2a22bb8f46d24aa3/picocalc-os/port/esp32p4/main/candela_gallery_p4.c — worker, console, CGAL records
- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a2a22bb8f46d24aa3/ttmp/2026/11/22/PICOCALC-CANDELA-GALLERY--a-gallery-of-candela-path-traced-scenes-on-the-picocalc-s-screen/scripts/05-same-without-option.py — preprocessed-source identity proof

## 2026-11-22

Device placement run: digests of B-01, R-01, W-02, X-04, S-02 equal RV32 references; internal stack saves 1-3%, running above the kernel task 28-36%; worker stack stays in PSRAM (a396d3b adds the core-1 probe, display bound, fewer repaints)

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a2a22bb8f46d24aa3/ttmp/2026/11/22/PICOCALC-CANDELA-GALLERY--a-gallery-of-candela-path-traced-scenes-on-the-picocalc-s-screen/various/device-03-placement/summary-tables.txt — placement table

## 2026-11-22

Full device run of a396d3b: 18/18 digests equal RV32; per-scene timings; probe 16.9% of core 1 taken; keys change the scene; worlds healthy (keyboard and display off by user). Gallery image 28d9a812... left installed; /tmp/picocalc-current-playable.txt updated (60761c2)

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a2a22bb8f46d24aa3/ttmp/2026/11/22/PICOCALC-CANDELA-GALLERY--a-gallery-of-candela-path-traced-scenes-on-the-picocalc-s-screen/various/device-04-a396d3b/summary-tables.txt — per-scene timings and agreement
