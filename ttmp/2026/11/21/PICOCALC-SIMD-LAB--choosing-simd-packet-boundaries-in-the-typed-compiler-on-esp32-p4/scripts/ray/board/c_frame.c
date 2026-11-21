#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "esp_cpu.h"
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "raytrace_demo.h"

typedef struct {uint32_t cap; uint16_t cells[];} surface;
typedef struct {const char *name;int sx,sy,lx,ly,stride;uint32_t rgb,depth,id;} frame_case;
#include "current_fixtures.h"
extern int current_clean(surface*,surface*,int,int,int,int);
extern int current_primary(surface*,surface*,surface*,int,int);
enum { SCALAR_C, PIE_C, TYPED };
enum { CLEAN, PRIMARY };

static surface *allocate(unsigned n) {
    return heap_caps_aligned_alloc(64,sizeof(surface)+2*(n+1),MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
}
static uint32_t digest(const surface *s){
    uint32_t h=2166136261u;const uint8_t *b=(const uint8_t*)s->cells;
    for(uint32_t i=0;i<2*s->cap;i++)h=(h^b[i])*16777619u;
    return h;
}
static void clear(surface *s,unsigned n){
    s->cap=n;memset(s->cells,0x55,2*n);s->cells[n]=0xc35a;
}
static int invoke(unsigned arm,unsigned phase,surface *rgb,surface *depth,surface *id,
                  surface *work,const frame_case *c, const raytrace_demo_scene *scene) {
    if(arm==TYPED){
        if(phase==CLEAN)return current_clean(rgb,work,c->sx,c->sy,c->lx,c->ly);
        return current_primary(depth,id,work,c->sx,c->sy);
    }
    raytrace_demo_mode mode=arm==SCALAR_C?RAYTRACE_DEMO_SCALAR:RAYTRACE_DEMO_PIE;
    if(phase==CLEAN)return raytrace_demo_render(rgb->cells,c->stride,scene,mode,NULL);
    return raytrace_demo_trace_audit((int16_t*)depth->cells,id->cells,c->stride,scene,mode);
}
void simd_c_frame_bench(void){
    surface *rgb=allocate(320*160),*depth=allocate(320*160),*id=allocate(320*160),*work=allocate(2048);
    surface *wantRgb=allocate(320*160),*wantDepth=allocate(320*160),*wantId=allocate(320*160);
    if(!rgb||!depth||!id||!work||!wantRgb||!wantDepth||!wantId||!raytrace_demo_has_pie()){
        puts("CFERROR allocation/PIE"); goto done;
    }
    static const int order[6][3]={{0,1,2},{1,2,0},{2,0,1},{2,1,0},{0,2,1},{1,0,2}};
    const unsigned n=sizeof(fixtures)/sizeof(fixtures[0]);
    for(unsigned block=0;block<6;block++) for(unsigned k=0;k<n;k++){
        const frame_case *c=&fixtures[(k+block)%n];
        const raytrace_demo_scene scene={c->sx,c->sy,c->lx,c->ly};
        unsigned cap=159*c->stride+160;
        clear(wantRgb,cap);clear(wantDepth,cap);clear(wantId,cap);
        if(!raytrace_demo_render(wantRgb->cells,c->stride,&scene,RAYTRACE_DEMO_SCALAR,NULL)||
           !raytrace_demo_trace_audit((int16_t*)wantDepth->cells,wantId->cells,c->stride,&scene,RAYTRACE_DEMO_SCALAR)||
           digest(wantRgb)!=c->rgb||digest(wantDepth)!=c->depth||digest(wantId)!=c->id){
            printf("CFERROR scalar reference %s\n",c->name);goto done;
        }
        for(int pos=0;pos<3;pos++)for(int ph=0;ph<2;ph++){
            int arm=order[block][pos],phase=(ph+block+pos+k)%2;
            clear(rgb,cap);clear(depth,cap);clear(id,cap);
            work->cap=2048;memset(work->cells,0,4096);work->cells[0]=c->stride;
            int64_t start=esp_timer_get_time();uint32_t stamp=esp_cpu_get_cycle_count();
            int ok=invoke(arm,phase,rgb,depth,id,work,c,&scene);
            uint32_t cycles=esp_cpu_get_cycle_count()-stamp;int64_t us=esp_timer_get_time()-start;
            if(!ok||rgb->cells[cap]!=0xc35a||depth->cells[cap]!=0xc35a||id->cells[cap]!=0xc35a||
               (phase==CLEAN?memcmp(rgb->cells,wantRgb->cells,2*cap):
                    memcmp(depth->cells,wantDepth->cells,2*cap)||memcmp(id->cells,wantId->cells,2*cap))){
                printf("CFERROR candidate %s %d %d\n",c->name,arm,phase);goto done;
            }
            printf("CFROW %u %s %d %d %"PRId64" %"PRIu32"\n",block,c->name,arm,phase,us,cycles);
            vTaskDelay(1);
        }
    }
done:
    heap_caps_free(rgb);heap_caps_free(depth);heap_caps_free(id);heap_caps_free(work);
    heap_caps_free(wantRgb);heap_caps_free(wantDepth);heap_caps_free(wantId);
}
