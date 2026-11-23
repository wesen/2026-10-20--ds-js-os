#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "candela_scene.h"
#include "esp_elf.h"

// The Candela scene (apps/typed/candela/app.json): Typed scene sections compiled on the handheld, rendered by the C
// renderer (nucleus/candela_scene.c) into the compositor's raytrace view. All calls belong to the kernel task.
// Startup compiles trusted bundled source.
typedef int32_t (*build_fn)(candela_graph *, int32_t);
typedef int32_t (*set_fn)(candela_graph *, int32_t, int32_t);
typedef struct {
    esp_elf_t elf;
    build_fn build;
    set_fn set;
    candela_shader shader;
    candela_graph graph;
    int fixture;
    unsigned builds;
} scene_module;

bool p4_candela_init(void);
bool p4_candela_frame(uint16_t *pixels, size_t stride, int fixture, int weight,
                      int light_x, int light_y);
void p4_candela_console(const char *args);
// For the bench build (bench/board/firmware/candela_bench.c): the installed scene and its builder.
scene_module *p4_candela_active(void);
bool p4_candela_build_scene(scene_module *m, int fixture, int64_t *build_us, int64_t *check_us);
