#!/bin/bash
set -eu
runner=(ttmp/2026/11/17/PICOCALC-CJI-PORT--*/scripts/07-check-bundled-catalog.py)
for world in files agenda; do
  python3 "${runner[0]}" --timeout 7200 "$world" >"/tmp/nov18-$world.jsonl" 2>"/tmp/nov18-$world-progress.log"
  python3 - "$world" <<'PY'
from pathlib import Path
import sys,json,hashlib
w=sys.argv[1]
r=json.loads(Path('/tmp/nov18-'+w+'.jsonl').read_bytes())
elf=Path('/tmp/p4-catalog-reference',w+'.elf').read_bytes()
assert r['world']==w and r['result']=='ok' and r['elf_bytes']==len(elf) and r['elf_sha256']==hashlib.sha256(elf).hexdigest(),r
print(w,'verified',flush=True)
PY
done
