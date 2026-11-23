// The Typed ray tracer's study programs and its agreement and timing bench (PICOCALC-RAY-PARITY), moved out of the
// port's typed_ray_p4.c (PICOCALC-TYPED-APP-MANIFEST): built only by the bench profile.
//   typedray status                 frames drawn, the loaded program and the displayed pose
//   typedray load PROGRAM           compile one of the programs below into the display slot
//   typedray bench SX SY LX LY STRIDE ROTATION   C scalar, C PIE and the loaded Typed program, phase by phase
// A program is a source and an RV32 back end, bundled with -D PICOCALC_TYPED_RAY_<NAME>=FILE (cmake/bench.cmake).
#include "esp_cpu.h"
#include "esp_rom_crc.h"
#include "p4.h"
#include "raytrace_demo.h"
#include "typed_ray_p4.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { SIDE = RAYTRACE_DEMO_SIDE };

static bool install(int program) {
    static const struct { const char *source, *backend; } programs[] = {
        {NULL, NULL},
        {NULL, "typed-ray/DIV"},
        {"typed-ray/SPAN", NULL},
        {"typed-ray/SPAN", "typed-ray/DIV"},
        {NULL, "typed-ray/PACKED"},
        {NULL, "typed-ray/INFERRED"},
        {"typed-ray/SHADOW", NULL},
        {"typed-ray/SHADOW", "typed-ray/DIV"},
        {NULL, "typed-ray/MATCHED"},
        {NULL, "typed-ray/CHECK_STACK"},
        {NULL, "typed-ray/HOIST_STACK"},
        {NULL, "typed-ray/CHECK_REG"},
        {NULL, "typed-ray/HOIST_REG"},
        {NULL, "typed-ray/SKIP_REG"},
        {NULL, "typed-ray/SHADOW_HOIST"},
    };
    const p4_typed_app *app = p4_typed_app_find("raytrace");
    if (!app || program < 0 || program >= (int)(sizeof(programs)/sizeof(programs[0]))) return false;
    // NULL source: the app's own. Programs without their own back end compile with the app's policy ("kernel").
    const char *source_name = programs[program].source ? programs[program].source : app->source;
    p4_compile_limits limits = p4_typed_app_limits(app);
    limits.rv32_backend = programs[program].backend;
    if (limits.rv32_backend) limits.policy = NULL;
    size_t ns=0, nt=0, ni=0;
    int64_t begin=port_clock();
    char *source=p4_bundle_read(source_name,&ns,NULL,0);
    char *slot=p4_bundle_read(app->reactor,&nt,NULL,0);
    char *image=source && slot ? p4_typed_compile("typed-ray",source_name,source,ns,app->link,app->entry,
             app->compiler,slot,nt,&ni,begin,&limits) : NULL;
    free(source); free(slot);
    return image && p4_typed_ray_load(program, image, ni, ns, begin);
}

typedef struct { typed_ray_buffer *rgb,*depth,*id,*work; } planes;
static planes allocate_planes(unsigned capacity) {
    return (planes){p4_typed_ray_buffer(capacity),p4_typed_ray_buffer(capacity),p4_typed_ray_buffer(capacity),p4_typed_ray_buffer(TYPED_RAY_WORK)};
}
static void free_planes(planes p) {
    port_big_free(p.rgb);port_big_free(p.depth);port_big_free(p.id);port_big_free(p.work);
}
static bool allocated(planes p){return p.rgb && p.depth && p.id && p.work;}
static void poison(typed_ray_buffer *b,unsigned char byte){memset(b->cells,byte,b->capacity*2);}
static bool same(const typed_ray_buffer *a,const typed_ray_buffer *b,int stride) {
    if(a->capacity!=b->capacity || a->cells[a->capacity]!=0xc35a || b->cells[b->capacity]!=0xc35a) return false;
    for(int y=0;y<SIDE;y++){
        if(memcmp(a->cells+y*stride,b->cells+y*stride,2*SIDE))return false;
        if(y<SIDE-1)for(int x=SIDE;x<stride;x++) if(a->cells[y*stride+x]!=0xaaaa || b->cells[y*stride+x]!=0x5555)return false;
    }
    return true;
}

enum { CLEAN, AUDIT, PRIMARY, SHADE };
static bool run(int arm,int phase,planes p,int stride,const raytrace_demo_scene *s) {
    typed_ray_module *installed=p4_typed_ray_installed();
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
    typed_ray_module *installed=p4_typed_ray_installed();
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
               observed.work->cells[TYPED_RAY_WORK]!=0xc35a) {
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
    int program,stride,rotation;char tail;raytrace_demo_scene s;int pose[4];
    typed_ray_module *installed=p4_typed_ray_installed();
    if(!strcmp(args,"status")){p4_typed_ray_pose(pose);printf("TRSTATUS {\"frames\":%u,\"program\":%d,\"pose\":[%d,%d,%d,%d]}\n",p4_typed_ray_frames(),
            installed ? installed->program : -1,pose[0],pose[1],pose[2],pose[3]);}
    else if(sscanf(args,"load %d %c",&program,&tail)==1){if(!install(program))puts("typedray: source or backend unavailable");}
    else if(sscanf(args,"bench %d %d %d %d %d %d %c",&s.sphere_x,&s.sphere_y,&s.light_x,&s.light_y,&stride,&rotation,&tail)==6)measure(s,stride,rotation);
    else puts("typedray status | typedray load PROGRAM | typedray bench SX SY LX LY STRIDE ROTATION");
}
