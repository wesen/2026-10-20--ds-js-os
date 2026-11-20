---
Title: Native measurement investigation diary
Ticket: PICOCALC-RENDER-BINARY
Status: complete
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

## Step 2. Freeze the native reader before the board window

I used the principal's v1 format and JS-generated specimens as the source of truth. Editor was opened after the group's fixture-selection freeze. The fixture generator read the four raw JSON and binary files, compared them byte for byte with the principal's encoder, and embedded them along with independent reference weights in a constant header.

### Prompt Context

See Step 1. **Commit (code)** `7ffd3a6` freezes the board-side reader and fixture header.

### What I did

Implemented a canonical preorder verifier for all eight tags, a direct array load, binary search for named fields, structural validation on cJSON, identity and shape checks, UTF-16 scalar hashing and a matched full traversal. Sent the director the include, fixture header and dispatch signature. Ran a cross-compiled-compatible host smoke test on all eight arms. Separated older/incoming generations in a host-only rejection test.

### Why

A range check on an offset alone cannot prove that two records do not alias. The validator advances one expected body cursor and requires each non-immediate value's offset to equal it. Array- and map-body headers reserve all their child slots before any nested body is visited. The check therefore rejects overlaps, backward references and unused body bytes.

### What worked

All eight native arms matched all three independently computed JS weights on the fixed corpus. AddressSanitizer, UndefinedBehaviorSanitizer and LeakSanitizer passed four genuine screens and 56 rejected replacements. The old active screen remained readable in the standalone admission model. The director received frozen reader SHA-256 `7fc214a24f2c3e241bf4572ef634eced7967c8ea342e841bbe67f78cfd647918` and header SHA-256 `4689eee71f899c5c258929f1936fa5cb4f5c0082fded073fdb6c0530096e4bf2`.

### What didn't work

The first sandboxed sanitizer process printed `LeakSanitizer has encountered a fatal error` and `LeakSanitizer does not work under ptrace`. The identical fixed executable passed outside the ptrace sandbox after approval. The initial pkg-config cJSON discovery failure is recorded in Step 1.

### What I learned

Both cJSON and a byte-index reader can traverse contiguous logical content efficiently. The number-to-text and UTF-16 checksum work must remain equal. Object and array access should be measured separately from representation materialization and release.

### What was tricky to build

cJSON truncates text at embedded NUL. Both native arms reject that domain before use, including the escaped zero in JSON and the literal zero in PSIX strings. A deliberately stricter 4,096 string-occurrence limit bounds the fair native domain without allocating a deduplication map on JSON admission. Duplicate object fields are rejected on both paths.

### What warrants a second pair of eyes

The native JSON fixture reader validates after ordinary cJSON materialization. Its extra preflight bounds nesting and handles the NUL subdomain. The C hash's numeric formatting is checked byte-for-byte via the corpus-specific JS witnesses. The native study makes no universal claim about arbitrary IEEE double formatting.

### What should be done in the future

Measure the two actual native entry points on one P4 with the fixed fixture hashes.

### Code review instructions

From the repository root run `python3 TICKET/scripts/native/06-native-trials.py /home/manuel/esp/esp-idf-5.4.2/components/json/cJSON OUTPUT.json`. To run sanitizers, compile `04-validation.c` with `-fsanitize=address,undefined -g -O1` and the IDF cJSON source and include path. The common firmware dispatch calls `bx_trial` only with fixed catalog names and repetitions.

### Technical details

Each binary receipt is copied into one owned native buffer. cJSON owns its parsed allocation chain. The separate allocator probe counts requested payload, with the input and local stack outside its measurement.

## Step 3. Count allocations and interpret the physical receiver

The director provided 56 physical native rows from seven blocks with eight repetitions per row. I checked the wire length, lookup, thirty-two repeated lookups and full checksum from every row against the corresponding JS fixture and block. A separate fresh host allocator run counted the cost of holding an old and new screen together.

### Prompt Context

See Step 1. The director handled the physical image and requested reviewed measurements for the principal Opus report.

### What I did

Parsed all blocks with `07-device-results.py`. Computed the median of per-block means; the admission–walk–release total is the median of the sum within each observation. Compared the extra QuickJS encoder cost with the maximum observed native consumer saving from a single read. Reported findings to the director and principal and wrote the factual appendix.

### Why

The P4 measures the cost of receiver allocation, checks and teardown in a native runtime. Current production paths may have different producer, handoff or compositor costs. A consumer change alone cannot answer a whole application question.

### What worked

One Chess generation took 48,257 requested host cJSON payload bytes and 1,360 allocations compared with one 2,761-byte binary copy. On P4 the median native Chess admission–walk–release time fell from 13.203 to 1.815 ms. All four consumer lifecycles shortened. Seven matched physical blocks per app passed all checksum checks.

### What didn't work

Direct array addressing did not guarantee a faster selected path. Across 32 System probes, cJSON took 179 µs and the indexed format 193.75 µs. The binary full walk was slightly slower on Chess, Snake and Editor. A single consumer's savings were smaller than the separately measured additional QuickJS binary encoding cost on every workload.

### What I learned

Allocation and release move the verdict most strongly for this native consumer. Many labels and coordinates still need decoding or checksumming in a full walk. The relation between costs is architecture-dependent.

### What was tricky to build

The source and receiver language matter. A brief independently implemented host-only writer verified that the same canonical bytes can be generated natively. A separate funded producer group was already working on a matched native producer, so their implementation owns the durable production-cost comparison. The prototype remains scratch; the appendix makes no claims from it.

### What warrants a second pair of eyes

Two pinned receiver generations in the allocator probe are a model. The printed live bytes do not include queue copies, caller input, pixel buffers or allocator metadata. The statistical comparison subtracts stage medians; it is explicitly an accounting projection.

### What should be done in the future

Use the producer study and a production-shaped native painter to determine whether the paired native path merits integration.

### Code review instructions

Start with `reference/04-native-reader-evidence.md`, `various/native-host.json` and `various/native-p4.json`. The extractor in `scripts/native/07-device-results.py` verifies every native row against its signed/unsigned-independent primary JS checksum before summarization.

### Technical details

Trace firmware identity and both code/fixture hashes are in the hardware receipt. Full-object cJSON traversal iterates siblings once. The binary walk reads ordered slots without rebuilding an object tree. Both produce the same index-weighted array and key-weighted object checksum.
