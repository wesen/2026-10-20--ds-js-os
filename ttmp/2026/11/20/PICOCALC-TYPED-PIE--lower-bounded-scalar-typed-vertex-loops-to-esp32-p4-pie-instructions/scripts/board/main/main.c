#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "esp_cpu.h"
#include "esp_rom_crc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

enum { CHANNELS = 6, CAPACITY = 1024, TRIALS = 11 };

typedef int32_t Project(void *, void *, void *, void *, void *, void *, int32_t);
extern Project stock_project, portable_project, pie_project;

// Header at +12 gives a 16-byte-aligned first payload halfword.
typedef union {
    struct { uint32_t padding[3], length; uint16_t data[CAPACITY]; } aligned;
    struct { uint32_t length; uint16_t data[CAPACITY]; } unaligned;
} Buffer;
_Static_assert(sizeof(Buffer) % 16 == 0, "every aligned payload must start at a vector boundary");
static _Alignas(16) Buffer storage[CHANNELS];
static uint16_t *payload(unsigned channel, unsigned pad)
{
    return pad ? storage[channel].aligned.data : storage[channel].unaligned.data;
}

static uint32_t *header(unsigned channel, unsigned pad)
{
    return pad ? &storage[channel].aligned.length : &storage[channel].unaligned.length;
}

static void seed(unsigned pad, unsigned capacity)
{
    memset(storage, 0, sizeof(storage));
    for (unsigned channel = 0; channel < CHANNELS; channel++) {
        *header(channel, pad) = capacity;
        for (unsigned i = 0; i < CAPACITY; i++) {
            payload(channel, pad)[i] = channel < 3
                ? (uint16_t)(i * (71 + 6 * channel) + 314 * channel + (i >> 2))
                : 0xfeed;
        }
    }
}

static int32_t run(Project *fn, unsigned pad, int32_t count, bool alias)
{
    return fn(header(0, pad), header(1, pad), header(2, pad),
              header(alias ? 0 : 3, pad), header(4, pad), header(5, pad), count);
}

static uint32_t crc(unsigned pad, bool alias)
{
    uint32_t value = 0;
    value = esp_rom_crc32_le(value, (const uint8_t *)payload(alias ? 0 : 3, pad), 2 * CAPACITY);
    value = esp_rom_crc32_le(value, (const uint8_t *)payload(4, pad), 2 * CAPACITY);
    return esp_rom_crc32_le(value, (const uint8_t *)payload(5, pad), 2 * CAPACITY);
}

static bool golden(unsigned pad, unsigned count)
{
    for (unsigned i = 0; i < CAPACITY; i++) {
        const int x = payload(0, pad)[i] % 256, y = payload(1, pad)[i] % 256, z = payload(2, pad)[i] % 256;
        const uint16_t wanted[] = {384 + x - z, 640 + x + z - y * 2, x + z + y};
        for (unsigned ch = 3; ch < CHANNELS; ch++)
            if (payload(ch, pad)[i] != (i < count ? wanted[ch - 3] : 0xfeed)) return false;
    }
    return true;
}

static uint32_t elapsed(Project *fn, unsigned count)
{
    const unsigned repeats = 16384u / count;
    uint32_t begin = esp_cpu_get_cycle_count();
    for (unsigned i = 0; i < repeats; i++) {
        run(fn, 3, count, false);
    }
    return (esp_cpu_get_cycle_count() - begin) / repeats;
}

static void sort(uint32_t *values)
{
    for (unsigned i = 1; i < TRIALS; i++) {
        const uint32_t value = values[i];
        unsigned j = i;
        while (j > 0 && values[j - 1] > value) {
            values[j] = values[j - 1];
            j--;
        }
        values[j] = value;
    }
}

void app_main(void)
{
    Project *const kernels[] = {stock_project, portable_project, pie_project};
    const unsigned counts[] = {1, 7, 8, 9, 17, 64, 256, CAPACITY};
    const char *names[] = {"stock", "portable", "pie"};
    vTaskDelay(pdMS_TO_TICKS(1200));
    for (;;) {
        bool pass = true;
        printf("PIE_BEGIN\n");
        for (unsigned n = 0; n < sizeof(counts) / sizeof(counts[0]); n++) {
            unsigned count = counts[n];
            for (unsigned variant = 0; variant < 3; variant++) {
                const unsigned pad = variant == 1 ? 0 : 3;
                const bool alias = variant == 2;
                uint32_t reference = 0;
                for (unsigned arm = 0; arm < 3; arm++) {
                    seed(pad, CAPACITY);
                    const int32_t result = run(kernels[arm], pad, count, alias);
                    const uint32_t actual = crc(pad, alias);
                    if (arm == 0) reference = actual;
                    const bool ok = result == count && actual == reference && (alias || golden(pad, count));
                    pass &= ok;
                    printf("PIE_CASE %s %u %u %08" PRIx32 " %s\n", names[arm], count, variant, actual, ok ? "ok" : "FAIL");
                }
            }
            uint32_t cycles[3][TRIALS];
            for (unsigned trial = 0; trial < TRIALS; trial++) {
                for (unsigned order = 0; order < 3; order++) {
                    const unsigned arm = (trial + order) % 3;
                    seed(3, CAPACITY);
                    run(kernels[arm], 3, count, false); // warm code and data
                    cycles[arm][trial] = elapsed(kernels[arm], count);
                    vTaskDelay(1);
                }
            }
            for (unsigned arm = 0; arm < 3; arm++) {
                sort(cycles[arm]);
                printf("PIE_CYCLES %s %u %" PRIu32 " %" PRIu32 " %" PRIu32 "\n",
                    names[arm], count, cycles[arm][0], cycles[arm][TRIALS / 2], cycles[arm][TRIALS - 1]);
            }
        }
        printf("PIE_DONE %s\n", pass ? "ok" : "FAIL");
        vTaskDelay(pdMS_TO_TICKS(3000));
    }
}
