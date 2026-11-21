#include <stdint.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "esp_timer.h"
#include "esp_cpu.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "production.inc"

typedef struct { uint32_t cap; uint16_t cells[]; } Surf;
typedef struct { const char *name; int sx,sy,lx,ly,stride; uint32_t rgb,depth,id; uint16_t meta[33]; } Case;
typedef int (*Clean)(Surf*,Surf*,int,int,int,int);
typedef int (*Shadow)(void*,int,int);
typedef int (*Primary)(Surf*,Surf*,Surf*,int,int);
typedef int (*Shade)(Surf*,Surf*,Surf*,Surf*,int,int,int,int);
typedef int (*Chess)(Surf*,int);
#include "inputs.h"
extern const uint8_t shadow_masks[][25600];
extern void cold_bench(void);
typedef struct { trace tr; light lamp; } Native;
static int native_shadow(void *ctx, int x, int y) {
    const Native *n=ctx;
    return in_shadow(&n->tr,&n->lamp,x,y);
}
static inline int checked_read(const Surf *w, unsigned i) {
    if(i >= w->cap) __builtin_trap();
    return w->cells[i];
}
#define CELL(i) checked_read(w,i)
#define PREDICATE checked_shadow
#include "layout.inc"
#define CELL(i) w->cells[i]
#define PREDICATE plain_shadow
#include "layout.inc"

