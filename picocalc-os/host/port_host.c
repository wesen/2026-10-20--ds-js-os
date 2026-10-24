// The host's port: the C library's allocator and files, and the simulated board's name. The host runs on
// the virtual clock, so port_clock is only there for completeness.
#include <malloc.h>
#include <stdlib.h>
#include <time.h>
#include "../nucleus/nucleus.h"

vtime_t port_clock(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (vtime_t)ts.tv_sec * 1000000 + ts.tv_nsec / 1000;
}
void *port_heap_malloc(size_t n) { return malloc(n); }
void *port_heap_realloc(void *p, size_t n) { return realloc(p, n); }
void port_heap_free(void *p) { free(p); }
size_t port_heap_usable(const void *p) { return malloc_usable_size((void *)p); }
void *port_big_calloc(size_t n) { return calloc(1, n); }
void port_big_free(void *p) { free(p); }
size_t port_js_stack(void) { return 192 * 1024; }
char *port_read_file(const char *path, size_t *len) { return read_file(path, len); }
const char *port_board_name(void) { return "ESP32-P4 in a PicoCalc (simulated)"; }
