// Untimed host-only allocation census. Link both cJSON.c and the two endpoints
// through the same wrappers. The resident cJSON source is allocated before reset.
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
#define BX_NOW() UINT64_C(0)
#include "../native/02-native.inc"
#include "binary_producer.inc"

void *__real_malloc(size_t n);
void *__real_realloc(void *p,size_t n);
void __real_free(void *p);
typedef struct {void *p;size_t len;} entry;
static entry live[8192];
static size_t nlive,used,peak,calls,reallocs;
static int enabled;
static size_t locate(void *p){
    for(size_t i=0;i<nlive;i++)if(live[i].p==p)return i;
    return nlive;
}
static void track(void *p,size_t n){
    if(!p)return;
    assert(nlive<sizeof(live)/sizeof(*live));
    live[nlive++]=(entry){p,n};used+=n;if(used>peak)peak=used;
}
void *__wrap_malloc(size_t n){
    void *p=__real_malloc(n);if(enabled&&p){calls++;track(p,n);}return p;
}
void *__wrap_realloc(void *p,size_t n){
    size_t i=enabled?locate(p):0;
    void *q=__real_realloc(p,n);
    if(enabled && (q || n==0)){
        calls++;reallocs++;
        if(i<nlive){used-=live[i].len;live[i]=live[--nlive];}else assert(!p);
        track(q,n);
    }
    return q;
}
void __wrap_free(void *p){
    if(enabled&&p){size_t i=locate(p);assert(i<nlive);used-=live[i].len;live[i]=live[--nlive];}
    __real_free(p);
}
static void zero_counts(void){peak=used;calls=reallocs=0;}
int main(int argc,char **argv){
    int bin=0;if(argc!=2)return 1;const bx_spec *s=bx_select(argv[1],&bin);if(!s)return 1;
    enabled=1;
    cJSON *src=cJSON_ParseWithLength((const char*)s->json,s->nj+1);assert(src);
    size_t source=used;
    zero_counts();size_t bytes=0,scratch=0;
    uint8_t *wire=bin?bp_encode(src,&bytes,&scratch):(uint8_t*)cJSON_PrintUnformatted(src);
    assert(wire);if(!bin)bytes=strlen((char*)wire);
    size_t enc_peak=peak-source, enc_calls=calls,enc_realloc=reallocs;
    size_t wire_live=used-source;
    zero_counts();
    uint8_t *retained=NULL;cJSON *parsed=NULL;bx_data b={0};
    if(bin){
        retained=malloc(bytes);assert(retained);memcpy(retained,wire,bytes);
        assert(bx_open(&b,retained,bytes)&&bx_shape(&b,s->app));
        assert(bx_weight(&b,bx_path(&b,s->late))==s->hlate);
    }else{
        assert(bx_json_preflight(wire,bytes));
        parsed=cJSON_ParseWithLength((char*)wire,bytes+1);int n=0,u=0;
        assert(parsed&&bx_jverify(parsed,0,&n,&u)&&bx_json_shape(parsed,s->app));
        assert(bx_jweight(bx_jpath(parsed,s->late))==s->hlate);
    }
    size_t receive_peak=peak-(source+wire_live), receive_calls=calls;
    size_t route_peak=enc_peak>peak-source?enc_peak:peak-source;
    if(bin){free(retained);free(wire);}else{cJSON_Delete(parsed);cJSON_free(wire);}
    assert(used==source);cJSON_Delete(src);assert(used==0&&nlive==0);enabled=0;
    printf("{\"arm\":\"%s\",\"pointerBytes\":%zu,\"cJSONBytes\":%zu,\"residentSourceBytes\":%zu,\"wireBytes\":%zu,"
           "\"encoderOutputLiveBytes\":%zu,\"encodeRequestedPeakAboveSource\":%zu,\"encodeAllocAndReallocCalls\":%zu,"
           "\"encoderReallocCalls\":%zu,\"binaryDictionaryAndFieldScratch\":%zu,\"admitPeakAboveWire\":%zu,"
           "\"admitAllocAndReallocCalls\":%zu,\"routePeakAboveSource\":%zu}\n",
           argv[1],sizeof(void*),sizeof(cJSON),source,bytes,wire_live,enc_peak,enc_calls,enc_realloc,scratch,
           receive_peak,receive_calls,route_peak);
    return 0;
}
