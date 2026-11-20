// Compact line protocol produced by 04-screen-oracle.mjs. Pixel layout matches the board.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"

kernel_t K;
profile_t PROFILE;
int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "--fonts") == 0) {
        char *fonts = gfx_fonts_json();
        puts(fonts);
        free(fonts);
        return 0;
    }
    dmabuf_t fb = {.w = 320, .h = 320, .bytes = 320 * 320 * 2};
    fb.front = calloc(1, fb.bytes);
    fb.back = calloc(1, fb.bytes);
    pixel_t *panel = calloc(1, fb.bytes);
    if (!fb.front || !fb.back || !panel) return 1;
    gfx_invalidate(&fb);
    char *line = NULL;
    size_t cap = 0;
    while (getline(&line, &cap, stdin) >= 0) {
        char op = line[0];
        int x, y, w, h;
        unsigned color;
        if (op == 'X') { gfx_invalidate(&fb); continue; }
        if (op == 'P' || op == 'S') {
            int rects[64 * 4], n = gfx_commit(&fb, rects, 64);
            if (op == 'P') {
                for (int i = 0; i < n; ++i) {
                    const int *r = rects + i * 4;
                    for (int row = r[1]; row < r[1] + r[3]; ++row) {
                        int at = row * fb.w + r[0];
                        memcpy(panel + at, fb.front + at, (size_t)r[2] * sizeof(pixel_t));
                    }
                }
            }
            if (fwrite(fb.back, 1, fb.bytes, stdout) != fb.bytes) return 2;
            if (memcmp(panel, fb.back, fb.bytes) && op == 'P') return 3;
            if (op == 'S') gfx_invalidate(&fb);
            continue;
        }
        if (op == 'T') {
            char font[20], textColor[20];
            int offset = 0;
            if (sscanf(line + 1, "%d %d %d %19s %19s %n", &x, &y, &w, font, textColor, &offset) != 5) return 4;
            char *hex = line + 1 + offset;
            size_t length = strcspn(hex, "\r\n");
            if (length % 2) return 5;
            for (size_t i = 0; i < length; i += 2) {
                unsigned v;
                if (sscanf(hex + i, "%2x", &v) != 1) return 6;
                hex[i / 2] = (char)v;
            }
            hex[length / 2] = 0;
            gfx_text(&fb, x, y, hex, gfx_font_index(font), gfx_color(textColor), w);
            continue;
        }
        if (sscanf(line + 1, "%d %d %d %d %x", &x, &y, &w, &h, &color) != 5) return 7;
        char rgb[10];
        snprintf(rgb, sizeof rgb, "#%06x", color & 0xffffff);
        if (op == 'F') gfx_fill(&fb, x, y, w, h, gfx_color(rgb));
        else if (op == 'R') gfx_rect(&fb, x, y, w, h, gfx_color(rgb));
        else if (op == 'L') gfx_line(&fb, x, y, w, h, gfx_color(rgb));
        else return 8;
    }
    free(line); free(fb.front); free(fb.back); free(panel);
    return ferror(stdin) || ferror(stdout);
}
