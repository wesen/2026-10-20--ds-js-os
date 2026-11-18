"""Compare WAMR's successful values and emitted module to the independent Node build."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

folder = Path(__file__).resolve().parents[1] / "fastpath"
script = "const fs=require('fs');require(process.argv[1]);process.stdout.write(compileTyped(fs.readFileSync(process.argv[2],'utf8')));"
expected = subprocess.check_output(["node", "-e", script, folder/"04-typed-wasm.js", folder/"scroll.typed"])
digest = hashlib.sha256(expected).hexdigest()
rows = []
for line in Path(sys.argv[1]).read_text().splitlines():
    if line.startswith("DIALECT_TYPED "):
        fields = dict(re.findall(r"(\w+)=([^ ]*)", line))
        row = {k: (v if k in ("sha","detail") else int(v)) for k, v in fields.items()}
        assert row["ok"] == 1 and row["sha"] == digest and row["bytes"] == len(expected), row
        assert row["checks"] == 396 and min(row[k] for k in ("setup_us","compile_us","load_us","exec_us")) > 0, row
        rows.append(row)
assert [r["trial"] for r in rows] == [1, 2, 3], rows
for row in rows:
    print(json.dumps(row))
