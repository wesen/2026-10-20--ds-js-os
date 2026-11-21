#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_private/esp_clk.h"

typedef struct { uint32_t length; uint16_t units[128]; } text;
typedef struct { int32_t offset, scale, dropped; } calibration;
typedef struct {
    int (*read)(const text *, const calibration *, int, int);
    int (*count)(const text *, int, int);
    int (*label)(text *, int, int);
} program;
#include "cases.h"

static const calibration cal = {7, 3, 11};
static text destination = {.length=48};
enum {BLOCKS=11, REPEATS=48, ENDPOINTS=3};

static int replay(const program *p, int endpoint) {
    int sum=0;
    for (unsigned i=0; i<sizeof(input)/sizeof(input[0]); ++i) {
        const int n=input[i].length;
        if(endpoint==0) sum+=p->read(&input[i],&cal,0,n);
        else if(endpoint==1) sum+=p->count(&input[i],0,n);
        else sum+=p->label(&destination,1,i%3);
    }
    return sum;
}

static bool verify(const program *p) {
    for (unsigned i=0; i<sizeof(input)/sizeof(input[0]); ++i) {
        int n=input[i].length;
        if (p->read(&input[i],&cal,0,n)!=parsed[i] || p->count(&input[i],0,n)!=counts[i]) return false;
    }
    for (unsigned i=0;i<3;++i) {
        memset(destination.units,0xa5,sizeof(destination.units));
        int n=p->label(&destination,1,i);
        if (n!=(int)labels[i].length || destination.length!=48) return false;
        for (unsigned j=0;j<128;++j) {
            uint16_t expected=j>=1 && j<=n ? labels[i].units[j-1] : 0xa5a5;
            if(destination.units[j]!=expected) return false;
        }
    }
    return true;
}

void app_main(void) {
    vTaskDelay(pdMS_TO_TICKS(3500));
    printf("WAVE_BEGIN arms=%u blocks=%d repeats=%d hz=%d core=%d\n",
           (unsigned)ARMS,BLOCKS,REPEATS,esp_clk_cpu_freq(),xPortGetCoreID());
    for (int a=0;a<ARMS;++a) if (!verify(&programs[a])) {printf("WAVE_FAIL %d\n",a); return;}
    for (int b=0;b<BLOCKS;++b) {
        for (int e=0;e<ENDPOINTS;++e) {
            for (int j=0;j<ARMS;++j) {
                int a=(b%2 ? ARMS-1-j+b : j+b)%ARMS;
                int warm=replay(&programs[a],e);
                int64_t start=esp_timer_get_time();
                int sum=0;
                for(int k=0;k<REPEATS;++k) sum+=replay(&programs[a],e);
                int64_t us=esp_timer_get_time()-start;
                if(warm!=expected_sums[e] || sum!=REPEATS*expected_sums[e]) {puts("WAVE_FAIL conditioned replay");return;}
                printf("WAVE_ROW %d %d %d %lld %d\n",b,e,a,(long long)us,sum);
            }
            vTaskDelay(1);
        }
    }
    puts("WAVE_DONE ok"); fflush(stdout);
}
