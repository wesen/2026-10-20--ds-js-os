---
Title: Blind indexed binary screen design and public laboratory notebook
Ticket: PICOCALC-RENDER-BINARY
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20
WhatFor: ""
WhenToUse: ""
---

# Indexed Binary UI Trees vs. JSON on a 320×320 Handheld: Study Design and Format Proposal (UITB v1)

## 1. Decision: general-purpose representation first

**Chosen for the first implementation:** a general-purpose, self-describing format. Values are tagged 8-byte slots, objects are keyed by small integer key IDs, and every reference is a 32-bit absolute offset. A compiler-known fixed schema (per-node-type field layouts, no tags, generated accessors) is **not** built yet.

Reasons:

1. **It isolates one variable.** The existing path is schemaless JSON. A general binary format is a lossless, mechanical transcoding of the same data model. The study can then attribute any difference to "binary + indexed + no allocation". A fixed schema would change two things at once: the encoding and the type discipline.
2. **The schema's upside is bounded, and the study measures the bound.** A schema removes two costs: tag checks and per-field key search. Both are a fraction of read time, and read time is a fraction of a frame that also writes 102,400 pixels (204,800 bytes). If the measured share is small, codegen cannot pay for itself. The study records exactly this share (criterion S1 below).
3. **The schema's costs recur.** It needs a schema language, generated code for both the producer and the renderer, and lockstep deployment. Because old generations can stay in flight, two field layouts would be live at the same time across every schema change.
4. **One reader serves all four workloads** and any later ones without regeneration.

**What this choice gives up:** in the worked example (§3.4), slots are 40% of the bytes, and every field read is a binary search over key IDs. Both costs are measured, and both have pre-set triggers for reconsideration.

**Key vocabulary is a separate, cheaper axis.** A resident key dictionary (compile-time key IDs) is not a fixed schema, because it fixes names, not layouts. It is tested as its own arm.

---

## 2. Study design

### 2.1 Arms (same device, same runtime, same painter backend)

| Arm | Path |
|---|---|
| **J0** | Existing JSON path, unmodified. Version hash recorded. |
| **J1** | JSON parsed by the existing parser, painted through the shared accessor interface. Prices the interface itself. |
| **BK** | UITB with an in-buffer key table (`dict_id = 0`). |
| **BD** | UITB with a resident dictionary (`dict_id ≠ 0`). |
| **BD+R** | BD with encoder dedup (hash-consing of strings and subtrees) and a pooled receive buffer. |
| **BD−V** *(ablation)* | BD with I32V disabled, so all arrays are ARR. Prices the typed vector. |

**Fairness rules:**
- If the runtime's JSON parser is native code, the UITB validator and reader are native too, built with the same compiler flags. If JSON is interpreted, UITB is interpreted. The level is reported.
- The painter is written once against a five-call accessor interface: `field`, `index`, `len`, `as_int`, `as_str`. Binary is compared against both J0 and J1.
- No arm is tuned after results are seen unless a notebook entry records the change and **all** arms are re-run.

### 2.2 Workloads

Each workload is a frozen deterministic trace: 600 generations, fixed seed, stored as JSON-data-model trees with the SHA-256 of each trace published before any UITB code exists.

| Workload | Shape | Stresses |
|---|---|---|
| System monitor | ~12 rows × 5 columns of labels, header, per-row bar canvas commands; numbers change every generation | Many small strings and objects |
| Chess board | 64 square nodes, ≤32 piece glyphs, highlight rects | Repetition, so dedup |
| Snake | Grid background, segment list, food; canvas tuples; fast tick | Numeric geometry, I32V |
| Text editor | ~20 visible lines up to 40 chars, including non-ASCII (é, ü, —, a CJK line), cursor, selection rects, line numbers | Long UTF-8 strings |

### 2.3 Per-generation pipeline (timed per stage)

`encode` (in the same runtime) → `transfer` (bytes counted; link time computed from measured link throughput L) → `validate`/`parse` → `read + full paint` of all 320×320 pixels.

**Correctness gate:** the framebuffer hash of every generation must be identical across all arms. Any mismatch blocks the timing results for that arm.

### 2.4 What gets priced

