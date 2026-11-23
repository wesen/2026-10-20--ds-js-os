#include <stdint.h>

extern void candela_typed_layout(void), candela_typed_init(void);
extern void candela_typed_sky(void), candela_typed_span(void);

__attribute__((visibility("default"))) int app_main(int argc, char **argv) {
    if (argc != 1 || !argv || !argv[0]) return -1;
    uintptr_t *entries = (uintptr_t *)argv[0];
    entries[0] = (uintptr_t)candela_typed_layout;
    entries[1] = (uintptr_t)candela_typed_init;
    entries[2] = (uintptr_t)candela_typed_sky;
    entries[3] = (uintptr_t)candela_typed_span;
    return 0;
}
