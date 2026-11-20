---
Title: Replaying the System specialization study
Ticket: PICOCALC-RENDER-SYSTEM
Status: complete
DocType: reference
Topics: [picocalc]
---

# Replaying the System specialization study

From the repository root, run this command in a clean checkout. It regenerates the stage timings, byte counts and image receipts under the child ticket. A new timing distribution will normally differ from the committed sample. Check out the observed revision separately if retaining the historical receipts is important.

```sh
bash ttmp/2026/11/20/PICOCALC-RENDER-SYSTEM--*/scripts/18-reproduce.sh
```

The host needs Node (observed v24.18.0), Acorn (observed v8.15.0; available to CommonJS), bash, make, a C compiler, glibc, ripgrep and sha256sum. The C objects are compiled against the repository's vendored QuickJS. The shared pixel oracle compiles its small driver and invokes it once per frame. The scripts keep raw RGB565 outputs in /tmp/render-system-{sysmon,keys}-* and retain per-frame hashes and command counts under various. Both competing image files are read and compared, including at the deliberately failed flush.

The blind protocol is in design-doc/01, the project's complete-snapshot control and release policy in reference/03. The three renderer implementations and the frozen Keys driver live in scripts/05–11. Each wire fixture stores the exact envelope string, UTF-8 count, publication decision and action ID. The decoded NDJSON input is what the shared pixel oracle consumes. Summaries are indexed by the same action identifiers. various/protocol-audit.json records the frozen prediction groups, the two-install arithmetic and valid → invalid → idle replay → valid admission tests.

The automatic rule and its runtime were frozen before anyone inspected held-out behavior. The first driver run failed at focus from a missing keyboard service. Commit 958d760 preserves the original driver. The repaired driver supplies a fixed keyboard service, dispatches the actual channel name and awaits events. Both checksums are preserved. No decision rule changed. The ordinary System upload, retained state and error guards are modeled in this study. Production source files remain the control.

For physical repetition generate /tmp/render-system-board.js with scripts/12-board-capsule.cjs. Install that file as input to the director's QuickJS stage runner. The capsule requires only a monotonic labMicros() and exposes renderLabRun(arm,1). The 20-state boundary corpus includes 17 deliveries. Per repetition the expected decoded-tree UTF-16 checksum is 2164593678 and exact changed UTF-8 bytes are 22072/8002/18980 for G/M/A. Both timing regions exclude receipt hashing and the explicit UTF-8 tally. This capsule can run locally via scripts/15-heap.sh or on the director's board fixture. Its single realm contains every treatment, the resident corpus and measurement glue.

The P4 build bundles each JS file as an uncompressed C byte array and adds a NUL plus a table entry. The source lengths price the content bytes only. Manual production integration would require dispatch and version checking across worlds. The generic-compacted automatic codec would be instantiated in each world; its implementation/catalog can share flash storage. The component QuickJS bytecode receipt uses the host compiler with debug metadata and one constant JS filename, and the allocator receipt records the used libc block sizes plus eight bytes. These are separate from firmware image size and kernel queue allocation.

The comparative diff works against the previous generic view and can emit a full snapshot when shorter. The archived generic screen must be available to an idle restarted receiver. Its measurements describe this deliberately simple diff with its full-reset frame, rather than a lower bound on stateful compression. The host time excludes painting, transport and the panel. Identical nodes after materialization explain why no painting work is removed.

scripts/22-paired-diff.cjs directly pairs M and S1 receiver measurements over 30 alternating blocks, six complete sweeps each. The initial local method gave a p95 upper limit below the 1.10 admission threshold. Verifying the import refactor repeated the sample and overwrote its full blocks. The first summary is preserved, and the final independent set of full blocks is in various/paired-diff.json. Its upper limit crosses 1.10. These two samples leave the tail decision inconclusive. The report uses both and does not select the favorable run.

scripts/23-source-cost.sh uses Terser 5.19.2 to compact each source component and Python 3's deterministic gzip-9 to price the resulting source data. This is independent of the shipping JS bundle and the serialized QuickJS bytecode control.
