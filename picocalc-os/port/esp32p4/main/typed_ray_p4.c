// Closed, complete Typed ray tracer. Only allocation, invocation and presentation live here.
#include "esp_elf.h"
#include "esp_cpu.h"
#include "esp_rom_crc.h"
#include "p4.h"
#include "raytrace_demo.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { SIDE = RAYTRACE_DEMO_SIDE, WORK = 2048 };
typedef struct { uint32_t capacity; uint16_t cells[]; } buffer;
typedef int (*frame_fn)(buffer*,buffer*,int,int,int,int);
typedef int (*audit_fn)(buffer*,buffer*,buffer*,buffer*,int,int,int,int);
typedef int (*trace_fn)(buffer*,buffer*,buffer*,int,int);

typedef struct {
    esp_elf_t elf;
    frame_fn frame;
    audit_fn audit;
    trace_fn trace;
    audit_fn shade;
    int program;
} module;

static module *installed;
static buffer *display_plane, *display_work;
static unsigned display_frames;
static raytrace_demo_scene display_pose;
static buffer *new_buffer(uint32_t capacity) {
    buffer *b = port_big_calloc(sizeof(*b) + 2u * (capacity+1));
    if (b) { b->capacity = capacity; b->cells[capacity] = 0xc35a; }
    return b;
}

static bool install(int program) {
    static const char *sources[] = {"typed-ray/main.typed","typed-ray/main.typed","typed-ray/SPAN","typed-ray/SPAN",
                                    "typed-ray/main.typed","typed-ray/main.typed","typed-ray/SHADOW","typed-ray/SHADOW","typed-ray/main.typed"};
    static const char *backends[] = {NULL,"typed-ray/DIV",NULL,"typed-ray/DIV","typed-ray/PACKED","typed-ray/INFERRED",NULL,"typed-ray/DIV","typed-ray/MATCHED"};
    if (program < 0 || program >= (int)(sizeof(sources)/sizeof(sources[0]))) return false;
    const p4_compile_limits limits = {.heap_bytes=4*1024*1024,.duration_us=8000000,.rv32_backend=backends[program]};
    size_t ns=0, nt=0, ni=0;
    int64_t begin=port_clock();
    char *source=p4_bundle_read(sources[program],&ns,NULL,0);
    // Four entry trampolines are shared with the closed Candela slot template.
    char *slot=p4_bundle_read("candela/slot.elf",&nt,NULL,0);
    char *image=source && slot ? p4_typed_compile("typed-ray",sources[program],source,ns,"typed-ray/link.js",
             "linkTypedRay",ENG_NATIVE,slot,nt,&ni,begin,&limits) : NULL;
    free(source); free(slot);
    module *next=image ? port_big_calloc(sizeof(*next)) : NULL;
    bool init=next && esp_elf_init(&next->elf)==0;
    uintptr_t entries[4]={0};
    char *argv[]={(char*)entries};
    bool ok=init && esp_elf_relocate(&next->elf,(uint8_t*)image,ni)==0 &&
            esp_elf_request(&next->elf,0,1,argv)==0 && entries[0] && entries[1] && entries[2] && entries[3];
    free(image);
    if (!ok) {
        if(init) esp_elf_deinit(&next->elf);
        if(next) port_big_free(next);
        return false;
    }
    next->frame=(frame_fn)entries[0]; next->audit=(audit_fn)entries[1];
    next->trace=(trace_fn)entries[2]; next->shade=(audit_fn)entries[3]; next->program=program;
    module *old=installed; installed=next;
    if(old){esp_elf_deinit(&old->elf);port_big_free(old);}
    printf("TRLOAD {\"program\":%d,\"sourceBytes\":%zu,\"elfBytes\":%zu,\"segmentBytes\":%zu,\"elapsedUs\":%" PRId64 "}\n",
           program,ns,ni,next->elf.segment_size,port_clock()-begin);
    return true;
}

bool p4_typed_ray_frame(uint16_t *pixels,size_t stride,int sx,int sy,int lx,int ly) {
    if(!pixels || stride<SIDE || (!installed && !install(0))) return false;
    if(!display_plane) display_plane=new_buffer(SIDE*SIDE);
    if(!display_work) display_work=new_buffer(WORK);
    if(!display_plane || !display_work) return false;
    display_work->cells[0]=SIDE;
    if(installed->frame(display_plane,display_work,sx,sy,lx,ly)!=1) return false;
    for(int y=0;y<SIDE;y++) memcpy(pixels+y*stride,display_plane->cells+y*SIDE,SIDE*2);
    display_frames++;
    display_pose=(raytrace_demo_scene){sx,sy,lx,ly};
    return true;
}

typedef struct { buffer *rgb,*depth,*id,*work; } planes;
static planes allocate_planes(unsigned capacity) {
    return (planes){new_buffer(capacity),new_buffer(capacity),new_buffer(capacity),new_buffer(WORK)};
}
static void free_planes(planes p) {
    port_big_free(p.rgb);port_big_free(p.depth);port_big_free(p.id);port_big_free(p.work);
}
static bool allocated(planes p){return p.rgb && p.depth && p.id && p.work;}
static void poison(buffer *b,unsigned char byte){memset(b->cells,byte,b->capacity*2);}
static bool same(const buffer *a,const buffer *b,int stride) {
    if(a->capacity!=b->capacity || a->cells[a->capacity]!=0xc35a || b->cells[b->capacity]!=0xc35a) return false;
    for(int y=0;y<SIDE;y++){
        if(memcmp(a->cells+y*stride,b->cells+y*stride,2*SIDE))return false;
        if(y<SIDE-1)for(int x=SIDE;x<stride;x++) if(a->cells[y*stride+x]!=0xaaaa || b->cells[y*stride+x]!=0x5555)return false;
    }
    return true;
}

