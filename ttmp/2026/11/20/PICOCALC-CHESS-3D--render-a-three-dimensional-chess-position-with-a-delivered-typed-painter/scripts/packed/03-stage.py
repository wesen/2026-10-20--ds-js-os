"""Stage the closed eight-buffer painter ABI and optional vector-path witness."""
import argparse
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = next(parent for parent in HERE.parents if (parent / ".git").exists())
PIE = next(HERE.parents[2].glob("PICOCALC-TYPED-PIE--*")) / "scripts"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("tree", type=Path)
parser.add_argument("arm", choices=["pie", "witness", "scalar", "paired"])
args = parser.parse_args()
tree = args.tree.resolve()
if tree == ROOT or ROOT.is_relative_to(tree):
    raise SystemExit("choose an isolated staging tree")
system = tree / "picocalc-os"


def replace(path, old, new):
    code = path.read_text()
    if code.count(old) != 1:
        raise ValueError(f"{path}: integration anchor changed")
    path.write_text(code.replace(old, new, 1))


subprocess.run(["python3", "-B", HERE.parent / "scene/stage.py", tree], check=True)
subprocess.run(["node", HERE / "01-source.mjs", system / "worlds/chess/painter.typed"], check=True)
emitter = system / "compiler/typed-rv32.js"
subprocess.run(["node", PIE / "03-compile.mjs", "stage", emitter], check=True)
paired = args.arm == "paired"
witness = args.arm in ("witness", "paired")
if witness:
    replace(emitter,
            "function prefix(code, instruction, diagnostics, portable) {",
            "function prefix(code, instruction, diagnostics, portable, latticeWitness) {")
    replace(emitter,
            "this.options.piePortable === true);",
            "this.options.piePortable === true, this.options.pieLatticeWitness === true);")
    replace(emitter, "    const loopWords = code.words.length - bodyStart;",
            """    const loopWords = code.words.length - bodyStart;
    // This witness is compiled only into the allowlisted lab module. The
    // normal PIE compiler and the corresponding raw images have no stamp.
    if (latticeWitness && !portable && code.program.name === "project" &&
        code.program.params.join(",") === "buffer,buffer,buffer,buffer,buffer,buffer,i32" &&
        plan.count === 6 && plan.outputs.length === 3 && plan.outputs[2].buffer === 5) {
        const skipWitness = {};
        code.load(T0, 4 * plan.count);
        code.constant(T1, 81);
        code.branch(1, T0, T1, skipWitness);
        code.load(T0, 4 * plan.outputs[2].buffer);
        code.load(T1, 0, T0);
        code.constant(T2, 82);
        code.branch(6, T1, T2, skipWitness);
        code.constant(T2, 0xabcd);
        code.store(T2, 4 + 2 * 81, T0, 1);
        code.mark(skipWitness);
    }""")

linker = system / "compiler/mobile-painter.js"
if paired:
    linker.write_text("""function linkMobilePainter(source, reactor, options) {
    const modes = [
        ["witness", {pie: true, pieLatticeWitness: true}],
        ["raw", {pie: true}],
        ["guarded", {piePortable: true}],
    ];
    let size = 0;
    const entries = Object.create(null);
    const pieces = [];
    for (const [name, mode] of modes) {
        const pieDiagnostics = [];
        const program = typedRv32.compile(source, [], 16384, {...options, ...mode, pieDiagnostics});
        const entry = program.signatures.find(fn => fn.name === "paintChess");
        if (!entry || entry.result !== "i32" ||
            entry.params.join(",") !== "buffer,buffer,buffer,buffer,buffer,buffer,buffer,buffer" ||
            program.importCount || program.relocations.length || program.asyncLayout ||
            pieDiagnostics.length !== 1 || pieDiagnostics[0].function !== "project" ||
            pieDiagnostics[0].lanes !== (name === "guarded" ? 1 : 8))
            throw new SyntaxError("unexpected closed packed-scene image");
        entries[name] = size + program.entries.paintChess;
        pieces.push(program.image);
        size += program.image.length;
    }
    // Closed RV32 modules use PC-relative internal branches and calls.
    const image = new Uint8Array(size);
    let at = 0;
    for (const bytes of pieces) {
        image.set(bytes, at);
        at += bytes.length;
    }
    return typedRv32.linkSlot({image, entries, importCount: 0, relocations: []}, reactor,
        modes.map(([name]) => name));
}
""")
else:
    replace(linker,
            "    const program = typedRv32.compile(source, [], 16384, options);",
            f"""    const pieDiagnostics = [];
        const program = typedRv32.compile(source, [], 16384, {{...options, pie: {str(args.arm != 'scalar').lower()},
            pieLatticeWitness: {str(witness).lower()}, pieDiagnostics}});
        if (pieDiagnostics.length !== {int(args.arm != 'scalar')} || pieDiagnostics.some(fn => fn.function !== "project" || fn.lanes !== 8))
            throw new SyntaxError("unexpected packed scene compiler target");""")
    replace(linker,
            'entry.params.join(",") !== "buffer,buffer"',
            'entry.params.join(",") !== "buffer,buffer,buffer,buffer,buffer,buffer,buffer,buffer"')
    replace(linker, "paintChess(buffer, buffer): i32", "eight-buffer paintChess entry")

