#!/usr/bin/env python3
"""Stage and optionally build one native Editor compiler timeline using an existing matched lane."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
BUILDER, = (REPO / "ttmp/2026/11/18").glob("PICOCALC-TYPED-WORLDS--*/scripts/03-build-editor-firmware.sh")
PHASES = (
    "input", "context", "bundle_scripts", "eval_wasm", "eval_async", "eval_rv32", "eval_world",
    "arg_setup", "js_dispatch", "native_setup",
    "rewrite_gate", "rewrite_read_program", "rewrite_scan_operations", "rewrite_source_graph",
    "rewrite_analyze", "rewrite_allocate", "rewrite_text",
    "ordinary_signatures", "ordinary_emission", "native_lower", "ordinary_graph",
    "native_assembly", "world_validate", "native_link",
    "arg_release", "result_copy", "error", "teardown",
)
PINS = {
    "pre-g": "13575450d0cd405db2861a8e6e5fecbcbd9904d6",
    "g4": "2e4fee184dd56de92cc090d97128011acdc961c7",
}
PORT = Path("picocalc-os/port/esp32p4/main")
COMPILER = Path("picocalc-os/compiler")
SHARED_ELF = Path("esp-idf/main/typed-world-reactor.elf")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def replace(source, before, after):
    if source.count(before) != 1:
        raise ValueError(f"expected one instrumentation anchor: {before!r}")
    return source.replace(before, after, 1)


def mark_before(source, anchor, phase):
    spaces = anchor[:len(anchor) - len(anchor.lstrip())]
    return replace(source, anchor, f"{spaces}egCompilePhase?.({PHASES.index(phase)});\n" + anchor)


def add_marker(source):
    return replace(source, '"use strict";', '"use strict";\nconst egCompilePhase = globalThis.__egCompilePhase;')


def runtime(source, g4):
    source = replace(source, '#include "quickjs.h"', '#include "quickjs.h"\n#include "eg_compiler_phases.inc"')
    source = replace(source, '''static bool eval_file(JSContext *ctx, const char *path) {
  size_t length;''', '''static bool eval_file(JSContext *ctx, const char *path, eg_compile_phase *trace,
                      unsigned eval_phase) {
  eg_phase_switch(trace, EG_BUNDLE_SCRIPTS);
  size_t length;''')
    source = replace(source, "  JSValue value = JS_Eval(ctx, text, length, path, JS_EVAL_TYPE_GLOBAL);",
                     "  eg_phase_switch(trace, eval_phase);\n"
                     "  JSValue value = JS_Eval(ctx, text, length, path, JS_EVAL_TYPE_GLOBAL);")
    source = replace(source, "  JSRuntime *rt = JS_NewRuntime2(&compiler_allocator, &heap);", '''  eg_compile_phase trace = {
    .enabled = engine == ENG_NATIVE && !strcmp(app, "editor") && !strcmp(entry, "compileTypedWorldRv32"),
    .phase = EG_INPUT, .since = started, .visits = {[EG_INPUT] = 1},
  };
  eg_phase_switch(&trace, EG_CONTEXT);
  JSRuntime *rt = JS_NewRuntime2(&compiler_allocator, &heap);''')
    source = replace(source, "  if (!ctx) goto done;\n  if (!eval_file", '''  if (!ctx) goto done;
  if (trace.enabled) {
    JS_SetContextOpaque(ctx, &trace);
    JSValue marker_global = JS_GetGlobalObject(ctx);
    int installed = JS_SetPropertyStr(ctx, marker_global, "__egCompilePhase",
                                      JS_NewCFunction(ctx, eg_phase_marker, "__egCompilePhase", 1));
    JS_FreeValue(ctx, marker_global);
    if (installed < 0) goto rejected;
  }
  if (!eval_file''')
    for path, phase in [('"typed/wasm.js"', "WASM"), ('"typed/rv32.js"', "RV32"), ("linker", "WORLD")]:
        source = replace(source, f"eval_file(ctx, {path})", f"eval_file(ctx, {path}, &trace, EG_EVAL_{phase})")
    if g4:
        source = replace(source, 'eval_file(ctx, "typed/async.js")',
                         'eval_file(ctx, "typed/async.js", &trace, EG_EVAL_ASYNC)')
    source = replace(source, "  JSValue global = JS_GetGlobalObject(ctx);",
                     "  eg_phase_switch(&trace, EG_ARG_SETUP);\n  JSValue global = JS_GetGlobalObject(ctx);")
    source = replace(source, "  if (ready) result = JS_Call(ctx, function, JS_UNDEFINED, argc, args);",
                     "  eg_phase_switch(&trace, EG_JS_DISPATCH);\n"
                     "  if (ready) result = JS_Call(ctx, function, JS_UNDEFINED, argc, args);\n"
                     "  eg_phase_switch(&trace, EG_ARG_RELEASE);")
    source = replace(source, "  size_t offset = 0, size = 0, unit = 0, available = 0;",
                     "  eg_phase_switch(&trace, EG_RESULT_COPY);\n"
                     "  size_t offset = 0, size = 0, unit = 0, available = 0;")
    source = replace(source, "rejected:\n  {", "rejected:\n  eg_phase_switch(&trace, EG_ERROR);\n  {")
    source = replace(source, "done:\n  if (ctx)", "done:\n  eg_phase_switch(&trace, EG_TEARDOWN);\n  if (ctx)")
    source = replace(source, '  printf("%s compile source=',
                     '  vtime_t finished = port_clock();\n  printf("%s compile source=')
    return replace(source, "(long long)(port_clock() - started), heap.peak, module ? *length : 0);",
                   """(long long)(finished - started), heap.peak, module ? *length : 0);
  eg_phase_print(&trace, finished, finished - started, module != NULL,
                 heap.peak, module ? *length : 0);""")


def frontend(source, g4):
    source = add_marker(source)
    if g4:
        source = mark_before(source, "    const lowered = globalThis.typedAsync?.rewrite(source, imported);", "rewrite_gate")
    for anchor, phase in [
        ("    const lex = new Lexer(source);", "ordinary_signatures"),
        ("    const edges = functions.map(() => []);", "ordinary_emission"),
        ("    const order = checkAcyclic(functions, edges);", "ordinary_graph"),
    ]:
        source = mark_before(source, anchor, phase)
    return source


def continuations(source):
    source = add_marker(source)
    for anchor, phase in [
        ("    const program = readProgram(source, imports);", "rewrite_read_program"),
        ("    scanOperations(program);", "rewrite_scan_operations"),
        ("    assertAcyclic(program);", "rewrite_source_graph"),
        ("    analyze(program);", "rewrite_analyze"),
        ("    const allocation = allocate(program);", "rewrite_allocate"),
        ("    const writer = new GeneratedText(source);", "rewrite_text"),
    ]:
        source = mark_before(source, anchor, phase)
    return source


def native(source):
    source = add_marker(source)
    source = mark_before(source, "    const imported = imports.map((fn, index) => ({...fn, index}));", "native_setup")
    source = replace(source, "    function lower(fn) { code.push(new FunctionCode(fn, callables, targets).lower()); }",
                     f"""    function lower(fn) {{
        egCompilePhase?.({PHASES.index("native_lower")});
        code.push(new FunctionCode(fn, callables, targets).lower());
    }}""")
    source = replace(source, "        fn.code = null;",
                     f'        fn.code = null;\n        egCompilePhase?.({PHASES.index("ordinary_emission")});')
    source = mark_before(source, "    let words = 0;", "native_assembly")
    return mark_before(source, "    const magic = [0x4147454e, 0x44415256, 0x3332534c];", "native_link")


def world(source):
    source = add_marker(source)
    return mark_before(source, "        const event = Object.entries(program.records.WorldEvent ?? {});", "world_validate")


def git(rev, *args, cwd=REPO):
    return subprocess.check_output(["git", "-C", str(cwd), rev, *args])


def sources(pin, g4):
    transforms = {
        PORT / "typed_p4.c": lambda s: runtime(s, g4),
        COMPILER / "typed-wasm.js": lambda s: frontend(s, g4),
        COMPILER / "typed-rv32.js": native,
        COMPILER / "typed-world.js": world,
    }
    if g4:
        transforms[COMPILER / "typed-async.js"] = continuations
    original = {path: git("show", f"{pin}:{path}") for path in transforms}
    marked = {path: transforms[path](raw.decode()).encode() for path, raw in original.items()}
    include = (HERE / "20-compiler-phases.inc").read_text()
    marked[PORT / "eg_compiler_phases.inc"] = replace(
        include, "@PHASE_ENUM@", "\n".join(f"  EG_{phase.upper()}," for phase in PHASES)).encode()
    return original, marked


def build(lane, export, target, pin, original, marked):
    checkout = lane / "checkout"
    sdkconfig = lane / "sdkconfig"
    builddir = lane / "build"
    stock = lane / "observer/rv32"
    if git("rev-parse", "HEAD", cwd=checkout).decode().strip() != pin:
        raise ValueError(f"{checkout} does not match {pin}")
    if checkout.resolve().is_relative_to(REPO):
        raise ValueError("refusing to instrument a checkout inside production source")
    for name, raw in original.items():
        if (checkout / name).read_bytes() != raw:
            raise ValueError(f"cannot override modified source: {checkout / name}")
    for name in marked.keys() - original.keys():
        if (checkout / name).exists():
            raise ValueError(f"cannot override existing file: {checkout / name}")
    expected = stock / "picocalc-os-p4.bin"
    if not expected.is_file():
        raise ValueError(f"missing existing matched observer image: {expected}")
    before_reactor = sha((builddir / SHARED_ELF).read_bytes())
    target.mkdir(parents=True, exist_ok=True)
    try:
        for name, raw in marked.items():
            (checkout / name).write_bytes(raw)
        with (target / "build.log").open("wb") as log:
            subprocess.run(["bash", BUILDER, export, builddir, sdkconfig, "rv32", target],
                           cwd=checkout, stdout=log, stderr=subprocess.STDOUT, check=True)
        after_reactor = sha((builddir / SHARED_ELF).read_bytes())
        if after_reactor != before_reactor:
            raise ValueError("compiler probes changed the reactor ELF")
        for item in ("sdkconfig", "partition-table.bin", "system.typed-editor.json",
                     "system.typed-files.json", "system.typed-agenda.json"):
            if (stock / item).read_bytes() != (target / item).read_bytes():
                raise ValueError(f"compiler probes changed the matched firmware profile: {item}")
        image = (target / "picocalc-os-p4.bin").read_bytes()
        bundled = {str(name): sha(raw) for name, raw in marked.items() if name.suffix == ".js"}
        for name in bundled:
            if marked[Path(name)] not in image:
                raise ValueError(f"probe script is missing from firmware: {name}")
        if b"eg_compile_phase_v1 " not in image:
            raise ValueError("phase recorder is missing from firmware")
        manifests = ("system.typed-editor.json", "system.typed-files.json", "system.typed-agenda.json")
        return {
            "bundledProbeSha256": bundled,
            "compilerInputSha256": sha((builddir / "esp-idf/main/editor.typed").read_bytes()),
            "reactorSha256": after_reactor,
            "stockObserverFirmwareSha256": sha(expected.read_bytes()),
            "artifacts": {name: sha((target / name).read_bytes()) for name in
                          ("picocalc-os-p4.bin", "partition-table.bin", "sdkconfig", *manifests)},
        }
    finally:
        for name in marked:
            dest = checkout / name
            if name in original:
                dest.write_bytes(original[name])
            else:
                dest.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("variant", choices=PINS)
    parser.add_argument("output", type=Path, help="new output directory for staged sources and firmware")
    parser.add_argument("--lane", type=Path, help="existing matched isolated checkout and build cache")
    parser.add_argument("--idf-export", type=Path)
    args = parser.parse_args()
    if (args.lane is None) != (args.idf_export is None):
        parser.error("provide both --lane and --idf-export to build")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    pin = PINS[args.variant]
    original, marked = sources(pin, args.variant == "g4")
    for name, raw in marked.items():
        staged = output / "sources" / name
        staged.parent.mkdir(parents=True, exist_ok=True)
        staged.write_bytes(raw)
    firmware = None
    if args.lane:
        firmware = build(args.lane.resolve(), args.idf_export.resolve(), output / "rv32", pin, original, marked)
    receipt = {
        "variant": args.variant, "revision": pin, "phases": PHASES,
        "sourceSha256": {str(name): sha(raw) for name, raw in marked.items()},
        "firmware": firmware,
    }
    (output / "manifest.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(output / "manifest.json")


if __name__ == "__main__":
    main()
