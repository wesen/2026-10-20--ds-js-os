#include "common.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

kernel_t K;
profile_t PROFILE;

void raster_pie_groups(pixel_t *dst, unsigned groups, const pixel_t *color) {
  if ((uintptr_t)dst % 16 || !groups) abort();
  for (unsigned i = 0; i < groups * 8; i++) dst[i] = *color;
}

int main(int argc, char **argv) {
  uint16_t words[MOBILE_PAINTER_MAX_WORDS + 1];
  size_t n = fread(words, sizeof(*words), MOBILE_PAINTER_MAX_WORDS + 1, stdin);
  char hints[MOBILE_PAINTER_MAX_TEXT + 1] = {0};
  if (!painter_commands_valid(words, n, hints)) return 2;
  const size_t bytes = pixel_count * sizeof(pixel_t);
  pixel_t *allocation = aligned_alloc(16, bytes + 32);
  pixel_t *baseline = malloc(bytes);
  if (!allocation || !baseline) return 3;
  pixel_t *pixels = allocation + 8;
  PROFILE.fill_ns_per_px = argc > 1 ? atof(argv[1]) : 2.5;
  vtime_t charge = 0;
  uint64_t dirty = 0;
  for (unsigned arm = 0; arm < arms; arm++) {
    memset(allocation, 0xa5, bytes + 32);
    K.seg_cost = 17;
    dmabuf_t fb = raster_buffer(pixels);
    renderers[arm](&fb, words, n);
    if (arm == 0) {
      memcpy(baseline, pixels, bytes);
      charge = K.seg_cost;
      dirty = fb.dirty;
    } else if (memcmp(baseline, pixels, bytes) || K.seg_cost != charge || fb.dirty != dirty) {
      fprintf(stderr, "Mismatch arm=%s, charge=%" PRId64 "/%" PRId64
                      " dirty=%" PRIx64 "/%" PRIx64 "\n",
              arm_names[arm], K.seg_cost, charge, fb.dirty, dirty);
      return 4;
    }
    for (unsigned i = 0; i < 8; i++)
      if (allocation[i] != 0xa5a5 || pixels[pixel_count + i] != 0xa5a5) return 5;
  }
  fwrite(pixels, 1, bytes, stdout);
  fputs(hints, stdout);
  fprintf(stderr, "charge=%" PRId64 " dirty=%016" PRIx64 "\n", charge - 17, dirty);
  free(baseline);
  free(allocation);
  return ferror(stdout) ? 6 : 0;
}
