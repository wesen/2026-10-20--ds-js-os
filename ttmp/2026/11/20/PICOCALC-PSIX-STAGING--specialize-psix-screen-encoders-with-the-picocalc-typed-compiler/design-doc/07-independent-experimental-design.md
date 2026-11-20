---
Title: "Independent experimental design for staged binary writers"
Ticket: PICOCALC-PSIX-STAGING
Status: complete
Topics: [picocalc]
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20
WhatFor: ""
WhenToUse: ""
---

# Independent experimental design for staged binary writers

This is the source-blind commission returned by Opus High. Its proposed format assumptions and planned controls describe a hypothetical design. For the actual implemented protocol, use the director guide and the source measurements. In particular PSIX v1 packs a four-bit tag and 20-bit payload, uses absolute packet offsets, and puts indirect numeric bodies in preorder. No measurements were supplied to this investigator at the design stage.

## 0. Reading guide

- **Sections 1–4** state the problem and teach the central argument with one worked example. A first-year intern should read these first.
- **Section 5** is the technical design: what is computed when, how code is generated, and how each hard case is handled (runtime strings, aliasing, ownership, initialization versus patching, new shapes, representation changes, front-end versus back-end reuse, language surface, and the plan interpreter).
- **Section 6** is the experiment: hypotheses, variants, workloads, the three benchmark phases, predictions with failure criteria, threats to validity, and decision rules.
- **Section 7** lists the primary references.
- **Appendix** is a short lab notebook: what was inferred and what evidence is still needed.

---

## 1. Problem statement

**Given:**

- A fixed, self-describing byte format **F**. It must not change.
- A generic runtime serializer **G** that turns any serializable value into an F packet.
- A compiler front end for a small typed JavaScript dialect. Its macro system separates expansion time from execution time and is hygienic, so expansions do not capture identifiers.
- Two back ends: WebAssembly and RV32.

**Goal:** produce specialized serializers **S** for two cases:

1. a **declared record type** `T`, known at compile time, and
2. an **observed shape** `σ`, a concrete object layout seen in a profile or at runtime, protected by a guard.

Each specialized serializer must satisfy the **equivalence contract**:

> For every input `v` accepted by the specialization (type `T`, or passing the guard for `σ`), `S(v)` produces exactly the bytes that `G(v)` produces. When `G(v)` fails, `S(v)` fails with the same error class at the same canonical position (§5.16). `S` has no observable effects that `G` lacks.

**Research question:** does the specialized serializer beat G, by how much, in which tier (compiled code, interpreted plan, or generic), and with which costs at compile time, at dispatch, and under steady repeated traffic?

**Non-goals:** changing F, changing readers, and generating machine code on the device at runtime.

---

## 2. Working model of the format

The problem description fixes these facts:

- The dictionary is packet-local, lexicographically sorted, unique, and UTF-8.
- Directories are nested and laid out in preorder.
- Slots are three bytes and tagged.
- Small integers are stored inline in the slot.
- Finite numbers that cannot be inlined go to eight-byte indirect storage.

Everything else below is an assumption to be checked against G's source and the format specification.

| # | Assumption | What the design does if it is false |
|---|---|---|
| A1 | The packet is laid out as header, dictionary, directory area, number area. Offsets inside the directory area are relative to its start. | If offsets are absolute, every directory reference depends on the dictionary's byte length, so more slots become dynamic. Slot payloads shift by a dynamic base. |
| A2 | The dictionary holds **all** distinct strings in the packet: keys **and string values**. | If it holds keys only, the dictionary of a declared record is a compile-time constant. The hardest coupling (§3, step 4) disappears. |
| A3 | A slot is one tag byte followed by a 16-bit little-endian payload. | Field widths are generator parameters. Only the bounds (A12) and the inline integer range (A9) change. |
| A4 | Tags include `NULL`, `FALSE`, `TRUE`, `SMALL` (signed 16-bit), `NUM` (index into the number area), `STR` (dictionary index), `OBJ`/`ARR` headers (payload is the entry count), and `DIR` (payload is the preorder ordinal of a child directory). | The tag set is a table in the generator. |
| A5 | An object directory is a header slot followed by one (key slot, value slot) pair per entry, in ascending key-index order. | If keys are implicit (for example, a separate key-index array), the layout arithmetic changes but the binding-time split does not. |
| A6 | An array directory is a header slot followed by value slots in element order. | Same as A5. |
| A7 | Preorder: a directory is followed by its children's directories in entry order, recursively. | Fixed by the problem statement. Listed only for completeness. |
| A8 | Number-area entries are not deduplicated. Their order is either **value-preorder** or **directory order**. Which one is unknown. | The generator must reproduce G's order exactly. If G deduplicates, specialized code needs a dedup step with G's exact equality on −0 and NaN. |
| A9 | A number is `SMALL` if it is integer-valued, within the signed 16-bit range, and not −0. Other finite numbers are `NUM`. Treatment of non-finite numbers (error or a special tag) is unknown. | Classification is one shared function, `classify`. It must be bit-for-bit G's classifier. |
| A10 | Lone UTF-16 surrogates are either rejected or replaced with U+FFFD. Which one is unknown. | Determines both the error contract and where deduplication must happen (§5.10). |
| A11 | Shared subobjects are serialized as separate subtrees. Cycles are an error. | If F has back-references, aliasing becomes visible in the output and the design in §5.11 changes. |
| A12 | The 16-bit payload bounds the number of dictionary entries, numbers, directories, and entries per directory at 2¹⁶ each. There is a configured maximum packet size `B`. | Bound checks are parameterized. |
| A13 | No user code runs during serialization: no getters, proxies, or `toJSON`-style hooks on serializable values. | If accessors exist, records with accessors are not specializable. See §5.12. |
| A14 | Property enumeration order does not affect output, because entries are sorted by key. | Holds directly from A5 and the sorted dictionary. |

---

## 3. The key argument

This section is written for an intern who has taken one compilers course.

### Step 1: every output byte has a binding time

A serializer computes bytes. Each byte depends on some inputs. Sort those inputs into two kinds:

- **Static inputs:** facts fixed by the *type* or *shape* of the value. Examples: which keys exist, how many fields there are, which fields are nested records.
- **Dynamic inputs:** facts that depend on the *particular value*. Examples: the number in `temp`, the text in `label`.

The **binding time** of a computation is the earliest moment all of its inputs are known. This is the vocabulary of partial evaluation (Jones, Gomard, Sestoft). If a computation needs only static inputs, it can run once when the program is compiled, instead of on every call.

### Step 2: the generic serializer redoes static work on every call

