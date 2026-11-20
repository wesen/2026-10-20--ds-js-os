"""Make a disposable copy of the playable image source and add a fixed research command."""
from pathlib import Path
import argparse, shutil, subprocess
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('work',type=Path)
p.add_argument('--update',action='store_true')
p.add_argument('--fixtures',required=True,type=Path)
p.add_argument('--wasm',required=True,type=Path)
p.add_argument('--source',required=True,type=Path)
p.add_argument('--capsule',action='append',default=[],help='fixed name=JS path')
a=p.parse_args()
scripts=Path(__file__).resolve().parent
repo=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
work=a.work.resolve(); tree=work/'tree'; osdir=tree/'picocalc-os'; port=osdir/'port/esp32p4'; main=port/'main'
if not a.update:
    tree.mkdir(parents=True,exist_ok=False)
    with subprocess.Popen(['git','archive','80cc251','picocalc-os'],stdout=subprocess.PIPE) as source:
        subprocess.run(['tar','-x','-C',str(tree)],stdin=source.stdout,check=True)
        if source.wait(): raise RuntimeError('source archive failed')

    for name in ('managed_components','dependencies.elf.lock','sdkconfig.agent-elf'):
        src=repo/'picocalc-os/port/esp32p4'/name; dest=port/name
        if src.is_dir(): shutil.copytree(src,dest,dirs_exist_ok=True)
        elif src.exists(): shutil.copy(src,dest)
    def replace(file,old,new):
        data=file.read_text(); assert data.count(old)==1,(file,old);file.write_text(data.replace(old,new))
    replace(main/'main_p4.c','  if (!strcmp(cmd, "stats"))','  extern void render_lab(const char *);\n  if (!strcmp(cmd, "renderlab")) { render_lab(rest); return; }\n  if (!strcmp(cmd, "stats"))')
    with (osdir/'nucleus/native_wasm.c').open('a') as f:
        f.write('\n#if NUCLEUS_WASM\nbool lab_wamr_ready(char *why, size_t n) { return runtime_ready(why, n); }\n#endif\n')
    replace(main/'CMakeLists.txt','"main_p4.c" "port_p4.c"','"main_p4.c" "render_lab.c" "port_p4.c"')
    replace(main/'CMakeLists.txt','set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)','include(${CMAKE_CURRENT_LIST_DIR}/render_lab.cmake)\nset(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)')
# CJI moved in the active checkout. Reconstruct the exact matching pinned revision.
historical='ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji'
if (tree/'ttmp').is_symlink():
    (tree/'ttmp').unlink()
if not (tree/historical/'runtime/runtime.c').exists():
    with subprocess.Popen(['git','archive','80cc251',historical],stdout=subprocess.PIPE) as archive:
        subprocess.run(['tar','-x','-C',str(tree)],stdin=archive.stdout,check=True)
        if archive.wait(): raise RuntimeError('CJI archive failed')
shutil.copyfile(scripts/'08-board-lab.c',main/'render_lab.c')
shutil.copyfile(a.fixtures,main/'chess_fixtures.h')
assets={'view.wasm':a.wasm,'view.typed':a.source}
for pair in a.capsule:
    key,path=pair.split('=',1)
    if key not in ('snake','sysmon','reader','chess'): raise ValueError(key)
    assets[key+'.js']=Path(path)
lines=[]
for name,src in assets.items():
    target=main/('study_'+name)
    shutil.copyfile(src,target)
    lines.extend([f'list(APPEND BUNDLE_EXTRA "study/{name}={target}")',f'list(APPEND BUNDLE_EXTRA_DEPS "{target}")'])
(main/'render_lab.cmake').write_text('\n'.join(lines)+'\n')
