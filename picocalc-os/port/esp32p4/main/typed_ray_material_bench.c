// Compare the installed mixed renderer with a single complete Typed frame.
#include "candela_p4.h"
#include "candela_scene.h"
#include "esp_elf.h"
#include "esp_rom_crc.h"
#include "p4.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { uint32_t size; uint16_t cells[]; } buffer;
typedef int32_t (*frame_fn)(buffer *, buffer *, candela_graph *, buffer *, buffer *, buffer *, int32_t, int32_t);
typedef int32_t (*builder_fn)(candela_graph *, int32_t, int32_t);
typedef int32_t (*phase_fn)(buffer *, candela_graph *, buffer *, buffer *, buffer *, int32_t, int32_t);
typedef int32_t (*material_fn)(candela_graph *, buffer *, buffer *, int32_t, buffer *);
typedef struct {
    esp_elf_t elf;
    frame_fn render;
    builder_fn build;
    phase_fn row_phase;
    material_fn shade;
} material_program;

static material_program *program;
enum { SIDE = 160, PIXELS = SIDE * SIDE, BYTES = 2 * PIXELS };

static bool load_once(void) {
    if (program) return true;
    const p4_compile_limits limits = {.heap_bytes = 4 * 1024 * 1024, .duration_us = 8000000};
    size_t ns = 0, nt = 0, ni = 0;
    int64_t begin = port_clock();
    char *source = p4_bundle_read("typedmat/main.typed", &ns, NULL, 0);
    char *slot = p4_bundle_read("candela/slot.elf", &nt, NULL, 0);
    char *bytes = source && slot ? p4_typed_compile("typedmat", "typedmat/main.typed", source, ns,
        "typedmat/link.js", "linkTypedMaterial", ENG_NATIVE, slot, nt, &ni, begin, &limits) : NULL;
    free(source);
    free(slot);
    if (!bytes) return false;
    material_program *next = port_big_calloc(sizeof(*next));
    bool init = next && esp_elf_init(&next->elf) == 0;
    uintptr_t entries[4] = {0};
    char *argv[] = {(char *)entries};
    bool ok = init && esp_elf_relocate(&next->elf, (uint8_t *)bytes, ni) == 0 &&
        esp_elf_request(&next->elf, 0, 1, argv) == 0 && entries[0] && entries[1] && entries[2] && entries[3];
    free(bytes);
    if (!ok) {
        if (init) esp_elf_deinit(&next->elf);
        port_big_free(next);
        return false;
    }
    next->render = (frame_fn)entries[0];
    next->build = (builder_fn)entries[1];
    next->row_phase = (phase_fn)entries[2];
    next->shade = (material_fn)entries[3];
    program = next;
    return true;
}

static buffer *allocate_buffer(uint32_t size) {
    buffer *b = port_big_calloc(sizeof(*b) + 2 * (size + 1));
    if (b) { b->size = size; b->cells[size] = 0xc35a; }
    return b;
}

static void measure(int fixture, int weight, int typed_first) {
    if (!load_once()) { puts("typedmat: could not load closed program"); return; }
    candela_graph graph = {.capacity = CANDELA_GRAPH_CELLS};
    if (program->build(&graph, fixture, weight) != 1 ||
        !candela_validate(&graph)) { puts("typedmat: invalid scene"); return; }
    enum { MIXED, TYPED, WORK, SHADER, IDS, COLORS, NBUFFERS };
    const uint32_t sizes[NBUFFERS] = {PIXELS, PIXELS, 2048, 192, 160, 320};
    buffer *b[NBUFFERS] = {0};
    for (int i = 0; i < NBUFFERS; ++i) {
        b[i] = allocate_buffer(sizes[i]);
        if (!b[i]) { puts("typedmat: allocation failed"); goto done; }
    }
    // The normal mixed entry updates its installed graph when the fixture changes.
    // Run each arm before either clock so no timed call constructs or edits a graph.
    int64_t times[2] = {0};
    for (int pass = 0; pass < 4; ++pass) {
        bool typed = (pass % 2 == 0) == (typed_first != 0);
        memset(b[typed ? TYPED : MIXED]->cells, typed ? 0xa5 : 0x5a, BYTES);
        int64_t begin = port_clock();
        bool ok = typed ? program->render(b[TYPED], b[WORK], &graph, b[SHADER], b[IDS], b[COLORS], 31, 25) == 1 :
            p4_candela_frame(b[MIXED]->cells, SIDE, fixture, weight, 31, 25);
        int64_t elapsed = port_clock() - begin;
        if (!ok) { puts("typedmat: frame rejected"); goto done; }
        if (pass >= 2) times[typed] = elapsed;
    }
    for (int i = 0; i < NBUFFERS; ++i) {
        if (b[i]->size != sizes[i] || b[i]->cells[sizes[i]] != 0xc35a) {
            puts("typedmat: buffer guard changed"); goto done;
        }
    }
    printf("TRMAT {\"fixture\":%d,\"weight\":%d,\"first\":%d,\"mixedUs\":%" PRId64
        ",\"typedUs\":%" PRId64 ",\"crc\":\"%08" PRIx32 "\",\"equal\":%d}\n",
        fixture, weight, typed_first, times[0], times[1],
        esp_rom_crc32_le(0, (uint8_t *)b[TYPED]->cells, BYTES),
        !memcmp(b[MIXED]->cells, b[TYPED]->cells, BYTES));
done:
    for (int i = 0; i < NBUFFERS; ++i) port_big_free(b[i]);
}