static void *psram(size_t bytes) {
    return heap_caps_aligned_alloc(64,bytes,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
}
static Surf *surface(size_t n) {return psram(sizeof(Surf)+2*(n+1));}
static void clear_plane(Surf *p,int n){p->cap=n; memset(p->cells,0x55,2*n);p->cells[n]=0xc35a;}
static uint32_t hash_plane(const Surf *p) {
    uint32_t h=2166136261u;
    const uint8_t *b=(const uint8_t*)p->cells;
    for(unsigned i=0;i<2*p->cap;i++) h=(h^b[i])*16777619u;
    return h;
}
// Williams order balances position for an even number of arms.
static int arm_at(int pos,int block,int n) {
    int at=pos%2 ? (pos+1)/2 : (n-pos/2)%n;
    return (at+block)%n;
}
static __attribute__((noinline)) int batch(Shadow fn,void *ctx,const uint16_t *xy,int n) {
    int total=0;
    for(int i=0;i<n;i++) total+=fn(ctx,xy[i]&255,xy[i]>>8);
    return total;
}
static int predicates(int fi,int kind,int blocks,Surf *w, Native *nat,uint16_t *xy) {
    const Case *c=&fixtures[fi]; const uint8_t *m=shadow_masks[kind<0?fi:12];
    raytrace_demo_scene scene={c->sx,c->sy,c->lx,c->ly};
    prepare(&nat->tr,&scene);nat->lamp=prepare_light(&nat->tr,c->lx,c->ly);
    w->cap=2048; memcpy(w->cells,c->meta,sizeof(c->meta));
    if(kind>=0){w->cells[16]=1;nat->tr.object_count=1;}
    int count=0,expected=0;
    for(int i=0;i<25600;i++) {
        if(kind<0 ? m[i]==0 : m[i]!=kind) continue;
        xy[count++]=(i/160)*256+i%160;
        expected+=kind<0 ? m[i]-1 : kind==3;
    }
    const int narms=3+NMODE;
    for(int block=-1;block<blocks;block++) for(int p=0;p<narms;p++) {
        int a=arm_at(p,block<0?0:block,narms);
        Shadow fn=a==0?native_shadow:a==1?plain_shadow:a==2?checked_shadow:shadows[a-3];
        void *ctx=a==0?(void*)nat:(void*)w;
        if(block<0){
            for(int i=0;i<count;i++){
                int x=xy[i]&255,y=xy[i]>>8;
                if(fn(ctx,x,y)!=(kind<0?m[160*y+x]-1:kind==3)) return 0;
            }
            continue;
        }
        uint32_t t=esp_cpu_get_cycle_count();int got=batch(fn,ctx,xy,count);
        uint32_t cycles=esp_cpu_get_cycle_count()-t;
        if(got!=expected) return 0;
        printf("SHROW pred %s %d %d %d %d %"PRIu32"\n",c->name,kind,block,a,count,cycles);
        vTaskDelay(1);
    }
    return 1;
}
static int frames(int count,int blocks,Surf *rgb,Surf *z,Surf *id,Surf *w,Surf *ref) {
    for(int b=0;b<blocks;b++) for(int j=0;j<count;j++) {
        const Case *c=&fixtures[(j+b)%count];int cap=159*c->stride+160;
        raytrace_demo_scene scene={c->sx,c->sy,c->lx,c->ly};clear_plane(ref,cap);
        if(!raytrace_demo_render(ref->cells,c->stride,&scene,RAYTRACE_DEMO_SCALAR,NULL)||hash_plane(ref)!=c->rgb) return 0;
        for(int p=0;p<NMODE+1;p++) for(int k=0;k<3;k++) {
            int a=arm_at(p,b,NMODE+1),phase=(k+p+b)%3;
            clear_plane(rgb,cap);clear_plane(z,cap);clear_plane(id,cap);
            w->cap=2048;memset(w->cells,0,4096);w->cells[0]=c->stride;
            if(phase==2&&!raytrace_demo_trace_audit((int16_t*)z->cells,id->cells,c->stride,&scene,RAYTRACE_DEMO_SCALAR)) return 0;
            int ok;int64_t start=esp_timer_get_time();
            if(a==0) {
                if(phase==0) ok=raytrace_demo_render(rgb->cells,c->stride,&scene,RAYTRACE_DEMO_SCALAR,NULL);
                else if(phase==1) ok=raytrace_demo_trace_audit((int16_t*)z->cells,id->cells,c->stride,&scene,RAYTRACE_DEMO_SCALAR);
                else ok=raytrace_demo_shade_audit(rgb->cells,(int16_t*)z->cells,id->cells,c->stride,&scene);
            } else {
                if(phase==0) ok=cleans[a-1](rgb,w,c->sx,c->sy,c->lx,c->ly);
                else if(phase==1) ok=primarys[a-1](z,id,w,c->sx,c->sy);
                else ok=shades[a-1](rgb,z,id,w,c->sx,c->sy,c->lx,c->ly);
            }
            int64_t us=esp_timer_get_time()-start;
            if(!ok||rgb->cells[cap]!=0xc35a||z->cells[cap]!=0xc35a||id->cells[cap]!=0xc35a||
               (phase==1 ? hash_plane(z)!=c->depth||hash_plane(id)!=c->id : memcmp(rgb->cells,ref->cells,2*cap))) return 0;
            printf("SHROW frame %s %d %d %d %lld\n",c->name,phase,b,a,(long long)us);
            vTaskDelay(1);
        }
    }
    return 1;
}
static int transfer(Surf *w) {
    for(int b=0;b<6;b++) for(int i=0;i<3;i++) for(int adv=0;adv<=1;adv++){
        for(int p=0;p<(NMODE==1?1:2);p++) {
            int a=(b+p)%2 && NMODE>1 ? NMODE-1 : 0;
            w->cap=133;memcpy(w->cells,chess_boards[i],266);
            int sum=0;uint32_t t=esp_cpu_get_cycle_count();
            for(int r=0;r<16;r++) sum+=chesss[a](w,adv);
            uint32_t cycles=esp_cpu_get_cycle_count()-t;
            if(sum!=16*chess_expected[i][adv]||memcmp(w->cells,chess_boards[i],266))return 0;
            printf("SHROW chess %d %d %d %d 16 %"PRIu32"\n",i,adv,b,a,cycles);
        }
    }
    return 1;
}
void app_main(void){
    vTaskDelay(pdMS_TO_TICKS(1500));
    printf("SIMDLAB BEGIN shadow %d\n",NMODE);
    Surf *work=surface(2048),*rgb=surface(51200),*depth=surface(51200),*ids=surface(51200),*ref=surface(51200);
    Native *nat=psram(sizeof(*nat)); uint16_t *coords=psram(51200);
    int count=NMODE==1?1:12,blocks=NMODE==1?4:6;
    if(!work||!rgb||!depth||!ids||!ref||!nat||!coords){puts("SHERROR allocation");goto finish;}
    for(int i=0;i<count;i++) if(!predicates(i,-1,blocks,work,nat,coords)){puts("SHERROR natural");goto finish;}
    for(int k=0;k<4;k++) if(!predicates(0,k,blocks,work,nat,coords)){puts("SHERROR path");goto finish;}
    if(!frames(count,blocks,rgb,depth,ids,work,ref)){puts("SHERROR frame");goto finish;}
    if(NMODE>1&&!transfer(work)){puts("SHERROR chess");goto finish;}
    if(NMODE>1)cold_bench();
finish:
    puts("SIMDLAB END");
}
