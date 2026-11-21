#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <inttypes.h>
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "esp_cpu.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

typedef struct {uint32_t cap; uint16_t cells[];} surface;
typedef struct {const char *name;int sx,sy,lx,ly,stride;uint32_t rgb,depth,id;} frame_case;
#include "frame_inputs.h"
typedef int (*clean_fn)(surface*,surface*,int,int,int,int);
typedef int (*primary_fn)(surface*,surface*,surface*,int,int);
#define ARM(n) extern int lab_##n##_clean(surface*,surface*,int,int,int,int); \
    extern int lab_##n##_primary(surface*,surface*,surface*,int,int)
ARM(baseline); ARM(empty); ARM(full);
static clean_fn const clean[]={lab_baseline_clean,lab_empty_clean,lab_full_clean};
static primary_fn const primary[]={lab_baseline_primary,lab_empty_primary,lab_full_primary};
static const uint8_t order[][3]={{0,1,2},{1,2,0},{2,0,1},{2,1,0},{0,2,1},{1,0,2}};
static uint32_t digest(surface *s){
    uint32_t h=2166136261u;const uint8_t *b=(const uint8_t*)s->cells;
    for(uint32_t n=0;n<2*s->cap;n++)h=(h^b[n])*16777619u;
    return h;
}
static surface *alloc_plane(size_t n){
    return heap_caps_aligned_alloc(64,sizeof(surface)+2*(n+1),MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
}
void simd_frame_bench(void){
    surface *rgb=alloc_plane(320*160),*depth=alloc_plane(320*160),*id=alloc_plane(320*160),*w=alloc_plane(2048);
    if(!rgb||!depth||!id||!w){puts("DFERROR allocation");goto done;}
    const unsigned n=sizeof(frames)/sizeof(frames[0]);
    for(int block=0; block<6;block++)for(unsigned i=0;i<n;i++){
        const frame_case *c=&frames[(i+block)%n];
        for(int pos=0;pos<3;pos++)for(int phaseOrder=0;phaseOrder<2;phaseOrder++){
            int arm=order[block][pos], phase=(phaseOrder+block+pos+i)%2;
            int cap=159*c->stride+160;
            rgb->cap=depth->cap=id->cap=cap;w->cap=2048;
            memset(w->cells,0,4096);w->cells[0]=c->stride;
            for(int z=0;z<3;z++){
                surface *p=(surface*[]){rgb,depth,id}[z];
                memset(p->cells,0x55,2*cap);p->cells[cap]=0xc35a;
            }
            int64_t start=esp_timer_get_time();uint32_t stamp=esp_cpu_get_cycle_count();
            int ok=phase==0?clean[arm](rgb,w,c->sx,c->sy,c->lx,c->ly):primary[arm](depth,id,w,c->sx,c->sy);
            uint32_t cyc=esp_cpu_get_cycle_count()-stamp;int64_t elapsed=esp_timer_get_time()-start;
            if(ok!=1 || rgb->cells[cap]!=0xc35a || depth->cells[cap]!=0xc35a || id->cells[cap]!=0xc35a ||
               (phase==0?digest(rgb)!=c->rgb:digest(depth)!=c->depth||digest(id)!=c->id)){
                printf("DFERROR equivalence %s %d %d\n",c->name,arm,phase);goto done;
            }
            printf("DFROW {\"block\":%d,\"fixture\":\"%s\",\"arm\":%d,\"phase\":%d,\"us\":%lld,\"cycles\":%" PRIu32 "}\n",block,c->name,arm,phase,(long long)elapsed,cyc);
            vTaskDelay(1);
        }
    }
done:
    heap_caps_free(rgb);heap_caps_free(depth);heap_caps_free(id);heap_caps_free(w);
}
