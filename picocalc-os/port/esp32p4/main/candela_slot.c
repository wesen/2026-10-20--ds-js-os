#include <stdint.h>

extern void candela_slot_build(void), candela_slot_color(void);
extern void candela_slot_row(void), candela_slot_set(void);

__attribute__((visibility("default"))) int app_main(int argc, char **argv) {
    if (argc != 1 || !argv || !argv[0]) return -1;
    uintptr_t *entries = (uintptr_t *)argv[0];
    entries[0] = (uintptr_t)candela_slot_build;
    entries[1] = (uintptr_t)candela_slot_color;
    entries[2] = (uintptr_t)candela_slot_row;
    entries[3] = (uintptr_t)candela_slot_set;
    return 0;
}
