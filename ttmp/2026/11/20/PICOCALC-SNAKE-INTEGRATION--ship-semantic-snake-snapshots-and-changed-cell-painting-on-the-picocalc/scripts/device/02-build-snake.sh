#!/usr/bin/env bash
# Bundle the current CJI source layout with the same options as playable Chess.
set -euo pipefail
out=$1
idf_export=$2
revision=$3
variant=$4              # ref or workspace
profile=${5:-normal}     # normal or profile
input=${6:-physical}     # physical or memory-keys, only for profile
repo=$(git rev-parse --show-toplevel)
here=$(cd "$(dirname "$0")" && pwd)
[[ "$variant" = ref || "$variant" = workspace ]]
[[ "$profile" = normal || "$profile" = profile ]]
[[ "$input" = physical || ("$profile" = profile && "$input" = memory-keys) ]]
mkdir -p "$out/tree"
out=$(cd "$out" && pwd)
# The development compiler uses fixed temporary names inside this tree.
exec 9>"$out/build.lock"
flock -x 9
tree=$out/tree
port=$tree/picocalc-os/port/esp32p4
commit=$(git rev-parse "$revision^{commit}")
git -C "$repo" archive "$commit" cji picocalc-os | tar -x -C "$tree"
if [[ "$variant" = workspace ]]; then
    for path in js/apps/snake.js js/system/compositor.js; do
        cp "$repo/picocalc-os/$path" "$tree/picocalc-os/$path"
    done
fi
original=$repo/picocalc-os/port/esp32p4
if [[ -d "$original/managed_components" ]]; then
    cp -a "$original/managed_components" "$port/"
fi
if [[ -f "$original/dependencies.elf.lock" ]]; then
    cp "$original/dependencies.elf.lock" "$port/"
elif [[ -f "$original/dependencies.agent-elf.lock" ]]; then
    cp "$original/dependencies.agent-elf.lock" "$port/dependencies.elf.lock"
fi
cp "$original/sdkconfig.agent-elf" "$out/sdkconfig"
if [[ "$profile" = profile ]]; then
    options=()
    if [[ "$input" = memory-keys ]]; then options+=(--with-memory-keys); fi
    python3 -B "$here/03-stage-observer.py" "$tree" "${options[@]}"
fi
sha256sum "$tree/picocalc-os/js/apps/snake.js" "$tree/picocalc-os/js/system/compositor.js" > "$out/world-sources.sha256"
set +u
source "$idf_export"
set -u
idf.py -C "$port" -B "$out/build" -D "SDKCONFIG=$out/sdkconfig" \
  -D PICOCALC_HEADLESS=OFF -D PICOCALC_DEVICE_COMPILER=ON \
  -D PICOCALC_RV32_CHESS=ON -D PICOCALC_RV32_AGENDA=ON \
  -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_FILES=ON \
  -D PICOCALC_RV32_STREAM_FUNCTIONS=ON -D PICOCALC_AGENT_WIFI=OFF build
python3 - "$out" "$commit" "$variant" "$profile" "$input" <<'PY'
import hashlib,json,sys
from pathlib import Path
out=Path(sys.argv[1])
pj=out/"build/esp-idf/main"
manifest=json.loads((pj/"system.typed-agenda.json").read_text())
worlds={w["name"]:w["file"] for w in manifest["worlds"] if w.get("engine")=="native"}
assert all(worlds.get(app)==f"{app}/compiled.bin" for app in ("chess","editor","files","agenda"))
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
sources={k:sha(out/"tree/picocalc-os/js"/p) for k,p in
    {"snake":"apps/snake.js","compositor":"system/compositor.js"}.items()}
mods={}
for world in sources:
    candidates=list((out/"build").rglob(f"{world}.elf"))
    assert candidates,world
    mods[world]=[{ "path":str(p.relative_to(out)), "bytes":p.stat().st_size, "sha256":sha(p)} for p in candidates]
image=out/"build/picocalc-os-p4.bin"
receipt=dict(sourceBase=sys.argv[2],sourceMode=sys.argv[3],profile=sys.argv[4],inputBuild=sys.argv[5],sourceSha256=sources,
    nativeModules=mods,nativeTypedWorlds=worlds,firmwareSha256=sha(image),imageBytes=image.stat().st_size)
(out/"build-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
PY
