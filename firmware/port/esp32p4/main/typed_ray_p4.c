// Closed, complete Typed ray tracer (apps/typed/raytrace/app.json). Only allocation, invocation and presentation
// live here; the compile settings are the manifest's, and the study programs are the bench build's.
#include "esp_rom_crc.h"
#include "p4.h"
#include "raytrace_demo.h"
#include "typed_ray_p4.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { SIDE = RAYTRACE_DEMO_SIDE };

static typed_ray_module *installed;
static typed_ray_buffer *display_plane, *display_work;
static unsigned display_frames;
static raytrace_demo_scene display_pose, requested_pose;
static bool frame_ready, frame_pending, frame_failed;
static int request_epoch;

static bool same_pose(raytrace_demo_scene a, raytrace_demo_scene b) {
    return a.sphere_x == b.sphere_x && a.sphere_y == b.sphere_y &&
           a.light_x == b.light_x && a.light_y == b.light_y;
}
typed_ray_buffer *p4_typed_ray_buffer(uint32_t capacity) {
    typed_ray_buffer *b = port_big_calloc(sizeof(*b) + 2u * (capacity+1));
    if (b) { b->capacity = capacity; b->cells[capacity] = 0xc35a; }
    return b;
}
typed_ray_module *p4_typed_ray_installed(void) { return installed; }
unsigned p4_typed_ray_frames(void) { return display_frames; }
void p4_typed_ray_pose(int pose[4]) {
    pose[0] = display_pose.sphere_x; pose[1] = display_pose.sphere_y;
    pose[2] = display_pose.light_x; pose[3] = display_pose.light_y;
}

bool p4_typed_ray_load(int program, char *image, size_t ni, size_t ns, int64_t begin) {
    const uint32_t image_crc=image ? esp_rom_crc32_le(0,(const uint8_t*)image,ni) : 0;
    typed_ray_module *next=image ? port_big_calloc(sizeof(*next)) : NULL;
    bool init=next && esp_elf_init(&next->elf)==0;
    uintptr_t entries[4]={0};
    char *argv[]={(char*)entries};
    bool ok=init && esp_elf_relocate(&next->elf,(uint8_t*)image,ni)==0 &&
            esp_elf_request(&next->elf,0,1,argv)==0 && entries[0] && entries[1] && entries[2] && entries[3];
    free(image);
    if (!ok) {
        if(init) esp_elf_deinit(&next->elf);
        if(next) port_big_free(next);
        return false;
    }
    next->frame=(typed_ray_frame_fn)entries[0]; next->audit=(typed_ray_audit_fn)entries[1];
    next->trace=(typed_ray_trace_fn)entries[2]; next->shade=(typed_ray_audit_fn)entries[3]; next->program=program;
    typed_ray_module *old=installed; installed=next;
    frame_ready = frame_failed = false;
    if(old){esp_elf_deinit(&old->elf);port_big_free(old);}
    printf("TRLOAD {\"program\":%d,\"sourceBytes\":%zu,\"elfBytes\":%zu,\"segmentBytes\":%zu,\"elapsedUs\":%" PRId64 ",\"elfCRC\":\"%08" PRIx32 "\"}\n",
           program,ns,ni,next->elf.segment_size,port_clock()-begin,image_crc);
    return true;
}

// Program 0: the app's source with its manifest's policy ("kernel"), on first display.
static bool install(void) {
    const p4_typed_app *app = p4_typed_app_find("raytrace");
    if (!app) return false;
    int64_t begin = port_clock();
    size_t ns = 0, ni = 0;
    free(p4_bundle_read(app->source, &ns, NULL, 0));
    char *image = p4_typed_app_compile(app, 0, NULL, 0, NULL, &ni);
    return p4_typed_ray_load(0, image, ni, ns, begin);
}

// The ordinary compositor has an 80 ms turn. First use compiles the stock guest;
// scheduling that work here also keeps slow physical frame computations outside draw.
void p4_typed_ray_poll(void) {
    if (!frame_pending) return;
    frame_pending = false;
    world_t *view = world_by_name("compositor");
    if (!view || view->epoch != request_epoch) return;
    if (!display_plane) display_plane = p4_typed_ray_buffer(SIDE * SIDE);
    if (!display_work) display_work = p4_typed_ray_buffer(TYPED_RAY_WORK);
    frame_ready = false;
    if ((installed || install()) && display_plane && display_work) {
        display_work->cells[0] = SIDE;
        const raytrace_demo_scene s = requested_pose;
        frame_ready = installed->frame(display_plane, display_work, s.sphere_x, s.sphere_y,
                                       s.light_x, s.light_y) == 1;
        if (frame_ready) display_pose = s;
    }
    frame_failed = !frame_ready;
    defer_deliver(view, new_msg(M_ON, "draw", "null", view->id));
}

bool p4_typed_ray_frame(uint16_t *pixels,size_t stride,int sx,int sy,int lx,int ly) {
    world_t *view = world_by_name("compositor");
    if (!pixels || stride < SIDE || !view || view != K.cur) return false;
    const raytrace_demo_scene pose = {sx, sy, lx, ly};
    if (frame_failed && view->epoch == request_epoch && same_pose(pose, requested_pose)) return false;
    if (!frame_ready || !same_pose(pose, display_pose)) {
        requested_pose = pose;
        request_epoch = view->epoch;
        frame_pending = true;
    } else {
        frame_pending = false;
        display_frames++;
    }
    for (int y = 0; y < SIDE; y++) {
        if (frame_ready) memcpy(pixels + y * stride, display_plane->cells + y * SIDE, SIDE * sizeof(*pixels));
        else memset(pixels + y * stride, 0, SIDE * sizeof(*pixels));
    }
    return true;
}
