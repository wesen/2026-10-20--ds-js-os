// ABI between the firmware and its independently loaded stage-1 tool image.
// The RV32 calling convention for these fields uses only integer registers.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdarg.h>
typedef struct {
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
    unsigned char *module;
    size_t module_length;
    char error[192];
    int status;
} compiler_job_t;
