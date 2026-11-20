---
Title: Native reader evidence for the binary-format report
Ticket: PICOCALC-RENDER-BINARY
Status: complete
Topics: [picocalc, performance]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Matched native ESP32-P4 receipt timings, host allocation and the producer cost that one receiver would need to recover.
---

# Native reader evidence for the binary-format report

A C receiver can avoid allocating a node for every scalar and container in a screen. We tested this on four fixed envelopes from the principal experiment. The JSON control uses ESP-IDF's cJSON 1.7.18 to parse and own a linked tree, then validates the admitted domain and sender. The indexed receiver takes one private copy of the delivered PSIX buffer and validates its entire string directory, UTF-8, canonical records, capacities, structure and sender before accessing a field. In both cases the receiver owns the representation through its last read and releases it afterward.

## What changed on the handheld

Seven rotated blocks on one physical ESP32-P4 each processed the same screen eight times per arm. Each entry below gives a median of per-block means in microseconds per screen. The sparse column covers 32 repeated reads alternating the first and last selected scalar. Both implementations compute identical UTF-16 scalar hashes, a repeated-lookup hash and a full recursive checksum. All 56 hardware rows also matched the principal JS witness, modulo the signed notation used to print a 32-bit hash.

| Screen and arm | Admit | Sparse ×32 | Full walk | Release | Admit + walk + release |
|---|---:|---:|---:|---:|---:|
| System cJSON | 3,616.6 | 179.0 | 362.6 | 948.4 | 4,929.5 |
| System PSIX | 141.2 | 193.8 | 349.2 | 3.9 | 494.8 |
| Chess cJSON | 9,595.9 | 106.8 | 1,572.6 | 2,038.2 | 13,203.2 |
| Chess PSIX | 184.2 | 95.6 | 1,627.5 | 4.0 | 1,814.9 |
| Snake cJSON | 1,797.5 | 90.5 | 285.5 | 400.1 | 2,481.0 |
| Snake PSIX | 72.1 | 90.2 | 286.1 | 3.9 | 362.2 |
| Editor cJSON | 8,442.1 | 200.4 | 1,257.4 | 1,729.2 | 11,427.8 |
| Editor PSIX | 170.9 | 195.5 | 1,270.1 | 3.9 | 1,444.6 |

The final column is computed from each observation's three stage times before taking the median. It excludes the sparse probes, producer, kernel channel and painter. PSIX's array child access loads a three-byte reference at `2 + 3 × index` within the array's body. Each object field along a path also requires binary search over key slots. The System path took longer with the indexed representation, while the Chess path shortened by 11.1 µs across 32 reads. Full cJSON traversal follows each node's sibling link once. Number formatting and text hashing are common work in both full walks. Three out of four full walks took slightly longer with PSIX. Admission and release account for most of the consumer saving. [Raw hardware rows](../various/native-p4.json)

## Where the memory saving came from

A separate 64-bit Linux run installed allocator hooks and counted requested payload bytes. The Chess JSON control allocated 1,360 times during receipt and held 48,257 bytes, compared with one 2,761-byte PSIX buffer. Holding an old Chess generation while accepting the next produced peaks of 96,514 and 5,522 bytes respectively. The other single-generation JSON/PSIX peaks were 17,276/1,850 bytes for System, 8,708/766 for Snake and 42,327/2,572 for Editor. These amounts exclude source bytes, local stack, allocator metadata, bus queues and raster buffers. Pointer width and allocator overhead differ on the handheld. [Host allocation and timing records](../various/native-host.json)

## What this means for the producer

On these recordings, the native consumer savings from admission, walking and release were 4.435 ms for System, 11.388 ms for Chess, 2.119 ms for Snake and 9.983 ms for Editor. In the same physical session the QuickJS prototype needed an additional 40.181, 31.196, 13.128 and 25.800 ms respectively to encode the binary format. In each case the measured extra producer work exceeds the saving available from one native consumer doing this work. This is a comparison of two explicitly scoped measured costs. A complete native producer, handoff and native painting path has a different cost model. The producer group's matched native experiment supplies that separate control.

The native comparison restricts its domain to zero-free UTF-8 strings and at most 4,096 occurrences of string keys and values. The primary JS implementation caps *distinct* strings at 4,096 and supports U+0000. cJSON represents strings as NUL-terminated pointers. Both native arms apply the narrower domain. Number hashing matches the JS reference on every selected scalar and full tree; this test does not qualify arbitrary floating-point formatting. No P4 peak heap, native rasterization or cross-runtime product latency was measured by this reader. The host sanitizer suite rejected 56 attempted replacements while preserving its previous valid fixture. [Reader and admission evidence](../scripts/native/02-native.inc) · [Validation fixture](../scripts/native/04-validation.c)
