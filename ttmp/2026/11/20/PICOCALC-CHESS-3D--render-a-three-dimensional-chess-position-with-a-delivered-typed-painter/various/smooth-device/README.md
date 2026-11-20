---
Title: Replaying the physical Chess orbit and gameplay captures
Ticket: PICOCALC-CHESS-3D
Status: complete
Topics: [picocalc, graphics, testing]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Recover the original physical RGB565 frames and verify the complete animation offline.
LastUpdated: 2026-11-20T17:03:00-05:00
WhatFor: Reproduce the full physical camera capture.
WhenToUse: When reviewing the 32-phase Chess rotation.
---

# Physical smooth Chess captures

Open [smooth-rotation.gif](smooth-rotation.gif) for the complete panel-paced revolution and [gameplay.gif](gameplay.gif) for the four full moves. All displayed game and hint pixels were verified against a host reference. The ordinary release identity and eight-world boot result are in [receipt.json](receipt.json). The GIFs contain output from the private observation build, which uses a key-status substitute for the attached controller.

The 32 intermediate PNGs and wrap witness retain the physical RGB565 colors. The archive contains only the camera UART timing rows, frame packets and their decoded RGB565 buffers. To audit it from this ticket, supply an empty capture directory and a fresh reference directory.

```sh
node scripts/camera/01-match.mjs /tmp/chess-reference
node scripts/camera/02-paint.mjs /tmp/chess-reference
python3 -B scripts/camera/02-reference.py /tmp/chess-reference
mkdir -p /tmp/chess-capture-replay
tar -xzf various/smooth-device/phase-records.tar.gz -C /tmp/chess-capture-replay
cp various/smooth-device/phase-*.png various/smooth-device/smooth-rotation.* /tmp/chess-capture-replay/
python3 -B scripts/camera/07-physical-animation.py /tmp/chess-capture-replay /tmp/chess-reference
```

The stored [independent audit](independent-audit.json) was reproduced from the committed archive. The observer startup and final readback reports identify the app binaries and the verified partition. The ordinary firmware has the normal input driver and omits the observer's frame storage.
