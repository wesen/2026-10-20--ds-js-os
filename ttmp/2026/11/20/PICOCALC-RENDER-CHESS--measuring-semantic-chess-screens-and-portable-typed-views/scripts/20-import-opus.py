"""Import an authenticated tool-free Opus result and keep only model identity, effort, brief digest and authored text."""
import argparse
import hashlib
import json
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('raw',type=Path);p.add_argument('brief',type=Path);p.add_argument('receipt',type=Path)
p.add_argument('--write-document',type=Path)
a=p.parse_args();data=json.loads(a.raw.read_text())
if isinstance(data,list):data=next(x for x in reversed(data) if x.get('type')=='result')
assert not data.get('is_error') and any('opus' in s for s in data['modelUsage'])
result=data['result'].strip()
a.receipt.write_text(json.dumps({'models':list(data['modelUsage']),'effort':'high',
    'briefSha256':hashlib.sha256(a.brief.read_bytes()).hexdigest(),'result':result},indent=2)+'\n')
if a.write_document:
    p=a.write_document
    front=p.read_text().split('---\n',2)[1]
    p.write_text('---\n'+front+'---\n\n'+result+'\n')