On every call, G must:

1. enumerate the object's keys,
2. encode them to UTF-8,
3. sort and deduplicate them together with any string values,
4. decide how many directories there are and their preorder ordinals, and
5. branch on the runtime kind of each field: number, string, object, and so on.

For a declared record, items 1, 2, 4 and most of 5 depend only on the type.

### Step 3: specialization moves static work to expansion time

A generator runs at expansion time. It reads the record declaration, performs the static work once, and emits a **residual program**. The residual program contains only the work that depends on values. Staging systems describe exactly this split: MetaML (Taha, Sheard) and Lightweight Modular Staging (Rompf, Odersky).

### Step 4: the format has one global coupling that limits this

The dictionary is **per packet** and **sorted**, and under A2 it contains string **values** too. Suppose a record has keys `id`, `label`, `pos`, `temp`, `x`, `y`, and the runtime value of `label` is `"kitchen"`. Then `"kitchen"` sorts between `id` and `label`, and the dictionary indices of `label`, `pos`, `temp`, `x`, and `y` all increase by one. **A single runtime string can change the index written into almost every key slot.**

So a key's dictionary index is not static. It is

```
index(key k) = staticRank(k) + dynamicShift(k)
```

where `dynamicShift(k)` is the number of distinct runtime strings that sort before `k` and are not themselves keys.

Some facts **remain static even with runtime strings**:

- The *relative* order of keys never changes. Inserting other strings does not reorder keys among themselves. Therefore the order of entries inside each directory is static.
- Directory entry counts are static.
- Directory preorder ordinals are static, for records without arrays or optional fields.
- The UTF-8 bytes of the keys are static.

Other facts become dynamic:

- key-slot payloads,
- the dictionary bytes, and
- the packet header lengths.

### Step 5: what can be gained, and what the experiment must separate

Specialization can only remove the part of G's cost that is type-determined. As string values become more numerous and longer, the unavoidable work grows: encoding, sorting, and deduplicating runtime strings. The relative benefit then shrinks.

A second point is easy to miss: **precomputing static facts and compiling them into code are different steps.** You can compute the layout once and still *interpret* it at runtime with a small loop over a "plan." So any speed-up of specialized code over G can come from three separate sources:

1. **(i)** caching key facts, such as sorted encoded keys,
2. **(ii)** precomputing the layout, such as slot positions, ordinals, and a single bounds check, and
3. **(iii)** removing interpretive dispatch, by emitting straight-line code.

The experiment in §6 is built to tell these apart. It also shows where (ii) and (iii) stop mattering because value work dominates. The **plan interpreter** is the control that isolates (iii).

---

## 4. Worked example

### 4.1 Declarations

```ts
record Point   { x: i32; y: i32 }
record Reading { id: u16; temp: f64; label: string; pos: Point }

serialize({ id: 7, temp: 21.5, label: "kitchen", pos: { x: 3, y: -4 } })
```

### 4.2 Static key set and order

The key set is `id, label, pos, temp, x, y`. Sorted by unsigned bytes, the order is the same as shown:

```
K = [ "id", "label", "pos", "temp", "x", "y" ]    staticRank = 0..5
```

With `label = "kitchen"`, the packet dictionary is:

```
0 "id"   1 "kitchen"   2 "label"   3 "pos"   4 "temp"   5 "x"   6 "y"
```

Here `rank("kitchen") = 1`: exactly one key (`"id"`) sorts before it. Every key with `staticRank ≥ 1` shifts by one.

If instead `label = "pos"`, the runtime string equals a key. Both share index 2, and no shift occurs. If `label = "a"`, every key shifts by one.

### 4.3 Directory area

Offsets are relative to the start of the directory area (A1). Tags are written symbolically.

```
D0  Reading  (preorder ordinal 0)
 off  slot                    binding time
  0   [OBJ  | 4]              static
  3   [STR  | idx("id")]      tag static; payload = 0 + shift
  6   [SMALL| 7]              tag dynamic (u16 > 32767 -> NUM); payload dynamic
  9   [STR  | idx("label")]   tag static; payload = 1 + shift
 12   [STR  | idx("kitchen")] tag static; payload dynamic
 15   [STR  | idx("pos")]     tag static; payload = 2 + shift
 18   [DIR  | 1]              fully static
 21   [STR  | idx("temp")]    tag static; payload = 3 + shift
 24   [NUM  | 0]              tag dynamic (21.0 would be SMALL); payload dynamic
D1  Point    (preorder ordinal 1)
 27   [OBJ  | 2]              static
 30   [STR  | idx("x")]       tag static; payload = 4 + shift
 33   [SMALL| 3]              tag dynamic; payload dynamic
 36   [STR  | idx("y")]       tag static; payload = 5 + shift
 39   [SMALL| -4]             tag dynamic; payload dynamic
 42   end                     directory-area length 42: static
Number area: [ 21.5 as binary64 LE ]           count dynamic (0..4)
```

Note on A8: the number-area index order would be `id, x, y, temp` under value-preorder, or `id, temp, x, y` under directory order. In this example only `temp` is a `NUM`, so both orders give index 0.

### 4.4 Binding-time map of the whole packet

```
+--------+----------------------+------------------------------+-------------+
| header | dictionary           | directory area (42 bytes)    | number area |
|  D     | keys: S bytes        | headers, DIR refs, key tags: | 8 x nNum    |
|        | placement: D (merge  |   S                          |   D         |
|        |   with runtime strs) | key payloads: S + D shift    |             |
|        | length: D            | value tags/payloads: mostly D|             |
+--------+----------------------+------------------------------+-------------+
S = static (computable at expansion time)     D = dynamic (per value)
```

What the example shows:

- Types do not always fix tags. `u16` and `f64` fields have value-dependent tags.
- A `string` field has a static tag (`STR`) but a dynamic payload.
- A nested record reference (`DIR | 1`) is fully static.

---

## 5. Design

### 5.1 Pipeline

```
                 EXPANSION TIME (phase 1)                          RUN TIME (phase 0)
 record T  --> typecheck --> shapeTree(T) --> layout(T) = L_T
                                                  |
                       +--------------------------+-------------------------+
                       v                          v                         v
                 plan P_T (data)          residual code C_T           template bytes
                 in read-only data        = unfold(runPlan, P_T)      (optional, §5.6)
                       |                          |
                       +------------+-------------+
                                    v
                        typed core IR  (shared by both targets)
                         +----------+----------+
                         v                     v
                    Wasm back end         RV32 back end
                 (store24, memcpy,      (store24, memcpy,
                  intrinsics)            intrinsics)

 Shared library `sercore`, instantiated in BOTH phases:
   utf8Compare, utf8Encode, classify, layout, dictMerge, st24, ...
```

