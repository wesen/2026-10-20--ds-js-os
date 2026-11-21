#include "p4.h"
#include "esp_cpu.h"
#include "esp_private/esp_clk.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { SAMPLES = 11, CALLS = 256, COMPILES = 5 };
typedef struct { uint32_t capacity; uint16_t data[8]; } text;
typedef int (*read_fn)(const text *, int);
typedef int (*copy_fn)(text *, int, int);
typedef int (*write_fn)(text *, const text *, int, int);
typedef struct { read_fn read; copy_fn copy; write_fn write; } program;
#define ARM(p) extern int p##_repeated(const text *, int); \
               extern int p##_literal(text *, int,int); \
               extern int p##_write(text *, const text *, int,int)
ARM(stock);
ARM(bounds_order);
ARM(bounds_selected);
ARM(semantics_late);
ARM(semantics_selected);
#define PROGRAM(p) {p##_repeated, p##_literal, p##_write}
static const program arms[] = {PROGRAM(stock),PROGRAM(bounds_order),PROGRAM(bounds_selected),
    PROGRAM(semantics_late),PROGRAM(semantics_selected)};
static const char *const native_names[] = {"stock","bounds-order","bounds-selected","semantics-late","semantics-selected"};
static const text input = {.capacity=8,.data={1,0xabcd,0xd83d,0xde00,34,513,81,5}};
static const text copy_expected = {.capacity=8,.data={97,98,0x263a,0x20ac,0xd83d,0xdc08,99,100}};

static bool native_trials(void) {
    static const char *const endpoints[] = {"repeated","literal","write"};
    uint32_t cycles[3][5][SAMPLES];
    bool pass=true;
    for(unsigned sample=0;sample<SAMPLES;sample++) {
        for(unsigned offset=0;offset<5;offset++) {
            unsigned arm=(sample+offset)%5;
            for(unsigned endpoint=0;endpoint<3;endpoint++) {
                text out=input;
                const program *p=&arms[arm];
                int expected=0, sum=0;
                for(unsigned i=0;i<CALLS;i++) expected += 3*input.data[i%8];
                (void)p->read(&input,0);
                (void)p->copy(&out,0,1);
                (void)p->write(&out,&input,1,1);
                out=input;
                uint32_t start=esp_cpu_get_cycle_count();
                if(endpoint==0) for(unsigned i=0;i<CALLS;i++) sum+=p->read(&input,i%8);
                if(endpoint==1) for(unsigned i=0;i<CALLS;i++) sum+=p->copy(&out,0,1);
                if(endpoint==2) for(unsigned i=0;i<CALLS;i++) sum+=p->write(&out,&input,1,2);
                cycles[endpoint][arm][sample]=esp_cpu_get_cycle_count()-start;
                text write_expected=input;
                write_expected.data[0]=513;
                write_expected.data[1]=input.data[2];
                if(endpoint==0) pass &= sum==expected && !memcmp(&out,&input,sizeof(out));
                if(endpoint==1) pass &= sum==8*CALLS && !memcmp(&out,&copy_expected,sizeof(out));
                if(endpoint==2) pass &= sum==7*CALLS && !memcmp(&out,&write_expected,sizeof(out));
            }
            vTaskDelay(1);
        }
    }
    for(unsigned endpoint=0;endpoint<3;endpoint++) {
        for(unsigned arm=0;arm<5;arm++) {
            printf("WAVE_NATIVE %s %s",endpoints[endpoint],native_names[arm]);
            for(unsigned i=0;i<SAMPLES;i++) printf(" %" PRIu32, cycles[endpoint][arm][i]);
            puts("");
        }
    }
    return pass;
}

static bool compile_trials(const char *world) {
    char path[64], label[64];
    size_t source_len=0, reactor_len=0;
    snprintf(path,sizeof(path),"%s/%s.typed",world,world);
    char *source=p4_bundle_read(path,&source_len,NULL,0);
    snprintf(path,sizeof(path),"%s/reactor.bin",world);
    char *reactor=p4_bundle_read(path,&reactor_len,NULL,0);
    static const char *const entries[] = {"compileTypedWorldRv32","wave_bounds_always","wave_bounds_order",
        "wave_bounds_selected","wave_semantics_late","wave_semantics_selected"};
    static const char *const names[] = {"stock","bounds-always","bounds-order","bounds-selected",
        "semantics-late","semantics-selected"};
    static const p4_compile_limits limits={.heap_bytes=4*1024*1024,.duration_us=9000000};
    bool pass=source && reactor;
    if (pass) {
        for(unsigned sample=0;sample<COMPILES;sample++) {
            for(unsigned offset=0;offset<6;offset++) {
                unsigned arm=(sample+offset)%6;
                snprintf(label,sizeof(label),"wave-%s-%s",world,names[arm]);
                size_t bytes=0;
                char *linked=p4_typed_compile(label,"bundle",source,source_len,"typed/world.js",
                    entries[arm],ENG_NATIVE,reactor,reactor_len,&bytes,port_clock(),&limits);
                pass &= linked && bytes==reactor_len;
                free(linked);
                vTaskDelay(1);
            }
        }
    }
    free(source);
    free(reactor);
    return pass;
}
static void wave_task(void *unused) {
    (void)unused;
    printf("WAVE_BEGIN core=%d cpu_hz=%d native_samples=%u calls=%u compile_samples=%u\n",
        xPortGetCoreID(),esp_clk_cpu_freq(),(unsigned)SAMPLES,(unsigned)CALLS,(unsigned)COMPILES);
    bool native=native_trials();
    bool chess=compile_trials("chess");
    bool editor=compile_trials("editor");
    printf("WAVE_DONE %s\n",native && chess && editor ? "ok":"FAIL");
    fflush(stdout);
    vTaskDeleteWithCaps(NULL);
}
void wave12_bench(void) {
    static bool started;
    if(!started)
        started=xTaskCreatePinnedToCoreWithCaps(wave_task,"wave12",80*1024,NULL,2,NULL,1,
                      MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT)==pdPASS;
    if(!started) puts("WAVE_DONE task-allocation-failed");
}
