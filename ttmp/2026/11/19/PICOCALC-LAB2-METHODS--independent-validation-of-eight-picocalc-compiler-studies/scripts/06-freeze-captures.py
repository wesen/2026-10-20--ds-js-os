"""Keep measurement lines in original order and save both source and extraction digests."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

root, dest = map(Path,sys.argv[1:3])
dest.mkdir(parents=True,exist_ok=True)
ledger={}
allowed={b"LABRUN",b"LABHASH",b"LABGUEST",b"LABDONE",b"FRAGROW",b"FRAGDONE"}
for name in sys.argv[3:]:
    source=(root/name).read_bytes()
    selected=[]
    for line in source.splitlines():
        words=line.split()
        if words and (words[0] in allowed or
                      (words[0] in {b"files",b"agenda",b"editor"} and
                       (b"functions=streamed" in words or b"status=ok" in words))):
            selected.append(line)
    assert any(line in (b"LABDONE",b"FRAGDONE") for line in selected)
    compact=b"\n".join(selected)+b"\n"
    (dest/name).write_bytes(compact)
    ledger[name]={"sourceSha256":hashlib.sha256(source).hexdigest(),
                  "extractSha256":hashlib.sha256(compact).hexdigest()}
if (root/"oracle.json").exists():
    shutil.copyfile(root/"oracle.json",dest/"oracle.json")
(dest/"capture-identities.json").write_text(json.dumps(ledger,indent=2)+"\n")