There is **one source of truth**: the layout `L_T`. The plan `P_T` is a direct serialization of `L_T`. The compiled code `C_T` is produced by unfolding the plan interpreter over `P_T` at expansion time. This is the first Futamura projection applied to a tiny interpreter: specializing an interpreter to a fixed input program yields a compiled program. It has two consequences:

- `P_T` and `C_T` agree by construction, and differential testing between them is cheap.
- The plan interpreter is a fair control: it holds exactly the same static information as `C_T`.

### 5.2 Shape trees and layout

```text
ShapeNode =
  | Scalar(kind)            kind ∈ {Null, Bool, Int(lo,hi), F64, Str, StrEnum(set)}
  | Record(fields)          fields: list of (keyUtf8, accessor, ShapeNode, optional?)
  | Array(elem, maxLen)
  | Opaque                  // not specializable: the whole call falls back to G
```

`layout(tree)` computes, at expansion time (or at plan-build time for runtime shapes):

```text
layout(tree):
  groups = key groups: for each Record node r, the set of keys of r,
           guarded by r's presence condition (always / optional bit / array non-empty)
  K      = sortUnique(⋃ keys, utf8Compare)        // static sorted key universe
  for each Record r: entries(r) = fields sorted by staticRank   // static entry order
  for each slot: classify binding time of its tag and payload   (S, S+shift, D)
  if tree has no Array and no optional fields:
       ordinals, offsets, directory-area length: constants
  else:
       emit running counters (ordinal, offset) only where needed
  numSlots = list of number fields, in G's number-area order (A8)
  strSlots = list of string-valued fields (sources of runtime strings)
  bound    = static upper bound on packet size, if one exists (§5.7)
```

**Presence and key ranks without exponential blow-up.** Keys can be absent from a packet in three ways:

- an optional field is missing,
- a nested record is behind a missing optional field, or
- an array is empty, so its element record's keys never occur.

The dictionary contains only strings that occur, so presence changes K. Generating code for every combination would cost 2ⁿ code paths. The design avoids that:

1. Each key `k` gets a presence predicate: the logical OR of its groups' conditions. A key shared by two record types is present if either record is present.
2. At runtime, compute a presence bitmask `m` over `K`. Use one 32-bit word per 32 keys.
3. Then `staticRank_m(k) = popcount(m & ((1 << k) - 1))`, plus any carried counts from lower words.

The cost is linear in the number of keys, with one code path.

### 5.3 Generator (expansion time) and residual code (run time)

Generator sketch. `quote`/`$` denote the hygienic template and splice. Names introduced by a template are fresh. References to `sercore` resolve at the template's definition site (§5.13).

```text
macro deriveSerializer(T):                       // phase 1
  tree = shapeTree(T)                            // compile error if a field type is Opaque
                                                 // and the user asked for `derive` explicitly
  L    = layout(tree)
  P    = encodePlan(L)                           // also emitted as data, for tier P
  return quote {
    const KDICT = $(bytesLiteral(encodeDict(L.K)))      // pre-encoded, length-prefixed
    function serialize_$(T.name)(v: $(T), out: Buf): Result {
      $(unfold(runPlanSource, P))                // straight-line code for this T
    }
  }
```

Residual code for `Reading`. This is what the generator would emit, written by hand here for readability. `%`-names are fresh identifiers.

```text
function serialize_Reading(v: Reading, out: Buf): Result {
  // A. Runtime strings (§5.10)
  let %s0 = sercore.utf8Scratch(v.label)          // may fail: InvalidString (A10)
  if (%s0.err) return %s0.err
  let %r  = sercore.rankAmong(KDICT, %s0)         // #keys < s0      (binary search, 6 keys)
  let %eq = sercore.equalsAt(KDICT, %r, %s0)      // s0 == K[r] ?

  // B. Number classes (no writes yet)
  let %cId = sercore.classifyU16(v.id)            // SMALL if <= 32767 else NUM
  let %cT  = sercore.classify(v.temp)             // may fail: NonFinite (A9)
  if (%cT.err) return %cT.err
  let %cX  = sercore.classifyI32(v.pos.x)
  let %cY  = sercore.classifyI32(v.pos.y)
  let %nn  = isNum(%cId) + isNum(%cT) + isNum(%cX) + isNum(%cY)

  // C. One bounds check
  let %dict = KDICT_BYTES + (%eq ? 0 : sercore.entryBytes(%s0))
  let %len  = HDR_BYTES + %dict + 42 + 8 * %nn
  if (%len > out.cap || %len > B) return Err(TooLarge)

  // D. Emit
  sercore.writeHeader(out, %len, %dict, 42, %nn)
  sercore.writeDictWithOne(out, HDR_BYTES, KDICT, %s0, %r, %eq)
  let D  = HDR_BYTES + %dict
  let N  = D + 42                                 // number area base
  let %sh = %eq ? 7 : %r                          // keys with staticRank >= sh shift by 1
  let %ni = 0                                     // next NUM index
  sercore.st24(out, D+0,  OBJ, 4)
  sercore.st24(out, D+3,  STR, 0 + (0 >= %sh))
  %ni = sercore.numSlot(out, D+6,  %cId, v.id,    N, %ni)
  sercore.st24(out, D+9,  STR, 1 + (1 >= %sh))
  sercore.st24(out, D+12, STR, %r)                // index of s0 is r in both cases
  sercore.st24(out, D+15, STR, 2 + (2 >= %sh))
  sercore.st24(out, D+18, DIR, 1)
  sercore.st24(out, D+21, STR, 3 + (3 >= %sh))
  // number-area order (A8): the calls below follow value-preorder
  // (id, x, y, temp); directory order would move the temp call first
  sercore.st24(out, D+27, OBJ, 2)
  sercore.st24(out, D+30, STR, 4 + (4 >= %sh))
  %ni = sercore.numSlot(out, D+33, %cX, v.pos.x, N, %ni)
  sercore.st24(out, D+36, STR, 5 + (5 >= %sh))
  %ni = sercore.numSlot(out, D+39, %cY, v.pos.y, N, %ni)
  %ni = sercore.numSlot(out, D+24, %cT, v.temp,  N, %ni)
  return Ok(%len)
}
```

What the residual contains, compared with G:

- no key enumeration, key encoding, or key sorting;
- no per-field kind dispatch;
- no visited set (`Reading` is non-recursive, §5.11);
- one bounds check;
- constant slot offsets.

What remains:

