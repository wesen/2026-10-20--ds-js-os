# Tasks

## TODO
- [x] Write the reorganization design doc <!-- t:q53s -->
- [ ] Phase A: promote the measurement harness into bench/ (host, board, reference) and reproduce current numbers <!-- t:n17a -->
- [ ] Phase B: pin the playable firmware in the repo (profile, digests, stable artifact store) and make restore use it <!-- t:0xwq -->
- [ ] Phase C: move the Typed compiler to compiler/typed and the link adapters next to their worlds <!-- t:3189 -->
- [ ] Phase D: move the firmware tree (nucleus, port, sdk, natives, host, sim, third_party, fs-seed) to firmware/ <!-- t:881b -->
- [ ] Phase E: move apps (Typed worlds, JS worlds, simulator tours) to apps/ <!-- t:ro8g -->
- [ ] Phase F: remove tracked build output and stale directories; fix .gitignore <!-- t:m76v -->
- [ ] Phase G: one root Makefile with test, test-replays, firmware, playable and bench-board <!-- t:wd80 -->
- [ ] Phase H: rewrite AGENTS.md as a layout and command reference; promote current guides to docs/ <!-- t:3fup -->
- [ ] Phase I: ttmp hygiene (close finished tickets, ticket index); no renames <!-- t:1ank -->
- [x] Phase B2: promote the Candela generators (CPU-KERNEL, SECTIONS, GALLERY) to tools/gen/candela, regenerate third_party/candela from them, fold the gallery compositor patch into compositor.js <!-- t:4dwu -->
- [ ] Before Phase C: make the trace REPL's compiler module table revision-aware (pkg/tracecompiler) so compiler.at works on both sides of each move <!-- t:v3ua -->
- [ ] Phase B2 device gate: install the B2 playable image, check the gallery is in front and gallery digest agrees for the 18 scenes (not run in B2: device off limits) <!-- t:oemr -->
- [ ] Promote upstream Candela vendoring (CANDELA-WORLD 01-vendor-candela.py, REPO-LAYOUT scripts/01) to tools/gen/candela for the next Candela bump; it must also re-derive translator/isa.js SECTION_API over all presets <!-- t:y737 -->
- [ ] Fix firmware/tests/test_native_worlds.py test_dial_on_the_launcher_from_the_manifest_and_from_storage (fails since before 889a9b2; marked expectedFailure) and the PaperS3 host link (port_tz_set, port_net_scan, port_net_join undefined) <!-- t:u5ux -->
