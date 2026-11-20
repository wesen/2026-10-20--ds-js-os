---
Title: Native producer and complete-route investigation diary
Ticket: PICOCALC-RENDER-BINARY
Status: complete
Topics: [picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Matched native encoding of a resident cJSON tree into ordinary JSON or the frozen indexed binary format, with encoder, ownership and complete-route observations.
---

# Native producer and complete-route investigation diary

## Step 1. Freeze the producer input and charge the dictionary

The native reader can skip a second materialized tree. To find out whether that helps an entire native publication, both encoders must start with the same tree and pay for constructing a new message on every update. The director commissioned this part of the existing binary-screen group after its format and four input pairs had been frozen.

### Prompt Context

The director relayed the user’s request verbatim.

> can you start one more group that replaces JSON with a binary format that can more easily be indexed as well? If that experiment turns out well, we can pass it on to the other groups to skip the json part too

> same guidelines reading diary + project report apply

**Interpretation.** Implement the missing same-language native encoder, price the matching receive operation and hand the evidence to the group’s Opus author. The director operates the board and publishes the group result. **Intended outcome.** Determine how far the portable representation earns reuse, including the sender’s work.

### What I did

Read the fixed encode/admit implementation in scripts/02-binary-screen.js, the C receiver in scripts/native/02-native.inc, the frozen fixture header and source manifest. Wrote scripts/producer/binary_producer.inc and compiled it against the checked-out ESP-IDF 5.4.2 cJSON.c. A trial parses the source fixture into a resident cJSON tree once before its measured loop. G uses cJSON_PrintUnformatted. B builds a dictionary of UTF-8 names and values, computes body and directory size, allocates the exact output buffer, sorts each object’s fields and writes child references in canonical preorder.

### Why

Timing a reader over prebuilt bytes would hide dictionary construction and sizing. Parsing every input to simulate an application holding a resident tree would instead charge both encoders for unrelated setup. Every repetition encodes from the same immutable source, retains a new destination on the receiver, reads the same late field, then frees both sides’ temporary storage.

### What worked

All eight host treatments passed on the first implementation. Each binary output matched the JS-produced artifact byte for byte. All four native JSON outputs also matched the frozen JSON files byte for byte, including the textual spelling of numbers in these samples. A second qualification covered the signed-20-bit integer endpoints and adjacent floating representations, booleans, null, empty containers, Unicode, object order and duplicate-field rejection.

### What didn't work

Compiling the host heap probe with cc -m32 failed while including stdlib.h with “fatal error: bits/libc-header-start.h: No such file or directory”. The installed host toolchain lacks 32-bit libc development headers. The reports identify the host allocation census as 64-bit. A sandboxed sanitizer process reached “LeakSanitizer does not work under ptrace (strace, gdb, etc)”. The approved external sanitizer execution returned zero for the same build and all fixtures.

### What I learned

The sample sizes in bytes are 1,919/1,850 for System G/B, 3,443/2,761 for Chess, 758/766 for Snake and 3,105/2,572 for Editor. An indexed wire format can save receive work on a payload that grows in transit. This needs a separate time observation for the particular route.

### What was tricky to build

The JS layout first reserves all child-reference slots for a container, then writes descendant bodies in sorted-key order for objects and in presentation order for arrays. The size pass computes maximum simultaneous field-pointer workspace along a recursion path. Parent arrays of sorted member pointers remain valid while a child is written. The dictionary borrows immutable cJSON strings and uses sorted insertion; the writer looks up their final IDs after the complete pass. Numeric bounds and byte order match the frozen codec. The C reader and encoder share the cJSON text subdomain, which excludes embedded NUL characters.

### What warrants a second pair of eyes

The timed receive route copies the incoming binary wire to a separately owned buffer. JSON admission performs preflight, materializing parse, cap and shape validation. Both routes do one late path query. The fixture memcmp, semantic comparison, whole-tree witness and FNV digest occur outside the clocks. Release follows those checks in each arm, so cache state at release can reflect the preceding check. There is no second encode or parse in the timed sum.

### What should be done in the future

Run the same staged include on the P4. Establish a real application-facing producer and a compatible painter before substituting this route into any other group’s existing firmware.

### Code review instructions

Start at bp_run and bp_encode in scripts/producer/binary_producer.inc, then read the frozen bx_open and bx_jverify. Run scripts/producer/reproduce.sh from the repository root. The optional first argument is a cJSON source directory and the second is a scratch output directory.

### Technical details

PSIX v1 holds a 13-byte header, a string directory of N+1 little-endian 16-bit offsets and packed 24-bit references. One sender allocation contains the wire result. Dictionary reallocations and one field-pointer array are charged; no dictionary survives a publication. The fixed input tree and canonical witness values are identical in all repetitions. No staging or upload command in this child work accesses hardware.

## Step 2. Separate sender, receiver and allocation evidence

I ran nine alternating G/B order blocks on the host with 32 re-encodings per cell. A separate executable instruments requested allocation sizes for one operation and explicitly checks that every owned allocation returns to its prior baseline. The timed executable uses ordinary malloc, realloc and free.

### Prompt Context

See Step 1. The aim is to identify whether the sender or receiver produces a win and make the memory price visible.

### What I did

Stored all 72 host block cells in scripts/producer/results/host.log. Summarized the median per screen and block-paired B/G ratio, and retained independent allocation and bytewise verification receipts.

### Why

A smaller packet can require more sender work. An object-tree parser can also dominate time and heap even when both packets have similar lengths. Counting them as one undifferentiated duration would conceal the placement decision.

### What worked

Median full-route microseconds G/B were 40.25/21.84 (System), 85.00/29.34 (Chess), 18.53/6.78 (Snake) and 74.97/22.13 (Editor). System’s encoder alone took 12.59/18.94 µs. The other encoder pairs took 30.69/25.31, 6.19/5.66 and 26.00/18.63 µs respectively. The complete native host route improved for all four.

### What didn't work

The native binary representation increased the System sender time and made Snake eight bytes longer. Neither observation alone predicts the full-route outcome.

### What I learned

G/B peak requested bytes above the common resident cJSON source were 19,196/3,700 (System), 51,701/5,522 (Chess), 9,467/1,532 (Snake) and 45,433/5,144 (Editor). B admission allocated one owned copy per packet. G admission issued 543, 1,360, 260 and 1,181 allocator calls, including reallocations.

### What was tricky to build

The output string from cJSON includes a trailing NUL in its allocation, with only its actual UTF-8 content charged on the wire. The binary output is never NUL-terminated. The meter tracks ordinary requested sizes after each allocator return. It excludes allocation metadata, possible allocator-internal transient realloc storage, stack and private libc qsort workspace. It meters application/cJSON malloc calls and the scratch pointers. Source, wire and new decoded view are simultaneously live at admission.

### What warrants a second pair of eyes

These C sources vary the representation from an already resident cJSON tree. Current app producers use different runtimes, including native paths which already write serialized data. This study establishes a same-representation cost comparison for native integration design, not the cost of migrating those renderers to cJSON.

### What should be done in the future

Report the physical stage and its measured ownership boundary separately from the host heap model and the existing JS encode path.

### Code review instructions

Review scripts/producer/heap.c, host.c and summarize.py along with results/allocation.ndjson and results/host-summary.json. The board integration entry is bp_trial(arm,reps).

### Technical details

The 64-bit host has sizeof(cJSON)=64 and an 8-byte pointer. B’s explicit dictionary and field-array scratch costs in fixture order are 1,176, 608, 640 and 392 bytes. The board's 32-bit pointer width halves those specific requests. Repeated lookup/paint costs and the entire application pipeline are separate endpoints.

## Step 3. Verify the physical end-to-end stage and hand the evidence to Opus

The director supplied seven rotating P4 blocks for all eight arms. I checked the measurements against the already committed host outputs, placed the full native-producer evidence inside the child study, and sent both the positive route result and the sender-only loss to the principal researcher for the joint article.

### Prompt Context

See Step 1. The user asks whether this format can help the other groups skip JSON. The relevant issue is whether the improvement persists after *both* endpoints pay their measured costs.

### What I did

Ran scripts/producer/qualify-board.py against /tmp/pico-render-board-05/physical.json. It checks 56 unique block/arm pairs, eight repetitions per pair, all lengths and wire hashes against independent host records, exact addition of timed stages, and matched late and full scene witnesses. Stored the cells and paired calculations in scripts/producer/results/physical.json. Wrote scripts/producer/physical-appendix.md and sent the conclusion to the director and the group’s Opus author. The existing native source and host commit is 6dbecbb.

### Why

Pairing prevents clock or load changes between blocks from masquerading as representation gains. Distinct source and receiving ownership force the binary trial to pay for its immutable retained copy. Each paint backend still needs an integration experiment.

### What worked

All 56 cells passed and all 448 publications validated. Median total G/B milliseconds per screen were 5.175/1.484 (System), 16.915/2.027 (Chess), 2.619/0.525 (Snake) and 14.021/1.703 (Editor). Across the seven pairs, B/G ranges were 0.286–0.287, 0.119–0.120, 0.193–0.203 and 0.120–0.122 respectively.

### What didn't work

The standalone native binary encoder lost on all four P4 fixtures. For example, System rose from 525 to 1,328 µs per complete encoding. A live production migration based on sender-only savings would fail even on this matched neutral input.

### What I learned

The receiver’s allocation and release change the route result. Binary replaced an expensive materializing parse with validation over one retained buffer. A late lookup can itself become slightly slower and still be consistent with a much faster complete route.

### What was tricky to build

Both a late witness and a full screen witness are verified without secretly parsing again. Only the late access is priced here. The expensive full verification and wire comparison are out-of-band, and the measured release follows them. Each printed route sum equals encode + admit + late lookup + release exactly.

### What warrants a second pair of eyes

Review the endpoint with the application teams: these numbers require an already resident cJSON tree and native receiver; current JS or serialized producers do not satisfy that assumption automatically. The group's independent paint and view data have different timing boundaries.

### What should be done in the future

Use the director's application handoff in PICOCALC-RENDER-LAB/reference/03-how-application-researchers-can-evaluate-the-binary-screen-api.md to select one native integration. Include state construction or direct emission, owned publication, replay, real paint and a complete end-to-end comparison. Keep the JS evidence separate.

### Code review instructions

Read the physical appendix beside results/physical.json and run python3 -B scripts/producer/qualify-board.py on a full director receipt. The group author received the verified medians and scope limits as soon as the last pair arrived.

### Technical details

The experiment firmware SHA-256 is f8af1bbfd4478e569824512b18017d908217672f87c1ce37b342375cb7162e0d. The parent director owns verification and restoration of the everyday firmware. The child has no serial-device access.
