// Raster a validated word stream into the app body, leaving system chrome intact.
#include "painter_commands.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

kernel_t K;
profile_t PROFILE;

int main(void) {
  uint16_t words[MOBILE_PAINTER_MAX_WORDS + 1];
  size_t count = fread(words, sizeof(words[0]), MOBILE_PAINTER_MAX_WORDS + 1, stdin);
  char hints[MOBILE_PAINTER_MAX_TEXT + 1] = {0};
  if (!painter_commands_valid(words, count, hints)) return 2;
  dmabuf_t fb = {.w = 320, .h = 320, .bytes = 204800};
  fb.back = calloc(1, fb.bytes);
  if (!fb.back) return 3;
  gfx_fill(&fb, 0, PAINTER_TOP, PAINTER_WIDTH, PAINTER_HEIGHT, gfx_color("#f6f4ef"));
  painter_commands_draw(&fb, words, count);
  fwrite(fb.back, 1, fb.bytes, stdout);
  fputs(hints, stdout);
  free(fb.back);
  return ferror(stdout) ? 4 : 0;
}
