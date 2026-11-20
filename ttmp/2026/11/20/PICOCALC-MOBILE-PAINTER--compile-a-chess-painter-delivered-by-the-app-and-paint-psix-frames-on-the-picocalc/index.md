---
Title: Compile a Chess painter delivered by the app and paint PSIX frames on the PicoCalc
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/painter_commands.c
      Note: Validation and body rasterization
    - Path: repo://picocalc-os/port/esp32p4/main/painter_service.c
      Note: Kernel-lane retained view and asynchronous compiler
    - Path: repo://picocalc-os/worlds/chess/painter.typed
      Note: App-provided rendering program
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T15:44:53.531794284-05:00
WhatFor: ""
WhenToUse: ""
---

# Compile a Chess painter delivered by the app and paint PSIX frames on the PicoCalc

## The experiment

Chess sends the UTF-8 text of its painter at startup and publishes counted PSIX snapshots as positions change. The compositor's installation service compiles the delivered text to RV32. It invokes the resulting entry on a decoded position, checks the complete list of drawing commands, and presents through the ordinary framebuffer and SPI display path.

## Reading order

1. Begin with the [director’s technical report](analysis/01-from-a-delivered-program-to-a-painted-chess-position.md) and the [implementation guide](design-doc/01-a-chess-app-that-installs-its-own-native-painter.md).
2. Follow the [compiler](analysis/02-compiler.md), [message transport](analysis/03-transport.md), and [physical qualification](analysis/04-device.md) from source to visible output. Each chapter has an implementation guide and detailed researcher diary under design-doc and reference.
3. Read the [compiler-service proposal](design-doc/05-an-asynchronous-compiler-service-and-the-lifetime-of-a-painter-handle.md) for the proposed job and executable handle lifecycle.

The [director diary](reference/01-director-implementation-and-qualification-diary.md) records integration decisions and failures. Reproduction scripts live in scripts/compiler, scripts/transport, scripts/device, and scripts/director. Machine-readable checks and compact images live in various. See [tasks](tasks.md) and the [changelog](changelog.md) for delivery status.