| Cost | Measure |
|---|---|
| **Wire bytes** | Raw bytes per generation. If the transport compresses, also bytes after that same compressor. Breakdown: header, block headers, slots, strings, key table. |
| **Time** | Per stage: median, p95, p99, max per workload. Frame cost model: `T = T_enc + B/L + T_val + T_paint`. |
| **Memory** | Peak heap during a frame. Retained bytes per in-flight generation for G ∈ {1, 2, 3}. Validator scratch (n/4 bytes). Allocation count per frame. Reader + validator code size (flash). |
| **Lookup** | Replay of the painter's recorded field-access trace, timed per access. "First-field latency": time from buffer arrival to reading one deep field. Key-resolution setup per buffer for BK (`K_used · log2 K` string compares). |
| **Resident dictionary** | RAM and flash bytes for each retained dictionary. Wire bytes saved per buffer. Coupling failures (dict ID unknown) under a forced version skew test. |
| **Reuse** | Bytes saved and encode time added by dedup. Allocations avoided by pooling. As a measurement only: the fraction of subtrees byte-identical to the previous generation, an upper bound for any future paint cache. |

### 2.5 Procedure and statistics

- The device runs at a fixed clock with background tasks stopped. Timing uses a cycle counter. There are 50 warm-up generations.
- Each arm runs 5 times, interleaved (J0 BK BD … J0 BK BD …) to spread drift across arms.
- Comparisons use 95% block-bootstrap confidence intervals (resampling generations within runs, 10,000 resamples) on per-workload p95 differences.
- **Independence:** the harness author is not the format implementer where staffing allows. Predictions and thresholds are committed before the first device run. Negative results are published in the same notebook.

---

## 3. Format proposal: UITB v1 (intern-facing)

### 3.1 Overview

- One buffer is one complete immutable tree.
- Byte order is little-endian. Every block starts on a 4-byte boundary. The receive buffer is 4-aligned in memory.
- Children are written before parents, so every reference inside a block points to an earlier block. This makes cycles impossible and validation a single forward scan.
- An array's child `i` is at a computed address, so earlier children are never read.

### 3.2 Header (28 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | 4 bytes | magic `55 49 54 42` ("UITB") |
| 4 | u16 | major = 1 |
| 6 | u16 | minor = 0 |
| 8 | u32 | total_len (n) |
| 12 | u32 | dict_id (0 = key table is in this buffer) |
| 16 | u32 | keytab_ref (0 if dict_id ≠ 0) |
| 20 | slot | root (8 bytes) |

### 3.3 Slots and blocks

A **slot** is 8 bytes: `u8 type, u8 0, u16 0, u32 payload`.

| type | name | payload |
|---|---|---|
| 0 | NULL | 0 |
| 1 | BOOL | 0 or 1 |
| 2 | INT | i32 |
| 3 | F32 | finite f32 bits |
| 4 | STR | offset of a STR block |
| 5 | ARR | offset of an ARR block |
| 6 | OBJ | offset of an OBJ block |
| 7 | I32V | offset of an I32V block |

A **block** starts with a header word `w`, where `kind = w >> 28` and `count = w & 0x0FFFFFFF`. The block kind equals the slot type that references it.

| kind | Layout | Size |
|---|---|---|
| 4 STR | w, `count` UTF-8 bytes, zero pad | 4 + ⌈count/4⌉·4 |
| 5 ARR | w, `count` slots | 4 + 8·count |
| 6 OBJ | w, `count` u16 key IDs (ascending), zero pad, `count` slots | 4 + ⌈2·count/4⌉·4 + 8·count |
| 7 I32V | w, `count` i32 | 4 + 4·count |
| 8 KEYTAB | w, `count` u32 offsets of STR blocks | 4 + 4·count |

**Encoder policy:**
- A number that is an integer and fits in i32 becomes INT. Otherwise, if it is exactly representable as a finite f32, it becomes F32. Otherwise the encoder rejects the tree and counts the rejection.
- A non-empty array of all INTs becomes I32V. Any other array becomes ARR.
- Duplicate JSON keys are rejected.

### 3.4 Worked example (BK arm, dedup on)

Input tree (105 bytes as compact JSON):

```json
{"type":"panel","kids":[{"type":"text","x":4,"y":8,"text":"CPU 42%"},{"type":"rect","box":[0,20,320,2]}]}
```

Keys sorted bytewise give these IDs: box=0, kids=1, text=2, type=3, x=4, y=5.

