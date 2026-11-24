#!/usr/bin/env python3
"""Move the compile heap and the TYPEDCOMPILE record out of typed_p4.c (into typed_compile_heap.{h,c}, written by hand).

usage: 18-split-compile-heap.py

Checked edits of firmware/port/esp32p4/main/typed_p4.c: the block from the arena comment to compile_interrupt goes
(the new files hold it verbatim), the parked-arena loop, the refusal line and the TYPEDCOMPILE printing become calls,
and the includes the moved code alone needed go. Also adds the new file to the component's sources and to the
compiled-module cache's key (typed-apps.cmake: the compiler's C side), and drops typed_p4.c's file-length exception.
"""
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
P4 = REPO / "firmware/port/esp32p4/main/typed_p4.c"
CMAKE = REPO / "firmware/port/esp32p4/cmake/typed-apps.cmake"
EXCEPTIONS = REPO / "tools/file-length-exceptions.txt"


def cut(text, start, end):
    """Remove from the line starting with `start` through the line `end` (inclusive), each found exactly once."""
    assert text.count(start) == 1, start
    i = text.index(start)
    j = text.index(end, i)
    assert text.count(end) >= 1
    return text[:i] + text[j + len(end):]


def replace(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old, new)


text = P4.read_text()
text = cut(text, "// QuickJS keeps small objects in 4 KB arenas",
           "static int compile_interrupt(JSRuntime *rt, void *opaque) {\n"
           "  compile_heap *heap = opaque;\n"
           "  return port_clock() >= heap->deadline;\n"
           "}\n\n")
text = replace(text, '#include "typed_cache.h"\n', '#include "typed_cache.h"\n#include "typed_compile_heap.h"\n')
for include in ('#include "esp_cpu.h"\n', '#include "sdkconfig.h"\n'):
    text = replace(text, include, "")
text = replace(text, """  while (heap->parked_count) {   // the parked arenas: freed after the runtime, counted until now
    void *block = heap->parked[--heap->parked_count];
    heap->live -= port_heap_usable(block);
    port_heap_free(block);
  }
""", "  compile_heap_release(heap);\n")
text = replace(text, """  if (!module)   // why: the heap cap, PSRAM, or neither (a compile error, the deadline)
    printf("%s compile refused_over_limit=%u refused_no_psram=%u heap_limit=%zu psram_free=%zu psram_largest=%zu\\n", app,
           heap->over_limit, heap->no_psram, heap->limit, heap_caps_get_free_size(MALLOC_CAP_SPIRAM),
           heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM));
""", "  if (!module) compile_heap_print_refusals(app, heap);\n")
start = '  printf("TYPEDCOMPILE {'
end = '  printf("]}\\n");\n'
assert text.count(start) == 1 and text.count(end) == 1
i, j = text.index(start), text.index(end)
text = text[:i] + "  compile_state_print(app, &state);\n" + text[j + len(end):]
assert "heap_caps_" not in text or '#include "esp_heap_caps.h"' in text
P4.write_text(text)

cmake = CMAKE.read_text()
cmake = replace(cmake, "target_sources(${COMPONENT_LIB} PRIVATE typed_p4.c typed_lex_index.c",
                "target_sources(${COMPONENT_LIB} PRIVATE typed_p4.c typed_compile_heap.c typed_lex_index.c")
cmake = replace(cmake, "set(typed_native_files ${MAIN}/typed_lex_index.c ${MAIN}/typed_lex_index.h ${MAIN}/typed_p4.c\n",
                "set(typed_native_files ${MAIN}/typed_lex_index.c ${MAIN}/typed_lex_index.h ${MAIN}/typed_p4.c\n"
                "    ${MAIN}/typed_compile_heap.c ${MAIN}/typed_compile_heap.h\n")
CMAKE.write_text(cmake)

lines = EXCEPTIONS.read_text().splitlines(keepends=True)
kept = [line for line in lines if not line.startswith("firmware/port/esp32p4/main/typed_p4.c ")]
assert len(kept) == len(lines) - 1
EXCEPTIONS.write_text("".join(kept))
print("typed_p4.c:", len(text.splitlines()), "lines")
