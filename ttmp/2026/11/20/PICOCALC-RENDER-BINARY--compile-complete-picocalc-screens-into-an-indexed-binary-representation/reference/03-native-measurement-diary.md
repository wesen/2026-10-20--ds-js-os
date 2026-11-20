---
Title: Native measurement investigation diary
Ticket: PICOCALC-RENDER-BINARY
Status: active
Topics: [picocalc, performance]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Independent native reader and cJSON measurements for Opus's binary group.
---

# Native measurement investigation diary

## Step 1. Match a native materializing control to direct indexed reads

The director commissioned an independent native-language comparison. I located ESP-IDF's own bundled cJSON and the producer group's chosen full-tree and sparse weight functions. The native pair will consume their same canonical bytes, scalar paths and expected hashes with no changes to the codec.

### Prompt Context

The original user commission is recorded verbatim in the Snake operator diary Step 1. The director assigned this follow-up as a native measurement role under the same principal Opus High investigator. No physical device access is assigned to this role.

### What I did

Inspected the candidate protocol under construction, the generic JSON envelopes and production ESP-IDF cJSON source. Asked the principal for the frozen codec and Editor release.

### Why

A comparison between interpreted scalar access and QuickJS's builtin JSON parser cannot price the same algorithm implemented in C. A native baseline can change the inference.

### What worked

The same IDF cJSON sources are available to both Linux and the ESP32-P4 firmware build. The existing trace uses a repeatable hash of UTF-16 text and indexed fields so we can compare against the principal's JS witnesses.

### What didn't work

`pkg-config --libs --cflags libcjson` returned `Package 'libcjson', required by 'virtual:world', not found`. The project already has the actual IDF source available for direct host compilation.

### What I learned

The baseline is a linked child list after parse; full traversal should follow sibling links once, while sparse array lookup legitimately pays cJSON's index lookup cost.

### What was tricky to build

The checksum must interpret Unicode as UTF-16 code units even though both C backings hold UTF-8. Sender identity and tree shape require validation before access.

### What warrants a second pair of eyes

Bounds defined by the wire format and the cJSON library's supported text domain. This is a measured native receiver experiment; the renderer and encoder remain the primary group's controls.

### What should be done in the future

Open Editor only after the shared freeze. Hand the director a fixed catalog and board-callable function.

### Code review instructions

Start with the principal's scripts 02–04, then the programs under `scripts/native`.

### Technical details

ESP-IDF 5.4.2 ships the cJSON library under `components/json/cJSON`. The earlier published C raster used production RGB565, while this new comparison measures ingress and traversal.
