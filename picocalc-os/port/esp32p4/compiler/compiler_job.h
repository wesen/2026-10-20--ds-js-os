// ABI between the firmware and its independently loaded stage-1 tool image.
// The RV32 calling convention for these fields uses only integer registers.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdarg.h>
#define FRONTEND_HEAP_CAP (8u * 1024 * 1024)
#define LARGE_FRONTEND_HEAP (10u * 1024 * 1024)
typedef enum { CJI_FRONTEND, CJI_LINK, CJI_ASSEMBLE } compiler_phase_t;
typedef struct {
#ifdef CJI_PROFILE_GC
    size_t profile_heap;
    int profile_started, profile_complete;
    int64_t frontend_us, gc_us, slide_bytes, survivor_bytes, live_peak, collections;
#endif
    void *frontend_heap;
    size_t frontend_heap_size;
    const char *source;
    size_t length;
    const char *exports;
    size_t exports_length;
    void *(*alloc)(size_t);
    void *(*resize)(void *, size_t);
    void (*release)(void *);
    int (*format)(char *, size_t, const char *, va_list);
    double (*number)(const char *, char **);
    double (*math)(unsigned, double, double);
    int64_t (*micros)(void);
    void (*phase)(compiler_phase_t);
    unsigned char *module;
    size_t module_length;
    char error[192];
    int status;
} compiler_job_t;
