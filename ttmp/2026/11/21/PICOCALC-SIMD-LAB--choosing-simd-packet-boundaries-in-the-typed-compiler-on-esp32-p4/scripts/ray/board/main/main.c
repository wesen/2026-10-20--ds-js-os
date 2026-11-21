#include <inttypes.h>
#include <stdio.h>
#include "esp_clk_tree.h"
#include "esp_cpu.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void simd_ray_bench(void);
void physics_bench_run(void);
void simd_director_bench(void);

void app_main(void) {
    // Leave a window for the host UART reader after esptool resets the board.
    vTaskDelay(pdMS_TO_TICKS(1300));
    printf("SIMDLAB BEGIN cpu_mhz=%d\n", CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ);
    simd_ray_bench();
    physics_bench_run();
    simd_director_bench();
    puts("SIMDLAB END");
    fflush(stdout);
}
