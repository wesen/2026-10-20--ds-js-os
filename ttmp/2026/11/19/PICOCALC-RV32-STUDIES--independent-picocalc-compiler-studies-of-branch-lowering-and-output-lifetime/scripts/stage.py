"""Stage independent frozen compiler variants and a paired machine-code probe in a private IDF tree."""
import argparse
import shutil
import subprocess
from pathlib import Path

here = Path(__file__).resolve().parent
day = here.parent.parent
repo = day.parents[3]
def ticket(key):
    only, = day.glob(key + "--*")
    return only
def replace(source, old, new):
    assert source.count(old) == 1, old
    return source.replace(old, new)
def call(*args):
    subprocess.run(args, check=True)

arg = argparse.ArgumentParser(description=__doc__)
arg.add_argument("work", type=Path)
work = arg.parse_args().work.resolve()
tree = work / "tree"
tree.mkdir()
(tree / "ttmp").symlink_to(repo / "ttmp")
osdir = tree / "picocalc-os"
osdir.mkdir()
for path in (repo / "picocalc-os").iterdir():
    if path.name != "port" and not path.name.startswith("build"):
        (osdir / path.name).symlink_to(path)
port = osdir / "port/esp32p4"
port.mkdir(parents=True)
original = repo / "picocalc-os/port/esp32p4"
for name in ["main", "optional", "managed_components", "compiler"]:
    shutil.copytree(original / name, port / name, symlinks=True)
for path in original.iterdir():
    if path.is_file():
        shutil.copyfile(path, port / path.name)
main = port / "main"
branch = ticket("PICOCALC-RV32-BRANCH") / "scripts/01-construct.sh"
output = ticket("PICOCALC-RV32-OUTPUT") / "scripts/01-prepare.py"
call("bash", branch, work / "branch")
entries = []
for lane, mode, profile in [("base","baseline",False),("branch",None,False),("compact","compact",False),
                            ("direct","direct",False),("pb","baseline",True),("pd","direct",True)]:
    dest = work / "lanes" / lane
    if mode:
        call("python3", output, "--mode", mode, "--out", dest, *(["--profile"] if profile else []))
    else:
        shutil.copytree(work / "branch/candidate", dest)
    for name in ("wasm","rv32","world"):
        js = dest / f"typed/{name}.js"
        entries.append(f'list(APPEND BUNDLE_EXTRA "labs/{lane}/{name}.js={js}")\nlist(APPEND BUNDLE_EXTRA_DEPS "{js}")')
        if lane == "base":
            assert js.read_bytes() == (work / f"branch/baseline/typed/{name}.js").read_bytes()

prior = ticket("PICOCALC-COMPILER-INTEGRATION") / "scripts/files-compare-p4"
probe = main / "lab"
probe.mkdir()
(probe / "main").mkdir()
generator = (prior / "generate.mjs").read_text()
generator = replace(generator, 'import {writeFileSync}', 'import {readFileSync, writeFileSync}')
generator = replace(generator, 'git("show", rev + ":picocalc-os/" + path)', '''path.startsWith("compiler/") ? readFileSync(join(rev, "typed", path.slice(15))) : git("show", "6426798:picocalc-os/" + path)''')
generator = replace(generator, 'git("rev-parse", "--verify", ref + "^{commit}").toString().trim()', 'ref')
generator = replace(generator, 'meta: {revision, compiler', 'meta: {revision: compiler["compiler/typed-rv32.js"].slice(0, 16), compiler')
(probe / "generate.mjs").write_text(generator)
call("node", probe / "generate.mjs", work / "lanes/base", work / "lanes/branch", probe)
(probe / "main/measure.c").write_text(replace((prior / "main/measure.c").read_text(), "void app_main(void)", "void lab_files_probe(void)"))

corefile = main / "typed_p4.c"
core = replace(corefile.read_text(), 'if (!eval_file(ctx, "typed/wasm.js")', '''char front[64] = "typed/wasm.js", back[64] = "typed/rv32.js";
  if (!strncmp(linker, "labs/", 5)) {
    int prefix = (int)(strrchr(linker, '/') - linker);
    snprintf(front, sizeof(front), "%.*s/wasm.js", prefix, linker);
    snprintf(back, sizeof(back), "%.*s/rv32.js", prefix, linker);
  }
  if (!eval_file(ctx, front)''')
core = replace(core, 'eval_file(ctx, "typed/rv32.js")', 'eval_file(ctx, back)')
corefile.write_text(core)
profile = replace(core, 'vtime_t deadline;', '''vtime_t deadline, since, spent[12];
  size_t phase_peak[12], visits[12];
  unsigned phase;''')
profile = replace(profile, 'static void account', (here / "phase-hooks.c.inc").read_text() + '\nstatic void account')
profile = replace(profile, 'if (heap->live > heap->peak)', '''if (heap->live > heap->phase_peak[heap->phase]) heap->phase_peak[heap->phase] = heap->live;
  if (heap->live > heap->peak)''')
profile = replace(profile, 'char *p4_typed_compile(', 'char *p4_typed_compile_profile(')
profile = replace(profile, '.limit = limits ?', '.phase = 7, .since = started, .visits = {[7] = 1},\n    .limit = limits ?')
profile = replace(profile, 'char front[64]', '''JS_SetContextOpaque(ctx, &heap);
  JSValue phase_global = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, phase_global, "outputPhase", JS_NewCFunction(ctx, output_phase, "outputPhase", 1));
  JS_FreeValue(ctx, phase_global);
  switch_phase(&heap, 8);
  char front[64]''')
profile = replace(profile,'JSValue global =','switch_phase(&heap, 9);\n  JSValue global =')
profile = replace(profile,'if (ready) result =','switch_phase(&heap, 0);\n  if (ready) result =')
profile = replace(profile,'JS_FreeValue(ctx, args[2]);','switch_phase(&heap, 10);\n  JS_FreeValue(ctx, args[2]);')
profile = replace(profile,'done:\n','done:\n  switch_phase(&heap, 11);\n')
profile = replace(profile,'  return module;', '''  heap.spent[heap.phase] += port_clock() - heap.since;
  for (int i = 0; i < 12; ++i)
    printf("LABPHASE %s %d %zu %lld %zu\\n", app, i, heap.visits[i], (long long)heap.spent[i], heap.phase_peak[i]);
  return module;''')
(main / "typed_lab_profile.c").write_text(profile)
shutil.copyfile(here / "editor-trials.c", main / "editor_p4.c")
cmake = main / "CMakeLists.txt"
cfg = replace(cmake.read_text(), "PRIV_REQUIRES driver", "PRIV_REQUIRES mbedtls driver")
entries.append('target_sources(${COMPONENT_LIB} PRIVATE typed_lab_profile.c lab/main/measure.c lab/main/functions.S)')
entries.append('set_source_files_properties(lab/main/measure.c PROPERTIES COMPILE_OPTIONS "-O2")')
key = 'set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)'
cmake.write_text(replace(cfg, key, '\n'.join(entries) + '\n' + key))