| Off | Size | Block | Contents |
|---|---|---|---|
| 0 | 28 | header | UITB, 1.0, n=268, dict=0, keytab=76, root=(OBJ, 244) |
| 28 | 8 | STR "box" | key 0. Bytes: `03 00 00 40 62 6F 78 00` |
| 36 | 8 | STR "kids" | key 1 |
| 44 | 8 | STR "text" | key 2, **and** the value of the text node's `type` (dedup) |
| 52 | 8 | STR "type" | key 3 |
| 60 | 8 | STR "x" | key 4 |
| 68 | 8 | STR "y" | key 5 |
| 76 | 28 | KEYTAB 6 | 28, 36, 44, 52, 60, 68 |
| 104 | 12 | STR "panel" | |
| 116 | 12 | STR "CPU 42%" | |
| 128 | 8 | STR "rect" | |
| 136 | 44 | OBJ 4 | keys @140: [2,3,4,5]. Slots: @148 STR 116, @156 STR 44, @164 INT 4, @172 INT 8 |
| 180 | 20 | I32V 4 | 0, 20, 320, 2 |
| 200 | 24 | OBJ 2 | keys @204: [0,3]. Slots: @208 I32V 180, @216 STR 128 |
| 224 | 20 | ARR 2 | @228 OBJ 136, @236 OBJ 200 |
| 244 | 24 | OBJ 2 | keys @248: [1,3]. Slots: @252 ARR 224, @260 STR 104 |
| 268 | | end | n = 268 |

Header bytes:

```
0000: 55 49 54 42 01 00 00 00 0C 01 00 00 00 00 00 00
0010: 4C 00 00 00 06 00 00 00 F4 00 00 00
```

**Reading `root.kids[1].box[2]`:**
1. Root slot @20 → OBJ 244. Binary-search keys @248 for id 1 → index 0. Slot @ 244+4+4+8·0 = **252** → ARR 224.
2. ARR 224, index 1 → slot @ 224+4+8·1 = **236** → OBJ 200. Block 136 (child 0) is never touched.
3. OBJ 200, id 0 → index 0 → slot @ 200+4+4 = **208** → I32V 180.
4. I32V 180, index 2 → i32 @ 180+4+4·2 = **192** → **320**.

**Byte accounting:**
- BK = 268 bytes (2.55× JSON).
- BD = 200 bytes (1.90× JSON). The key table and key strings are gone, but "text" must be re-emitted as a value string.
- In BD, the 10 slots take 80 of the 200 bytes (40%).

### 3.5 Pseudocode

```python
def size(kind, c):
    return {4: 4 + up4(c), 5: 4 + 8*c, 6: 4 + up4(2*c) + 8*c,
            7: 4 + 4*c, 8: 4 + 4*c}[kind]        # unknown kind -> reject

def validate(buf, resident):                     # returns ok or raises Reject
    n = len(buf)
    req(28 <= n <= 1 << 20 and n % 4 == 0 and buf[0:4] == b"UITB")
    req(u16(buf, 4) == 1 and u16(buf, 6) == 0 and u32(buf, 8) == n)
    dict_id, kt = u32(buf, 12), u32(buf, 16)
    if dict_id == 0:
        req(kt != 0)
    else:
        req(kt == 0 and dict_id in resident)
    depth = bytearray(n // 4)                    # 0 = not a block start
    max_key = -1
    p = 28
    while p < n:
        w = u32(buf, p); kind, c = w >> 28, w & 0x0FFFFFFF
        s = size(kind, c); req(s <= n - p)
        d = 1
        if kind == 4:
            req(utf8_ok(buf[p+4 : p+4+c]) and zero(buf[p+4+c : p+s]))
        elif kind == 5:
            for i in range(c):
                d = max(d, 1 + slot(buf, p + 4 + 8*i, depth))
        elif kind == 6:
            ks = [u16(buf, p + 4 + 2*i) for i in range(c)]
            req(strictly_ascending(ks) and zero(buf[p+4+2*c : p+4+up4(2*c)]))
            if ks: max_key = max(max_key, ks[-1])
            base = p + 4 + up4(2*c)
            for i in range(c):
                d = max(d, 1 + slot(buf, base + 8*i, depth))
        elif kind == 8:
            req(dict_id == 0 and p == kt)
            prev = None
            for i in range(c):
                r = u32(buf, p + 4 + 4*i)
                req(is_block(r, 4, depth))
                cur = str_bytes(buf, r)
                req(prev is None or cur > prev)
                prev = cur
        req(d <= 32)
        depth[p // 4] = d
        p += s
    req(p == n)
    slot(buf, 20, depth)                         # root, any type
    K = count(buf, kt) if dict_id == 0 else resident[dict_id].size
    if dict_id == 0:
        req(is_block(kt, 8, depth))
    req(max_key < K)

def slot(buf, q, depth):                         # returns depth contribution
    t, v = buf[q], u32(buf, q + 4)
    req(buf[q+1 : q+4] == b"\0\0\0")
    if t == 0: req(v == 0); return 0
    if t == 1: req(v <= 1); return 0
    if t == 2: return 0
    if t == 3: req(finite_f32(v)); return 0
    req(t in (4, 5, 6, 7) and is_block(v, t, depth))   # only earlier blocks are marked
    return depth[v // 4]

def is_block(r, kind, depth):
    return r % 4 == 0 and 28 <= r < len(depth) * 4 and depth[r // 4] and kind_at(r) == kind
```

