/* registry.h: the kernel instances and scenes linked into the benchmark app. 04-build.py board writes
 * registry.c (one entry per arm and scene) and blobs.S (the scenes' packed buffers). */
#pragma once
#include "cdl_api.h"
typedef struct { const char *id; const unsigned char *blob, *end; int w, h; } cdl_scene_t;
typedef struct {
  const char *arm;
  int armIx, sceneIx;
  int (*bind)(const cdl_buffers *, const void *, void *);
  unsigned (*sky_bytes)(void);
  void (*render_span)(int y, int x0, int x1, unsigned frame, cdl_pixout *out);
  const void *sections;                  /* NULL for single-translation-unit arms */
  void (*post_bind)(const float *, const float *, const float *, const float *);   /* NULL without a post pass */
  void (*display)(int, int, float *);
  void (*denoise)(int, int, float *);
} cdl_arm_t;
extern const cdl_scene_t CDL_SCENES[];
extern const int CDL_NSCENES;
extern const cdl_arm_t CDL_ARMS[];
extern const int CDL_NARMS;
extern const char *const CDL_ARM_NAMES[];
extern const int CDL_NARM_NAMES;
