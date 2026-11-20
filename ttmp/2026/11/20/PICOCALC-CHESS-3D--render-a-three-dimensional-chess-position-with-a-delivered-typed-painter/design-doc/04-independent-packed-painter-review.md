---
Title: Independently qualifying the packed ground lattice in the delivered painter
Ticket: PICOCALC-CHESS-3D
DocType: design-doc
Status: active
Topics: [compiler, graphics, picocalc]
---

# Independently qualifying the packed ground lattice in the delivered painter

The original renderer projects four corners for each square. Adjacent squares share corners. An eight-by-eight board has nine grid lines along each axis, so there are exactly 81 distinct ground positions. Each position at integer column c and row r has world coordinates (16c, 0, 16r). At the default camera pitch of five its screen coordinate is (160+16c−16r, 42+10c+10r). The corner farthest along both board axes is (160,202). This is vertex 80 when the grid is stored row by row. An eight-lane machine can process ten full groups and must still compute this final point.

## Observable result and controls

Preserve the frozen scalar renderer with digest d6c2dc3a6858dbf1571409a534f63c27d0d5ab116dd466fafbd7701fca7a81a4. Compare with the batched scalar source first. This exposes indexing or rounding changes even when the scalar and packed versions of the new loop share an error. Then compile the same batched source with the optimizer disabled, with RV32 scalar specialization, and with packed specialization. Count instructions at the actual projection entry in the machine interpreter so an untaken packed body cannot satisfy the test. Count full groups and inspect vertex 80 directly.

Use the actual 47-game-state fixture from the frozen experiment, plus crafted states covering cursor, legal moves, promotion and all piece types. Compare the number of returned commands and every returned word, including geometric coordinates, colors, text and hint commands. Check input immutability and output sentinels. Read all 81 scratch results from the native run and derive expected values from board coordinates. Test one deliberately misaligned scratch payload to force scalar fallback. Run successive states against reused scratch and deliberately poison writable output data between runs to detect dependencies on stale values. Compare produced pixels with the frozen renderer's application rectangle for available device frames. Follow each observation to its boundary: host command/path execution, framebuffer capture, or completed panel transfer.

## ABI and lifetime

Inspect the actual entry signature, compiler/linker signature check, relocated function pointer and call site. All eight RV32 integer argument registers can carry a pointer. Every scratch pointer must instead be independently verified to refer to a live Typed buffer whose capacity header is followed by 81 halfwords, whose data address is 16-byte aligned and whose range is disjoint from the others. C structure alignment alone does not establish the address returned by a heap allocator. Document who allocates the storage, what happens on failure, whether two calls may overlap and when the last reference dies. The installed painter and asynchronous compilation worker have distinct lifetimes.

The producer’s existing packet ABI and the renderer’s private entry ABI need separate verification. A packet containing normalized game data should remain sufficient to render the same position. The scratch columns belong to the receiver. Establish that neither their addresses nor their contents escape into a retained display list. Extract and validate the native command list before interpreting a reported speedup.

## Timing decision

Compare frozen scalar geometry with the redesigned batch geometry compiled normally, then compare guarded scalar and packed compilation of that same batch source. These are distinct changes: deduplicating 256 square corners into 81 lattice vertices can change the workload before any instruction is packed. Measure byte counts, scratch bytes and warm native painter invocation independently of cold compilation, rasterization and SPI transfer. State the sample endpoints and counts for every physical timing claim.