Reader functions. These are only callable on a handle returned by a successful `validate`:

```python
def field(s, key_id):                            # s is an OBJ slot
    b = s.payload; c = count(b); lo, hi = 0, c
    while lo < hi:
        m = (lo + hi) // 2; k = u16(b + 4 + 2*m)
        if k == key_id:
            return slot_at(b + 4 + up4(2*c) + 8*m)
        lo, hi = (m + 1, hi) if k < key_id else (lo, m)
    return MISSING

def index(s, i):
    b = s.payload; req(i < count(b))
    if s.type == ARR:
        return slot_at(b + 4 + 8*i)
    if s.type == I32V:
        return Slot(INT, i32(b + 4 + 4*i))
```

**Encoder:** a post-order walk. Each block's bytes are finalized after its children's offsets are known. With dedup on, a map from block bytes to offset returns the existing offset, so one map deduplicates both strings and whole subtrees. For BK, the key strings and the KEYTAB block are emitted first.

**Renderer:** BK resolves its compiled-in key names to IDs once per buffer by binary search over KEYTAB. BD uses constants. A rejected buffer is never painted; the previous generation stays on screen and a reject counter increments.

**Why validation is eager:** full validation is O(n), so on a full paint the arbitrary-jump property saves allocation and parse work, not asymptotic time. Its asymptotic benefit appears only for partial reads, which the first-field latency metric measures separately.

### 3.6 Well-formedness rules (closed)

A buffer is well-formed **if and only if** it satisfies all of W1–W12. Every other buffer is rejected whole.

- **W1** 28 ≤ n ≤ 2²⁰; n ≡ 0 (mod 4); u32@8 = n.
- **W2** Magic is `UITB`; major = 1; minor = 0.
- **W3** If dict_id = 0: keytab_ref is the start of a KEYTAB block. If dict_id ≠ 0: keytab_ref = 0, dict_id is resident in the reader, and the buffer contains no KEYTAB block.
- **W4** Blocks tile [28, n) contiguously from offset 28, with no gaps or trailing bytes. Each block's computed size fits in the buffer.
- **W5** Block kind ∈ {4, 5, 6, 7, 8}.
- **W6** All padding is zero: STR tail, OBJ key-area tail, and slot bytes 1–3.
- **W7** Slot type ∈ 0..7. NULL payload = 0. BOOL payload ∈ {0, 1}. F32 is finite. INT is unrestricted.
- **W8** Every reference (slot types 4–7 and KEYTAB entries) is 4-aligned and is the start of a block of the matching kind (KEYTAB entries reference STR). References inside a block point to a block that starts strictly before the referencing block. Header references may point to any block.
- **W9** STR bytes are well-formed UTF-8 per RFC 3629: no overlong forms, no surrogates, ≤ U+10FFFF. U+0000 is permitted.
- **W10** OBJ keys are strictly ascending and each is < K, where K is the KEYTAB count or the resident dictionary size.
- **W11** At most one KEYTAB exists, and it is at keytab_ref. Its entries' string contents are strictly ascending bytewise.
- **W12** Depth: inline slots contribute 0, STR and I32V blocks have depth 1, and containers have depth 1 + the maximum child depth. Every block's depth is ≤ 32.

**Explicitly permitted:** shared references (DAGs), unreferenced blocks, duplicate string contents, any root type, and empty STR, ARR and OBJ blocks.

**Conformance test requirement:** at least one negative test per rule, plus a mutation fuzzer run against a sanitizer-instrumented host build.

### 3.7 Published precedent

Both formats below are documented in the FlatBuffers project.

**FlatBuffers (schema-compiled):**
- Fields are reached through per-table vtables of field offsets.
- Vectors are length-prefixed and indexed in O(1).
- References are unsigned 32-bit offsets relative to their own position.
- A root offset sits at the buffer start.
- A verifier checks bounds before any access.

**FlexBuffers (schemaless):**
- Values are built bottom-up, so offsets point backward.
- The root is found at the buffer end.
- Maps hold a sorted key vector searched by binary search over key strings.
- Typed vectors exist for homogeneous scalars.
- Bit widths are packed per vector.

