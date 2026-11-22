/* Promoted from PICOCALC-TYPED-CHESS scripts/04-engine-rv32-runner.c (PICOCALC-REPO-LAYOUT Phase A); run from the repository root. */
#include <stdint.h>

enum { BOARD = 135, LIMIT = 16384, MOVES = 512, LIST = 1024, UNDO = 384 };
typedef struct { uint16_t words[BOARD], depth; } Position;
typedef struct { uint32_t length; uint16_t units[LIMIT]; } Buffer;
extern const Position cases_start[], cases_end[];
extern int32_t chessLegalMoves(Buffer *, int32_t, int32_t);
extern int32_t chessInCheck(Buffer *, int32_t);
extern int32_t chessPerft(Buffer *, int32_t);
extern int32_t chessStartSearch(Buffer *, int32_t *, int32_t, int32_t, int32_t);
extern int32_t chessSearchSlice(Buffer *, int32_t *, int32_t);
static Buffer board = {LIMIT};
static int32_t state[80];
static int32_t row[2 + MOVES + 3 + 4 * 5];

static void print(const void *data, unsigned size)
{
    register int a0 asm("a0") = 1;
    register const void *a1 asm("a1") = data;
    register unsigned a2 asm("a2") = size;
    register int a7 asm("a7") = 2;
    asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
}

static void exit_now(int status)
{
    register int a0 asm("a0") = status;
    register int a7 asm("a7") = 1;
    asm volatile("ecall" : : "r"(a0), "r"(a7) : "memory");
    __builtin_unreachable();
}

static void restored(const Position *position)
{
    for (unsigned i = 0; i < BOARD; ++i)
        if (board.units[i] != position->words[i]) exit_now(4);
}

void _start(void)
{
    static const int32_t config[][4] = {CONFIGURATIONS};
    for (const Position *position = cases_start; position < cases_end; ++position) {
        for (unsigned i = 0; i < BOARD; ++i) board.units[i] = position->words[i];
        const int count = chessLegalMoves(&board, LIST, UNDO);
        if (count < 0 || count > MOVES) exit_now(2);
        restored(position);
        unsigned at = 0;
        row[at++] = count;
        row[at++] = chessInCheck(&board, position->words[128]);
        for (int i = 0; i < MOVES; ++i) row[at++] = i < count ? board.units[LIST + i] : 0;
        for (int i = 1; i <= 3; ++i) {
            row[at++] = i <= position->depth ? chessPerft(&board, i) : -1;
            restored(position);
        }
        for (unsigned i = 0; i < sizeof config / sizeof *config; ++i) {
            chessStartSearch(&board, state, config[i][0], config[i][1], config[i][2]);
            unsigned steps = 0;
            while (state[F_running]) {
                chessSearchSlice(&board, state, config[i][3]);
                if (++steps >= 10000) exit_now(3);
            }
            restored(position);
            row[at++] = state[F_bestMove];
            row[at++] = state[F_nodes];
            row[at++] = state[F_score];
            row[at++] = state[F_completed];
            row[at++] = steps;
        }
        print(row, sizeof row);
    }
    exit_now(0);
}
