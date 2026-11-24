# Tasks

## TODO
- [x] Refinements: verify the design against typed_p4.c, port_p4.c, fs_p4.c, kernel_supervision.c and the Candela arm; record decisions <!-- t:boym -->
- [x] Milestone 1: portable cache core (key, file format, atomic store, eviction) and a host test with torn and corrupt files <!-- t:5mcq -->
- [ ] Milestone 2: the cache in p4_typed_app_compile on the P4; cold vs warm boot, first frames, hit path, FAT write cost; health on both boots <!-- t:fxux -->
- [x] Milestone 2 gate: a hit byte-identical to a fresh compile for every boot app; a corrupted entry is a miss and the boot stays healthy <!-- t:eo6a -->
- [x] Milestone 3: the Candela Typed arm through the cache; candela-gallery in the playable profile; gallery.py 18/18 on both arms <!-- t:nlzx -->
- [x] Milestone 4: the default arm and the first-use experience (background compile while C++ draws) <!-- t:qvbz -->
- [x] Gates: make test, make test-host with both policies (25/25) <!-- t:hnkx -->
- [ ] Restore the playable image from the main checkout; final report <!-- t:7eb4 -->
