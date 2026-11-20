"""Classify index receivers at each instruction in the named slice specialization."""
import argparse
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('named', type=Path)
parser.add_argument('out', type=Path)
args = parser.parse_args()
out = args.out
out.mkdir(parents=True, exist_ok=True)
cji = Path("cji")
runtime = (cji/'runtime/runtime.c').read_text()
marker = '/* (CJI-3, lane 6: an array or a string first'
assert runtime.count(marker) == 1
# All guest pointers are observed only inside the function. Retain counts by code identity.
header = """
extern const char slice_begin[] __asm__("slice.4604fbb68ec0");
static unsigned long long slice_kinds[3];
__attribute__((destructor)) static void show_slice_counts(void) {
    fprintf(stderr, "SLICE array_numeric=%llu string_numeric=%llu other=%llu\\n",
            slice_kinds[0], slice_kinds[1], slice_kinds[2]);
}
"""
sym = next(line.split() for line in subprocess.check_output(['nm','-S',args.named/'named.o'],text=True).splitlines()
           if line.endswith(' slice.4604fbb68ec0'))
size = int(sym[1],16)
runtime = runtime.replace('int64_t rt_any_index(int64_t o,',header+'\nint64_t rt_any_index(int64_t o,')
runtime = runtime.replace(marker, f"""uintptr_t pc = (uintptr_t)__builtin_return_address(0)-1;
    if (pc - (uintptr_t)slice_begin < {size}u) {{
        unsigned kind = !is_number(k) ? 2 : is_array(o) ? 0 : is_string(o) ? 1 : 2;
        slice_kinds[kind]++;
    }}
    """+marker)
(out/'runtime.c').write_text(runtime)
# Export the original local symbol for address comparison in the diagnostic runtime.
subprocess.run(['objcopy','--globalize-symbol=slice.4604fbb68ec0',args.named/'named.o',out/'named.o'],check=True)
subprocess.run(['cc','-std=gnu11','-O2','-g','-no-pie','-fno-omit-frame-pointer','-DCJI_PROFILE_GC',
                '-I'+str(cji/'runtime'),cji/'runtime/aot_main.c',out/'runtime.c',out/'named.o','-lm','-o',out/'trace'],check=True)
for w in ('agenda','files'):
    with (out/f'{w}.ir').open('wb') as ir, (out/f'{w}.log').open('w') as log:
        subprocess.run([out/'trace','-C','-g','-h','8388608','-H','8388608','--',
                        f'picocalc-os/js/apps/{w}.js','--world-unit'],stdout=ir,stderr=log,check=True)
    assert (out/f'{w}.ir').read_bytes() == (args.named/f'{w}.ref').read_bytes()
    print(w, next(s for s in (out/f'{w}.log').read_text().splitlines() if s.startswith('SLICE')))