- UTF-8 encoding of `label`,
- one rank search among 6 static keys,
- number classification, and
- the byte stores.

### 5.4 Dictionary finalization with several runtime strings

```text
// K: static, sorted, unique, pre-encoded.  R: runtime UTF-8 byte strings.
finalizeDict(K, presentMask, R):
  sortBytewise(R); dedupAdjacent(R)          // r is small: insertion sort for r ≤ 8
  i = next present key from 0; j = 0; n = 0
  keyIdx[|K|]; strIdx[|R|]
  while i < |K| or j < |R|:
    if j == |R| or (i < |K| and K[i] <B R[j]):
         keyIdx[i] = n; emit K[i]; n++; i = next present key after i
    elif i == |K| or R[j] <B K[i]:
         strIdx[j] = n; emit R[j]; n++; j++
    else:                                    // equal bytes: one shared entry
         keyIdx[i] = n; strIdx[j] = n; emit K[i]; n++; i = next present key after i; j++
  if n > 2^16: return Err(TooManyStrings)
  return (keyIdx, strIdx, n)
```

Cost per packet is O(r log r + |K| + r) byte-string comparisons. Comparisons among keys are never repeated. If `r = 0`, the dictionary is a constant blob and emission is a single `memcpy`. The emitted residual code selects the `r = 0` path, the `r = 1` path (as in §5.3), or the general path, based on how many string-valued fields the type has.

### 5.5 Numbers

`classify` is one function in `sercore`, used by G, P, and C.

The static type of a field narrows the classifier:

| Field type | Classifier | Tag |
|---|---|---|
| `u8`, `i8` | none | always `SMALL` (static tag) |
| `i16` | none | always `SMALL` (static tag) |
| `u16`, `i32` | integer range check | dynamic |
| `f64` | full classifier: −0 check, integer check, non-finite check (A9) | dynamic |

Number-area order must replicate A8 exactly. The generator orders the calls to `numSlot` by the confirmed rule. In §5.3 the calls follow value-preorder.

### 5.6 Initialization versus patching

There are three ways to produce output bytes.

| Strategy | What it does | Valid when | Expected effect |
|---|---|---|---|
| **Init** | Write every byte with straight-line stores of folded constants. | Always. | Baseline for C. |
| **Template** | `memcpy` a pre-built static image (headers, `DIR` slots, key tags, and with `r = 0` the whole dictionary plus key payloads), then patch dynamic bytes. | The bytes copied are static for this call: same presence mask, and key payloads copied only when no shift is possible. Value tags that depend on numbers are always patched. | Fewer store instructions. Extra read traffic from read-only data, which on some handhelds lives in flash with wait states. |
| **Delta** | Keep the previous packet in a serializer-owned buffer. Rewrite only bytes whose inputs changed. | All of the following hold: (a) the buffer has been returned by its consumer (§5.12); (b) the **dynamic signature** is equal to the previous call's, where the signature is the presence mask, the sorted set of runtime strings, every number class, and therefore every length and offset; (c) the signature comparison is cheaper than the rewrite it avoids. | Gains only on signature-stable traffic. Risk: stale bytes. |

**Rules:**

- **Init is the default.**
- **Template is a variant** to be measured (§6), not assumed to win.
- **Delta is experimental.** It is admitted only if it passes the correctness gate in a mode that compares every delta-produced packet with a freshly initialized one.

### 5.7 Bounds

- **Static bound.** If a type has no strings, no arrays, and only fixed-width numbers, the generator computes the maximum packet size `Bmax(T)` at expansion time. If `Bmax(T) > B`, it emits a compile-time warning: the record may not fit.
- **Dynamic bound.** Otherwise, exact length is computed after dictionary finalization and number classification. There is **one** capacity check before the first write, instead of one per write. G presumably checks per write; this must be verified.
- **Count bounds.** Every count is checked against 2¹⁶ (A12): dictionary entries, numbers, directories, and entries per directory. For fixed records these checks are discharged at expansion time.

### 5.8 Observed shapes: guards, dispatch, new shapes, representation changes

#### Tiers and dispatch

```
serialize(v)
  |-- static type is a declared record T ----------------------> C_T or P_T   (no guard)
  |
  |-- call-site cache: v.shapeId == e.shapeId && deepGuard(e) --> e.run       (C_σ from build-time
  |       (≤ NPOLY entries, checked in order)                                   profile, or P_σ
  |                                                                             built at runtime)
  |-- miss: plannable(v) && cache not full --> build P_σ, insert, run P_σ
  |
  `-- otherwise (megamorphic / dictionary-mode / Opaque) ------> G
```

The per-site cache follows the polymorphic inline cache design (Deutsch and Schiffman; Hölzle, Chambers, and Ungar). Shape identifiers follow Self's maps (Chambers, Ungar, and Lee). This assumes the dialect's runtime has such identifiers; see the notebook.

#### Deep guard

```text
deepGuard(v, e):
  for each object node o in e.shapeTree (preorder):
     if shapeOf(o) != e.expected[o]: return false
  for each field f with e.kindGuard[f]:          // only if shapes do not record field kinds
     if kindOf(f) not in e.allowedKinds[f]: return false
  return true
```

Guards are checked **before any write**. Even without that, abandoning a half-written scratch buffer and restarting with G is always correct: the serializer has no side effects before it returns (§5.12). So, unlike deoptimization in a general optimizing compiler (Hölzle, Chambers, and Ungar 1992), no state has to be reconstructed.

#### Canonical layout sharing

Two shapes with the same key set and field kinds produce the same packet layout, by A14. They share one layout `L` and differ only in their accessor tables (field offsets). The cache stores `(shapeId → accessor table, shared L)`.

#### New shapes at runtime

- Neither target generates code at runtime on the device. A new shape therefore gets a **plan**: data built by `sercore.layout` running at runtime. This is the same library used at expansion time.
- Compiled `C_σ` exists only for shapes in a build-time profile.
- The cache size `NPOLY` and the policy when the cache is full (no insertion, or replacement) are design parameters measured in Phase 2.

#### Representation changes

| Change between packets | Changes static layout? | Handling |
|---|---|---|
| Number field: int ↔ double representation | No | Absorbed. `classify` reads either representation. No guard needed. |
| Field kind: string ↔ number | No layout change. Dictionary membership changes, but that is already dynamic. | Absorbed **if** the residual code for that field has both paths, as allowed by `allowedKinds`. Otherwise the kind guard fails and the call falls back. |
| Field kind: scalar ↔ object/array | Yes: a directory is inserted in preorder. | The guard fails. Fall back to the next tier. |
| Property added or deleted | Yes: key set changes. | New `shapeId`. Cache miss. |
| Object becomes dictionary-mode or megamorphic | Unknown layout. | G. |
| Declared record edited in source | Not a runtime event. | Regenerate at build. F is self-describing, so readers need no coordination. |

**Rule:** a deviation can be absorbed at the field level if and only if it changes neither the key universe nor the directory tree. Otherwise the whole call is redirected.

### 5.9 The plan interpreter (runtime tier and experimental control)

```text
Plan = array of ops (byte-coded), produced from L:
  HDR kind count          KEY k              DIRREF ordinal
  U8 acc                  NUM acc            BOOL acc        NULLABLE acc next
  STR acc rslot           PRESENCE acc bit   ARRAY acc elemPlan
  END

