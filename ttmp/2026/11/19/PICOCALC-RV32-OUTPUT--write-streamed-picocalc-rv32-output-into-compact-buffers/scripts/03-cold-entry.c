// Host implementations for the production typed_p4.c entry.
#include "p4.h"
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

vtime_t port_clock(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now)) abort();
  return now.tv_sec * 1000000LL + now.tv_nsec / 1000;
}

void *port_heap_malloc(size_t size) { return malloc(size); }
void *port_heap_realloc(void *ptr, size_t size) { return realloc(ptr, size); }
void port_heap_free(void *ptr) { free(ptr); }
size_t port_heap_usable(const void *ptr) { return malloc_usable_size((void *)ptr); }
size_t port_js_stack(void) { return 4 * 1024 * 1024; }

char *p4_bundle_read(const char *path, size_t *length, char *buffer, size_t capacity) {
  if (buffer || capacity) abort();
  FILE *file = fopen(path, "rb");
  if (!file) { perror(path); return NULL; }
  if (fseek(file, 0, SEEK_END)) abort();
  long size = ftell(file);
  if (size < 0 || fseek(file, 0, SEEK_SET)) abort();
  char *text = malloc((size_t)size + 1);
  if (!text || fread(text, 1, (size_t)size, file) != (size_t)size || fclose(file)) abort();
  text[size] = 0;
  *length = (size_t)size;
  return text;
}

int main(int argc, const char *argv[]) {
  static const struct workload {
    const char *name, *linker, *entry;
    const p4_compile_limits *limits;
  } *app = NULL;
  static const p4_compile_limits editor_limits = {
    .heap_bytes = 4 * 1024 * 1024, .duration_us = 6000000,
  };
  static const struct workload apps[] = {
    {"files", "files/compile.js", "compileFilesRv32", NULL},
    {"agenda", "agenda/compile.js", "compileAgendaRv32", NULL},
    {"editor", "typed/world.js", "compileTypedWorldRv32", &editor_limits},
  };
  if (argc != 2) return 2;
  for (size_t i = 0; i < sizeof(apps) / sizeof(apps[0]); i++) {
    if (strcmp(argv[1], apps[i].name) == 0) app = &apps[i];
  }
  if (!app) return 2;
  char source_name[64], reactor_name[64];
  snprintf(source_name, sizeof(source_name), "%s/program.typed", app->name);
  snprintf(reactor_name, sizeof(reactor_name), "%s/reactor.bin", app->name);
  size_t source_size, reactor_size, module_size = 0;
  const vtime_t start = port_clock();
  char *source = p4_bundle_read(source_name, &source_size, NULL, 0);
  char *reactor = p4_bundle_read(reactor_name, &reactor_size, NULL, 0);
  if (!source || !reactor) return 3;
  char *module = p4_typed_compile(app->name, "bundle", source, source_size,
      app->linker, app->entry, ENG_NATIVE, reactor, reactor_size, &module_size, start, app->limits);
  free(reactor);
  free(source);
  if (!module || !module_size) return 4;
  FILE *out = fopen("compiled.elf", "wb");
  if (!out || fwrite(module, 1, module_size, out) != module_size || fclose(out)) return 5;
  free(module);
  return 0;
}
