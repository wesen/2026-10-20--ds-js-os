#include "lab_editor_guest.h"

static bool editor_guest(void) {
    enum { UNITS = 96 };
    struct { uint32_t length; uint16_t units[UNITS]; } text, query, mismatch;
    text.length = query.length = mismatch.length = UNITS;
    for (unsigned i = 0; i < UNITS; ++i) {
        text.units[i] = 'A' + i % 23;
        query.units[i] = mismatch.units[i] = 'a' + i % 23;
    }
    mismatch.units[UNITS - 1] = 'x';
    uint32_t expected = 0;
    for (unsigned i = 0; i < BATCH; ++i) expected = expected * 31u + (i % 2 == 0);
    uint32_t durations[BLOCKS][LANES];
    for (unsigned block = 0; block < BLOCKS + 2; ++block) {
        for (unsigned p = 0; p < LANES; ++p) {
            unsigned lane = (block + (block / LANES % 2 ? LANES - p : p)) % LANES;
            uint32_t result = 0;
            uint32_t start = tick();
            for (unsigned i = 0; i < BATCH; ++i) {
                const void *target = i % 2 == 0 ? (const void *)&query : (const void *)&mismatch;
                result = result * 31u + (uint32_t)searches[lane](&text, 0, UNITS, target, UNITS);
            }
            __asm__ volatile("" : "+r"(result) :: "memory");
            uint32_t elapsed = tick() - start;
            if (result != expected || !elapsed) return false;
            if (block >= 2) durations[block - 2][lane] = elapsed;
        }
    }
    for (unsigned b = 0; b < BLOCKS; ++b)
        for (unsigned lane = 0; lane < LANES; ++lane)
            printf("LABGUEST findmatch %u %s %u %" PRIu32 " %d\n",
                   b, names[lane], BATCH, durations[b][lane], esp_clk_cpu_freq());
    return true;
}