runPlan(P, v, out):
  // Pass A: presence mask, runtime strings, number classes  (walk P once, no writes)
  // Pass B: finalizeDict, exact length, one bounds check
  // Pass C: emission
  pc = 0; d = dirBase
  loop:
    switch P[pc].op:
      case HDR:    st24(out, d, P[pc].kind, P[pc].count); d += 3
      case KEY:    st24(out, d, STR, keyIdx[P[pc].k]);    d += 3
      case NUM:    ni = numSlot(out, d, cls[slot], load(v, P[pc].acc), N, ni); d += 3; slot++
      case STR:    st24(out, d, STR, strIdx[P[pc].rslot]); d += 3
      case DIRREF: st24(out, d, DIR, P[pc].ordinal);       d += 3
      ...
      case END:    return Ok(len)
    pc += 1
```

**Fairness requirements for the control:**

- `P` and `C` link the **same** `sercore` object code.
- Both use the same passes.
- Both allocate scratch memory the same way.

The **only** difference between them is per-op dispatch and operand loads versus folded constants.

**Dispatch implementation differs by target:**

- **Wasm** has no computed branch to an arbitrary address. The interpreter uses a `br_table` switch.
- **RV32** can also use a threaded variant, with handler addresses stored in the plan.

Report both RV32 variants. Ertl and Gregg show that dispatch technique alone moves interpreter cost. A slow control would inflate C's apparent advantage.

### 5.10 Runtime strings

1. **Comparison** is unsigned bytewise over UTF-8, with no Unicode normalization: precomposed and decomposed forms are distinct entries. Never use the host's UTF-16 string comparison at expansion time. The two orders differ:

   | String | UTF-8 bytes | UTF-16 code units |
   |---|---|---|
   | U+E000 | `EE 80 80` | `E000` |
   | U+10000 | `F0 90 80 80` | `D800 DC00` |

   UTF-8 order puts U+E000 first. UTF-16 order puts U+10000 first. Both are mandatory test keys (§6.6).

2. **Deduplicate on encoded bytes, not string identity.** If A10 is "replace", then `"\uD800"` and `"\uFFFD"` are different JS strings with the same UTF-8 bytes (`EF BF BD`). They must yield **one** dictionary entry. A runtime string that equals a key's bytes shares the key's entry.

3. **Fast path.** If a string's code units are all below 0x80, its UTF-8 length equals its length and encoding is a narrowing copy. Check this with one scan. Non-ASCII strings take the general encoder.

4. **Scratch space.** Encoded strings go into a per-call scratch arena of bounded size (at most `B`). Final dictionary placement is known only after sorting, so bytes are copied once from scratch into the output. An alternative encodes into the output tail and moves the bytes afterward. This is a measured variant only if scratch memory is tight on the device.

5. **String-enum fields** (`kind: "a" | "b" | "c"`). The set is static. The generator pre-encodes each alternative and precomputes its rank among `K`. The runtime string becomes a small integer selection, with no encoding, search, or scratch.

6. **Caching encodings across calls** (keyed by string identity) is **excluded** from version 1. It needs weak references or lifetime rules from the dialect's memory manager, and it complicates ownership. Record it as future work.

### 5.11 Aliasing

- **Shared subobjects.** Under A11, a subobject reachable through two fields is serialized twice, and the specialized code does the same automatically. No identity map is needed.
- **Cycles.** If the type graph of a declared record is acyclic, its value graph is acyclic: a value can only reference values of types reachable from its own type. So the visited-set or cycle check is **removed statically**. This is sound regardless of mutability.
- **Recursive types** (lists, trees) get a depth counter.
  - **Equivalence hazard:** G may report `Cycle` (from a visited set) where a depth-bounded serializer would report `DepthExceeded`.
  - **Rule:** for recursive types, either keep G's visited-set semantics in the residual code, or have the language team define the two errors as one class. The contract in §5.16 forbids silent divergence.
- **Strings.** JS strings are immutable values, so aliasing between string fields is unobservable except through deduplication, which is byte-based (§5.10).
- **Output aliasing input.** F has no byte-blob type, so input cannot overlap the output buffer. If a blob type is added later, add an overlap check: the transport could hand back a view into the buffer it lent.
- **Template images** are copied, never lent. The read-only image cannot be written through `out`.

### 5.12 Ownership

| Object | Owner during call | Rule |
|---|---|---|
| Input value `v` | Caller | Borrowed read-only for the call. The serializer retains no references. No user code runs (A13). Records with accessors, if the dialect has them, are classified Opaque. |
| Output buffer `out` | Caller (Init, Template) | Write range is `[0, len)`. On error, contents are unspecified, but no byte at or beyond `cap` is written. |
| Output buffer (Delta) | Serializer, **leased** to the transport | API: `acquire() → Buf`, `release(Buf)`. Delta patching is allowed only on a released buffer. In debug builds a generation counter detects use after release. |
| Scratch arena | Serializer, per call | Reset on return. Bounded by `B`. |
| `KDICT`, plans, templates | Program image | Placed in read-only data: the Wasm data segment, or RV32 `.rodata`, which may be in flash. Placement (flash versus RAM copy) is an experimental factor. |
| Call-site caches | Runtime | Bounded at `NPOLY` entries per site. Plans for runtime shapes are allocated from a bounded plan heap. When it is exhausted, the call goes to G; no failure is visible to the caller. |

### 5.13 Hygiene and phase separation

**Capture hazard.** The generated code calls `writeSlot`, `classify`, and similar helpers. Suppose the module that writes `derive Serialize for T` defines its own `classify`. A text-pasting generator would bind to the user's function. Field names must not be spliced as text either, because keys can be arbitrary strings such as `"a-b"` or `"constructor"`.

The design takes four measures:

- Templates are hygienic: identifiers are resolved at the template's definition site (Kohlbecker, Friedman, Felleisen, and Duba; Dybvig, Hieb, and Bruggeman; Flatt's scopes-as-sets model).
- Helper references are qualified bindings to `sercore`.
- Field reads are generated from the type checker's field descriptors (`accessor` in §5.2), never from strings.
- Every local the template introduces is fresh.

**Phase separation.** `sercore` is instantiated separately for expansion and for run time, following Flatt's "you want it when?". Both instances run **the same** `utf8Compare` and `layout`, so expansion-time and run-time sort orders cannot disagree. No mutable state crosses phases.

**Determinism.** Expansion output must be byte-for-byte reproducible for reproducible builds. That means no iteration over hash tables in nondeterministic order, and a total order on key sorting.

### 5.14 Front-end versus back-end reuse

**Decision:** specialize in the **front end**. The generator emits typed core IR after type checking, which is then type-checked again. Generator bugs then surface as type errors, and both back ends are reused unchanged except for three intrinsics:

| Intrinsic | Wasm lowering | RV32 lowering |
|---|---|---|
| `st24(out, off, tag, payload)` | `i32.store8` + `i32.store16`. Unaligned access is permitted; alignment hints are only hints. Alternatively, an overlapping `i32.store` when slots are written in ascending address order and one byte of capacity slack exists. | Three `sb`, or `sb` + `sh` when 2-byte alignment of the payload is provable. Misaligned word access behavior is left to the execution environment by the ISA manual: it may be fast, slow, or trap. So overlapping word stores are allowed only if the target is profiled to handle them natively. |
| `memcpy` | `memory.copy` if the engine supports bulk memory, else a loop. | Word-copy loop with byte prologue and epilogue. |
| `cycles()` (benchmark only) | Host clock import. | `rdcycle`, `rdinstret` (Zicntr), if present. |

The slot alignment modulo 4 is static only if the dictionary's byte length is static, which is the `r = 0` case without optional keys. Otherwise the back end emits alignment-agnostic sequences.

Specializing in the back end (emitting Wasm or RV32 directly) is rejected because it would duplicate the generator per target. The experiment tests whether this choice costs performance (P9 in §6.7).

### 5.15 Programmer-visible language changes

The changes are kept minimal. Nothing below changes what any program computes.

1. **Implicit specialization.** `serialize(x)` where the static type of `x` is a declared record uses `C_T`. The language does not change.
2. **Explicit form, optional.** `derive Serialize for T` with options: `bound(n)` for a per-type size bound, and `tier(plan|code)`. This makes expansion cost and code size attributable to a declaration, and gives a place for compile-time diagnostics: "T may exceed bound B"; "field f is Opaque, call will use generic serializer."
3. **Opt-out.** `@noSpecialize` on a type or call site, for code-size control on flash-limited devices.
4. **Report flag.** A compiler flag lists, for each call site, the tier chosen and the code and data bytes added.
5. **Staging is not exposed.** Quote and splice remain internal to the compiler's macro library. Exposing them would add a second language level to the dialect, which is a much larger change than this project needs.

**Visible differences that remain:**

- code size,
- compile time, and
- with `derive` only, new compile-time *warnings*, never new runtime behavior.

### 5.16 Equivalence contract, including error precedence

A packet may contain several error causes, for example an invalid string in `label` and a non-finite `temp`. G reports the error it reaches first in its traversal order. The specialized code's multi-pass structure (strings first, then numbers) could report a different error. The design therefore:

1. defines the **canonical error** as the one at the lowest value-preorder position, with ties broken by error class order;
2. specifies G as reporting the canonical error, and patches G if its current behavior differs, with the language team's agreement; and
3. makes P and C compute all error candidates in pass A and return the canonical one.

The extra cost is one position comparison per error candidate, paid only on failure paths.

---

## 6. Experiment

### 6.1 Hypotheses, and how the variants discriminate between them

The cost of G is modeled as the sum of:

- `c_key`: enumerate, encode, and sort keys,
- `c_interp`: per-field kind dispatch and recursion,
- `c_dict`: sort and deduplicate runtime strings, then merge,
- `c_val`: number classification, string encoding, stores, and
- `c_chk`: per-write bounds checks.

The variants remove different subsets:

| Variant | Removes |
|---|---|
| G+K | `c_key` (by caching) |
| P | `c_key`, most of `c_chk`, the layout part of `c_interp` |
| C | additionally, per-op dispatch |

| Hypothesis | Statement | Predicted pattern |
|---|---|---|
| **H1** key work dominates | `c_key` is the main cost. | G+K ≈ P ≈ C, all clearly below G, at `r = 0`. |
| **H2** dispatch dominates | `c_interp` is the main cost. | G+K ≈ G. P below G. C clearly below P. The P−C gap grows with field count. |
| **H3** value work dominates | `c_val` is the main cost. | All variants within the indifference margin θ of each other, at every string fraction. |
| **H4** string coupling dominates when strings are present | `c_dict` + string encoding dominates as `r` and string length grow. | The ratio `(G − C)/G` decreases monotonically with string fraction and string length. The P−C gap stays roughly constant in absolute terms. |

The hypotheses are not mutually exclusive across workload regions. The experiment reports which one holds **in each cell** of the factor grid.

### 6.2 Variants

| ID | Description |
|---|---|
| **G** | Production generic serializer, unmodified. |
| **G+K** | G plus a per-type or per-shape memo of sorted, encoded keys. This is a cheap non-staged change. It tests whether caching alone captures the gain. |
| **P-switch / P-thread** | Plan interpreter. The threaded variant exists on RV32 only. |
| **C-init** | Compiled residual code, Init strategy. |
| **C-tpl** | Compiled residual code, Template strategy. |
| **C-δ** | Compiled residual code, Delta strategy. Steady-traffic phase only. Gated by the stricter correctness mode of §5.6. |
| **C-fe / C-intr** | Portable `st24`/`memcpy` lowering versus back-end intrinsics. |
| **O-C / O-P / O-G** | For observed shapes: build-time compiled guarded code, runtime-built plan, and generic. |

### 6.3 Workload factors

| Factor | Levels |
|---|---|
| Scalar fields per record | 1, 4, 16, 64, 256 |
| Nesting depth | 0, 1, 3 |
| Fraction of fields that are strings | 0, 0.25, 1.0 |
| String content | short ASCII, long ASCII, non-ASCII including supplementary-plane characters, strings equal to keys |
| Number mix | all `SMALL`, all `NUM`, alternating classes |
| Optional fields present | 0, half, all (with 8 and 32 optional fields) |
| Arrays | none; array of records with lengths 0, 1, 16 |
| Shapes per call site (observed) | 1, 2, 4, 8, 16 |
| Shape churn (observed) | stable; new shape every k packets, for k in {1, 10, 1000} |
| Representation churn | none; int↔double; string↔number; scalar↔object |
| Static data placement | flash (where applicable), RAM copy |
| Target | Wasm (the engine actually used on the handheld), RV32 hardware |

Do not run the full Cartesian product. Use a fractional factorial design that covers all main effects plus these interactions:

- strings × field count,
- target × variant, and
- churn × shapes per site.

### 6.4 Benchmark phases

#### Phase 1: upfront compile

- **Corpus:**
  - generated record families sweeping the factors above;
  - pathological cases: 32 optional fields, 256 keys whose bytes collide on long prefixes, deep nesting;
  - the application's real record declarations, if any exist.
- **Measure, per record:**
  - expansion time,
  - residual IR size (IR nodes),
  - re-typecheck time,
  - back-end time,
  - code bytes added (Wasm code section; RV32 `.text`),
  - data bytes added (data segment or `.rodata`), and
  - plan size.
- **Where:** on the build host, and on the device if the compiler itself runs on the handheld (see notebook).
- **Report:** slope of each metric against total fields, and the residuals of a linear fit.

#### Phase 2: dispatch

- **Microbenchmarks** using a 1-field record, so dispatch cost is not hidden by emission:
  - time from call to first byte written;
  - guard cost against depth of nested objects;
  - cache-lookup cost against `NPOLY`;
  - latency of the first packet of a new shape (plan build plus run); and
  - behavior when the cache is full.
- **Derived quantity:** `k*` = the number of same-shape packets after which `P_σ` (including its build cost) has cost less in total than G for the same packets.

#### Phase 3: steady repeated traffic

- **Traces:**
  - synthetic traces from the factor grid; and
  - recorded application traces, if obtainable, with real distributions of shapes, strings, and churn.
- **Harness:** serialize into a transport buffer under the real ownership protocol (lease and release for C-δ), back to back.
- **Report:**
  - throughput in packets and bytes per unit time;
  - per-packet latency at p50, p99, and maximum (relevant on a handheld with frame or real-time deadlines); and
  - fallback counts per tier.

### 6.5 Measurement method

- **RV32:**
  - `rdcycle` and `rdinstret` around batches, if the Zicntr extension is present;
  - interrupts masked, or interrupt counts recorded and the affected runs reported;
  - cache state set explicitly (cold or warmed) and reported.
- **Wasm:**
  - host monotonic clock around batches of `n` calls, with an empty-loop batch subtracted;
  - instruction counts too, if the engine exposes them.
- **Repetition:**
  - `R` fresh boots or process starts × `M` iterations per configuration;
  - configuration order randomized per run (Georges, Buytaert, and Eeckhout; Kalibera and Jones).
- **Layout effects** (Mytkowicz, Diwan, Hauswirth, and Sweeney; Curtsinger and Berger):
  - several link orders and function alignments on RV32;
  - effects smaller than the spread across layouts are reported as indistinguishable.
- **Warm-up:** first-iteration and steady-state results are reported separately and never averaged together (Barrett, Bolz-Tereick, Killick, Mount, and Tratt).
- **Statistics:** medians and 95% bootstrap confidence intervals of **ratios** to G for the same cell.
- **Preregistration:** the indifference margin θ, the failure thresholds below, and `R`, `M` are fixed and recorded in the notebook **before** the first timed run. A starting proposal for discussion is θ = 5% of G's median. This is a policy choice, not an expected result.

### 6.6 Correctness gate (must pass before any timing counts)

1. **Differential testing.** G, G+K, P, C-init, C-tpl, and C-δ produce byte-identical packets and identical canonical errors on:
   - property-based random inputs for every type in the corpus (Claessen and Hughes), and
   - the fixed edge-case list below.
2. **Edge cases:**
   - keys U+E000 and U+10000 together (the UTF-8 versus UTF-16 ordering case);
   - a runtime string equal to a key;
   - `"\uD800"` and `"\uFFFD"` in the same packet;
   - −0, ±0 integers at the `SMALL` boundary (−32768, 32767, 32768), NaN, ±Infinity;
   - an empty array whose element keys appear nowhere else, and the same with a key shared with the parent record;
   - all optional fields absent; all present;
   - exactly 2¹⁶ and 2¹⁶ + 1 dictionary entries;
   - a packet exactly at capacity and one byte over;
   - a shared subobject; a cycle through a recursive type; and
   - user-module helpers named like `sercore` helpers (hygiene).
3. **Delta mode.** Every C-δ packet is also produced by C-init and compared.
4. **Phase test.** The expansion-time key order equals the run-time `utf8Compare` order for all corpus keys.

**Any mismatch stops the experiment** until it is fixed.

### 6.7 Predictions and concrete failure criteria

| # | Prediction | Failure criterion (falsifies the prediction or the design choice) |
|---|---|---|
| **P1** | All variants are byte- and error-equivalent. | Any mismatch in §6.6. |
| **P2** | At `r = 0` with ≥ 16 keys: T(C) ≤ T(P) ≤ T(G+K) ≤ T(G). T(G) − T(G+K) grows with key count. | The CI of T(G+K)/T(G) includes 1 − θ or higher at 64 keys on both targets. Then key work is not a significant cost, and H1 is rejected. |
| **P3** | T(P) − T(C) grows with field count and is insensitive to string fraction. | On a target, the CI of (T(P) − T(C))/T(G) includes 0 at 64 fields. Then compiled code is not justified on that target; ship P only there. |
| **P4** | (T(G) − T(C))/T(G) decreases as string fraction and string length grow (H4). | The ratio does not decrease between string fraction 0 and 1.0 with long non-ASCII strings. Then the cost model is wrong. Inspect G's string path and the dictionary merge before drawing conclusions. |
| **P5** | C-tpl beats C-init only when `r = 0` and number classes are static. It loses or ties elsewhere. Template data in flash costs more than in RAM. | C-tpl beats C-init by more than θ in cells where most slots are dynamic. That would mean store cost, not computation, dominates emission; revisit the cost model. |
| **P6** | Dispatch: declared records add no guard cost. Monomorphic observed-shape guard cost is constant in field count and linear in nested-object count. Polymorphic cost grows with entry position. | Guard plus lookup cost for a 1-field record exceeds T(G) − T(O-P) for that record. Then specialization must be disabled below a minimum record size, which is the measured break-even field count. |
| **P7** | First packet of a new shape: plan build plus run costs more than G. There is a finite break-even count `k*`. | `k*` is larger than the median same-shape run length in the recorded traces. Then runtime plans do not pay for themselves on real traffic; use G for unprofiled shapes. |
| **P8** | Expansion time, IR size, and code size grow linearly in total fields, including with optional fields (popcount ranks, §5.2). | Superlinear growth in any of these against the number of optional fields or the nesting depth. That indicates a 2ⁿ path in the generator, which is a bug. |
| **P9** | C-fe is within θ of C-intr on both targets. | Outside θ on either target. Then add the intrinsic for that target and keep front-end generation. |
| **P10** | The ordering of variants is the same on Wasm and RV32. Magnitudes may differ. | The ordering flips for some cell. Then tier selection must be target-specific. |
| **P11** | Under representation churn, fallback counts equal the counts predicted by classifying each trace event with the table in §5.8. | Any difference between observed and predicted fallback counts. That indicates a guard or absorbability bug. |
| **P12** | C-δ helps only on signature-stable traces. | Any correctness-mode mismatch, or no gain over C-init beyond θ on the most stable trace. Then drop C-δ. |

### 6.8 Threats to validity

- **A weak G inflates every gain.** G must be the production implementation. G+K exists to show how much a cheap fix to G recovers without staging.
- **A weak P inflates C's gain.** P must share `sercore` with C, and must have the best dispatch available on each target (§5.9).
- **Measurement artifacts:**
  - code layout and alignment effects (§6.5);
  - flash wait states and cache effects on RV32;
  - the Wasm engine's own tiering: if the engine compiles in tiers, report its warm-up separately.
- **Unrepresentative workloads.** Synthetic grids can over-represent extreme cells. Recorded traces are needed for the decisions that P6 and P7 drive.
- **Unverified assumptions.** A1–A14 are assumptions. A2 changes the size of the possible gain more than any other single fact. A8 and A10 must be resolved before the correctness gate means anything.

### 6.9 Decision rules (fixed in advance)

- If P1 fails, nothing ships.
- For each target `t`:
  - If P3 holds on `t`: use C for declared records, for record sizes above the break-even size measured in Phase 2.
  - Else: use P for declared records on `t`.
- If P2 shows G+K captures at least half of C's gain on `t`: ship G+K as well. It is the lowest-risk change, and it improves G for every caller.
- Observed shapes:
  - Use O-C for profiled shapes only if P6 holds.
  - Use runtime O-P only if P7 holds.
  - Otherwise use G.
- C-tpl and C-δ ship only in the cells where they passed P5 and P12.

---

## 7. References (primary authors)

Bibliographic details are given to the best of my knowledge. Verify them before citing in a publication.

**Partial evaluation and staging**

- Y. Futamura. "Partial evaluation of computation process—an approach to a compiler-compiler." *Systems, Computers, Controls* 2(5), 1971.
- N. D. Jones, C. K. Gomard, P. Sestoft. *Partial Evaluation and Automatic Program Generation.* Prentice Hall, 1993.
- W. Taha, T. Sheard. "Multi-stage programming with explicit annotations." PEPM 1997.
- T. Rompf, M. Odersky. "Lightweight modular staging: a pragmatic approach to runtime code generation and compiled DSLs." GPCE 2010.
- C. Consel, F. Noël. "A general approach for run-time specialization and its application to C." POPL 1996. (Template-based specialization.)
- D. R. Engler, W. C. Hsieh, M. F. Kaashoek. "`C: a language for high-level, efficient, and machine-independent dynamic code generation." POPL 1996.
- T. Würthinger et al. "Practical partial evaluation for high-performance dynamic language runtimes." PLDI 2017.

