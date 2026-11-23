// The fragments board study (PICOCALC-TYPED-F32): the three Candela fragments (sphere, ggx, norm3) in three arms,
// GCC -O2 with its default contraction (arm 0), GCC -O2 -ffp-contract=off (arm 1) and the Typed compiler's RV32
// image (arm 2, kernel policy), timed in cycles over N inputs per kernel, in six blocks with a rotating arm order.
// Before timing, every arm's result for every input is checked: arms 1 and 2 must equal the host's Typed results
// bit for bit (inputs.h), arm 0 is hashed. Prints FRAG rows; run by 08-run-board.py.
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "esp_cpu.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "inputs.h"

typedef float (*Pair)(const float *, const float *, float);
typedef float (*One)(const float *);
float fma_sphere(const float *, const float *, float), fma_ggx(const float *, const float *, float), fma_norm3(const float *);
float off_sphere(const float *, const float *, float), off_ggx(const float *, const float *, float), off_norm3(const float *);
float typed_sphere(const float *, const float *, float), typed_ggx(const float *, const float *, float), typed_norm3(const float *);
static const Pair spheres[3] = {fma_sphere, off_sphere, typed_sphere}, ggxs[3] = {fma_ggx, off_ggx, typed_ggx};
static const One norms[3] = {fma_norm3, off_norm3, typed_norm3};
static const char *const kernels[3] = {"sphere", "ggx", "norm3"};

static inline uint32_t bits(float x) { uint32_t u; memcpy(&u, &x, 4); return u; }
// One kernel of one arm over every input; returns the FNV-1a hash of the result bits.
static __attribute__((noinline)) uint32_t run(int kernel, int arm, uint32_t *check) {
    uint32_t h = 2166136261u;
    for (int i = 0; i < N; i++) {
        const float *v = inputs[i];
        float r = kernel == 0 ? spheres[arm](v, v + 4, v[3]) : kernel == 1 ? ggxs[arm](v + 8, v + 12, v[7]) : norms[arm](v);
        uint32_t b = bits(r);
        if (check && check[i] != b) return 0;
        h = (h ^ b) * 16777619u;
    }
    return h;
}

void app_main(void) {
    vTaskDelay(pdMS_TO_TICKS(1500));
    printf("F32FRAG BEGIN %d %d\n", N, BLOCKS);
    uint32_t *expected[3] = {expected_sphere, expected_ggx, expected_norm3};
    for (int k = 0; k < 3; k++) {
        for (int a = 1; a < 3; a++) if (!run(k, a, expected[k])) { printf("F32FRAG MISMATCH %s %d\n", kernels[k], a); goto done; }
        printf("F32FRAG HASH %s %08" PRIx32 " %08" PRIx32 " %08" PRIx32 "\n", kernels[k], run(k, 0, NULL), run(k, 1, NULL), run(k, 2, NULL));
    }
    for (int b = 0; b < BLOCKS; b++) for (int k = 0; k < 3; k++) for (int p = 0; p < 3; p++) {
        // Each arm takes each position twice over six blocks; odd blocks run the rotation backwards.
        const int a = b % 2 ? (2 - p + b / 2) % 3 : (p + b / 2) % 3;
        run(k, a, NULL); // warm the caches
        uint32_t t = esp_cpu_get_cycle_count();
        uint32_t h = run(k, a, NULL);
        uint32_t cycles = esp_cpu_get_cycle_count() - t;
        printf("F32FRAG ROW %s %d %d %d %" PRIu32 " %08" PRIx32 "\n", kernels[k], b, p, a, cycles, h);
        vTaskDelay(1);
    }
done:
    puts("F32FRAG END");
}
