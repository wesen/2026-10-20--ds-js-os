// Only the kernel task owns the active trusted module and its validated scene.
#include "candela_p4.h"
#include "candela_scene.h"
#include "esp_elf.h"
#include "esp_heap_caps.h"
#include "esp_rom_crc.h"
#include "p4.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { SIDE = RAYTRACE_DEMO_SIDE, FRAME_BYTES = 2 * SIDE * SIDE, UPDATE_COUNT = 1024 };
static const char *const sources[] = {"candela/hand.typed", "candela/fluent.typed", "candela/callback.typed"};
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

static scene_module *active;

static uint32_t crc_bytes(const void *ptr, size_t length) {
    return esp_rom_crc32_le(0, ptr, length);
}

static bool build_scene(scene_module *m, int fixture, int64_t *build_us, int64_t *check_us) {
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

static bool install(unsigned stage) {
    if (stage >= sizeof(sources) / sizeof(sources[0])) return false;
    const p4_compile_limits limits = {.heap_bytes = 4*1024*1024, .duration_us = 8000000};
    const int64_t start = port_clock();
    const size_t before = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
    bool monitored = heap_caps_monitor_local_minimum_free_size_start() == ESP_OK;
    size_t source_len = 0, template_len = 0, length = 0;
    char *source = p4_bundle_read(sources[stage], &source_len, NULL, 0);
    char *template = p4_bundle_read("candela/slot.elf", &template_len, NULL, 0);
    char *bytes = NULL;
    if (source && template) {
        bytes = p4_typed_compile("candela", sources[stage], source, source_len,
                                 "candela/link.js", "linkCandela", ENG_NATIVE, template, template_len,
                                 &length, start, &limits);
    }
    int64_t compile_us = port_clock() - start;
    free(source);
    free(template);
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
    if (!build_scene(next, 0, NULL, NULL) || !build_scene(next, 1, NULL, NULL)) {
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

bool p4_candela_init(void) { return install(2); }

bool p4_candela_frame(uint16_t *pixels, size_t stride, int fixture, int weight, int lx, int ly) {
    if (!pixels || stride < SIDE || !active || fixture<0 || fixture>1 || weight<0 || weight>256 ||
        lx<0 || lx>=SIDE || ly<0 || ly>=SIDE) return false;
    if (active->fixture != fixture && !build_scene(active, fixture, NULL, NULL)) return false;
    if (active->graph.cells[295] != weight && active->set(&active->graph, 0, weight) != 1) return false;
    return candela_render(pixels,stride,&active->graph,lx,ly,RAYTRACE_DEMO_PIE,
                          CANDELA_SHADE_ROW,&active->shader,NULL);
}

static void measure(int fixture, int weight, bool row_first) {
    if (!active || fixture<0 || fixture>1 || weight<0 || weight>256) { puts("candela: invalid trial"); return; }
    int64_t build_us, check_us;
    if (!build_scene(active,fixture,&build_us,&check_us)) { puts("candela: build rejected"); return; }
    candela_graph before = active->graph;
    unsigned initial_builds = active->builds;
    int64_t begin = port_clock();
    for (unsigned i=0;i<UPDATE_COUNT;i++) {
        if (active->set(&active->graph,0,(i&1) ? weight : 256-weight) != 1) { puts("candela: set failed"); return; }
    }
    int64_t update_us = port_clock()-begin;
    before.cells[295] = weight;
    bool param_only = before.capacity==active->graph.capacity && !memcmp(before.cells,active->graph.cells,sizeof(before.cells)) && active->builds==initial_builds;
    uint16_t *pixels = port_big_calloc(FRAME_BYTES), *first = port_big_calloc(FRAME_BYTES);
    if (!pixels || !first) { puts("candela: frame buffer allocation failed"); goto done; }
    int64_t time_us[2];
    for (int p=0;p<2;p++) {
        bool row = p==0 ? row_first : !row_first;
        memset(pixels,p ? 0x55 : 0xaa,FRAME_BYTES);
        begin=port_clock();
        bool ok = candela_render(pixels,SIDE,&active->graph,31,25,RAYTRACE_DEMO_PIE,
                                 row ? CANDELA_SHADE_ROW : CANDELA_SHADE_SCALAR,&active->shader,NULL);
        time_us[row]=port_clock()-begin;
        if (!ok) { puts("candela: draw rejected"); goto done; }
        if (!p) memcpy(first,pixels,FRAME_BYTES);
    }
    struct { uint32_t capacity; uint16_t cells[CANDELA_WORK_CELLS]; } work = {.capacity=CANDELA_WORK_CELLS};
    const int32_t left = active->shader.color_at(&active->graph,&work,active->graph.cells[284],60,61);
    const int32_t right = active->shader.color_at(&active->graph,&work,active->graph.cells[289],110,65);
    const int32_t floor = active->shader.color_at(&active->graph,&work,active->graph.cells[6],7,9);
    printf("CANROW {\"fixture\":%d,\"weight\":%d,\"rowFirst\":%d,\"buildUs\":%" PRId64
           ",\"checkAndPublishUs\":%" PRId64 ",\"updateBatchUs\":%" PRId64
           ",\"updates\":%d,\"paramOnly\":%d,\"pixelUs\":%" PRId64 ",\"rowUs\":%" PRId64
           ",\"equal\":%d,\"crc\":\"%08" PRIx32 "\",\"graphCRC\":\"%08" PRIx32 "\","
           "\"nodes\":%u,\"materials\":%u,\"spheres\":%u,\"rgbSamples\":[%ld,%ld,%ld]}\n",
           fixture,weight,row_first,build_us,check_us,update_us,UPDATE_COUNT,param_only,time_us[0],time_us[1],
           !memcmp(first,pixels,FRAME_BYTES),crc_bytes(pixels,FRAME_BYTES),crc_bytes(active->graph.cells,606),
           active->graph.cells[2],active->graph.cells[3],active->graph.cells[4],(long)left,(long)right,(long)floor);
done:
    port_big_free(first);
    port_big_free(pixels);
}

void p4_candela_console(const char *args) {
    int stage, fixture, weight, order; char trailing;
    if (sscanf(args,"stage %d %c",&stage,&trailing)==1 && stage>=0 && stage<=2) {
        if (!install((unsigned)stage)) puts("candela: stage rejected");
    } else if (sscanf(args,"bench %d %d %d %c",&fixture,&weight,&order,&trailing)==3 && (order==0 || order==1)) {
        measure(fixture,weight,order);
    } else if (!strcmp(args,"graph") && active && active->fixture>=0) {
        printf("CANGRAPH [");
        for (unsigned i=0;i<303;i++) printf("%s%u",i?",":"",active->graph.cells[i]);
        puts("]");
    } else puts("candela stage 0|1|2 | candela bench FIXTURE WEIGHT ROW_FIRST | candela graph");
}
