# Tasks

## TODO
- [x] Fix 1: painter wait with peripherals off-by-user (device.wait_painter) + fake-serial test <!-- t:n14a -->
- [x] Fix 2: absolute console deadline, #OK at line end + fake-serial tests <!-- t:ot2g -->
- [ ] Fix 3: fresh-boot health (reboot when up > 120 s); --health-only gate on the board <!-- t:my29 -->
- [ ] Fix 4: 30-minute soak of the installed playable image for the compositor overrun <!-- t:xmts -->
- [x] Fix 5: i2c/spi deltas over 5 s in every health record + fake-serial test <!-- t:zyj0 -->
- [ ] Gates: make test; install --stored with peripherals on; --health-only showing the reboot <!-- t:txnn -->
- [ ] Blocked: keyboard i2c0 NACKs every transfer (install 13:10 EST); needs a power cycle by a person, then the install gate, soak and --health-only gate <!-- t:4hg7 -->
- [x] Install holds the firmware before esptool resets it (device.quiesce, ff2a33c) <!-- t:2enh -->