wrapper = system / "port/esp32p4/main/mobile_painter_p4.c"
replace(wrapper,
        '#include "p4.h"',
        '''#include "p4.h"
#include "esp_heap_caps.h"

#include <inttypes.h>

static uint32_t packed_trial_hash(const void *bytes, size_t length) {
  const uint8_t *p = bytes;
  uint32_t hash = UINT32_C(2166136261);
  for (size_t i = 0; i < length; ++i) hash = (hash ^ p[i]) * UINT32_C(16777619);
  return hash;
}''')
replace(wrapper,
        "typedef int (*paint_entry)(const void *state, void *out);",
        '''typedef int (*paint_entry)(const void *state, void *out,
                           void *xs, void *ys, void *zs, void *sx, void *sy, void *depth);

enum { LATTICE_CHANNELS = 6, LATTICE_VERTICES = 81, LATTICE_CAPACITY = 82 };
typedef struct {
  uint32_t pad[3];
  uint32_t capacity;
  uint16_t cells[88];
} lattice_buffer;
_Static_assert(offsetof(lattice_buffer, capacity) == 12, "normal capacity immediately before payload");
_Static_assert(offsetof(lattice_buffer, cells) == 16, "PIE payload starts aligned");
_Static_assert(sizeof(lattice_buffer) == 192, "PIE scratch stride");''')
replace(wrapper, "  draw_buffer draw;", "  draw_buffer draw;\n  lattice_buffer *lattice;")
replace(wrapper,
        "  free(reactor);",
        f'''  if (image.bytes)
    printf("chess3d-packed-target={args.arm} source-bytes=%zu source-fnv=%08" PRIx32
           " linked-bytes=%zu linked-fnv=%08" PRIx32 "\\n", length,
           packed_trial_hash(source, length), image.length, packed_trial_hash(image.bytes, image.length));
  free(reactor);''')
replace(wrapper,
        "  painter->draw.capacity = MOBILE_PAINTER_MAX_WORDS;",
        '''  painter->lattice = heap_caps_aligned_alloc(16, LATTICE_CHANNELS * sizeof(*painter->lattice),
                                               MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
  if (!painter->lattice) {
    mobile_painter_free(painter);
    return NULL;
  }
  for (unsigned i = 0; i < LATTICE_CHANNELS; ++i) painter->lattice[i].capacity = LATTICE_CAPACITY;
  painter->draw.capacity = MOBILE_PAINTER_MAX_WORDS;''')
replace(wrapper,
        "  esp_elf_deinit(&painter->module);",
        "  heap_caps_free(painter->lattice);\n  esp_elf_deinit(&painter->module);")
replace(wrapper,
        '''  vtime_t started = port_clock();
  int count = painter->entry(&input, &painter->draw);
  if (native_us) *native_us = port_clock() - started;''',
        f'''  lattice_buffer *lattice = painter->lattice;
  for (unsigned i = 0; i < LATTICE_CHANNELS; ++i)
    if ((uintptr_t)lattice[i].cells % 16 || lattice[i].capacity != LATTICE_CAPACITY) return -1;
  lattice[1].cells[LATTICE_VERTICES] = 5;
  lattice[5].cells[LATTICE_VERTICES] = 0;
  vtime_t started = port_clock();
  int count = painter->entry(&input, &painter->draw,
                             &lattice[0].capacity, &lattice[1].capacity, &lattice[2].capacity,
                             &lattice[3].capacity, &lattice[4].capacity, &lattice[5].capacity);
  if (native_us) *native_us = port_clock() - started;
  const unsigned stamp = lattice[5].cells[LATTICE_VERTICES];
  uint32_t draw_hash = count > 0 && count <= MOBILE_PAINTER_MAX_WORDS
      ? packed_trial_hash(painter->draw.words, (size_t)count * sizeof(painter->draw.words[0])) : 0;
  printf("chess3d-packed-arm={args.arm} cursor=%u count=%d stride=%u capacity=%u witness=%04x"
         " draw-fnv=%08" PRIx32 "\\n",
         (unsigned)input.cells[72], count, (unsigned)sizeof(*lattice), (unsigned)lattice[5].capacity, stamp, draw_hash);
  if (stamp != {"0xabcd" if witness else "0"}) return -1;''')

