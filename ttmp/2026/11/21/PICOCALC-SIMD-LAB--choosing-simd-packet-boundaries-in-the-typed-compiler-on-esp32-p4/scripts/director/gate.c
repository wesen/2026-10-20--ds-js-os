#include <stdio.h>
#include <stdint.h>
#include <inttypes.h>
#include "esp_cpu.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
struct gate_data {uint32_t cap;uint16_t d[160];};
typedef int (*gate_fn)(struct gate_data*,int,int,int);
extern int simd_dynamic_stock(struct gate_data*,int,int,int);
extern int simd_dynamic_pie(struct gate_data*,int,int,int);
extern int simd_dynamic_gated(struct gate_data*,int,int,int);
static struct gate_data __attribute__((aligned(16))) input;
void simd_gate_bench(void){
    static const int lengths[]={0,1,3,5,7,8,9,15,16,17,33,96,127};
    static gate_fn const arms[]={simd_dynamic_stock,simd_dynamic_pie,simd_dynamic_gated};
    static const unsigned char order[][3]={{0,1,2},{1,2,0},{2,0,1},{2,1,0},{0,2,1},{1,0,2}};
    const int repeats=192;
    input.cap=160;for(int i=0;i<160;i++) input.d[i]=(37*i+11)%97;
    for(int b=0;b<6;b++)for(int i=0;i<13;i++) {
        int n=lengths[(i+b)%13],gold=0;
        for(int j=0;j<n;j++){int d=35-input.d[6+j];if(d>=0)gold+=d*d;}
        for(int k=0;k<3;k++){
            int arm=order[b][k];gate_fn run=arms[arm];
            if(run(&input,6,n,35)!=gold){puts("DGERROR initial equivalence");return;}
            uint32_t sum=0,start=esp_cpu_get_cycle_count();
            for(int rep=0;rep<repeats;rep++)sum+=(uint32_t)run(&input,6,n,35);
            uint32_t cycles=esp_cpu_get_cycle_count()-start;
            if(sum!=(uint32_t)gold*repeats){puts("DGERROR timed equivalence");return;}
            printf("DGROW {\"block\":%d,\"n\":%d,\"arm\":%d,\"cycles\":%" PRIu32 ",\"calls\":%d}\n",b,n,arm,cycles,repeats);
        }
        vTaskDelay(1);
    }
}
