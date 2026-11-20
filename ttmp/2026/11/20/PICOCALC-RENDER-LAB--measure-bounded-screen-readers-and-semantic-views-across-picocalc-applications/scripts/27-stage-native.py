"""Register the fixed native binary/C-JSON replay in the temporary measurement command."""
import shutil,sys
from pathlib import Path
main=Path(sys.argv[1])/'picocalc-os/port/esp32p4/main'
shutil.copyfile(sys.argv[2],main/'binary_native_fixtures.h')
shutil.copyfile(sys.argv[3],main/'binary_native.inc')
p=main/'render_lab.c'
s=p.read_text()
anchor='void render_lab(const char *rest) {'
s=s.replace(anchor,'#define BX_NOW() port_clock()\n#include "binary_native.inc"\n'+anchor)
anchor='    else if(!strcmp(name,"trace"))'
assert anchor in s
p.write_text(s.replace(anchor,'    else if(!strcmp(name,"nativebin"))bx_trial(arm,reps);\n'+anchor))
p=main/'CMakeLists.txt'
s=p.read_text()
if 'PRIV_REQUIRES json driver' not in s:
    assert s.count('PRIV_REQUIRES driver')==1
    p.write_text(s.replace('PRIV_REQUIRES driver','PRIV_REQUIRES json driver'))

if len(sys.argv)>4:
    shutil.copyfile(sys.argv[4],main/'binary_producer.inc')
    p=main/'render_lab.c'
    s=p.read_text().replace('#include "binary_native.inc"','#include "binary_native.inc"\n#include "binary_producer.inc"')
    anchor='    else if(!strcmp(name,"nativebin"))'
    assert s.count(anchor)==1
    p.write_text(s.replace(anchor,'    else if(!strcmp(name,"nativeprod"))bp_trial(arm,reps);\n'+anchor))
