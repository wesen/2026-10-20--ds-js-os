# Tasks

## TODO
- [x] Step 1: regenerate the Typed kernel with value records, record results, continue, ?:, u32 and local arrays (1c72244, 416e220) <!-- t:rtop -->
- [x] Step 1 checks: E_rel <= 0.02 on 18 scenes, Wasm vs RV32 bit identity on 18 scenes, Typed reference digests through the renderer core <!-- t:unui -->
- [x] Step 2: profile B-01 and R-01 per function and instruction class before compiler changes (scripts 01, 02, 11) <!-- t:r7ld -->
- [x] Step 3: compiler changes the profile justifies: rows, coalesce, call-free homes, open record-result inlining, result fusion, affine rows (1fc5528, e096e70, 0cb1e3e, 6b1f2e3) <!-- t:ojvt -->
- [x] Gates: make test, make test-host with stock and kernel policies, 84-digest identity harness <!-- t:e48s -->
- [ ] Step 4 (board, paused until the PicoCalc is power-cycled): build candela-typed, gallery.py --arm typed and --arm cpp 18/18, paired study 18 scenes x 4 blocks x 4 passes at 160x160 against the 1.76x baseline <!-- t:0d1b -->
- [ ] After the board study: restore the playable firmware from the main checkout and confirm health <!-- t:mpc1 -->
