# Qualify the 80 KiB Editor slot on the P4

This recipe is for the supervising board operator. It uses the normal native wrappers with the staged compiler and one physically smaller assembly reservation. The general native compilation trial measures all the compiler lanes in a standard reactor. The separate firmware here measures the actual executable allocation change in a running Editor.

## Inputs and checkpoint

- Control revision `40bcf850a5809ef6d839127869faa952596ed157`.
- Compiler staging under `/tmp/picocalc-staged-rv32-lab/run`, or recreate with `python3 -B scripts/01-stage.py <fresh-directory>` from the repository root.
- `bash scripts/07-build-small-slot.sh <staged-directory> <slot-work-directory> <ESP-IDF-export.sh>` builds the firmware under `<slot-work-directory>/build`.
- `node scripts/08-slot-oracle.mjs <staged-directory> <standard-reactor> <slot-work-directory>/build/esp-idf/main/typed-world-reactor.elf <slot-work-directory>` emits the comparison and linked modules. The standard reactor is the unmodified Editor bundle from the prior combined trial or the matching generic build.
- The host oracle expects the small Editor module to be **92,996 bytes**. Its SHA-256 is `81718435b1d83e79cd8ad11d3f3260aa7978d6eb081cf0a42f9491d112c67bb4`.

## Measurement

1. Use the supervising board run's saved factory-app bytes, verified partition table and restoration process. Compare the small firmware's generated partition table with the table read from the device before changing the app partition. Save the small firmware digest and the saved app digest in the measurement receipt.
2. With the unchanged-size staged firmware under the same measurement conditions, obtain a cold native Editor compile line and the full `editor` entry in the `worlds` RPC. Record `engine`, `file`, status, `mem_kb`, error and any timing fields actually provided in the response. Carry forward the observed full-size control from the generic experiment if it uses the same staged image at launch.
3. Install the small-slot firmware for one cold sample and reboot for a second. Capture the `editor native compiler functions=streamed` and `editor compile source=bundle status=ok` lines. Require 92,996 bytes in the compile line. Compare the `SLOT80 editor bytes=92996 sha256=...` line to the host oracle. The wrapper hashes the complete module after the compiler time and heap receipt. Capture the `worlds` response after the compiler has loaded the app. The native Editor entry should reference `editor/compiled.bin` and carry no `last_error`. Record actual firmware clock time and peak JS heap, because the smaller reactor also changes the size of the typed array linking needs to allocate.
4. Run the established long-inline Editor workflow, or the same open, edit, save and preview scenario used by the control. Save the fixture's existing outcome evidence and confirm no crash, trap, timeout or missing world. Include a captured screen or frame result when available.
5. Restore the saved production app partition using the supervisor's verified board procedure. Record the final native world state and verify the exact saved app bytes using the established restoration receipt.

Report the measured resident-memory delta independently of the exact 147,456-byte ELF reduction. `worlds` may report a whole-KiB aggregate with accounting for other resident buffers. Reproduce baseline and small workflows before attributing any additional difference to execution.
