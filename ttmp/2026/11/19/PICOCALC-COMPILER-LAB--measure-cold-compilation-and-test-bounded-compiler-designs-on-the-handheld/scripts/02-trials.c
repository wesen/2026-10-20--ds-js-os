#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "esp_cpu.h"
#include "esp_private/esp_clk.h"
#include "mbedtls/sha256.h"
#include "p4.h"
#include "lab_files_abi.h"
#include "lab_guest.h"

char *lab_editor_compile(size_t *length);
char *lab_agenda_compile(size_t *length);
const char *lab_front = "exp/base/wasm.js", *lab_back = "exp/base/rv32.js";

static bool compile_one(unsigned block, unsigned position, unsigned lane, const char *app,
                        char *(*compile_app)(size_t *)) {
    printf("LABRUN %u %u %s %s\n", block, position, names[lane], app);
    size_t size = 0;
    char *module = compile_app(&size);
    unsigned char hash[32];
    if (!module || mbedtls_sha256((const unsigned char *)module, size, hash, 0)) {
        free(module);
        return false;
    }
    free(module);
    printf("LABHASH %s %s ", names[lane], app);
    for (unsigned i = 0; i < sizeof(hash); ++i) printf("%02x",hash[i]);
    puts("");
    return true;
}

static inline uint32_t tick(void) {
    __asm__ volatile("" ::: "memory");
    uint32_t result = esp_cpu_get_cycle_count();
    __asm__ volatile("" ::: "memory");
    return result;
}

enum { BATCH=128, BLOCKS=16 };
static bool guest(void) {
    files_string left = {.length = 91}, right = {.length = 91};
    for (unsigned i=0; i<91; ++i) left.units[i] = right.units[i] = 'a' + i%21;
    right.units[90] += 7;
    uint32_t durations[2][BLOCKS][LANES];
    uint32_t expected_files=0, expected_dates=0;
    for (unsigned i=0; i<BATCH; ++i) {
        expected_files = expected_files*31u + (uint32_t)(-7);
        expected_dates = expected_dates*31u + (uint32_t)expected_days[i%8];
    }
    for (unsigned op=0; op<2; ++op) {
        for (unsigned b=0; b<BLOCKS+2; ++b) {
            for (unsigned p=0; p<LANES; ++p) {
                unsigned lane=(b + (b/LANES%2 ? LANES-p : p))%LANES;
                uint32_t result=0;
                uint32_t start=tick();
                if (op==0) {
                    for (unsigned i=0; i<BATCH; ++i)
                        result=result*31u+(uint32_t)comparisons[lane](&left,false,&right,false);
                } else {
                    for (unsigned i=0; i<BATCH; ++i)
                        result=result*31u+(uint32_t)weekdays[lane](dates[i%8]);
                }
                __asm__ volatile("" : "+r"(result) :: "memory");
                uint32_t elapsed=tick()-start;
                if (result!=(op==0 ? expected_files : expected_dates) || !elapsed) return false;
                if (b>=2) durations[op][b-2][lane]=elapsed;
            }
        }
    }
    for (unsigned op=0; op<2; ++op)
        for (unsigned b=0; b<BLOCKS; ++b)
            for (unsigned l=0; l<LANES; ++l)
                printf("LABGUEST %s %u %s %u %" PRIu32 " %d\n",
                       op?"weekday":"compare",b,names[l],BATCH,durations[op][b][l],esp_clk_cpu_freq());
    return true;
}

char *p4_editor_compile(size_t *length) {
    static bool ran;
    if (!ran) {
        ran = true;
        for (unsigned b=0; b<2*LANES; ++b) {
            for (unsigned p=0; p<LANES; ++p) {
                unsigned lane = (b + (b/LANES ? LANES-p : p))%LANES;
                lab_front=fronts[lane]; lab_back=backs[lane];
                if (!compile_one(b,p,lane,"files",p4_files_compile) ||
                    !compile_one(b,p,lane,"agenda",lab_agenda_compile) ||
                    !compile_one(b,p,lane,"editor",lab_editor_compile)) {
                    puts("LABFAIL cold"); return NULL;
                }
            }
        }
        lab_front=fronts[0]; lab_back=backs[0];
        if (!guest()) { puts("LABFAIL guest"); return NULL; }
        puts("LABDONE");
    }
    return lab_editor_compile(length);
}
