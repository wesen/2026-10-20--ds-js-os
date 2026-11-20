"""Add an isolated, non-printing search clock until the last matching Editor frame is available."""
import argparse
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
BUILDER, = (REPO/"ttmp/2026/11/18").glob("PICOCALC-TYPED-WORLDS--*/scripts/03-build-editor-firmware.sh")


def patch(path, old, new):
    text=path.read_text()
    if new in text: return
    if text.count(old)!=1: raise ValueError(f"observer anchor changed at {path}: {old}")
    path.write_text(text.replace(old,new))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("work",type=Path); p.add_argument("idf",type=Path)
    a=p.parse_args();w=a.work.resolve();tree=w/"checkout";os=tree/"picocalc-os"
    if not (w/"images/rv32/picocalc-os-p4.bin").exists(): raise ValueError("build the uninstrumented images first")
    kernel=os/"nucleus/kernel.c"
    shutil.copyfile(HERE/"05-find-observer.inc",kernel.with_name("p4_find_observer.inc"))
    patch(kernel,"static void run_segment(world_t *W, bool is_settle) {",'#include "p4_find_observer.inc"\n\nstatic void run_segment(world_t *W, bool is_settle) {')
    patch(kernel,"  K.cur = W; K.seg_cost = 0; K.segments++;","  eg_find_begin(W, is_settle);\n  K.cur = W; K.seg_cost = 0; K.segments++;")
    patch(kernel,"  W->cpu_us += cost;","  W->cpu_us += cost;\n  eg_find_end(W, is_settle);")
    console=os/"port/esp32p4/main/main_p4.c"
    patch(console,'  if (!strcmp(cmd, "stats")) kernel_stats_print();','  if (!strcmp(cmd, "egfind")) { extern void eg_find_arm(const char *); eg_find_arm(rest); }\n  else if (!strcmp(cmd, "stats")) kernel_stats_print();')
    for target in ("wasm","rv32"):
        with (w/(target+"-observer-build.log")).open("wb") as log:
            subprocess.run(["bash",BUILDER,a.idf,w/"build",w/"sdkconfig",target,w/"observer"/target],cwd=tree,stdout=log,stderr=subprocess.STDOUT,check=True)
        normal=w/"images"/target
        experimental=w/"observer"/target
        for f in ("system.typed-editor.json","system.typed-files.json","system.typed-agenda.json","sdkconfig","partition-table.bin"):
            if (normal/f).read_bytes()!=(experimental/f).read_bytes(): raise ValueError(f"observer changed build configuration: {f}")


if __name__=="__main__": main()
