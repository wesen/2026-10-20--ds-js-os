#include <assert.h>
#define BX_NOW() 0
#include "binary_native.inc"
#include "binary_producer.inc"
#include "descriptor.h"
int main(void) {
    uint8_t wire[576];int verified=0;
    for(size_t i=0;i<sizeof(stage_cases)/sizeof(*stage_cases);i++) {
        memset(wire,0xa5,sizeof wire);
        unsigned n=stage_cases[i].length;
        assert(stage_plan(&stage_cases[i].input,wire,n-1)==-2);
        for(size_t j=0;j<sizeof wire;j++) assert(wire[j]==0xa5);
        assert(stage_plan(&stage_cases[i].input,wire,sizeof wire)==n);
        assert(!memcmp(wire,stage_cases[i].wire,n) && wire[n]==0xa5);
        cJSON *source=cJSON_Parse(stage_cases[i].json);
        size_t len=0,scratch=0;uint8_t *generic=bp_encode(source,&len,&scratch);
        assert(generic && len==n && !memcmp(generic,wire,n));
        free(generic);cJSON_Delete(source);verified++;
    }
    int32_t bounds[]={-2147483647,-524289,-524288,524287,524288,2147483647};
    for(size_t i=0;i<sizeof bounds/sizeof(*bounds);i++) {
        struct stage_input input=stage_cases[0].input;
        uint32_t num=(uint32_t)bounds[i];
        input.words[88]=(uint16_t)num; input.words[89]=(uint16_t)(num>>16);
        cJSON *source=cJSON_Parse(stage_cases[0].json);
        cJSON *fields=cJSON_GetObjectItem(cJSON_GetObjectItem(cJSON_GetObjectItem(source,"frame"),"tree"),"f");
        cJSON_SetNumberValue(cJSON_GetArrayItem(fields,8),bounds[i]);
        size_t n=0,s=0;uint8_t *generic=bp_encode(source,&n,&s);
        assert(generic && stage_plan(&input,wire,sizeof wire)==n && !memcmp(generic,wire,n));
        cJSON_Delete(source);free(generic);
    }
    printf("{\"canonicalTrace\":%d,\"shortUnmodified\":%d,\"wideBoundaryCases\":6}\n",verified,verified);
}
