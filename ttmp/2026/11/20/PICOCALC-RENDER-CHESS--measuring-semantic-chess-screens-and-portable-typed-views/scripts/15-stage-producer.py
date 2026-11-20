"""Install the fixed Chess producer probe into the director's disposable staged tree after lab stage 07."""
import argparse, shutil
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('tree',type=Path)
p.add_argument('fixture_dir',type=Path)
a=p.parse_args()
main=a.tree/'picocalc-os/port/esp32p4/main'
lab=main/'render_lab.c'
native=a.tree/'picocalc-os/nucleus/native_wasm.c'
assert lab.exists() and 'lab_wamr_ready' in native.read_text(), 'requires the disposable lab image'
shutil.copyfile(Path(__file__).with_name('14-board-producer.inc'),main/'chess_producer.inc')
shutil.copyfile(a.fixture_dir/'chess_producer_modules.h',main/'chess_producer_modules.h')
def insert_once(path,anchor,replacement):
    data=path.read_text()
    if replacement in data: return
    assert data.count(anchor)==1,(path,anchor)
    path.write_text(data.replace(anchor,replacement))
insert_once(lab,'void render_lab(const char *rest) {','#include "chess_producer.inc"\n\nvoid render_lab(const char *rest) {')
insert_once(lab,'    if(!strcmp(name,"view"))chess_trial(arm,reps);','    if(!strcmp(name,"producer"))producer_trial(arm,reps);\n    else if(!strcmp(name,"view"))chess_trial(arm,reps);')
anchor='  world_t *W = running(env);\n  if (n0 > NW_STR_MAX'
insert_once(native,anchor,'''  extern bool lab_producer_intercept(wasm_exec_env_t, int32_t, const char *, uint32_t, const char *, uint32_t, int64_t *);
  int64_t captured;
  if (lab_producer_intercept(env,op,s0,n0,s1,n1,&captured)) return captured;
'''+anchor)
