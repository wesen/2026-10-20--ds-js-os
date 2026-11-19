#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 4 ]]; then
    echo "Usage: $0 IDF_EXPORT BUILD_DIR SDKCONFIG wasm|rv32" >&2
    exit 2
fi

idf_export=$1
build_dir=$(realpath -m "$2")
sdkconfig=$(realpath "$3")
backend=$4

case "$backend" in
    wasm)
        reactor=wasm
        rv32_files=OFF
        make -C picocalc-os files-reactor
        ;;
    rv32)
        reactor=native
        rv32_files=ON
        ;;
    *)
        echo "Unknown backend: $backend" >&2
        exit 2
        ;;
esac

# ESP-IDF activation needs access to variables that are unset before activation.
set +u
source "$idf_export"
set -u
idf.py -C picocalc-os/port/esp32p4 -B "$build_dir" -D "SDKCONFIG=$sdkconfig" \
    -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_RV32_AGENDA=ON -D PICOCALC_DEVICE_COMPILER=ON \
    -D PICOCALC_COMPILER_PROFILE=ON -D PICOCALC_HEADLESS=OFF \
    -D PICOCALC_TYPED_FILES=ON -D "PICOCALC_RV32_FILES=$rv32_files" build

python - "$build_dir" "$reactor" <<'PY'
import json
from pathlib import Path
import sys

build, engine = Path(sys.argv[1]), sys.argv[2]
main = build / "esp-idf/main"
for name in ("system.typed-files.json", "system.typed-agenda.json"):
    worlds = json.loads((main / name).read_text())["worlds"]
    files = [entry for entry in worlds if entry["name"] == "files"]
    assert len(files) == 1, files
    assert files[0]["file"] == "files/compiled.bin", files
    assert files[0]["engine"] == engine and files[0]["claims"] == ["fs:/"], files
    assert {"keyboard", "display", "compositor", "editor"} <= {entry["name"] for entry in worlds}
    agenda = next(entry for entry in worlds if entry["name"] == "agenda")
    expected_agenda = "agenda/compiled.bin" if name == "system.typed-agenda.json" else "apps/agenda.js"
    assert agenda["file"] == expected_agenda, agenda
bundle = (main / "js_bundle.c").read_text()
for name in ("typed/wasm.js", "typed/rv32.js", "files/files.typed", "files/compile.js", "files/reactor.bin"):
    assert f'"{name}"' in bundle, name
image = build / "picocalc-os-p4.bin"
print(f"{engine} Files image: {image.stat().st_size} bytes; both boot manifests preserve Files claims")
PY
