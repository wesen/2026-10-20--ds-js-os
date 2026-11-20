// Build with check-receiver.py against the selected staged receiver and reactor entry.
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "mobile_painter_p4.h"

typedef int (*expected_entry)(const void *, void *, void *, void *, void *, void *, void *, void *);
typedef int esp_elf_t;
typedef int64_t vtime_t;
enum { MALLOC_CAP_INTERNAL = 1, MALLOC_CAP_8BIT = 2 };
enum { SUCCESS, NO_HANDLE, BAD_RELOCATION, NO_ENTRY, NO_SCRATCH };
static int failure, live_handle, live_scratch, modules, calls;
static void *old_channels[6];
static vtime_t port_clock(void) { static vtime_t tick; return ++tick; }
static void *port_big_calloc(size_t n) {
    if (failure == NO_HANDLE) return NULL;
    ++live_handle;
    return calloc(1,n);
}
static void port_big_free(void *p) { --live_handle; free(p); }
static void *heap_caps_aligned_alloc(size_t boundary, size_t n, int caps) {
    assert(boundary == 16 && n == 6*192 && caps == (MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT));
    if (failure == NO_SCRATCH) return NULL;
    ++live_scratch;
    return aligned_alloc(boundary,n);
}
static void heap_caps_free(void *p) { if (p) --live_scratch; free(p); }
static int esp_elf_init(esp_elf_t *module) { ++modules; *module=1; return 0; }
static void esp_elf_deinit(esp_elf_t *module) { assert(*module==1); --modules; }
static int esp_elf_relocate(esp_elf_t *module,const uint8_t *bytes,size_t n) {
    assert(*module==1 && bytes && n==4);
    return failure == BAD_RELOCATION ? -1 : 0;
}
extern int app_main(int, char **);
static int esp_elf_request(esp_elf_t *module,int zero,int argc,char **argv) {
    assert(*module==1 && zero==0 && argc==(PAIRED?3:1) && argv);
    return failure == NO_ENTRY ? 0 : app_main(argc,argv);
}
#include "staged-receiver.inc"
_Static_assert(__builtin_types_compatible_p(paint_entry,expected_entry),"receiver entry should take eight buffers");

int mobile_painter_generated(const void *state,void *out,void *x,void *y,void *z,
                             void *sx,void *sy,void *depth) {
    void *channels[6]={x,y,z,sx,sy,depth};
    const state_buffer *input=state;
    draw_buffer *draw=out;
    assert(input->capacity==90 && draw->capacity==4096);
    for (int i=0;i<6;i++) {
        assert(*(uint32_t *)channels[i]==82);
        assert(((uintptr_t)channels[i]+4)%16==0);
        if (i) assert((uintptr_t)channels[i]-(uintptr_t)channels[i-1]==192);
        if (calls>0) assert(old_channels[i]==channels[i]);
        old_channels[i]=channels[i];
    }
    uint16_t *pitch=(uint16_t *)((char *)y+4);
    uint16_t *stamp=(uint16_t *)((char *)depth+4);
    assert(pitch[81]==5 && stamp[81]==0);
    stamp[81]=WITNESS?0xabcd:0;
    draw->words[0]=input->cells[72];
    draw->words[1]=123;
    ++calls;
    return 2;
}

#if PAIRED
extern __typeof__(mobile_painter_generated) mobile_painter_guarded __attribute__((alias("mobile_painter_generated")));
extern __typeof__(mobile_painter_generated) mobile_painter_raw __attribute__((alias("mobile_painter_generated")));
#endif

int main(void) {
    uint16_t state[90]={0}, words[4096]={0};
    for (failure=NO_HANDLE;failure<=NO_SCRATCH;failure++) {
        const mobile_painter_image image={malloc(4),4};
        assert(!mobile_painter_load(image,NULL));
        assert(!live_handle && !live_scratch && !modules);
    }
    failure=SUCCESS;
    const mobile_painter_image image={malloc(4),4};
    mobile_painter *handle=mobile_painter_load(image,NULL);
    assert(handle && live_handle==1 && live_scratch==1 && modules==1);
    for (int i=0;i<2;i++) {
        state[72]=52-8*i;
        words[2]=0xcafe;
        int64_t elapsed=0;
        assert(mobile_painter_run(handle,state,words,&elapsed)==2);
        assert(elapsed>0 && words[0]==state[72] && words[1]==123 && words[2]==0xcafe);
    }
    handle->lattice[1].capacity=80;
    words[0]=0xaaaa;
    assert(mobile_painter_run(handle,state,words,NULL)<0 && calls==2 && words[0]==0xaaaa);
    mobile_painter_free(handle);
    assert(!live_handle && !live_scratch && !modules);
    printf("RECEIVER_OK 4 rejected installs, 2 eight-buffer calls, 1 rejected capacity, 0 live allocations\n");
}
