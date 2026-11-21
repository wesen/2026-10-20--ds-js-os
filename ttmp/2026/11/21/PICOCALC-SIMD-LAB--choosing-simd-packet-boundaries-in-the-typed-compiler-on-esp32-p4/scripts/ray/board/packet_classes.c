// A region microbenchmark. Each independent packet starts with identical depth
// and ID state. This measures the hand schedule by actual input hit mask.
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "esp_cpu.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "ceiling_fixtures.h"

typedef struct { uint32_t capacity; uint16_t cells[2048]; } Buffer;
typedef struct { uint16_t depth[8], id[8]; } Output;
extern uint32_t ceiling_min(const uint16_t*);
extern uint64_t ceiling_minmax(const uint16_t*);
static _Alignas(16) Buffer work;
typedef void (*Plan)(const uint16_t*, int, int, int, Output*);
static inline __attribute__((always_inline)) void consume(const uint16_t *xs,int r,int z,int id,Output *out,int all) {
    for(int i=0;i<8;i++){
        int d=r-xs[i];
        if(all || d>=0) {
            int depth=z-work.cells[520+d];
            if(!out->depth[i] || depth<out->depth[i]){out->depth[i]=(uint16_t)depth; out->id[i]=(uint16_t)id;}
        }
    }
}
static void scalar(const uint16_t *xs,int r,int z,int id,Output *out){consume(xs,r,z,id,out,0);}
static void empty(const uint16_t *xs,int r,int z,int id,Output *out){
    if(ceiling_min(xs)<=(unsigned)r) consume(xs,r,z,id,out,0);
}
static void empty_full(const uint16_t *xs,int r,int z,int id,Output *out){
    uint64_t mm=ceiling_minmax(xs);
    if((uint32_t)mm<=(unsigned)r) consume(xs,r,z,id,out,(mm>>32)<=(unsigned)r);
}
static void ref(const uint16_t *xs,int r,int z,int id,Output *out) {
    for(int i=0;i<8;i++) {
        if(xs[i]>(unsigned)r)continue;
        int depth=z-work.cells[520+r-xs[i]];
        if(!out->depth[i] || depth<out->depth[i]){out->depth[i]=(uint16_t)depth;out->id[i]=(uint16_t)id;}
    }
}

void simd_packet_classes(void) {
    const uint8_t *inputs[]={opening_raw,dense_raw,sparse_raw};
    Plan arms[]={scalar,empty,empty_full};
    for(int b=0;b<9;b++) for(int scene=0;scene<3;scene++){
        uint32_t cycles[3][3]={0},count[3]={0}; int ok=1;
        memcpy(&work,inputs[scene],sizeof(work));
        for(int y=0;y<160;y++) for(int j=0;j<work.cells[16];j++){
            uint16_t *sphere=work.cells+1+5*j;
            int dy=y-sphere[1],term=sphere[3]*sphere[3]-dy*dy;
            if(term<0)continue;
            uint16_t *row=work.cells+40+160*j;
            for(int x=6;x+8<=160;x+=8){
                const uint16_t *xs=row+x;
                if((uintptr_t)xs&15) {ok=0;continue;}
                unsigned mask=0;
                Output init={0},want,got;
                for(int lane=0;lane<8;lane++){
                    if(xs[lane]<=(unsigned)term)mask|=1u<<lane;
                    init.depth[lane]=(lane%3)==0?1:0;
                    init.id[lane]=0xaa00+lane;
                }
                int group=mask==0?0:mask==255?2:1;
                count[group]++;
                want=init;ref(xs,term,sphere[2],j+1,&want);
                for(int pos=0;pos<3;pos++){
                    int arm=(b+pos+scene)%3;got=init;
                    uint32_t begin=esp_cpu_get_cycle_count();
                    arms[arm](xs,term,sphere[2],j+1,&got);
                    cycles[arm][group]+=esp_cpu_get_cycle_count()-begin;
                    if(memcmp(&got,&want,sizeof(got)))ok=0;
                }
            }
        }
        for(int a=0;a<3;a++)for(int g=0;g<3;g++)
            printf("PKTCLASS %d %d %d %d %"PRIu32" %"PRIu32" %d\n",b,scene,a,g,count[g],cycles[a][g],ok);
        vTaskDelay(1);
    }
}
