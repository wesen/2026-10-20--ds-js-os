"""Cross-check completed normal Editor boots, pixel identity and the slot-only change."""
import hashlib
import json
import re
import sys
from pathlib import Path
from statistics import median
from PIL import Image, ImageChops

work, reference = map(Path,sys.argv[1:])
ticket = Path(__file__).resolve().parents[1]
decoded = json.loads((ticket/'various/native-elf.json').read_bytes())
known = {
    'standard-world': decoded['standard']['sha'],
    'slot80': decoded['small']['sha'],
    'select-world': '06a85ff63c94a9d193a9136f92a2250e6725c5f9df830e9c00aa643d96503944',
}
def digest(blob):
    return hashlib.sha256(blob).hexdigest()

result={}
for trial,expected in known.items():
    path=work/trial
    data=json.loads((path/'physical.json').read_bytes())
    assert data['restored'] and data['control_after']['engine']=='native'
    assert len(data['boots'])==(1 if trial=='select-world' else 3)
    trial_output={'firmware':data['firmware_sha256'],'elf':expected,'boots':[]}
    for i,row in enumerate(data['boots'],1):
        raw=(path/f'measured-{i}.log').read_text(errors='replace')
        assert re.search(rf'^(?:LIVE|SLOT80) editor bytes={row["module_bytes"]} sha256={expected}$', raw, re.M)
        assert f"editor compile source=bundle status=ok us={row['elapsed_us']} peak_js_bytes={row['peak_js_bytes']} module_bytes={row['module_bytes']}" in raw
        worlds, = [json.loads(line) for line in raw.splitlines() if line.startswith('[{"name":')]
        editor, = [w for w in worlds if w['name']=='editor']
        assert (editor['engine'],editor['last_error'],editor['mem_kb'],editor['limit_kb'])==('native','',row['world_kib'],768)
        trial_output['boots'].append([row[k] for k in ['elapsed_us','peak_js_bytes','module_bytes','world_kib']])
    trial_output['median']=[median(column) for column in zip(*trial_output['boots'])]
    if trial!='standard-world':
        assert data['preview']['input_bytes']==65536 and data['preview']['scratch_removed'] and not data['preview']['faults']
        ref=Image.open(reference).convert('RGB')
        boxes={}
        for name,sha in data['preview']['screenshots'].items():
            shot=path/'preview'/name
            assert digest(shot.read_bytes())==sha
            pixels=Image.open(shot).convert('RGB')
            assert pixels.size==ref.size==(640,640)
            bbox=ImageChops.difference(ref,pixels).getbbox()
            assert not bbox or (546<=bbox[0] and bbox[2]<=630 and 6<=bbox[1] and bbox[3]<=36)
            boxes[name]=bbox
        trial_output['pixelDifferenceBoundingBoxes']=boxes
    result[trial]=trial_output
cols=['coldUs','peakBytes','elfBytes','worldKiB']
print(json.dumps({'columns':cols,'trials':result,'smallMinusStandard':dict(zip(cols,
    [round(s-b,3) for s,b in zip(result['slot80']['median'],result['standard-world']['median'])]))},indent=2))
