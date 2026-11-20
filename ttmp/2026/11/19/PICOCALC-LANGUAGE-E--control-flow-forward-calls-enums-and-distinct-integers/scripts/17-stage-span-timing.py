#!/usr/bin/env python3
"""Build shared allocator and profiling inputs for the isolated span timing study."""

import importlib.util
import shutil
import sys
from pathlib import Path

sys.dont_write_bytecode = True
here = Path(__file__).resolve().parent
work, lexical, allocator = map(Path, sys.argv[1:])
spec = importlib.util.spec_from_file_location("signature_experiment", here / "05-signature-reuse-experiment.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

native = (lexical / "scripts/03-native-qjs.c").read_text()
memory = allocator.read_text().split("typedef struct {", 1)[1].split("static double now_ms", 1)[0]
native = helper.change(native, "#include <stdio.h>", "#include <malloc.h>\n#include <stdio.h>")
native = helper.change(native, "static JSValue read_path", "typedef struct {" + memory + """
static Allocation observed = {.limit = 4 * 1024 * 1024};
static JSValue heap_peak(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    return JS_NewFloat64(ctx, (double)observed.peak);
}
static JSValue read_path""")
native = helper.change(native, "JSRuntime *rt=JS_NewRuntime();\n    JS_SetMemoryLimit(rt,4*1024*1024);", """
    const JSMallocFunctions mallocs = {tracked_malloc, tracked_free, tracked_realloc, tracked_usable};
    JSRuntime *rt = JS_NewRuntime2(&mallocs, &observed);""".strip())
native = helper.change(native, 'JS_SetPropertyStr(ctx,g,"cpuMs",JS_NewCFunction(ctx,cpu_ms,"cpuMs",0));',
    '''JS_SetPropertyStr(ctx,g,"cpuMs",JS_NewCFunction(ctx,cpu_ms,"cpuMs",0));
    JS_SetPropertyStr(ctx,g,"heapPeak",JS_NewCFunction(ctx,heap_peak,"heapPeak",0));''')
(work / "tracked-qjs.c").write_text(native)
(work / "before-load.js").write_text(
    "globalThis.__spanLoadStart = {cpu: cpuMs(), wall: Date.now()};\nglobalThis.__now = cpuMs;\n")

driver = (lexical / "scripts/06-measure-index.js").read_text()
driver = helper.change(driver, "const source = readText(sourcePath);", """const load = {
    cpu: cpuMs() - __spanLoadStart.cpu, wall: Date.now() - __spanLoadStart.wall,
};
const source = readText(sourcePath);""")
driver = helper.change(driver, "const before = cpuMs();", "const wallBefore = Date.now();\nconst before = cpuMs();")
driver = helper.change(driver, "print(JSON.stringify({app, engine, ms, bytes: bytes.length, layout}));",
    """print(JSON.stringify({app, engine, ms, wall: Date.now() - wallBefore, load, peak: heapPeak(),
        bytes: bytes.length, fields: layout?.totalFields, phases: globalThis.__signatureExperiment}));""")
(work / "timing.js").write_text(driver)

for lane in ("indexed", "indexed-prepass", "indexed-spans", "composed"):
    destination = work / (lane + "-profile")
    shutil.copytree(work / lane, destination)
    path = destination / "typed-async.js"
    path.write_text(helper.instrument_rewrite(path.read_text()))
