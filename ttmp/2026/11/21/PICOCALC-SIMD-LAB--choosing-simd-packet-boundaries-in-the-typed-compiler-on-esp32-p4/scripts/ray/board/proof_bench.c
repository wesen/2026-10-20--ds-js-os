#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <inttypes.h>
#include "esp_cpu.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

typedef struct {uint32_t n;uint16_t a[144];} array;
typedef int (*proof_t)(array*,array*,int,int,int);
#define FAMILY(f) extern int proof_##f##_scalar(array*,array*,int,int,int); \
    extern int proof_##f##_guarded(array*,array*,int,int,int); \
    extern int proof_##f##_static(array*,array*,int,int,int)
FAMILY(inside); FAMILY(boundary); FAMILY(dynamic);
#define ARMS(f) {proof_##f##_scalar,proof_##f##_guarded,proof_##f##_static}
static _Alignas(16) array input,output,expected;
void simd_proof_bench(void){
    const proof_t arms[][3]={ARMS(inside),ARMS(boundary),ARMS(dynamic),ARMS(dynamic)};
    const int ceilings[]={32766,32767,32766,32767},lengths[]={8,32,127};
    const unsigned values[]={0,1,31,32766,32767,32768,65534,65535};
    input.n=output.n=expected.n=144;
    for(int i=0;i<144;i++) input.a[i]=values[i%8];
    for(int block=0;block<6;block++)for(int family=0;family<4;family++)for(int len=0;len<3;len++){
        int n=lengths[len],v=ceilings[family],want=0;
        memset(expected.a,0xa5,sizeof(expected.a));
        for(int i=0;i<n;i++){int d=v-input.a[6+i];if(d>=0){want+=d;expected.a[i+1]=(uint16_t)d;}}
        for(int pos=0;pos<3;pos++){
            int arm=(block+pos+family)%3;
            memset(output.a,0xa5,sizeof(output.a));
            proof_t f=arms[family][arm];
            const int calls=64;
            int ok=1; uint32_t begin=esp_cpu_get_cycle_count();
            for(int i=0;i<calls;i++) if(f(&input,&output,6,n,v)!=want)ok=0;
            uint32_t cycles=esp_cpu_get_cycle_count()-begin;
            if(memcmp(&expected,&output,sizeof(array)))ok=0;
            printf("PROOF %d %d %d %d %u %d %d\n",block,family,n,arm,(unsigned)cycles,calls,ok);
        }
        vTaskDelay(1);
    }
}
