#include <stdio.h>
#include <stdlib.h>

#include "mbedtls/sha256.h"
#include "p4.h"

char *front_editor_compile(size_t *length);
char *front_agenda_compile(size_t *length);

const char *front_wasm_path = "typed/wasm.js";
const char *front_rv32_path = "typed/rv32.js";
bool front_profile;

typedef struct {
    const char *name;
    const char *wasm;
    bool marked;
} Variant;

static const Variant variants[] = {
    {"base", "typed/wasm.js", false},
    {"cursor", "lab-frontend/cursor.js", false},
    {"base_trace", "lab-frontend/base-trace.js", true},
    {"cursor_trace", "lab-frontend/cursor-trace.js", true},
};

static void select_variant(unsigned index) {
    const Variant *variant = &variants[index];
    front_wasm_path = variant->wasm;
    front_profile = variant->marked;
    front_rv32_path = variant->marked ? "lab-frontend/rv32-trace.js" : "typed/rv32.js";
}

static bool measure(unsigned block, unsigned pos, unsigned index, const char *app,
                    char *(*compile_app)(size_t *)) {
    const char *variant = variants[index].name;
    printf("FRONT begin %u %u %s %s\n", block, pos, variant, app);
    size_t size = 0;
    char *module = compile_app(&size);
    unsigned char hash[32];
    if (!module || mbedtls_sha256((const unsigned char *)module, size, hash, 0)) {
        free(module);
        printf("FRONT failed %s %s\n", variant, app);
        return false;
    }
    free(module);
    printf("FRONT end %s %s ", variant, app);
    for (unsigned i = 0; i < sizeof(hash); ++i) printf("%02x", hash[i]);
    puts("");
    return true;
}

char *p4_editor_compile(size_t *length) {
    static bool ran;
    if (!ran) {
        ran = true;
        const unsigned order[][4] = {{0,1,3,2}, {1,2,0,3}, {2,3,1,0}, {3,0,2,1}};
        for (unsigned b = 0; b < 4; ++b) {
            for (unsigned p = 0; p < 4; ++p) {
                unsigned variant = order[b][p];
                select_variant(variant);
                // Exercise the same bundled-input native compile entry for every trial.
                if (!measure(b, p, variant, "files", p4_files_compile) ||
                    !measure(b, p, variant, "agenda", front_agenda_compile) ||
                    !measure(b, p, variant, "editor", front_editor_compile)) {
                    select_variant(0);
                    return NULL;
                }
            }
        }
        select_variant(0);
        puts("FRONT complete");
    }
    return front_editor_compile(length);
}
