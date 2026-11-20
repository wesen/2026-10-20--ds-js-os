// Host qualification for exact artifacts, scalar representation and canonical map order.
#include <stdint.h>
#include <stdlib.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define BX_NOW() UINT64_C(0)
#include "../native/02-native.inc"
#include "binary_producer.inc"
static cJSON *read_json(const char *text){cJSON *j=cJSON_Parse(text);assert(j);return j;}
static uint8_t *pack(const cJSON *j,size_t *n) {
    size_t scratch;uint8_t *wire=bp_encode(j,n,&scratch);
    bx_data view={0};assert(wire && bx_open(&view,wire,*n));
    assert(bx_weight(&view,bx24(view.p+10))==bx_jweight(j));
    return wire;
}
int main(void){
    for(size_t i=0;i<sizeof(bx_fixtures)/sizeof(bx_fixtures[0]);i++){
        const bx_spec *s=&bx_fixtures[i];
        cJSON *j=read_json((char*)s->json);
        char *g=cJSON_PrintUnformatted(j);
        size_t n;uint8_t *wire=pack(j,&n);
        assert(n==s->nb && !memcmp(s->bin,wire,n));
        assert(g && strlen(g)==s->nj && !memcmp(s->json,g,s->nj));
        printf("%s json=%zu psix=%zu exact=both\n",s->app,s->nj,s->nb);
        free(wire);cJSON_free(g);cJSON_Delete(j);
    }
    const char *scalars[]={"null","true","false","[]","{}","0","-0","-524288","524287","524288","-524289",
                            "0.125","\"\\u00e9\"","\"\\ud83e\\udd81\"","{\"a\":[false,0.25],\"🦁\":null}"};
    for(size_t i=0;i<sizeof(scalars)/sizeof(scalars[0]);i++){
        cJSON *j=read_json(scalars[i]);size_t n;free(pack(j,&n));cJSON_Delete(j);
    }
    cJSON *a=read_json("{\"z\":{\"k\":2,\"a\":1},\"a\":[true,null]}"),
          *b=read_json("{\"a\":[true,null],\"z\":{\"a\":1,\"k\":2}}");
    size_t na,nb;uint8_t *wa=pack(a,&na),*wb=pack(b,&nb);assert(na==nb && !memcmp(wa,wb,na));
    free(wa);free(wb);cJSON_Delete(a);cJSON_Delete(b);
    cJSON *dup=read_json("{\"k\":1,\"k\":2}");
    size_t n,scratch;assert(!bp_encode(dup,&n,&scratch));cJSON_Delete(dup);
    puts("15 scalar/container cases, canonical object order, duplicate-key refusal passed");
    return 0;
}
