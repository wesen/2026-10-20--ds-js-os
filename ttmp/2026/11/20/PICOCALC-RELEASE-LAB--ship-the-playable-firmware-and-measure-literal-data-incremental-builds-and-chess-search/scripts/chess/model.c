// CJI emulator syscalls for exact deterministic counts, without a device clock.
#include <stdint.h>

enum { BOARD_CAPACITY = 16384 };
typedef struct { uint32_t capacity; uint16_t cells[BOARD_CAPACITY]; } board_buffer;
typedef struct { int position, depth, budget; int32_t expected[5]; } bench_case;
#include "bench-data.h"

extern int chessStartSearch(board_buffer *, int32_t *, int, int, int);
extern int chessSearchSlice(board_buffer *, int32_t *, int);

static board_buffer board;
static int32_t state[64];

static uint64_t steps(void)
{
    register uint32_t a0 asm("a0");
    register uint32_t a1 asm("a1");
    register int a7 asm("a7") = 10;
    asm volatile("ecall" : "=r"(a0), "=r"(a1) : "r"(a7) : "memory");
    return ((uint64_t)a1 << 32) | a0;
}

static void write(const void *data, unsigned length)
{
    register int a0 asm("a0") = 1;
    register const void *a1 asm("a1") = data;
    register unsigned a2 asm("a2") = length;
    register int a7 asm("a7") = 2;
    asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
}

static void finish(int status)
{
    register int a0 asm("a0") = status;
    register int a7 asm("a7") = 1;
    asm volatile("ecall" : : "r"(a0), "r"(a7) : "memory");
    __builtin_unreachable();
}

void _start(void)
{
    board.capacity = BOARD_CAPACITY;
    for (unsigned i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i) {
        const bench_case *row = &cases[i];
        const uint16_t *root = positions[row->position];
        for (unsigned j = 0; j < BOARD_CAPACITY; j++)
            board.cells[j] = j < 135 ? root[j] : 0;
        for (unsigned j = 0; j < sizeof(state) / sizeof(state[0]); j++)
            state[j] = 0;
        int slices = 0;
        const uint64_t begin = steps();
        chessStartSearch(&board, state, row->depth, row->budget, 1);
        while (state[FIELD_running]) {
            chessSearchSlice(&board, state, SLICE_STEPS);
            ++slices;
        }
        const uint64_t count = steps() - begin;
        int32_t result[7] = {state[FIELD_bestMove], state[FIELD_score], state[FIELD_completed],
                            state[FIELD_nodes], slices, (int32_t)count, (int32_t)(count >> 32)};
        for (unsigned j = 0; j < 135; j++)
            if (board.cells[j] != root[j]) finish(2);
        for (unsigned j = 0; j < 5; j++)
            if (result[j] != row->expected[j]) finish(3);
        write(result, sizeof(result));
    }
    finish(0);
}
