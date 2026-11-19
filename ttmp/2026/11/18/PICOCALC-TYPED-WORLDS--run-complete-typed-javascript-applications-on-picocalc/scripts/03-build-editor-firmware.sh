#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 5 ]]; then
    echo "Usage: $0 IDF_EXPORT BUILD_DIR SDKCONFIG wasm|rv32 OUTPUT_DIR" >&2
    exit 2
fi
idf_export=$1
build_dir=$(realpath -m "$2")
sdkconfig=$(realpath "$3")
target=$4
out=$5
case "$target" in
    wasm) make -C picocalc-os typed-world-reactor; native=OFF; engine=wasm ;;
    rv32) native=ON; engine=native ;;
    *) echo "Unknown backend: $target" >&2; exit 2 ;;
esac
set +u
source "$idf_export"
set -u
idf.py -C picocalc-os/port/esp32p4 -B "$build_dir" -D "SDKCONFIG=$sdkconfig" \
    -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_RV32_AGENDA=ON -D PICOCALC_DEVICE_COMPILER=ON \
    -D PICOCALC_COMPILER_PROFILE=ON -D PICOCALC_HEADLESS=OFF -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_TYPED_EDITOR=ON -D "PICOCALC_RV32_EDITOR=$native" build
python - "$build_dir" "$out" "$engine" "$sdkconfig" <<'PY'
import hashlib
import json
from pathlib import Path
import shutil
import sys

build, output, engine, sdkconfig = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
main = build / "esp-idf/main"
editor = Path("picocalc-os/worlds/editor")
source = b"".join((editor / name).read_bytes() + b"\n" for name in (editor / "source.list").read_text().splitlines())
assert (main / "editor.typed").read_bytes() == source
manifests = [main / f"system.typed-{kind}.json" for kind in ("editor", "files", "agenda")]
for manifest in manifests:
    worlds = json.loads(manifest.read_text())["worlds"]
    assert len({entry["name"] for entry in worlds}) == len(worlds)
    selected = next(entry for entry in worlds if entry["name"] == "editor")
    assert selected["file"] == "editor/compiled.bin" and selected["engine"] == engine
    assert selected["budget_ms"] == 200 and selected["mem_kb"] == 768
    assert not selected.get("claims")
    assert {"display", "keyboard", "compositor", "files", "agenda"} <= {entry["name"] for entry in worlds}
bundle = (main / "js_bundle.c").read_text()
for payload in ("editor/editor.typed", "editor/reactor.bin", "typed/world.js", "typed/wasm.js"):
    assert f'"{payload}"' in bundle, payload
assert '"natives/editor.elf"' not in bundle
output.mkdir(parents=True, exist_ok=True)
image = build / "picocalc-os-p4.bin"
for item in [image, sdkconfig, build / "partition_table/partition-table.bin", *manifests]:
    shutil.copyfile(item, output / item.name)
print(f"Editor {engine}: {image.stat().st_size} firmware bytes; source SHA-256 {hashlib.sha256(source).hexdigest()}")
PY
