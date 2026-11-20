"""Create an isolated copy of the frozen playable tree and add the fixed stage benchmark."""
import argparse
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('work', type=Path)
args=parser.parse_args()
scripts=Path(__file__).resolve().parent
repo=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
work=args.work.resolve()
tree=work/'tree'
main=tree/'picocalc-os/port/esp32p4/main'
historical='ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji'
if not tree.exists():
    tree.mkdir(parents=True)
    with subprocess.Popen(['git','archive','80cc251','picocalc-os',historical],stdout=subprocess.PIPE) as archive:
        subprocess.run(['tar','-x','-C',tree],stdin=archive.stdout,check=True)
        if archive.wait(): raise RuntimeError('frozen source unavailable')
    port=main.parent
    for name in ('managed_components','dependencies.elf.lock','sdkconfig.agent-elf'):
        src=repo/'picocalc-os/port/esp32p4'/name
        if src.is_dir(): shutil.copytree(src,port/name,dirs_exist_ok=True)
        elif src.is_file(): shutil.copyfile(src,port/name)
    for f in ('typed-wasm.js','typed-rv32.js'):
        assert (repo/'picocalc-os/compiler'/f).read_bytes()==(tree/'picocalc-os/compiler'/f).read_bytes(),f
    def patch(file,old,new):
        data=file.read_text()
        assert data.count(old)==1,(file,old)
        file.write_text(data.replace(old,new))
    patch(main/'main_p4.c','  if (!strcmp(cmd, "stats"))','  extern void staging_trial(const char *);\n  if (!strcmp(cmd, "psixstudy")) { staging_trial(rest); puts("#OK psixstudy"); return; }\n  if (!strcmp(cmd, "stats"))')
    cm=main/'CMakeLists.txt'
    patch(cm,'"main_p4.c" "port_p4.c"','"main_p4.c" "staging_trial.c" "port_p4.c"')
    patch(cm,'PRIV_REQUIRES driver','PRIV_REQUIRES json driver')
    patch(cm,'set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)','include(${CMAKE_CURRENT_LIST_DIR}/stage.cmake)\nset(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)')
for name in ('slot.S','entry.c','link.js','stage.cmake','staging_trial.c','descriptor.h'):
    shutil.copyfile(scripts/name,main/name)
study=next(scripts.parent.parent.parent.glob('PICOCALC-RENDER-BINARY--*'))
for source,target in [('native/02-native.inc','binary_native.inc'),('native/binary_native_fixtures.h','binary_native_fixtures.h'),('producer/binary_producer.inc','binary_producer.inc')]:
    shutil.copyfile(study/'scripts'/source,main/target)
for name,target in [('01-specialize.js','generator.js'),('02-primitives.typed','primitives.typed')]:
    shutil.copyfile(scripts.parent/'static'/name,main/target)
subprocess.run(['node',scripts/'fixtures.mjs',main/'stage_fixtures.h'],check=True)
# ELF_FLAGS match the frozen firmware builder. Generate a golden image before CMake
# bundles fixed assets; no download or external module reaches the execution hook.
import glob
candidates=sorted(glob.glob('/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf-gcc'))
if not candidates: raise RuntimeError('install the ESP-IDF 5.4.2 cross compiler')
slot=work/'golden-slot.elf'
subprocess.run([candidates[0],'-march=rv32imafc_zicsr_zifencei','-mabi=ilp32f','-Os','-fPIC','-shared','-nostartfiles','-nostdlib','-e','app_main','-ffunction-sections','-fdata-sections','-Wl,--gc-sections','-fvisibility=hidden','-Wl,--strip-all','-Wl,-z,max-page-size=16','-Wno-attributes','-o',slot,main/'entry.c',main/'slot.S'],check=True)
subprocess.run(['node',scripts/'golden.mjs',tree/'picocalc-os',main,slot],check=True)
subprocess.run(['node',scripts.parent/'runtime/05-build-board.mjs',main/'adaptive.js'],check=True)
if (scripts/'patch.h').is_file():
    subprocess.run(['node',scripts/'patch-fixtures.mjs',main],check=True)
    for name in ['patch.h','relocated-table.c']:
        shutil.copyfile(scripts/name,main/name)
print(main)