**UITB takes from these:** O(1) indexing, sorted-key binary search, backward offsets, typed vectors, and verify-before-read.

**UITB changes these:**
- Integer key IDs replace key-string comparisons.
- Fixed 32-bit widths replace width packing, for a simpler validator. Width packing is a v2 candidate.
- Self-describing block headers make the buffer scannable in one forward pass. This yields linear, non-recursive validation and DAG sharing without a memo table.

---

## 4. Promotion criteria (pre-registered; thresholds are proposals to confirm before NB-000)

**Promote BD to replace J0** only if all of the following hold on device:

- **C1 (correctness):**
  - 100% framebuffer hash equality across 4 × 600 generations.
  - Zero encoder rejections in the traces.
  - Every conformance negative test is rejected.
  - Zero out-of-bounds reads or crashes in 10⁶ mutated buffers.
- **C2 (time):**
  - Consumer p95 (validate + read + paint) improves ≥ 10% in ≥ 2 workloads, with the CI excluding 0.
  - No workload regresses > 3%.
- **C3 (memory):** with G = 2, peak RAM is ≤ J0 in every workload and ≥ 25% lower in ≥ 2 workloads.
- **C4 (wire):** bytes ≤ 1.5 × J0. If the measured `B/L` exceeds 10% of the frame budget, the limit tightens to ≤ 1.0 × J0.
- **C5 (cost):** added flash ≤ 8 KB; resident dictionaries ≤ 1 KB RAM in total.

**Other promotions and triggers:**

- **BD over BK:** BD saves ≥ 15% bytes or ≥ 5% median consumer time, and the version-skew test shows a clean reject with no wrong paint.
- **Dedup and pool (BD+R):** ≥ 10% bytes saved in ≥ 1 workload, encode time increase ≤ 20%, and zero per-frame allocations with the pool.
- **I32V stays:** BD−V is ≥ 10% larger or slower on snake. Otherwise I32V is removed from v2.
- **S1 (start a fixed-schema prototype):** in BD, key search + tag checks + type-string comparisons ≥ 15% of consumer p95 in any workload, **or** slots ≥ 40% of bytes while C4 fails.
- **Stop:** if C2 and C3 both fail, keep JSON and publish the result.

---

## 5. Three blind predictions (committed at NB-000, never edited)

- **P1 (bytes):** BD raw wire bytes are ≥ 1.2 × J0 in all four workloads, and BK is larger than BD in all four. Dedup reduces chess bytes by ≥ 30%, more than any other workload.
- **P2 (memory):** with G = 2, BD peak RAM is ≤ 60% of J0's in all four workloads. J0's retained per-generation cost exceeds 3 × its JSON text size.
- **P3 (time):**
  - In J0, paint is ≥ 70% of consumer time for chess and snake, so BD's p95 gain there is < 10%.
  - BD's largest gain is in system monitor or text editor.
  - BD key search + tag checks stay < 15% of consumer p95 in every workload, so S1 does not fire.

---

## 6. Public lab notebook (compact)

Format per entry: `ID | date | action | testable prediction | result`. Planned entries carry no dates; dates and results are filled in only after the entry is run.

```
NB-000 | 2026-11-20 | Publish plan, rules W1–W12, thresholds C1–C5/S1, P1–P3;
         record commit hash | — | pending
NB-001 | — | Freeze 4×600 traces, publish SHA-256 | ≥99% of numbers are integers
         within i16; zero non-exact-f32 non-integers | pending
NB-002 | — | Host validator + conformance tests + 10⁶-mutation fuzz under sanitizers
         | 0 OOB reads; every W-rule negative test rejected | pending
NB-003 | — | Device harness; J0 vs J1 | J1 consumer p95 within 5% of J0 | pending
NB-004 | — | Correctness gate for BK, BD, BD+R, BD−V | 100% framebuffer hash
         match | pending
NB-005 | — | Wire-byte breakdown, all arms | P1 holds; BD slots 30–45% of bytes
         | pending
NB-006 | — | Timing runs, 5 interleaved repeats | P3 holds | pending
NB-007 | — | Memory for G∈{1,2,3}; allocations per frame | P2 holds; BD+R
         allocations/frame = 0 | pending
NB-008 | — | Lookup replay, first-field latency, BK key-resolution setup | BK setup
         < 2% of consumer median; BD first-field latency < J0's by ≥ 5× | pending
NB-009 | — | Dict version-skew test; subtree identity vs previous generation |
         clean reject 100%; chess ≥ 80% of subtrees unchanged per generation | pending
NB-010 | — | Decision note against C1–C5/S1, including failed predictions | — | pending
```
