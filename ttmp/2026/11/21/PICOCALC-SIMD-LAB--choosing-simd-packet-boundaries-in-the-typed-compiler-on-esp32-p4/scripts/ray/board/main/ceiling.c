// Matched scalar and PIE controls for the canonical guarded full ray row.
#include <stdint.h>
#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#include "esp_cpu.h"
#include "esp_rom_crc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "ceiling_fixtures.h"

typedef struct { uint32_t capacity; uint16_t data[2048]; } Buffer;
extern int simd_typed_empty(void*, int);
extern int simd_typed_full(void*, int);
extern int row(void*, int); // independent checked C reference
extern int p4_typed_stock_row(void*, int);
extern int p4_typed_scalar_row(void*, int);
extern int p4_typed_pie_row(void*, int);
extern uint32_t ceiling_min(const uint16_t*);
extern uint64_t ceiling_minmax(const uint16_t*); // RV32 ABI: lo=min a0, hi=max a1
static _Alignas(16) Buffer work;

static inline int admissible(Buffer *w, int y) {
    // This preflight establishes that metadata, lookup inputs, table and both
    // outputs are in bounds, disjoint, and no arithmetic overflows occur.
    if ((unsigned)y>=160 || w->capacity<1865) return 0;
    int n=w->data[16];
    if(n>3) return 0;
    for(int i=0;i<n;i++) {
        const uint16_t *obj=w->data+1+5*i;
        if(obj[1]>159 || obj[3]>32) return 0;
    }
    return 1;
}

static inline void consume(Buffer *w, unsigned x, int d, int z, int id) {
    int depth = z - w->data[520+d];
    uint16_t *old = w->data + 1545 + x;
    if (!*old || depth < *old) {
        *old=(uint16_t)depth; w->data[1705+x]=(uint16_t)id;
    }
}
static inline __attribute__((always_inline)) int schedule(Buffer *w, int y, unsigned arm) {
    if (!admissible(w,y)) return row(w,y);
    memset(w->data+1545,0,320*sizeof(uint16_t));
    for(int sphere=0;sphere<w->data[16];sphere++) {
        const uint16_t *obj=w->data+1+sphere*5;
        int dy=y-obj[1], radius=obj[3], z=obj[2], term=radius*radius-dy*dy;
        if(term<0) continue;
        const uint16_t *sq=w->data+40+160*sphere;
        unsigned x=0;
        for(;x<160 && ((uintptr_t)(sq+x)&15);x++) {
            int d=term-sq[x]; if(d>=0) consume(w,x,d,z,sphere+1);
        }
        for(;x+8<=160;x+=8) {
            unsigned min=0,max=UINT32_MAX;
            if(arm==1) min=ceiling_min(sq+x);
            if(arm==2) {
                uint64_t mm=ceiling_minmax(sq+x); min=(uint32_t)mm;max=mm>>32;
            }
            if(min>(unsigned)term) continue;
            const unsigned all = max<=(unsigned)term;
            for(unsigned i=0;i<8;i++){
                int d=term-sq[x+i];
                if(all || d>=0) consume(w,x+i,d,z,sphere+1);
            }
        }
        for(;x<160;x++) { int d=term-sq[x]; if(d>=0) consume(w,x,d,z,sphere+1); }
    }
    return 1;
}
static int scalar(void *p,int y){return schedule(p,y,0);}
static int min_only(void *p,int y){return schedule(p,y,1);}
static int min_max(void *p,int y){return schedule(p,y,2);}

typedef int (*Row)(void*,int);
void simd_ceiling_bench(void) {
    const uint8_t *inputs[]={opening_raw,dense_raw,sparse_raw};
    const uint32_t *answers[]={opening_crc,dense_crc,sparse_crc};
    const char *scenes[]={"opening","dense","sparse"};
    const char *names[]={"typed-stock","typed-scalar","typed-pie","checked-c","reg-scalar","input-min","input-minmax","typed-empty","typed-full"};
    const Row call[]={p4_typed_stock_row,p4_typed_scalar_row,p4_typed_pie_row,row,scalar,min_only,min_max,simd_typed_empty,simd_typed_full};
    const int arms=(int)(sizeof(call)/sizeof(call[0]));
    for(int b=0;b<arms;b++)for(int s=0;s<3;s++)for(int a=0;a<arms;a++){
        unsigned arm=(b+a+s)%arms;uint32_t cycles=0;unsigned ok=1;
        for(int y=0;y<160;y++){
            memcpy(&work,inputs[s],sizeof(work));
            uint32_t start=esp_cpu_get_cycle_count();
            int result=call[arm](&work,y);
            cycles+=esp_cpu_get_cycle_count()-start;
            if(result!=1 || esp_rom_crc32_le(0,(const uint8_t*)&work,sizeof(work))!=answers[s][y]) ok=0;
        }
        printf("CEILING %d %s %s %"PRIu32" %u\n",b,scenes[s],names[arm],cycles,ok);
        vTaskDelay(1);
    }
}
