typedef int (*paint_entry)(const void *state, void *out);

__attribute__((visibility("hidden"))) int mobile_painter_generated(const void *state, void *out);

// The relocated reactor hands its one patched entry back to the compiler worker.
__attribute__((visibility("default"))) int app_main(int argc, char **argv) {
  if (argc != 1 || !argv || !argv[0]) return -1;
  *(paint_entry *)argv[0] = mobile_painter_generated;
  return 0;
}
