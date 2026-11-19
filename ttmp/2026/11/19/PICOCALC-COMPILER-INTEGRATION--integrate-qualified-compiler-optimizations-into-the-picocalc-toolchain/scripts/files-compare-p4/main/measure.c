#include <inttypes.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "esp_cpu.h"
#include "esp_private/esp_clk.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "metadata.h"
#include "slots.h"

extern int compare_old(const files_string *, bool, const files_string *, bool);
extern int compare_next(const files_string *, bool, const files_string *, bool);
_Static_assert(offsetof(files_string, units) == 4, "unexpected string ABI");

enum { REPEATS = 128, BLOCKS = 16, CASES = 5 };
typedef struct {
    const char *name;
    files_string left, right;
    bool left_dir, right_dir;
    int expected;
} fixture;
typedef struct { uint32_t cycles, hash; } sample;
static fixture cases[CASES];
static sample results[CASES][BLOCKS][2];

static uint32_t hash_byte(uint32_t hash, uint8_t byte) {
    return (hash ^ byte) * UINT32_C(16777619);
}

static uint32_t code_hash(const volatile uint8_t *bytes, size_t size) {
    uint32_t hash = UINT32_C(2166136261);
    for (size_t i = 0; i < size; i++) hash = hash_byte(hash, bytes[i]);
    return hash;
}

static void prepare(void) {
    const char *names[CASES] = {"equal91", "late91", "prefix", "first", "dir"};
    for (int i = 0; i < CASES; i++) {
        fixture *f = &cases[i];
        f->name = names[i];
        f->left.length = f->right.length = 91;
        for (unsigned k = 0; k < 91; k++) {
            f->left.units[k] = f->right.units[k] = (k % 5 == 0) ? 0x03bb : 'a' + k % 23;
        }
    }
    cases[1].right.units[90] += 31;
    cases[1].expected = -31;
    cases[2].left.length = 71;
    cases[2].expected = -20;
    cases[3].left.units[0] = cases[3].right.units[0] + 7;
    cases[3].expected = 7;
    cases[4].left_dir = true;
    cases[4].expected = -1;
}

static inline uint32_t tick(void) {
    __asm__ volatile("" ::: "memory");
    uint32_t value = esp_cpu_get_cycle_count();
    __asm__ volatile("" ::: "memory");
    return value;
}

// Separate external assembler symbols keep the generated calls visible to GCC.
// The common loop, inlined with each constant function address, gives direct calls.
typedef int (*compare_fn)(const files_string *, bool, const files_string *, bool);
static __attribute__((always_inline)) inline sample batch(compare_fn fn, const fixture *f) {
    uint32_t hash = UINT32_C(2166136261);
    uint32_t start = tick();
    for (int i = 0; i < REPEATS; i++) {
        int value = fn(&f->left, f->left_dir, &f->right, f->right_dir);
        hash = (hash ^ (uint32_t)value) * UINT32_C(16777619);
    }
    // The result must become available before the ending counter read.
    __asm__ volatile("" : "+r"(hash) :: "memory");
    return (sample){.cycles = tick() - start, .hash = hash};
}

static __attribute__((noinline)) sample sample_old(const fixture *f) { return batch(compare_old, f); }
static __attribute__((noinline)) sample sample_next(const fixture *f) { return batch(compare_next, f); }

void app_main(void) {
    prepare();
    printf("FCBENCH START smoke=%d old=%s new=%s core=%d hz=%d repeats=%d blocks=%d\n",
           BENCH_SMOKE, OLD_REV, NEXT_REV, (int)xPortGetCoreID(), esp_clk_cpu_freq(), REPEATS, BLOCKS);
    uint32_t old_hash = code_hash((const volatile uint8_t *)compare_old, OLD_BYTES);
    uint32_t next_hash = code_hash((const volatile uint8_t *)compare_next, NEXT_BYTES);
    printf("FCBENCH CODE old_ptr=%p old_bytes=%d old_fnv=%08" PRIx32
           " next_ptr=%p next_bytes=%d next_fnv=%08" PRIx32 "\n",
           (void *)compare_old, OLD_BYTES, old_hash, (void *)compare_next, NEXT_BYTES, next_hash);
    if (old_hash != OLD_FNV || next_hash != NEXT_FNV) {
        puts("FCBENCH FAILED code identity");
        return;
    }
    for (int c = 0; c < CASES; c++) {
        const fixture *f = &cases[c];
        int old = compare_old(&f->left, f->left_dir, &f->right, f->right_dir);
        int next = compare_next(&f->left, f->left_dir, &f->right, f->right_dir);
        if (old != f->expected || next != f->expected) {
            printf("FCBENCH FAILED case=%s expected=%d old=%d new=%d\n", f->name, f->expected, old, next);
            return;
        }
        uint32_t expected_hash = UINT32_C(2166136261);
        for (int i = 0; i < REPEATS; i++)
            expected_hash = (expected_hash ^ (uint32_t)f->expected) * UINT32_C(16777619);
        for (int b = -2; b < BLOCKS; b++) {
            // Two complete warm blocks. The first measured lane alternates
            // by block and starts differently on successive fixtures.
            for (int position = 0; position < 2; position++) {
                int lane = (b + 2 + c + position) & 1;
                sample s = lane ? sample_next(f) : sample_old(f);
                if (s.hash != expected_hash || s.cycles == 0) {
                    printf("FCBENCH FAILED sample=%s block=%d lane=%d\n", f->name, b, lane);
                    return;
                }
                if (b >= 0) results[c][b][lane] = s;
            }
        }
    }
    for (int c = 0; c < CASES; c++) {
        for (int b = 0; b < BLOCKS; b++) {
            const sample *pair = results[c][b];
            printf("FCBENCH PAIR case=%s block=%d first=%s old=%" PRIu32
                   " new=%" PRIu32 " hash=%08" PRIx32 "\n", cases[c].name, b,
                   ((c + b) & 1) ? "new" : "old", pair[0].cycles, pair[1].cycles, pair[0].hash);
        }
    }
    puts("FCBENCH COMPLETE");
    fflush(stdout);
}
