#!/usr/bin/env bash
# Start in a shell configured by ESP-IDF's export.sh, at the repository root.
set -euo pipefail
cd picocalc-os/port/esp32p4
idf.py -B build-elf -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_NATIVE_ELF=ON \
    -D PICOCALC_PROFILE_TOOL= -D PICOCALC_HEADLESS="${1:-OFF}" -D PICOCALC_DEVICE_COMPILER=ON -D PICOCALC_COMPILER_PROFILE=ON \
    -D SDKCONFIG=sdkconfig.agent-elf \
    -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' build
sha256sum build-elf/picocalc-os-p4.{elf,bin}
