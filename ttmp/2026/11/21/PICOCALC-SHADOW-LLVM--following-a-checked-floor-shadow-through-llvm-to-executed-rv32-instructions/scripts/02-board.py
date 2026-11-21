"""Stage a dedicated, predicate-only IDF experiment. Reuse the exact previous source and masks."""
import hashlib,json,re,shutil,subprocess,sys
from pathlib import Path
T=Path(__file__).resolve().parents[1];root=T.parents[4]
old=next(T.parent.glob('PICOCALC-SHADOW-CODEGEN--*'))
simd=next(T.parent.glob('PICOCALC-SIMD-LAB--*'))
build,images,objects=map(lambda s:Path(s).resolve(),sys.argv[1:])
m=build/'main';m.mkdir(parents=True,exist_ok=True)
for f in ['CMakeLists.txt','sdkconfig.defaults']:shutil.copyfile(simd/'scripts/ray/board'/f,build/f)
shutil.copy(root/'picocalc-os/port/esp32p4/partitions.csv',build)
n=root/'picocalc-os/nucleus'
for f in ['raytrace_demo.h','raytrace_demo_pie.S']:shutil.copy(n/f,m)
shutil.copyfile(n/'raytrace_demo.c',m/'production.inc')
shutil.copy(old/'scripts/board/layout.inc',m)
work=old/'scripts/board/bench.c';s=work.read_text().split('static int frames(')[0]
fixture=(images/'inputs.h').read_text().split('static const Case fixtures[]=')[1].split('extern int clean0')[0]
(m/'inputs.h').write_text('static const Case fixtures[]='+fixture+'\n')
s=s.replace('const int narms=3+NMODE;', '''extern int llvm_kernel(void*,int,int), nolsr_kernel(void*,int,int), fastreg_kernel(void*,int,int), wrap_kernel(void*,int,int), typed_kernel(void*,int,int);
    static Shadow const arms[]={checked_shadow,llvm_kernel,nolsr_kernel,fastreg_kernel,wrap_kernel,typed_kernel};
    const int narms=6;''')
s=s.replace('Shadow fn=a==0?native_shadow:a==1?plain_shadow:a==2?checked_shadow:shadows[a-3];','Shadow fn=arms[a];').replace('void *ctx=a==0?(void*)nat:(void*)w;','void *ctx=w;')
s+='''
void app_main(void) {
    vTaskDelay(pdMS_TO_TICKS(1500));
    puts("SIMDLAB BEGIN checked LLVM shadow");
    Surf *w=surface(2048); Native *n=psram(sizeof(*n)); uint16_t *xy=psram(51200);
    if(!w||!n||!xy){puts("SHERROR memory");goto end;}
    for(int i=0;i<12;i++) if(!predicates(i,-1,6,w,n,xy)){puts("SHERROR natural");goto end;}
    for(int k=0;k<4;k++) if(!predicates(0,k,6,w,n,xy)){puts("SHERROR path");goto end;}
end:
    puts("SIMDLAB END");
}
'''
(m/'bench.c').write_text(s)
mc=json.loads((images/'manifest.json').read_text())
treated=[r for r in mc['records'] if r['family']=='ray'][-1];image=images/'image_0_2.bin'
assert hashlib.sha256(image.read_bytes()).hexdigest()==treated['sha']=='c31e75ee3817542fa31e0466bacb712814e018da084cd2f420abb7fe2993037e'
mask=(images/'masks.bin').read_bytes()
paths=json.loads((old/'various/board/paths.json').read_text())
assert len(mask)==13*25600 and all(hashlib.sha256(mask[i*25600:(i+1)*25600]).hexdigest()==p['maskSHA'] for i,p in enumerate(paths))
(m/'fixture.S').write_text(f'.section .text.typed_shadow,"ax",@progbits\n.balign 16\nimage_start:\n.incbin "{image}"\n.globl typed_kernel\n.set typed_kernel, image_start+{treated["entries"]["typedRayInShadow"]}\n.section .rodata.masks,"a",@progbits\n.globl shadow_masks\nshadow_masks:\n.incbin "{images/"masks.bin"}"\n')
cc=Path(shutil.which('riscv32-esp-elf-objcopy') or 'riscv32-esp-elf-objcopy')
names=['llvm','nolsr','fastreg','wrap']
for name in names:subprocess.run([cc,'--redefine-sym','kernel='+name+'_kernel',objects/(name+'.o'),m/(name+'.o')],check=True)
(m/'CMakeLists.txt').write_text('idf_component_register(SRCS bench.c fixture.S raytrace_demo_pie.S INCLUDE_DIRS "." PRIV_REQUIRES esp_timer esp_psram)\n'
 'target_compile_options(${COMPONENT_LIB} PRIVATE -O3 -Wno-error=unused-function)\n'+
 '\n'.join('target_sources(${COMPONENT_LIB} PRIVATE ${CMAKE_CURRENT_LIST_DIR}/'+name+'.o)' for name in names)+'\n')
