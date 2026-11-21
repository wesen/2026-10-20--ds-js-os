#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "esp_private/esp_clk.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

enum { CAPACITY = 16384, RUNS = 3 };
typedef struct { uint32_t capacity; uint16_t cells[CAPACITY]; } board_buffer;
typedef struct { int position, depth, budget; int32_t expected[5]; } bench_case;
#include "bench-data.h"

typedef int (*begin_fn)(board_buffer *, int32_t *, int, int, int);
typedef int (*slice_fn)(board_buffer *, int32_t *, int);
#define ARM(name) \
  extern int name##_chessStartSearch(board_buffer *, int32_t *, int, int, int); \
  extern int name##_chessSearchSlice(board_buffer *, int32_t *, int)
ARM(stock);
ARM(leaf);
ARM(inline);
static const struct { begin_fn begin; slice_fn slice; } arms[] = {
    {stock_chessStartSearch, stock_chessSearchSlice},
    {leaf_chessStartSearch, leaf_chessSearchSlice},
    {inline_chessStartSearch, inline_chessSearchSlice},
};
static const int fixtures[] = {0, 4, 6, 14, 15};
static board_buffer board;
static int32_t state[64];

void app_main(void)
{
    vTaskDelay(pdMS_TO_TICKS(4000));
    printf("LEAF-BEGIN cases=5 repeats=3 hz=%d\n", esp_clk_cpu_freq());
    int success = 1;
    for (int rep = 0; rep < RUNS; ++rep) {
        for (unsigned j = 0; j < sizeof(fixtures) / sizeof(fixtures[0]); ++j) {
            const unsigned index = fixtures[j];
            const bench_case *row = &cases[index];
            for (int q = 0; q < 3; ++q) {
                const int arm = (q + rep + j) % 3;
                memset(&board, 0, sizeof(board));
                board.capacity = CAPACITY;
                memcpy(board.cells, positions[row->position], sizeof(positions[0]));
                memset(state, 0, sizeof(state));
                int slices = 0;
                const int64_t start = esp_timer_get_time();
                arms[arm].begin(&board, state, row->depth, row->budget, 1);
                while (state[FIELD_running]) {
                    arms[arm].slice(&board, state, SLICE_STEPS);
                    ++slices;
                }
                const int64_t wall = esp_timer_get_time() - start;
                const int32_t result[] = {state[FIELD_bestMove], state[FIELD_score], state[FIELD_completed],
                                          state[FIELD_nodes], slices};
                const int ok = !memcmp(result, row->expected, sizeof(result)) &&
                    !memcmp(board.cells, positions[row->position], sizeof(positions[0]));
                success &= ok;
                printf("LEAF-ROW %u %d %d %" PRId32 " %" PRId32 " %" PRId32 " %" PRId32
                       " %d %" PRId64 " %d\n",
                       index, arm, rep, result[0], result[1], result[2], result[3], slices, wall, ok);
                vTaskDelay(1);
            }
        }
    }
    printf("LEAF-DONE %s\n", success ? "ok" : "fail");
    fflush(stdout);
}
