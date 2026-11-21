"""Make reproducible inputs to the standalone ESP-IDF harness after 02-build-heldout.mjs."""
import json,shutil,sys
from pathlib import Path
p=Path(sys.argv[1]).resolve()
here=Path(__file__).resolve().parent
for name in ['director.c','director_qjs.c']:
    shutil.copy(here/name,p/name)
with (p/'director_inputs.h').open('w') as h:
    for name,src in [('bundle','compiler.js'),('short_src','short.typed'),('long_src','long.typed'),('dynamic_src','dynamic.typed')]:
        lines=(p/src).read_text().splitlines(keepends=True)
        h.write('static const char '+name+'[] =\n'+'\n'.join(json.dumps(x,ensure_ascii=True) for x in lines)+';\n')
    import re,struct
    words=(p/'director.S').read_text()
    h.write('static const uint32_t expected_fnv[3][4] = {\n')
    manifest=json.loads((p/'manifest.json').read_text())
    for family,images in manifest['compiled'].items():
        values={}
        for mode in ['stock','scalar','pie']:
            region=re.search('simd_'+family+'_'+mode+':\n((?:\\.4byte [^\n]+\n)+)',words)[1]
            b=b''.join(struct.pack('<I',int(x.split()[1],16)) for x in region.splitlines())
            import hashlib
            assert hashlib.sha256(b).hexdigest()==images[mode]['sha']
            v=2166136261
            for x in b:v=((v^x)*16777619)&0xffffffff
            values[mode]=v
        values['auto']=values[images['auto']['calls'][0]['plan']]
        h.write('{'+','.join(str(v)+'u' for v in values.values())+'},\n')
    h.write('};\n')
