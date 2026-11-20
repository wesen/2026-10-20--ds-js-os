"""Run the fixed C measurements on the host and report native allocation separately from timing."""
import csv
import json
import pathlib
import statistics
import subprocess
import sys
import tempfile

root=pathlib.Path(__file__).resolve().parent
cj=pathlib.Path(sys.argv[1])
target=pathlib.Path(sys.argv[2])
def compile_bin(tmp,src):
    out=pathlib.Path(tmp,src.stem)
    subprocess.run(['cc','-O2','-Wall','-I',str(cj),str(src),str(cj/'cJSON.c'),'-lm','-o',str(out)],check=True)
    return out
with tempfile.TemporaryDirectory() as tmp:
    host=compile_bin(tmp,root/'03-host.c')
    heap=compile_bin(tmp,root/'05-heap.c')
    checks=compile_bin(tmp,root/'04-validation.c')
    validated=subprocess.check_output([checks],text=True).strip()
    memory=list(csv.DictReader(subprocess.check_output([heap],text=True).splitlines()))
    samples=[]
    for i in range(12):
        for name in ['sysmon','chess','snake','editor']:
            for arm in ('GB' if i%2==0 else 'BG'):
                argument=f'{name}-{arm}'
                line=subprocess.check_output([host,argument,'64'],text=True).strip()
                prefix=f'LAB NATIVEBIN {argument} '
                assert line.startswith(prefix),line
                samples.append(dict(block=i,app=name,arm=arm,data=json.loads(line[len(prefix):])))
    summary={}
    for name in ['sysmon','chess','snake','editor']:
        arms={}
        for arm in 'GB':
            rows=[x['data'] for x in samples if x['app']==name and x['arm']==arm]
            assert len(rows)==12 and all(x['reps']==64 for x in rows)
            sums={k:round(statistics.median(x[k]/64 for x in rows),4) for k in
                  ('admitUs','lookupUs','repeatLookupUs','walkUs','releaseUs')}
            sums['admitWalkReleaseUs']=round(statistics.median((x['admitUs']+x['walkUs']+x['releaseUs'])/64 for x in rows),4)
            arms[arm]=sums
        summary[name]=arms
    target.write_text(json.dumps(dict(memory=memory,validation=validated,
       bounds='12 host blocks x 64 operations, stage times total microseconds/64, no producer or painter',
       summary=summary,samples=samples),indent=2)+'\n')
print(json.dumps(summary,indent=2))
