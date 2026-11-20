#include "damage.h"
#include "esp_cpu.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <inttypes.h>
#include <stdio.h>
#include <string.h>

struct board_case {
    const char *name;
    const uint16_t *old;
    unsigned old_n;
    const uint16_t *next;
    unsigned next_n;
    uint32_t expected_body;
};
#include "board-cases.inc"

static uint32_t body_hash(const dmabuf_t *fb) {
    const uint8_t *p=(const uint8_t *)(fb->back+320*PAINTER_TOP);
    uint32_t h=UINT32_C(2166136261);
    for (unsigned i=0;i<320*PAINTER_HEIGHT*2;i++) h=(h^p[i])*UINT32_C(16777619);
    return h;
}

void damage_benchmark(void) {
    enum { BYTES=320*320*2, TRIALS=7 };
    dmabuf_t seed={.w=320,.h=320,.bytes=BYTES}, target=seed;
    unsigned caps=MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT;
    seed.back=heap_caps_aligned_alloc(64,BYTES,caps);
    target.back=heap_caps_aligned_alloc(64,BYTES,caps);
    uint16_t *old=heap_caps_malloc(MOBILE_PAINTER_MAX_WORDS*2,caps);
    uint16_t *next=heap_caps_malloc(MOBILE_PAINTER_MAX_WORDS*2,caps);
    bool pass=seed.back && target.back && old && next;
    printf("DAMAGE_BEGIN pairs=%u samples=%u core=%d\n",(unsigned)(sizeof(board_cases)/sizeof(*board_cases)),TRIALS,xPortGetCoreID());
    for(unsigned ci=0;pass && ci<sizeof(board_cases)/sizeof(*board_cases);ci++){
        const struct board_case *c=&board_cases[ci];
        memcpy(old,c->old,c->old_n*2);
        memcpy(next,c->next,c->next_n*2);
        char hints[MOBILE_PAINTER_MAX_TEXT+1];
        if(!painter_commands_valid(old,c->old_n,hints) || !painter_commands_valid(next,c->next_n,hints)){
            pass=false; break;
        }
        memset(seed.back,0xa9,BYTES);
        painter_commands_draw(&seed,old,c->old_n);
        damage_stats stats;
        uint32_t cycles[2][TRIALS];
        for(unsigned t=0;t<TRIALS;t++){
            for(unsigned k=0;k<2;k++){
                unsigned arm=(t+k)%2;
                memcpy(target.back,seed.back,BYTES);
                target.dirty=0;
                uint32_t begin=esp_cpu_get_cycle_count();
                if(arm) damage_draw(&target,old,c->old_n,next,c->next_n,false,&stats);
                else painter_commands_draw(&target,next,c->next_n);
                cycles[arm][t]=esp_cpu_get_cycle_count()-begin;
                if(body_hash(&target)!=c->expected_body ||
                   memcmp(target.back,seed.back,PAINTER_TOP*320*2) ||
                   memcmp(target.back+320*(PAINTER_TOP+PAINTER_HEIGHT),seed.back+320*(PAINTER_TOP+PAINTER_HEIGHT),
                          (320-PAINTER_TOP-PAINTER_HEIGHT)*320*2)) pass=false;
            }
            vTaskDelay(1);
        }
        printf("DAMAGE_CASE %s mode=%d box=%d,%d,%d,%d replay=%u fnv=%08" PRIx32 " %s\n",
               c->name,stats.mode,stats.body.x0,stats.body.y0,stats.body.x1,stats.body.y1,
               stats.replayed,c->expected_body,pass?"ok":"FAIL");
        for(unsigned arm=0;arm<2;arm++){
            printf("DAMAGE_CYCLES %s %s",c->name,arm?"damage":"full");
            for(unsigned t=0;t<TRIALS;t++) printf(" %" PRIu32,cycles[arm][t]);
            puts("");
        }
    }
    heap_caps_free(seed.back);heap_caps_free(target.back);
    heap_caps_free(old);heap_caps_free(next);
    printf("DAMAGE_DONE %s\n",pass?"ok":"FAIL");
}