**Hygienic macros and phases**

- E. Kohlbecker, D. P. Friedman, M. Felleisen, B. Duba. "Hygienic macro expansion." LFP 1986.
- R. K. Dybvig, R. Hieb, C. Bruggeman. "Syntactic abstraction in Scheme." *Lisp and Symbolic Computation* 5(4), 1993.
- M. Flatt. "Composable and compilable macros: you want it when?" ICFP 2002.
- M. Flatt. "Binding as sets of scopes." POPL 2016.

**Serialization**

- H. Miller, P. Haller, E. Burmako, M. Odersky. "Instant pickles: generating object-oriented pickler combinators for fast and extensible serialization." OOPSLA 2013.
- A. J. Kennedy. "Pickler combinators." *Journal of Functional Programming* 14(6), 2004.

**Shapes, inline caches, deoptimization**

- L. P. Deutsch, A. M. Schiffman. "Efficient implementation of the Smalltalk-80 system." POPL 1984.
- C. Chambers, D. Ungar, E. Lee. "An efficient implementation of SELF, a dynamically-typed object-oriented language based on prototypes." OOPSLA 1989.
- U. Hölzle, C. Chambers, D. Ungar. "Optimizing dynamically-typed object-oriented languages with polymorphic inline caches." ECOOP 1991.
- U. Hölzle, C. Chambers, D. Ungar. "Debugging optimized code with dynamic deoptimization." PLDI 1992.

