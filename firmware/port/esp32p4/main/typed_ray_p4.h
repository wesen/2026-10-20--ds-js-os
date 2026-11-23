// The Typed ray tracer (apps/typed/raytrace/app.json) in the compositor's raytrace view: compiled on first display,
// relocated, and drawn by typed_ray_p4.c. The bench build (bench/board/firmware/typed_ray_bench.c) loads its study
// programs into the same slot.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_elf.h"

typedef struct { uint32_t capacity; uint16_t cells[]; } typed_ray_buffer;
typedef int (*typed_ray_frame_fn)(typed_ray_buffer *, typed_ray_buffer *, int, int, int, int);
typedef int (*typed_ray_audit_fn)(typed_ray_buffer *, typed_ray_buffer *, typed_ray_buffer *, typed_ray_buffer *,
                                  int, int, int, int);
typedef int (*typed_ray_trace_fn)(typed_ray_buffer *, typed_ray_buffer *, typed_ray_buffer *, int, int);

typedef struct {
    esp_elf_t elf;
    typed_ray_frame_fn frame;
    typed_ray_audit_fn audit;
    typed_ray_trace_fn trace;
    typed_ray_audit_fn shade;
    int program;
} typed_ray_module;

enum { TYPED_RAY_WORK = 2048 };

typed_ray_module *p4_typed_ray_installed(void);
// Relocate a compiled image (freed here) and make it the displayed program; prints a TRLOAD record.
bool p4_typed_ray_load(int program, char *image, size_t length, size_t source_bytes, int64_t begin);
typed_ray_buffer *p4_typed_ray_buffer(uint32_t capacity);   // capacity cells and a guard cell, in PSRAM
unsigned p4_typed_ray_frames(void);
void p4_typed_ray_pose(int pose[4]);          // sphere x, y, light x, y of the displayed frame
