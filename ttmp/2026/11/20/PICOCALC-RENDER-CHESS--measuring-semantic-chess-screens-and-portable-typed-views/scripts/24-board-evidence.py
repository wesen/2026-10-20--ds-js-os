"""Extract only the relevant device observations from one supervised physical study receipt."""
import argparse
import hashlib
import json
import statistics
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('physical',type=Path);p.add_argument('output',type=Path)
a=p.parse_args();r=json.loads(a.physical.read_text())
runs=[t for t in r['runs'] if t['name'] in ('producer','chess','view')]
assert runs, 'no device Chess runs'
summary={'sourceSha256':hashlib.sha256(a.physical.read_bytes()).hexdigest(),'firmware':r['experimentSha256'],
         'playableFirmware':r['firmwareSha256'],'restored':r.get('restored',False),'serialUploadMs':r.get('serialUploadMs'),
         'raw':runs,'failures':[f for f in r['failures'] if any(f'renderlab {name} ' in str(f) for name in ('producer','view','chess'))],'series':{}}
def observation(block,group,arm,key,value):
    summary['series'].setdefault('/'.join((group,arm,key)),[]).append([block,value])
for row in runs:
    block,group,arm,d=row['block'],row['name'],row['arm'],row['data']
    def add(key,value):observation(block,group,arm,key,value)
    if group=='view':
        assert d['moduleBytes']==8641 and d['frames']==47*row['reps']
        for key in ('acquireUs','installUs'):add(key,d[key])
        add('acquireAndInstallUs',d['acquireUs']+d['installUs'])
        for key in ('resetUs','guestUs','checkUs'):add(key+'PerFrame',d[key]/d['frames'])
    elif group=='chess':
        assert d['frames']==3*row['reps']
        add('parseUsPerFrame',d['parseUs']/d['frames'])
        add('parseUs',d['parseUs'])
    else:
        assert d['frames']==6*row['reps']+1
        us=d['sumEventUs'];assert len(us)==7
        for i,name in enumerate(['launch','plainLeft','plainRight','select','selectedLeft','selectedRight','deselect']):
            add(name+'Us',us[i]/(1 if i==0 else row['reps']))
        add('selectedCursorUs',(us[4]+us[5])/(2*row['reps']))
        add('plainCursorUs',(us[1]+us[2])/(2*row['reps']))
summary['medians']={k:{'n':len(v),'median':statistics.median(x[1] for x in v),
                          'min':min(x[1] for x in v),'max':max(x[1] for x in v)} for k,v in summary['series'].items()}
a.output.write_text(json.dumps(summary,indent=2)+'\n')
