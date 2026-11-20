#!/usr/bin/env bash
# Run 15-heap.sh first to export the exact source components.
set -euo pipefail
dir=$(cd "$(dirname "$0")" && pwd)
terser --version
for name in generic manual manualResident autoResident; do
  terser "/tmp/render-system-size-$name.js" --compress --mangle -o "/tmp/render-system-size-$name.min.js"
done
python3 - "$dir/../various/minified-source.json" <<'PY'
import json, gzip, pathlib, sys
parts = {name:pathlib.Path('/tmp/render-system-size-'+name+'.min.js').read_bytes()
         for name in ['generic','manual','manualResident','autoResident']}
out={}
for arm,names in [('G',['generic']),('M',['manual','manualResident']),('A',['generic','autoResident'])]:
    x=b'\n'.join(parts[n] for n in names)
    out[arm]={'components':{k:len(parts[k]) for k in names},'minified':len(x),'gzip9':len(gzip.compress(x,9,mtime=0))}
pathlib.Path(sys.argv[1]).write_text(json.dumps(out,indent=2)+'\n')
PY