typedef struct { uint32_t size; uint16_t cells[SIDE]; } row16;
typedef struct { uint32_t size; uint16_t cells[2 * SIDE]; } color_row;
typedef struct { row16 ids, visible, shadow; color_row color; } phase_row;

static void measure_phases(int fixture, int weight, int material_first) {
    if (!load_once()) { puts("typedmat: could not load phase module"); return; }
    candela_graph graph = {.capacity = CANDELA_GRAPH_CELLS};
    if (program->build(&graph, fixture, weight) != 1 || !candela_validate(&graph)) {
        puts("typedmat: invalid phase graph"); return;
    }
    phase_row *rows = port_big_calloc(sizeof(*rows) * SIDE);
    buffer *work = allocate_buffer(2048), *shader = allocate_buffer(192);
    if (!rows || !work || !shader) { puts("typedmat: phase allocation failed"); goto done; }
    for (int y = 0; y < SIDE; ++y) {
        phase_row *r = rows + y;
        r->ids.size = r->visible.size = r->shadow.size = SIDE;
        r->color.size = 2 * SIDE;
        for (int phase = (y == 0 ? 0 : 1); phase <= 1; ++phase) {
            if (program->row_phase(work, &graph, (buffer *)&r->ids, (buffer *)&r->visible,
                    (buffer *)&r->shadow, y, phase) != 1) {
                puts("typedmat: visibility preparation failed"); goto done;
            }
        }
    }
    int64_t times[2] = {0};
    for (int pass = 0; pass < 4; ++pass) {
        bool material = (pass % 2 == 0) == (material_first != 0);
        int64_t start = port_clock();
        for (int y = 0; y < SIDE; ++y) {
            phase_row *r = rows + y;
            if (material) {
                if (program->shade(&graph, shader, (buffer *)&r->ids, y, (buffer *)&r->color) != SIDE) {
                    puts("typedmat: material row failed"); goto done;
                }
            } else if (program->row_phase(work, &graph, (buffer *)&r->ids, (buffer *)&r->visible,
                        (buffer *)&r->shadow, y, 2) != 1) {
                puts("typedmat: shadow row failed"); goto done;
            }
        }
        times[material] = port_clock() - start;
    }
    uint32_t shadow_crc = 0, color_crc = 0, shadow_count = 0;
    for (int y = 0; y < SIDE; ++y) {
        phase_row *r = rows + y;
        shadow_crc = esp_rom_crc32_le(shadow_crc, (uint8_t *)r->shadow.cells, sizeof(r->shadow.cells));
        color_crc = esp_rom_crc32_le(color_crc, (uint8_t *)r->color.cells, sizeof(r->color.cells));
        for (int x = 0; x < SIDE; ++x) shadow_count += r->shadow.cells[x];
    }
    printf("TRPHASE {\"fixture\":%d,\"weight\":%d,\"first\":%d,\"shadowUs\":%" PRId64
        ",\"materialUs\":%" PRId64 ",\"shadowCRC\":\"%08" PRIx32 "\",\"materialCRC\":\"%08" PRIx32
        "\",\"shadowPixels\":%" PRIu32 "}\n", fixture, weight, material_first, times[0], times[1],
        shadow_crc, color_crc, shadow_count);
done:
    port_big_free(shader); port_big_free(work); port_big_free(rows);
}

void p4_typed_ray_material_console(const char *args) {
    int fixture, weight, first;
    char tail;
    if (!strcmp(args, "drop")) {
        if (program) { esp_elf_deinit(&program->elf); port_big_free(program); program = NULL; }
        puts("typedmat: released");
    } else if (sscanf(args, "bench %d %d %d %c", &fixture, &weight, &first, &tail) == 3 &&
            fixture >= 0 && fixture <= 1 && weight >= 0 && weight <= 256 && (first == 0 || first == 1)) {
        measure(fixture, weight, first);
    } else if (sscanf(args, "phases %d %d %d %c", &fixture, &weight, &first, &tail) == 3 &&
            fixture >= 0 && fixture <= 1 && weight >= 0 && weight <= 256 && (first == 0 || first == 1)) {
        measure_phases(fixture, weight, first);
    } else puts("typedmat bench|phases FIXTURE WEIGHT FIRST | typedmat drop");
}
