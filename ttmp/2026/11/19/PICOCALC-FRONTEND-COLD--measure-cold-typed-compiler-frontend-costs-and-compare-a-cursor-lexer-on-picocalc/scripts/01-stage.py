"""Stage a pinned source snapshot with an optional disposable ESP32-P4 trial."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
BASE = "40bcf850a5809ef6d839127869faa952596ed157"
CJI = "ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji"

PHASES = (
    "read", "realm", "eval_wasm", "eval_rv32", "eval_linker", "args", "dispatch",
    "parse", "match", "token", "lower", "assemble", "link", "copy", "teardown",
)


def replace(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"expected exactly one occurrence of {old!r}")
    return source.replace(old, new)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def at_phase(source, anchor, phase):
    indentation = anchor[:len(anchor) - len(anchor.lstrip())]
    return replace(source, anchor, f"{indentation}frontPhase({PHASES.index(phase)});\n{anchor}")


def cursor_wasm(control, fresh=False):
    lexer = (HERE / "02-cursor.js.inc").read_text()
    helpers, scanner = lexer.split("\n    next() {", 1)
    begin = control.index("    next() {")
    end = control.index("\n    fail(message)", begin)
    legacy = control[begin:end].replace("    next() {", "    legacyNext() {", 1)
    source = control[:begin] + "    next() {" + scanner + "\n" + legacy + control[end:]
    source = replace(source, "class Lexer {", helpers + "\nclass Lexer {")
    token_anchor = "        this.offset = 0;\n        this.next();"
    if fresh:
        return replace(source, '''        this.token.at = start;
        this.token.value = source.slice(start, end);
        this.token.kind = kind;''',
            '        this.token = { at: start, value: source.slice(start, end), kind };')
    return replace(source, token_anchor,
                   "        this.offset = 0;\n        this.token = { at: 0, value: \"\", kind: \"eof\" };\n        this.next();")


def trace_wasm(source, cursor):
    source = replace(source, "    next() {", "    scanNext() {")
    source = replace(source, "    scanNext() {", '''    next() {
        frontPhase(8);
        this.scanNext();
        frontPhase(7);
    }

    scanNext() {''')
    if cursor:
        source = at_phase(source, "        this.token.at = start;", "token")
    # Charge the entire regexp match and trivia fallback to match, with
    # result destructuring and token creation in token handling.
    source = at_phase(source, "            const {id, int, str, op} = match.groups;", "token")
    source = replace(source, '''        this.token = { value: "", kind: "eof", at: this.offset };
        if (!/^''', '''        const at = this.offset;
        const invalid = !/^''')
    source = replace(source, '''.test(this.source.slice(this.offset))) {
            this.fail("invalid token");
        }''', '''.test(this.source.slice(at));
        frontPhase(9);
        this.token = { value: "", kind: "eof", at };
        if (invalid) this.fail("invalid token");''')
    return source


def trace_rv32(source):
    source = at_phase(source, "        // Buffered compilation checks the entire source before reporting a backend error.", "lower")
    source = replace(source, "        fn.code = null;", "        fn.code = null;\n        frontPhase(7);")
    source = at_phase(source, "    const {functions, records} = typedWasm.compileFunctions(", "parse")
    source = at_phase(source, "    let words = 0;", "assemble")
    source = at_phase(source, "    return {image, entries, records: layouts, relocations, importCount: imports.length,", "dispatch")
    source = replace(source, "function linkSlot(program, runtime, entries) {",
                     "function linkSlot(program, runtime, entries) {\n    frontPhase(12);")
    return at_phase(source, "    return bytes;", "dispatch")


def unpack(tree, paths):
    with subprocess.Popen(["git", "-C", REPO, "archive", BASE, *paths], stdout=subprocess.PIPE) as git:
        subprocess.run(["tar", "-xf", "-", "-C", tree], stdin=git.stdout, check=True)
        git.stdout.close()
        if git.wait():
            raise RuntimeError("could not unpack pinned production sources")


def stage_lanes(work, board_assets):
    work.mkdir(parents=True, exist_ok=True)
    tree = work / "tree"
    tree.mkdir()
    paths = ["picocalc-os"] if board_assets else [
        "picocalc-os/compiler", "picocalc-os/worlds", "picocalc-os/third_party/quickjs",
    ]
    if board_assets:
        paths.append(CJI)
    unpack(tree, paths)
    osdir = tree / "picocalc-os"
    compiler = osdir / "compiler"
    wasm = (compiler / "typed-wasm.js").read_text()
    rv32 = (compiler / "typed-rv32.js").read_text()
    cursor = cursor_wasm(wasm)
    variants = {
        "base": (wasm, rv32),
        "cursor": (cursor, rv32),
        "base_trace": (trace_wasm(wasm, False), trace_rv32(rv32)),
        "cursor_trace": (trace_wasm(cursor, True), trace_rv32(rv32)),
        "cursor_fresh": (cursor_wasm(wasm, fresh=True), rv32),
    }
    common = {
        "typed/world.js": compiler / "typed-world.js",
        "files/compile.js": osdir / "worlds/files/compile.js",
        "agenda/compile.js": osdir / "worlds/agenda/compile.js",
    }
    manifest = {}
    for name, (wasm, rv32) in variants.items():
        lane = work / "lanes" / name
        (lane / "typed").mkdir(parents=True)
        (lane / "typed/wasm.js").write_text(wasm)
        (lane / "typed/rv32.js").write_text(rv32)
        for path, linked in common.items():
            (lane / path).parent.mkdir(exist_ok=True)
            (lane / path).symlink_to(linked)
        manifest[name] = {path: digest(lane / path) for path in ("typed/wasm.js", "typed/rv32.js")}
    assert manifest["base"]["typed/wasm.js"] == digest(compiler / "typed-wasm.js")
    assert manifest["base"]["typed/rv32.js"] == digest(compiler / "typed-rv32.js")
    (work / "compilers.json").write_text(json.dumps({"revision": BASE, "variants": manifest}, indent=2) + "\n")
    return osdir


def trace_runtime(source):
    source = replace(source, '#include "quickjs.h"', '''#include "quickjs.h"

extern const char *front_wasm_path;
extern const char *front_rv32_path;
extern bool front_profile;''')
    # Make the phase count a compile-time constant in the allocator state.
    enum, rest = (HERE / "03-phases.c.inc").read_text().split("\n\n", 1)
    source = replace(source, "typedef struct {", enum + "\n\ntypedef struct {\n"
        "  bool trace;\n  unsigned phase;\n  vtime_t since, spent[FRONT_PHASE_COUNT];\n"
        "  size_t visits[FRONT_PHASE_COUNT], phase_peak[FRONT_PHASE_COUNT];")
    source = replace(source, "static void account(", rest + "\nstatic void account(")
    source = replace(source, "  if (heap->live > heap->peak)", '''  if (heap->trace && heap->live > heap->phase_peak[heap->phase])
    heap->phase_peak[heap->phase] = heap->live;
  if (heap->live > heap->peak)''')
    source = replace(source, "  compile_heap heap = {", '''  compile_heap heap = {
    .trace = front_profile, .phase = FRONT_READ, .since = started,
    .visits = {[FRONT_READ] = 1},''')
    source = replace(source, "  JSRuntime *rt = JS_NewRuntime2", "  front_enter(&heap, FRONT_REALM);\n  JSRuntime *rt = JS_NewRuntime2")
    source = replace(source, '''  if (!eval_file(ctx, "typed/wasm.js") ||
      (engine == ENG_NATIVE && !eval_file(ctx, "typed/rv32.js")) ||
      !eval_file(ctx, linker)) goto rejected;
  JSValue global''', '''  if (heap.trace) {
    JS_SetContextOpaque(ctx, &heap);
    JSValue phase_global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, phase_global, "frontPhase", JS_NewCFunction(ctx, front_phase, "frontPhase", 1));
    JS_FreeValue(ctx, phase_global);
  }
  front_enter(&heap, FRONT_EVAL_WASM);
  if (!eval_file(ctx, front_wasm_path)) goto rejected;
  front_enter(&heap, FRONT_EVAL_RV32);
  if (engine == ENG_NATIVE && !eval_file(ctx, front_rv32_path)) goto rejected;
  front_enter(&heap, FRONT_EVAL_LINKER);
  if (!eval_file(ctx, linker)) goto rejected;
  front_enter(&heap, FRONT_ARGS);
  JSValue global''')
    source = replace(source, "  if (ready) result = JS_Call", "  front_enter(&heap, FRONT_DISPATCH);\n  if (ready) result = JS_Call")
    source = replace(source, "  JS_FreeValue(ctx, args[2]);", "  front_enter(&heap, FRONT_COPY);\n  JS_FreeValue(ctx, args[2]);")
    source = replace(source, "done:\n", "done:\n  front_enter(&heap, FRONT_TEARDOWN);\n")
    source = replace(source, '  printf("%s compile source=', '''  vtime_t finished = port_clock();
  if (heap.trace) {
    heap.spent[heap.phase] += finished - heap.since;
    for (unsigned i = 0; i < FRONT_PHASE_COUNT; ++i) {
      printf("FRONTPHASE %s %u %zu %lld %zu\\n", app, i, heap.visits[i],
             (long long)heap.spent[i], heap.phase_peak[i]);
    }
  }
  printf("%s compile source=''')
    return replace(source, "(long long)(port_clock() - started)", "(long long)(finished - started)")


def stage_board(osdir, work, assets):
    port = osdir / "port/esp32p4"
    for file in ("sdkconfig.agent-elf", "dependencies.agent-elf.lock"):
        shutil.copyfile(assets / file, port / file)
    shutil.copytree(assets / "managed_components", port / "managed_components")
    main = port / "main"
    cmake = main / "CMakeLists.txt"
    source = replace(cmake.read_text(), "PRIV_REQUIRES driver", "PRIV_REQUIRES mbedtls driver")
    names = {
        "cursor.js": "cursor/typed/wasm.js",
        "base-trace.js": "base_trace/typed/wasm.js",
        "cursor-trace.js": "cursor_trace/typed/wasm.js",
        "rv32-trace.js": "base_trace/typed/rv32.js",
    }
    lines = ["target_sources(${COMPONENT_LIB} PRIVATE frontend_trials.c)"]
    for name, relative in names.items():
        bundled = work / "lanes" / relative
        lines += [f'list(APPEND BUNDLE_EXTRA "lab-frontend/{name}={bundled}")',
                  f'list(APPEND BUNDLE_EXTRA_DEPS "{bundled}")']
    marker = "set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)"
    cmake.write_text(replace(source, marker, "\n".join(lines) + "\n" + marker))
    path = main / "typed_p4.c"
    path.write_text(trace_runtime(path.read_text()))
    path = main / "editor_p4.c"
    path.write_text(replace(path.read_text(), "char *p4_editor_compile(", "char *front_editor_compile("))
    with (main / "agenda_p4.c").open("a") as file:
        file.write('''
char *front_agenda_compile(size_t *length) {
  vtime_t start;
  return (char *)compile(false, length, &start);
}
''')
    shutil.copyfile(HERE / "04-trials.c", main / "frontend_trials.c")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path, help="scratch directory without a tree or lanes subdirectory")
    parser.add_argument("--board-assets", type=Path, help="existing ESP32-P4 port with managed components and agent-elf sdkconfig")
    args = parser.parse_args()
    work = args.work.resolve()
    tree = stage_lanes(work, args.board_assets)
    if args.board_assets:
        stage_board(tree, work, args.board_assets)
