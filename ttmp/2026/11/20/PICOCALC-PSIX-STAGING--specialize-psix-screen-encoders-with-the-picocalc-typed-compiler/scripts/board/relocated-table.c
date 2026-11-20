// Same layout interpreter as the linked-in control, compiled to a separate GCC ELF
// so the stock loader places this code and its constant data in program PSRAM.
#include <stdint.h>
static void bp_u16(uint8_t *p,unsigned x){p[0]=x;p[1]=x>>8;}
static void bp_ref(uint8_t *p,unsigned tag,unsigned x){p[0]=x;p[1]=x>>8;p[2]=(tag<<4)|((x>>16)&15);}
#include "descriptor.h"
typedef int (*plan_fn)(const struct stage_input *,uint8_t *,size_t);
__attribute__((visibility("default"))) int app_main(int argc,char **argv) {
    if(argc!=1 || !argv || !argv[0])return -1;
    *(plan_fn *)argv[0]=stage_plan;return 0;
}
