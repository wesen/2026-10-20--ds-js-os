// Count requested malloc payload, separate from clocks. Excludes libc rounding and private instrumentation header.
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cJSON.h"
typedef union {size_t bytes;max_align_t alignment;} meter_header;
static size_t live_bytes,peak_bytes,amount_calls;
static void *bx_alloc(size_t n){
    meter_header *h=malloc(sizeof(*h)+n);if(!h)return NULL;h->bytes=n;
    live_bytes+=n;amount_calls++;if(live_bytes>peak_bytes)peak_bytes=live_bytes;return h+1;
}
static void bx_free(void *p){
    if(p){meter_header *h=(meter_header*)p-1;live_bytes-=h->bytes;free(h);}
}
#define BX_NOW() 0ULL
#define malloc bx_alloc
#define free bx_free
#include "02-native.inc"
#undef malloc
#undef free
static void generation(const bx_spec *f,int bin) {
    bx_data bs[2];cJSON *js[2]={NULL,NULL};uint8_t *owns[2]={NULL,NULL};
    size_t first=0,firstPeak=0,firstCalls=0;
    live_bytes=0;peak_bytes=0;amount_calls=0;
    for(int i=0;i<2;i++){
        if(bin){
            owns[i]=bx_alloc(f->nb);if(!owns[i])exit(2);memcpy(owns[i],f->bin,f->nb);
            if(!bx_open(&bs[i],owns[i],f->nb)||!bx_shape(&bs[i],f->app))exit(3);
        }else{
            const char *end=NULL;if(!bx_json_preflight(f->json,f->nj))exit(4);
            js[i]=cJSON_ParseWithLengthOpts((const char*)f->json,f->nj+1,&end,1);
            int n=0,s=0;if(!js[i]||!bx_jverify(js[i],0,&n,&s)||!bx_json_shape(js[i],f->app))exit(5);
        }
        if(i==0){first=live_bytes;firstPeak=peak_bytes;firstCalls=amount_calls;}
    }
    printf("%s,%s,%zu,%zu,%zu,%zu,%zu\n",f->app,bin?"B":"G",first,firstPeak,firstCalls,live_bytes,peak_bytes);
    for(int i=0;i<2;i++)if(bin)bx_free(owns[i]);else cJSON_Delete(js[i]);
    if(live_bytes)exit(6);
}
int main(void) {
    cJSON_Hooks hooks={bx_alloc,bx_free};cJSON_InitHooks(&hooks);
    puts("app,arm,retainedBytes,firstPeakBytes,allocationCalls,twoRetainedBytes,twoPeakBytes");
    for(size_t i=0;i<sizeof(bx_fixtures)/sizeof(bx_fixtures[0]);i++)for(int b=0;b<2;b++)generation(bx_fixtures+i,b);
    return 0;
}