enum { CLEAN, AUDIT, PRIMARY, SHADE };
static bool run(int arm,int phase,planes p,int stride,const raytrace_demo_scene *s) {
    if (arm==2) {
        if(!installed)return false;
        switch(phase) {
        case CLEAN:return installed->frame(p.rgb,p.work,s->sphere_x,s->sphere_y,s->light_x,s->light_y)==1;
        case AUDIT:return installed->audit(p.rgb,p.depth,p.id,p.work,s->sphere_x,s->sphere_y,s->light_x,s->light_y)==1;
        case PRIMARY:return installed->trace(p.depth,p.id,p.work,s->sphere_x,s->sphere_y)==1;
        default:return installed->shade(p.rgb,p.depth,p.id,p.work,s->sphere_x,s->sphere_y,s->light_x,s->light_y)==1;
        }
    }
    raytrace_demo_mode mode=arm==0 ? RAYTRACE_DEMO_SCALAR : RAYTRACE_DEMO_PIE;
    switch(phase){
    case CLEAN:return raytrace_demo_render(p.rgb->cells,stride,s,mode,NULL);
    case AUDIT:return raytrace_demo_render_audit(p.rgb->cells,(int16_t*)p.depth->cells,p.id->cells,stride,s,mode);
    case PRIMARY:return raytrace_demo_trace_audit((int16_t*)p.depth->cells,p.id->cells,stride,s,mode);
    default:return raytrace_demo_shade_audit(p.rgb->cells,(const int16_t*)p.depth->cells,p.id->cells,stride,s);
    }
}

static void measure(raytrace_demo_scene scene,int stride,int rotation) {
    if(!installed || stride<SIDE || stride>320 || rotation<0 || rotation>2){puts("typedray: invalid configuration");return;}
    const unsigned capacity=(SIDE-1)*stride+SIDE;
    planes expected=allocate_planes(capacity), observed=allocate_planes(capacity);
    if(!allocated(expected)||!allocated(observed)){puts("typedray: plane allocation failed");goto done;}
    poison(expected.rgb,0xaa);poison(expected.depth,0xaa);poison(expected.id,0xaa);
    if(!run(0,AUDIT,expected,stride,&scene)){puts("typedray: oracle rejected scene");goto done;}
    observed.work->cells[0]=stride;
    int64_t times[3][4];
    uint32_t cycles[3][4];
    for(int n=0;n<3;n++){
        const int arm=(n+rotation)%3;
        for(int phase=CLEAN;phase<=SHADE;phase++){
            poison(observed.rgb,0x55);
            if(phase!=SHADE){poison(observed.id,0x55);poison(observed.depth,0x55);}
            const int64_t begin=port_clock();
            const uint32_t cycle_start=esp_cpu_get_cycle_count();
            bool ok=run(arm,phase,observed,stride,&scene);
            cycles[arm][phase]=esp_cpu_get_cycle_count()-cycle_start;
            times[arm][phase]=port_clock()-begin;
            if(!ok || (phase!=PRIMARY && !same(expected.rgb,observed.rgb,stride)) ||
               (phase!=CLEAN && (!same(expected.depth,observed.depth,stride) || !same(expected.id,observed.id,stride))) ||
               observed.work->cells[WORK]!=0xc35a) {
                printf("typedray: agreement failed arm=%d phase=%d\n",arm,phase);goto done;
            }
        }
    }
    printf("TRROW {\"program\":%d,\"pose\":[%d,%d,%d,%d],\"stride\":%d,\"rotation\":%d,\"timesUs\":[",
           installed->program,scene.sphere_x,scene.sphere_y,scene.light_x,scene.light_y,stride,rotation);
    for(int arm=0;arm<3;arm++)printf("%s[%" PRId64 ",%" PRId64 ",%" PRId64 ",%" PRId64 "]", arm?",":"",
                                     times[arm][0],times[arm][1],times[arm][2],times[arm][3]);
    printf("],\"cycles\":[");
    for(int arm=0;arm<3;arm++)printf("%s[%" PRIu32 ",%" PRIu32 ",%" PRIu32 ",%" PRIu32 "]", arm?",":"",
                                     cycles[arm][0],cycles[arm][1],cycles[arm][2],cycles[arm][3]);
    printf("],\"crc\":[\"%08" PRIx32 "\",\"%08" PRIx32 "\",\"%08" PRIx32 "\"]}\n",
           esp_rom_crc32_le(0,(uint8_t*)expected.rgb->cells,2*capacity),
           esp_rom_crc32_le(0,(uint8_t*)expected.depth->cells,2*capacity),
           esp_rom_crc32_le(0,(uint8_t*)expected.id->cells,2*capacity));
done:
    free_planes(expected);free_planes(observed);
}

void p4_typed_ray_console(const char *args) {
    int program,stride,rotation;char tail;raytrace_demo_scene s;
    if(!strcmp(args,"status"))printf("TRSTATUS {\"frames\":%u,\"program\":%d,\"pose\":[%d,%d,%d,%d]}\n",display_frames,
            installed ? installed->program : -1,display_pose.sphere_x,display_pose.sphere_y,display_pose.light_x,display_pose.light_y);
    else if(sscanf(args,"load %d %c",&program,&tail)==1){if(!install(program))puts("typedray: source or backend unavailable");}
    else if(sscanf(args,"bench %d %d %d %d %d %d %c",&s.sphere_x,&s.sphere_y,&s.light_x,&s.light_y,&stride,&rotation,&tail)==6)measure(s,stride,rotation);
    else puts("typedray load PROGRAM | typedray bench SX SY LX LY STRIDE ROTATION");
}