slot = wrapper.with_name("mobile_painter_slot.c")
entry_declaration = "(const void *state, void *out, void *xs, void *ys, void *zs, void *sx, void *sy, void *depth)"
replace(slot, "typedef int (*paint_entry)(const void *state, void *out);",
        f"typedef int (*paint_entry){entry_declaration};")
replace(slot, "int mobile_painter_generated(const void *state, void *out);",
        f"int mobile_painter_generated{entry_declaration};")

if paired:
    extra_entries = ("raw", "guarded")
    app_main = '__attribute__((visibility("default"))) int app_main(int argc, char **argv) {'
    replace(slot, app_main,
            "\n".join(f'__attribute__((visibility("hidden"))) int mobile_painter_{name}{entry_declaration};'
                      for name in extra_entries) + "\n\n" + app_main)
    replace(slot, "argc != 1 || !argv || !argv[0]", "argc != 3 || !argv || !argv[0] || !argv[1] || !argv[2]")
    replace(slot, "  return 0;",
            "".join(f"  *(paint_entry *)argv[{i}] = mobile_painter_{name};\n"
                    for i, name in enumerate(extra_entries, 1)) + "  return 0;")
    asm = slot.with_suffix(".S")
    replace(asm, ".word .Lend-.Lslot, 1", ".word .Lend-.Lslot, 3")
    replace(asm, "    .space 16384 - (.-.Lslot)",
            """    .global mobile_painter_raw, mobile_painter_guarded
    .hidden mobile_painter_raw, mobile_painter_guarded
    .type mobile_painter_raw,@function
mobile_painter_raw:
    .word 0x00100073
    .type mobile_painter_guarded,@function
mobile_painter_guarded:
    .word 0x00100073
    .space 49152 - (.-.Lslot)""")
    replace(wrapper, '#include "esp_heap_caps.h"', '#include "esp_heap_caps.h"\n#include "esp_cpu.h"')
    replace(wrapper, "  paint_entry entry;", "  paint_entry entry, raw, guarded;")
    replace(wrapper,
            "    char *args[] = {(char *)&painter->entry};\n    rc = esp_elf_request(&painter->module, 0, 1, args);",
            """    char *args[] = {(char *)&painter->entry, (char *)&painter->raw, (char *)&painter->guarded};
    rc = esp_elf_request(&painter->module, 0, 3, args);""")
    replace(wrapper, "  if (rc || !painter->entry) {", "  if (rc || !painter->entry || !painter->raw || !painter->guarded) {")
    replace(wrapper, ".duration_us = 8000000", ".duration_us = 14000000")

    benchmark = (HERE / "benchmark.inc").read_text()
    wrapper.write_text(wrapper.read_text() + "\n" + benchmark)
    private_header = wrapper.with_suffix(".h")
    private_header.write_text(private_header.read_text() + """
void mobile_painter_benchmark(mobile_painter *painter, const uint16_t cells[MOBILE_PAINTER_STATE_CELLS]);
""")
    service = wrapper.with_name("painter_service.c")
    replace(service, "#include <stdlib.h>", "#include <stdlib.h>\n#include <stdatomic.h>")
    replace(service, "static unsigned sources, compiles, packets, calls, paints, rejects;",
            """static unsigned sources, compiles, packets, calls, paints, rejects;
static atomic_bool benchmark_requested;

void p4_painter_benchmark_request(void) {
  atomic_store(&benchmark_requested, true);
}""")
    replace(service, "void p4_painter_poll(void) {",
            """void p4_painter_poll(void) {
  if (atomic_exchange(&benchmark_requested, false)) {
    if (authorized && have_state && program) mobile_painter_benchmark(program, state);
    else printf("chess3d-paired unavailable\\n");
  }""")
    service_header = service.with_suffix(".h")
    service_header.write_text(service_header.read_text() + "\nvoid p4_painter_benchmark_request(void);\n")
    console = wrapper.with_name("main_p4.c")
    replace(console, '  else if (!strcmp(cmd, "painter")) p4_painter_status();',
            '''  else if (!strcmp(cmd, "painter")) p4_painter_status();
  else if (!strcmp(cmd, "chesspacked")) p4_painter_benchmark_request();''')
