"""Compare peak and still-live bytes with actual values retained in a host QuickJS realm."""
import json,subprocess,sys,tempfile
from pathlib import Path
here=Path(__file__).resolve().parent; src,=here.parents[1].glob('PICOCALC-RENDER-SYSTEM--*/scripts/14-host-heap.c')
cap=Path(sys.argv[1]).read_text();out=Path(sys.argv[2])
with tempfile.TemporaryDirectory() as d:
    work=Path(d); binary=work/'meter';probe=work/'probe.c'
    # Query heap while the guest value is still reachable after a GC.
    code=src.read_text()
    pos=code.index('      printf("{\\"resident\\"')
    code=code[:pos]+'''      JS_RunGC(rt);
      printf("{\\"resident\\":%zu,\\"peakAboveStart\\":%zu,\\"liveAboveStart\\":%zu,\\"value\\":%s}",start,m.peak-start,m.used-start,v);
'''+code[code.index('      JS_FreeCString(ctx,v);',pos):]
    probe.write_text(code)
    objects=[f'picocalc-os/build/eng/{n}.o' for n in ['quickjs','libregexp','libunicode','dtoa','cutils']]
    subprocess.run(['cc','-O2','-Ipicocalc-os/third_party/quickjs',probe,*objects,'-lm','-lpthread','-ldl','-o',binary],check=True)
    capsule=work/'measure.js';capsule.write_text(cap+'''
let held=null;
renderLabRun=function(spec){
   const [app,arm]=spec.split('-'), wire=labFrames[app];
   if(arm==='base') held=JSON.parse(wire);
   else if(arm==='ix') held=indexScreen(wire);
   else if(arm==='used'){const count=indexScreen(wire).used; held=indexScreen(wire,new Uint16Array(4*count));}
   return JSON.stringify({bytes:utf8Size(wire),type:arm==='base'?held.t:held.view().t});
};
''')
    results={}
    for name in ['sysmon','snake','chess','keys','editor']:
        results[name]={arm:json.loads(subprocess.check_output([binary,capsule,f'{name}-{arm}'])) for arm in ['base','ix','used']}
    out.write_text(json.dumps(results,indent=2)+'\n')
