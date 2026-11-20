#include "mobile_painter.h"

typedef struct {
    uint32_t capacity;
    uint16_t cells[MOBILE_PAINTER_STATE_CELLS];
} state_buffer;

typedef struct {
    uint32_t capacity;
    uint16_t words[MOBILE_PAINTER_MAX_WORDS];
} draw_buffer;

typedef struct {
    state_buffer input;
    uint32_t count;
    uint16_t expected[MOBILE_PAINTER_MAX_WORDS];
} fixture;

extern const fixture fixtures_start[], fixtures_end[];
extern int paintChess(const state_buffer *state, draw_buffer *draw);
static draw_buffer draw = {.capacity = MOBILE_PAINTER_MAX_WORDS};

static void quit(int status) {
    register int a0 asm("a0") = status;
    register int a7 asm("a7") = 1;
    asm volatile("ecall" : : "r"(a0), "r"(a7) : "memory");
    __builtin_unreachable();
}

void _start(void) {
    for (const fixture *f = fixtures_start; f < fixtures_end; ++f) {
        for (int i = 0; i < MOBILE_PAINTER_MAX_WORDS; ++i) draw.words[i] = 0xaaaa;
        int count = paintChess(&f->input, &draw);
        if (count <= 0 || count != (int)f->count) quit(1);
        if (draw.capacity != MOBILE_PAINTER_MAX_WORDS) quit(2);
        for (int i = 0; i < count; ++i)
            if (draw.words[i] != f->expected[i]) quit(3);
        for (int i = count; i < MOBILE_PAINTER_MAX_WORDS; ++i)
            if (draw.words[i] != 0xaaaa) quit(4);
    }
    quit(0);
}
