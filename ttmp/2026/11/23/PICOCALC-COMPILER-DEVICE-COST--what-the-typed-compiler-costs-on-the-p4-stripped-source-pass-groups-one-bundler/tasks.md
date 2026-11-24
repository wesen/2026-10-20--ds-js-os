# Tasks

## TODO
- [x] Instrument the P4 compile: TYPEDCOMPILE line per compile (8c6a1ff) <!-- t:4rec -->
- [x] One shared bundler for the three builds, bundles byte-identical (b2efc56) <!-- t:p4vr -->
- [x] Split the loops group: kernel group for kernel-only passes (c7fca6b); 84/84 digests <!-- t:3sjw -->
- [x] Strip debug info from the compiler bytecode in every compile runtime (4239fde); host diagnostics unchanged <!-- t:gf4l -->
- [x] In-image typedcost session: strip none/source/debug, lazy vs all, heap padding <!-- t:pa4h -->
- [x] Explain or fix the P4-only pass-group slowdown <!-- t:kyjk -->
- [x] Paired boot study on the merged base: control, group, strip, final (17-boot-arms.py; bench/board, rotating order) <!-- t:qk25 -->
- [x] Gates: make test, make test-host both policies, playable health with peripherals on, 75% of deadlines <!-- t:8xvh -->
- [ ] Restore the playable image from the main checkout and confirm health <!-- t:ly5h -->
- [x] Arena parking (7682d93): measure on the device (E4 in-image, park arm in the boot study); keep or revert <!-- t:86kp -->
- [x] Split the compile heap and TYPEDCOMPILE out of typed_p4.c (f1ecb93); one-write TYPEDCOMPILE line (91aeb52); parking taken out (d76d9bf) <!-- t:658l -->
