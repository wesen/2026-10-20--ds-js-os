# Reproduce the PicoCalc compiler promotion

Start with the [qualification report](analysis/01-promoting-two-native-compiler-changes-to-the-playable-picocalc.md) for results and the [implementation guide](design-doc/01-from-the-typed-frontend-to-an-ordinary-psram-loaded-world.md) for the compiler and loader interfaces.

## Host and release

Run the commands below in Bash from the repository root. The build needs ESP-IDF v5.4.2 with the ESP32-P4 toolchain and its ELF loader component. The build script accepts an optional fourth argument pointing to a managed-components directory. It creates a new staging directory for the archived source and its outputs.

```bash
ticket=(ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--*)
stage=/tmp/reproduce-picocalc-compiler-promotion
idf_export=/home/manuel/esp/esp-idf-5.4.2/export.sh
make -C picocalc-os test-apps
bash "$ticket/scripts/release/01-build-firmware.sh" 8052db7 "$stage" "$idf_export"
python "$ticket/scripts/release/02-attest.py" "$stage" "$stage/attested.json"
```

The output firmware includes ESP-IDF build metadata. A fresh build can have its own application digest. The attestation also verifies content identities independent of the firmware build timestamp. The ticket's [recorded build](various/release/build.json) identifies the exact image installed during this trial. For the app traces and four paired full-world links, use the commands and fixture preparation in the [host qualification diary](reference/04-host-qualification-diary.md).

## Physical replays

The previous ordinary control is the smooth Chess release identified in the [November 20 release receipt](../PICOCALC-RELEASE-LAB--ship-the-playable-firmware-and-measure-literal-data-incremental-builds-and-chess-search/various/release.json). Its application SHA-256 begins with 134f3a24. The device operator's [ordinary firmware diary](reference/03-device-investigation-diary.md) gives the exact order for stock readback, cold reboots, the Chess reply and the Editor scratch-file checks.

For the fixed-work experiment use the original stock image as input to the builder and the promoted playable image as the restore image. The physical collector verifies the expected application and partition before writing the probe, and restores and verifies the playable image when it finishes. Only one operator can own the serial port. The PSRAM collector also supports an offline preflight.

```bash
probe=/tmp/reproduce-picocalc-psram-chess
stock=/tmp/picocalc-native-release/picocalc-os-p4.bin
bash "$ticket/scripts/psram/02-build.sh" "$stage" "$stock" "$probe" "$idf_export"
attested_build=/tmp/picocalc-native-promotion-rev1/build
python "$ticket/scripts/psram/03-device.py" "$probe" "$attested_build" --preflight
```

The physical scripts and restore receipt refer to the attested application. When repeating the experiment with a separately rebuilt image, first qualify the actual playable image and supply its reviewed digest to the device gates. The original timed search trials, paired results and board handoff are documented in the [PSRAM qualification diary](reference/05-psram-qualification-diary.md).
