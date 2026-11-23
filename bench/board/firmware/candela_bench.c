// The Candela scene's update and row timings (PICOCALC-CANDELA-P4), moved out of the port's candela_p4.c
// (PICOCALC-TYPED-APP-MANIFEST): built only by the bench profile.
//   candela bench FIXTURE WEIGHT ROW_FIRST   build, 1024 parameter updates, and the scalar and row draws, with CRCs
#include "candela_p4.h"
#include "candela_scene.h"
#include "esp_rom_crc.h"
#include "p4.h"
#include "raytrace_demo.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { SIDE = RAYTRACE_DEMO_SIDE, FRAME_BYTES = 2 * SIDE * SIDE, UPDATE_COUNT = 1024 };

static uint32_t crc_bytes(const void *ptr, size_t length) {
    return esp_rom_crc32_le(0, ptr, length);
}

static void measure(int fixture, int weight, bool row_first) {
    scene_module *active = p4_candela_active();
    if (!active || fixture<0 || fixture>1 || weight<0 || weight>256) { puts("candela: invalid trial"); return; }
    int64_t build_us, check_us;
    if (!p4_candela_build_scene(active,fixture,&build_us,&check_us)) { puts("candela: build rejected"); return; }
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

bool p4_candela_bench_console(const char *args) {
    int fixture, weight, order; char trailing;
    if (sscanf(args,"bench %d %d %d %c",&fixture,&weight,&order,&trailing)!=3 || (order!=0 && order!=1)) return false;
    measure(fixture,weight,order);
    return true;
}
