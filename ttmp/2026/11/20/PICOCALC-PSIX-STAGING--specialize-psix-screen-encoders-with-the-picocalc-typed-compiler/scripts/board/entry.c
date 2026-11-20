#include <stdint.h>
typedef int (*serializer_fn)(const void *, void *, int);
extern int generated_encode(const void *, void *, int);
// The fixed test obtains the relocated entry once before its measured loops.
__attribute__((visibility("default"))) int app_main(int argc, char **argv) {
    if (argc != 1 || !argv || !argv[0]) return -1;
    *(serializer_fn *)argv[0] = generated_encode;
    return 0;
}
