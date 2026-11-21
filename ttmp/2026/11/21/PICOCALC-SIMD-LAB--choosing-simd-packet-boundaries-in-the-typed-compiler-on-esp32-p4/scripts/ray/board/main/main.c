#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "trial.h"

void simd_packet_classes(void);
void simd_c_frame_bench(void);
void simd_ceiling_bench(void);
void physics_bench_run(void);
void simd_director_bench(void);
void simd_director_qjs_bench(void);
void simd_proof_bench(void);
void simd_frame_bench(void);
void simd_gate_bench(void);

void app_main(void) {
    vTaskDelay(pdMS_TO_TICKS(1300));
    printf("SIMDLAB BEGIN cpu_mhz=%d\n", CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ);
#if SIMD_C_FRAME
    simd_c_frame_bench();
#elif SIMD_CLASS_TRIAL
    simd_packet_classes();
#elif SIMD_FRAME_TRIAL
    simd_proof_bench();
    simd_frame_bench();
    simd_gate_bench();
#else
    simd_ceiling_bench();
    physics_bench_run();
    simd_director_bench();
    simd_director_qjs_bench();
#endif
    puts("SIMDLAB END");
    fflush(stdout);
}