**Interpreters**

- J. R. Bell. "Threaded code." *Communications of the ACM* 16(6), 1973.
- M. A. Ertl, D. Gregg. "The structure and performance of efficient interpreters." *Journal of Instruction-Level Parallelism* 5, 2003.

**Ownership**

- D. G. Clarke, J. M. Potter, J. Noble. "Ownership types for flexible alias protection." OOPSLA 1998.

**Targets and encodings**

- A. Haas, A. Rossberg, D. L. Schuff, B. L. Titzer, et al. "Bringing the web up to speed with WebAssembly." PLDI 2017.
- A. Waterman, K. Asanović (eds.). *The RISC-V Instruction Set Manual, Volume I: Unprivileged ISA.*
- F. Yergeau. RFC 3629, "UTF-8, a transformation format of ISO 10646," 2003.

**Methodology**

- A. Georges, D. Buytaert, L. Eeckhout. "Statistically rigorous Java performance evaluation." OOPSLA 2007.
- T. Mytkowicz, A. Diwan, M. Hauswirth, P. F. Sweeney. "Producing wrong data without doing anything obviously wrong!" ASPLOS 2009.
- T. Kalibera, R. Jones. "Rigorous benchmarking in reasonable time." ISMM 2013.
- C. Curtsinger, E. D. Berger. "Stabilizer: statistically sound performance evaluation." ASPLOS 2013.
- E. Barrett, C. F. Bolz-Tereick, R. Killick, S. Mount, L. Tratt. "Virtual machine warmup blows hot and cold." OOPSLA 2017.
- K. Claessen, J. Hughes. "QuickCheck: a lightweight tool for random testing of Haskell programs." ICFP 2000.

---
