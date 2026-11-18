---
Title: Persistent range states and statically typed array copies
Ticket: PICOCALC-CJI-TRIE
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-TRIE--avoid-redundant-range-state-writes-and-specialize-trie-node-copies/scripts/01-variant.py
      Note: Actual range-state and typed copy source edits
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-TRIE--avoid-redundant-range-state-writes-and-specialize-trie-node-copies/scripts/03-check-states.mjs
      Note: Multi-depth snapshot and work-count probes
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-TRIE--avoid-redundant-range-state-writes-and-specialize-trie-node-copies/scripts/04-benchmark.py
      Note: Rotated native performance measurements
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T15:11:53.775533194-05:00
WhatFor: ""
WhenToUse: ""
---

# Persistent range states and statically typed array copies

## The problem the user sees

The user compiles an application called Agenda on an ESP32-P4 board. The board runs a compiled copy of CJI, a JavaScript compiler written in JavaScript. CJI must discover which numerical operations can safely use exact integers before it emits an application module. This ticket changes the compiler performing that analysis. The user's application and the language rules are the reference against which changes must be validated.

An interval is a conservative range of possible numeric values, together with flags for exceptional values such as negative zero. A function-local state maps each numbered variable to its current interval. Where control flow branches, each path must retain its own facts. At the point where the paths meet, the solver joins their states, forming a conservative result that includes both possibilities. The existing compiler already interns equivalent intervals so that each distinct abstract value in one analysis has a small numeric ID.

## A store in the analysis

CJI represents a state using a small mutable record containing a root and a slot-number table. The root points to an immutable 32-way tree. Each level consumes five bits of a variable's slot number. Leaf entries are interval IDs and internal entries are child arrays. A missing slot reads as undefined. The static branch-copy operation creates a second mutable state handle pointing to the same immutable root. Updating one handle can then replace its root without changing the other's mapping. Exception processing also retains certain *handles*, so their identity and mutability matter independently of the tree's persistence.

Consider a depth-two tree and variable 37. The high five-bit group is 1 and the low group is 5. A store to this variable replaces child 5 of the leaf under root child 1. All other children can be shared. When the existing value of that slot is already the proposed ID, the entire existing root represents the required result. The current `trieSet` eagerly slices every node visited, including those on an unchanged path. Later joins first compare root or child identity. Creating a distinct copy of a semantically unchanged node removes the possibility of succeeding on that cheap test.

```text
state A ───► root ───► leaf at child 1 ───► slot 5 = interval 19
state B ────┘

write B[37] = 19          both handles may keep root
write B[37] = 21          B gets a new root and a new leaf
                          A can still read interval 19
```

This is path copying in a persistent data structure. Driscoll and colleagues formalize persistence as access to multiple versions after an update. For a direct implementation comparison, inspect Clojure's PersistentVector.doAssoc, which visits a vector trie and replaces children along a path. Here the compiler has a useful extra property: leaf equality is comparison of canonical IDs. [Making Data Structures Persistent](https://www.cs.cmu.edu/~sleator/papers/Persistence.htm) · [Clojure PersistentVector](https://github.com/clojure/clojure/blob/master/src/jvm/clojure/lang/PersistentVector.java)

## First change — Descend before copying

The proposed update accepts the current node, slot number, interval ID and remaining level. It obtains the old child once, computes the new child, and tests whether the node can be reused. The equality test compares IDs at a leaf and references at an internal node. It must be valid only within a single analysis, since interval IDs are recycled across runs.

```text
slot = (key >> (5 * level)) & 31
previous = child(node, slot) or absent
replacement = interval if at leaf else set(previous, key, interval, level - 1)
if node exists and previous equals replacement:
    return node
copy = clone existing node or allocate a fresh 32-slot node
copy[slot] = replacement
return copy
```

Correctness follows by induction on the depth. On a leaf the new mapping differs only at the chosen slot. When the old and new values compare equal, reusing the array preserves every lookup. At an internal node the recursive result already represents the required subtree. If it is the old child, every child remains valid. If the child changed, path copying preserves the old version while publishing the new child. The public assignment still writes the resulting root to its state handle. The argument does not depend on the order in which branch states are eventually joined.

## Second change — Teach one copy operation its receiver layout

The existing slice specialization visits ordinary arrays with numeric keys on all 15,922,776 measured Agenda reads at that helper. The generic helper boxes the integer index and dispatches on the receiver every iteration. A compiler-private trie node has a stronger invariant: every allocated node is an ordinary array of 32 slots. Entries may hold either a child reference, a number, or undefined. A specialized copy can declare the receiver as Any[] while retaining tagged entries. That preserves the independent facts that the container's layout is known and an element's value may be dynamic.

Use a private `cloneTrieNode` with a pinned Any[] parameter and result in the source subset's type comment syntax. Allocate the destination at 32 elements and copy indices 0 through 31 in order. This is narrower than globally assuming a receiver layout for library slice and is directly testable on the current workload. A dynamic caller may pay one checked projection at the call boundary. Inspect the generated helper body to verify that its inner loop omits any_index; type annotations alone are insufficient evidence. Check collection roots around the destination allocation. A read from a missing slot yields undefined. The trie only consumes slots by indexed read and tests presence with an undefined check. Verify all producers and consumers before relying on this fact: a generic array user observing property presence could distinguish a hole from an explicit undefined slot.

## Four controlled builds

Use the corrected guarded compiler from PICOCALC-CJI-RANGES as the control. Change only the range-state writer, only the private copy helper, then both. The copy helper runs less often in the combined version; benefits can overlap. All four executables should receive the same source and arena. Rotate their order across native trials after warming. Retain frontend time, GC time, collection count, live bytes, code size and output hash. Judge practical value by the time to a verified machine module on the physical board.

| Interface | What to inspect |
|---|---|
| Imported CJI `src/ranges.js:analyzeRanges` | Owns the current interval IDs, trie slot numbering and state lifetime. |
| `trieGet`, `trieSet`, `copyState`, `joinStates` | Read, update, take snapshots and test subtree identity. Mutation is limited to the state handle and newly allocated arrays. |
| `src/types.js:isDynamicType` and `src/cast-insert.js:cast` | Define which arrays can cross an Any boundary and how a checked projection is inserted. |
| `src/library.js` and `runtime/runtime.c:rt_any_index` | Explain the cost of the general slice path and the semantics it supports. |
| RANGES scripts 20, 23, 31, 35 and 38 | Bootstrap stage 1 and verify archived frontend cases, linked catalog binaries and original suite. |
| PERF scripts 05, 09, 18 and 22 | Build and identify an experimental image, run the board compiler, validate receipts and boot the ordinary headless image after testing. |

## Validation an intern can reproduce

1. Start from a clean copy of the imported source, apply the guarded scheduling patches, and apply the candidate edits. Use the unmodified stage 0 to compile the resulting frontend. This keeps changes to what executes on the device independent of changes to the compiler used to build it.
2. Compile representative programs through stage 1 at 8 MiB. Check the full emitted SLIR against the stored reference before comparing time. Run the catalog with its existing heap policy, including Agent at 10 MiB, and record existing failures separately.
3. Probe the changed operation with a multi-level tree, repeated write, changed leaf, missing leaf, and divergent snapshots. Validating both independent handles catches an accidental mutation of a shared node.
4. Examine the candidate's generated copy loop and run a counter on fresh and suppressed copies. Collect physical evidence using the same guarded control and board configuration. A lower number of writes is evidence about mechanism; elapsed seconds must come from a separate timed executable.
5. Restore the headless ordinary firmware and retain the boot and smoke test receipt. Publish the criteria, failures and observed results in the guide and report.
