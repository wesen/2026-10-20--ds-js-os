#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include "esp_cpu.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

struct input { uint32_t length; uint16_t distance[160]; };
typedef int32_t (*kernel)(struct input *, int32_t, int32_t, int32_t);
#define DECLARE(tag) extern int32_t simd_##tag(struct input *,int32_t,int32_t,int32_t)
DECLARE(short_stock); DECLARE(short_scalar); DECLARE(short_pie);
DECLARE(long_stock); DECLARE(long_scalar); DECLARE(long_pie);
DECLARE(dynamic_stock); DECLARE(dynamic_scalar); DECLARE(dynamic_pie);
static kernel const kernels[3][3]={
    {simd_short_stock,simd_short_scalar,simd_short_pie},
    {simd_long_stock,simd_long_scalar,simd_long_pie},
    {simd_dynamic_stock,simd_dynamic_scalar,simd_dynamic_pie}
};
static const uint8_t order[6][3]={{0,1,2},{1,2,0},{2,0,1},{2,1,0},{0,2,1},{1,0,2}};
static struct input __attribute__((aligned(16))) input;
void simd_director_bench(void) {
    input.length=160;
    for (int i=0;i<160;i++) input.distance[i]=(i*37+11)%97;
    const int lengths[]={8,96,3,17,96}, variants[]={0,1,2,2,2}, thresholds[]={0,35,96};
    const unsigned repeats=128;
    for(int block=0;block<6;block++) for(int f=0;f<5;f++) for(int j=0;j<3;j++){
        int fixture=(f+block)%5, reach=thresholds[(j+block)%3];
        int size=lengths[fixture], family=variants[fixture], gold=0;
        for(int i=0;i<size;i++){int d=reach-(int)input.distance[6+i]; if(d>=0)gold+=d*d;}
        for(int k=0;k<3;k++){
            int arm=order[block][k];kernel fn=kernels[family][arm];
            if(fn(&input,6,size,reach)!=gold){printf("DSERROR correctness\n");return;}
            uint32_t sum=0, start=esp_cpu_get_cycle_count();
            for(unsigned i=0;i<repeats;i++) sum+=(uint32_t)fn(&input,6,size,reach);
            uint32_t cycles=esp_cpu_get_cycle_count()-start;
            if(sum!=(uint32_t)gold*repeats){printf("DSERROR timed correctness\n");return;}
            printf("DSROW {\"block\":%d,\"fixture\":%d,\"n\":%d,\"reach\":%d,\"arm\":%d,\"cycles\":%" PRIu32 ",\"calls\":%u,\"value\":%d}\n",block,fixture,size,reach,arm,cycles,repeats,gold);
        }
        vTaskDelay(1);
    }
}
