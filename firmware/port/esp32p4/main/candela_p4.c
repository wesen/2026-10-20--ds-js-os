// Only the kernel task owns the active trusted module and its validated scene.
#include "candela_p4.h"
#include "candela_scene.h"
#include "esp_elf.h"
#include "esp_heap_caps.h"
#include "p4.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { SIDE = RAYTRACE_DEMO_SIDE };

static scene_module *active;
scene_module *p4_candela_active(void) { return active; }

bool p4_candela_build_scene(scene_module *m, int fixture, int64_t *build_us, int64_t *check_us) {
    candela_graph next = {.capacity = 303};
    int64_t begin = port_clock();
    int success = m->build(&next, fixture);
    int64_t end = port_clock();
    if (build_us) *build_us = end - begin;
    if (success != 1 || !candela_validate(&next)) return false;
    m->graph = next;
    m->fixture = fixture;
    m->builds++;
    if (check_us) *check_us = port_clock() - end;
    return true;
}

// The scene's stages are the variants of apps/typed/candela/app.json (hand, fluent, callback).
static bool install(unsigned stage) {
    const p4_typed_app *app = p4_typed_app_find("candela");
    if (!app || stage >= (unsigned)app->n_variants) return false;
    const int64_t start = port_clock();
    const size_t before = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
    bool monitored = heap_caps_monitor_local_minimum_free_size_start() == ESP_OK;
    size_t length = 0, source_len = 0;
    free(p4_bundle_read(app->variants[stage].source, &source_len, NULL, 0));
    char *bytes = p4_typed_app_compile(app, (int)stage, NULL, 0, NULL, &length);
    int64_t compile_us = port_clock() - start;
    int64_t relocate_start = port_clock();
    scene_module *next = bytes ? port_big_calloc(sizeof(*next)) : NULL;
    bool init = next && esp_elf_init(&next->elf) == 0;
    uintptr_t entries[4] = {0};
    char *argv[] = {(char *)entries};
    bool ok = init && esp_elf_relocate(&next->elf, (uint8_t *)bytes, length) == 0 &&
              esp_elf_request(&next->elf, 0, 1, argv) == 0 &&
              entries[0] && entries[1] && entries[2] && entries[3];
    int64_t relocate_us = port_clock() - relocate_start;
    free(bytes);
    size_t minimum = monitored ? heap_caps_get_minimum_free_size(MALLOC_CAP_SPIRAM) : 0;
    if (monitored) heap_caps_monitor_local_minimum_free_size_stop();
    if (!ok) {
        if (init) esp_elf_deinit(&next->elf);
        if (next) port_big_free(next);
        return false;
    }
    next->build = (build_fn)entries[0];
    next->shader.color_at = (__typeof__(next->shader.color_at))entries[1];
    next->shader.shade_row = (__typeof__(next->shader.shade_row))entries[2];
    next->set = (set_fn)entries[3];
    next->fixture = -1;
    if (!p4_candela_build_scene(next, 0, NULL, NULL) || !p4_candela_build_scene(next, 1, NULL, NULL)) {
        esp_elf_deinit(&next->elf);
        port_big_free(next);
        return false;
    }
    next->fixture = -1;
    next->builds = 0;
    scene_module *old = active;
    active = next;
    if (old) {
        esp_elf_deinit(&old->elf);
        port_big_free(old);
    }
    printf("CANLOAD {\"stage\":%u,\"compileUs\":%" PRId64 ",\"relocateUs\":%" PRId64 ",\"installTotalUs\":%" PRId64
           ",\"imageBytes\":%zu,\"elfSegmentBytes\":%zu,\"residentStructBytes\":%zu,"
           "\"sourceBytes\":%zu,\"graphBytes\":%zu,\"psramMonitored\":%d,\"psramPeakDeltaBytes\":%zu}\n",
           stage, compile_us, relocate_us, port_clock()-start, length, next->elf.segment_size, sizeof(*next),
           source_len,sizeof(next->graph),monitored, monitored && before>minimum ? before-minimum : 0);
    return true;
}

bool p4_candela_init(void) { return install(2); }   // callback

bool p4_candela_frame(uint16_t *pixels, size_t stride, int fixture, int weight, int lx, int ly) {
    if (!pixels || stride < SIDE || !active || fixture<0 || fixture>1 || weight<0 || weight>256 ||
        lx<0 || lx>=SIDE || ly<0 || ly>=SIDE) return false;
    if (active->fixture != fixture && !p4_candela_build_scene(active, fixture, NULL, NULL)) return false;
    if (active->graph.cells[295] != weight && active->set(&active->graph, 0, weight) != 1) return false;
    return candela_render(pixels,stride,&active->graph,lx,ly,RAYTRACE_DEMO_PIE,
                          CANDELA_SHADE_ROW,&active->shader,NULL);
}

void p4_candela_console(const char *args) {
    int stage; char trailing;
    if (sscanf(args,"stage %d %c",&stage,&trailing)==1 && stage>=0 && stage<=2) {
        if (!install((unsigned)stage)) puts("candela: stage rejected");
    } else if (!strcmp(args,"graph") && active && active->fixture>=0) {
        printf("CANGRAPH [");
        for (unsigned i=0;i<303;i++) printf("%s%u",i?",":"",active->graph.cells[i]);
        puts("]");
    } else puts("candela stage 0|1|2 | candela graph");
}
