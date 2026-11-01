# ESP32-P4 PicoCalc port

This port targets the PicoCalc adapter with a **Waveshare ESP32-P4-WIFI6 base board**.
The detailed agent architecture, setup, operating instructions, and verification report are in
[the PicoCalc agent implementation guide](../../docs/picocalc-agent-implementation.md).

## Build

Use the repository's ESP-IDF **v5.4.2** toolchain environment. A normal `idf.py build` remains an
offline build. The direct HTTPS transport is optional and uses the board's onboard ESP32-C6 over SDIO.

From this directory, after sourcing the ESP-IDF environment:

```sh
idf.py -B build-agent \
  -D PICOCALC_AGENT_WIFI=ON \
  -D SDKCONFIG=sdkconfig.agent \
  -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' build
```

Use the same flags when running `flash` or `monitor`, and supply the actual P4 port with `-p PORT`.
Keep the offline and network build/config directories separate. `dependencies.agent.lock` pins
the resolved network components; they are downloaded only for the optional network build.
Check the chip revision before flashing; never override a revision mismatch with `--force`.

### Machine-code native worlds (optional)

`-D PICOCALC_NATIVE_ELF=ON` adds Espressif's `elf_loader` (2.0.0, downloaded, pinned) and runs the worlds of
`optional/native_elf/system.elf.json` as ELF modules: C built with `sdk/nw_elf.c` as position-independent
shared objects, compiled and bundled by `main/CMakeLists.txt`. They are trusted drivers and are not isolated
(they run in machine mode with the firmware; a bad store panics the board, a loop that never returns stalls the
kernel), so they come only from the firmware, never from storage. Use its own build and config directories:

```sh
idf.py -B build-elf -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_NATIVE_ELF=ON \
  -D SDKCONFIG=sdkconfig.agent-elf \
  -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' build
```

Each combination keeps its own lock (`dependencies.agent.lock`, `dependencies.agent-elf.lock`,
`dependencies.elf.lock`), so building one does not rewrite another. WebAssembly worlds need no option: WAMR is
vendored (`third_party/wamr`) and always built in.

The network build has been cross-compiled with ESP-IDF v5.4.2, ESP-Hosted 1.4.2, and Wi-Fi Remote
0.14.0. Physical Wi-Fi, TLS, display responsiveness, storage recovery, and battery behavior still
need the hardware checks in the guide.

## Provisioning and companion firmware

Credentials are entered locally through the native `net` UART commands or the provisioning helper
described in the guide. `net status` reports configuration, Wi-Fi, and native clock readiness without
printing credential values. The default endpoint is `https://api.openai.com/v1/responses`; it can be
changed only through native configuration. Credentials are not part of the JavaScript bundle.

The P4 SDIO configuration is in `sdkconfig.agent-wifi`. If the C6 firmware needs updating, use a copy
of the **pinned** `managed_components/espressif__esp_hosted/slave` source, with `sdkconfig.c6-agent`
applied after that source's defaults. This overlay is exclusively for the C6, not for the P4.
It selects matching packet-mode SDIO, 20 MHz, and disables unused Bluetooth. The guide gives the
separate C6 build and manufacturer-specific programming-pad procedure; flashing the P4 does not
update its C6 companion.

The added `agentstore` partition holds bounded world records separately from the native credential
namespace. Existing NVS and factory application offsets are preserved. NVS initialization never
automatically erases a failed partition. Default NVS storage is not encrypted at rest.
