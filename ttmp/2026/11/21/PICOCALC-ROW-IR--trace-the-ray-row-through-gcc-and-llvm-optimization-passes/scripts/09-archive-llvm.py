"""Archive all printable pass states at their natural scopes, with an offset index."""
from pathlib import Path
import gzip,hashlib,json,re,subprocess,sys
work,dest=map(lambda p:Path(p).resolve(),sys.argv[1:3])
dest.mkdir(parents=True,exist_ok=True)
summary={}
for case in ['firmware','checked','unchecked']:
    src=work/case
    records={}
    for phase in ['middle','backend']:
        args=(['opt-18','-passes=default<O2>','-debug-pass-manager','-print-after-all','-disable-output','raw.ll']
            if phase=='middle' else ['llc-18','-O2','-print-after-all','opt.ll','-o','/dev/null'])
        log=work/(case+'-'+phase+'.log')
        with log.open('wb') as f: subprocess.run(args,cwd=src,stderr=f,check=True)
        name=case+'-'+phase
        data=log.read_bytes()
        offsets=[{'offset':m.start(),'header':m[1].decode(errors='replace').strip()} for m in re.finditer(rb'^[;# ]*\*\*\* (IR Dump After [^\n]*?)(?: \*\*\*)?\r?$',data,re.M)]
        if not offsets: raise ValueError('no pass headers: '+name)
        (dest/(name+'.log.gz')).write_bytes(gzip.compress(data,compresslevel=6,mtime=0))
        (dest/(name+'.index.json.gz')).write_bytes(gzip.compress(json.dumps(offsets).encode(),mtime=0))
        records[phase]={'command':args,'sha256':hashlib.sha256(data).hexdigest(),'rawBytes':len(data),'dumps':len(offsets)}
    for file in ['raw.ll','opt.ll','finalize-isel.mir','virtregrewriter.mir']:
        (dest/(case+'-'+file+'.gz')).write_bytes(gzip.compress((src/file).read_bytes(),mtime=0))
    summary[case]=records
(dest/'manifest.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({case:{key:v['dumps'] for key,v in info.items()} for case,info in summary.items()}))
