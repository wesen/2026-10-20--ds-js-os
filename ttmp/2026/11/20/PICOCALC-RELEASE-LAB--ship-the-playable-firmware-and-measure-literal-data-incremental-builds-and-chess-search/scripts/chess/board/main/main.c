#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "esp_timer.h"
#include "esp_memory_utils.h"
#include "esp_private/esp_clk.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

enum { BOARD_CAPACITY = 16384, RUNS = 3, RETURN_FIELDS = 5 };

typedef struct {
    uint32_t capacity;
    uint16_t cells[BOARD_CAPACITY];
} board_buffer;

typedef struct {
    int position, depth, budget;
    int32_t expected[RETURN_FIELDS];
} bench_case;

#include "bench-data.h"

extern int chessStartSearch(board_buffer *, int32_t *, int, int, int);
extern int chessSearchSlice(board_buffer *, int32_t *, int);

static board_buffer board;
static int32_t state[64];

void app_main(void)
{
    const int count = sizeof(cases) / sizeof(cases[0]);
    vTaskDelay(pdMS_TO_TICKS(4000));
    printf("CHESS-BENCH v1 cases=%d repeats=%d hz=%d slice=%d core=%d internal=%d\n",
           count, RUNS, esp_clk_cpu_freq(), SLICE_STEPS, xPortGetCoreID(), esp_ptr_internal(&board));
    bool passed = true;
    for (int rep = 0; rep < RUNS; ++rep) {
        for (int j = 0; j < count; ++j) {
            const int index = (j + rep * 5) % count;
            const bench_case *row = &cases[index];
            const uint16_t *root = positions[row->position];
            memset(&board, 0, sizeof(board));
            board.capacity = BOARD_CAPACITY;
            memcpy(board.cells, root, sizeof(positions[0]));
            memset(state, 0, sizeof(state));
            int slices = 0;
            int64_t max_slice = 0;
            const int64_t begin = esp_timer_get_time();
            chessStartSearch(&board, state, row->depth, row->budget, 1);
            while (state[FIELD_running]) {
                const int64_t start_slice = esp_timer_get_time();
                chessSearchSlice(&board, state, SLICE_STEPS);
                const int64_t elapsed = esp_timer_get_time() - start_slice;
                if (elapsed > max_slice) max_slice = elapsed;
                ++slices;
            }
            const int64_t wall = esp_timer_get_time() - begin;
            int32_t actual[] = {state[FIELD_bestMove], state[FIELD_score],
                                state[FIELD_completed], state[FIELD_nodes], slices};
            const bool ok = !memcmp(actual, row->expected, sizeof(actual)) &&
                            !memcmp(board.cells, root, sizeof(positions[0]));
            passed &= ok;
            printf("CHESS-ROW %d %d %" PRId32 " %" PRId32 " %" PRId32 " %" PRId32
                   " %d %" PRId64 " %" PRId64 " %d\n",
                   index, rep, actual[0], actual[1], actual[2], actual[3],
                   slices, wall, max_slice, ok);
            // Give the RTOS idle task a turn between cases outside the clock.
            vTaskDelay(1);
        }
    }
    printf("CHESS-DONE %s\n", passed ? "ok" : "fail");
    fflush(stdout);
}
