// Linux port services for the unmodified P4 typed compiler entry.
#include "p4.h"
#include <malloc.h>
#include <stdlib.h>
#include <time.h>

vtime_t port_clock(void) {
    struct timespec t;
    if (clock_gettime(CLOCK_MONOTONIC, &t)) abort();
    return t.tv_sec * 1000000LL + t.tv_nsec / 1000;
}
void *port_heap_malloc(size_t bytes) { return malloc(bytes); }
void *port_heap_realloc(void *p, size_t bytes) { return realloc(p, bytes); }
void port_heap_free(void *p) { free(p); }
size_t port_heap_usable(const void *p) { return malloc_usable_size((void *)p); }
size_t port_js_stack(void) { return 4 * 1024 * 1024; }

char *p4_bundle_read(const char *path, size_t *length, char *buffer, size_t capacity) {
    if (buffer || capacity) abort(); // These two compiler entries only request owned reads.
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); return NULL; }
    if (fseek(f, 0, SEEK_END)) abort();
    long size = ftell(f);
    if (size < 0 || fseek(f, 0, SEEK_SET)) abort();
    char *bytes = malloc((size_t)size + 1);
    if (!bytes || fread(bytes, 1, (size_t)size, f) != (size_t)size) abort();
    if (fclose(f)) abort();
    bytes[size] = 0;
    *length = (size_t)size;
    return bytes;
}
int main(void) {
    size_t size = 0;
    char *module = p4_editor_compile(&size);
    if (!module || !size) return 1;
    FILE *out = fopen("compiled.elf", "wb");
    if (!out || fwrite(module, 1, size, out) != size || fclose(out)) return 2;
    free(module);
    return 0;
}
