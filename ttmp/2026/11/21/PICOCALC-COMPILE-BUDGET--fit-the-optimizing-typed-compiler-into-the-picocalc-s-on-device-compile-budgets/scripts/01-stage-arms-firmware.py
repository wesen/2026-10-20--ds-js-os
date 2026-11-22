"""Build a measurement copy of the playable firmware that compiles each boot world under every arm.

usage (repo root):
    python3 01-stage-arms-firmware.py --output DIR --idf-export EXPORT.sh --arms ARMS.json \
        [--pick stock,step6,...] [--rounds 2]

The tracked picocalc-os and cji files are copied to DIR/checkout; the shared tree is not
touched, so the compiler can be edited while this builds. In the copy, p4_typed_compile in
port/esp32p4/main/typed_p4.c becomes a wrapper: for files, agenda, editor and chess it first
compiles the world's real bundle source under each picked arm (the options object is passed as
the entry's third argument), rounds times, reversing the arm order on odd rounds, and prints

    CCARM {"app":..,"round":..,"arm":..,"status":"ok"|"failed","us":..,"peak":..,"bytes":..,"fnv":..}

for each compile, then performs the world's normal compile (no options: the compiler default).
"us" is wall time of one QuickJS runtime from creation to teardown, the same span the firmware's
own "compile source=..." line reports; "peak" is the compiler heap's high-water mark. Every
compile in this image gets a 60 s deadline in place of the 1.7 s / 6 s budgets, so slow arms
finish and the default compile completes; the image is for measurement only. The heap limits
are unchanged, so an arm that needs more heap than its world allows reports "failed".
Builds the playable configuration (16-build-playable-firmware.sh's flags).
"""
import argparse, hashlib, json, shutil, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]


def patch(path, old, new):
    text = path.read_text()
    if text.count(old) != 1:
        raise ValueError(f"anchor changed in {path}: {old[:60]}")
    path.write_text(text.replace(old, new))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--idf-export", type=Path, required=True)
    p.add_argument("--arms", type=Path, required=True)
    p.add_argument("--pick", default="stock,step6,step7,step8,step11,step13")
    p.add_argument("--rounds", type=int, default=2)
    p.add_argument("--rebuild", action="store_true",
                   help="reuse OUTPUT: recopy the tracked files over its checkout (copy2 keeps the mtimes of unchanged "
                        "files) and rebuild its build tree incrementally")
    a = p.parse_args()
    arms = json.loads(a.arms.read_text())
    names = a.pick.split(",")
    work = a.output.resolve()
    work.mkdir(parents=True, exist_ok=a.rebuild)
    checkout = work / "checkout"
    tracked = subprocess.check_output(["git", "ls-files", "-z", "picocalc-os", "cji"], cwd=REPO)
    for name in tracked.decode().strip("\0").split("\0"):
        dest = checkout / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / name, dest, follow_symlinks=False)
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    dirty = subprocess.run(["git", "diff", "--quiet", "HEAD", "--", "picocalc-os", "cji"], cwd=REPO).returncode != 0
    os_dir = checkout / "picocalc-os"
    main_dir = os_dir / "port/esp32p4/main"
    typed = main_dir / "typed_p4.c"
    patch(typed, '#include "quickjs.h"\n', '#include "quickjs.h"\n#include "freertos/FreeRTOS.h"\n#include "freertos/task.h"\n')
    patch(typed, "char *p4_typed_compile(const char *app, const char *source_kind, const char *source,\n"
                 "                       size_t source_length, const char *linker, const char *entry, int engine,\n"
                 "                       const char *reactor, size_t reactor_length, size_t *length, vtime_t started,\n"
                 "                       const p4_compile_limits *limits) {",
          "static char *typed_compile_once(const char *app, const char *source_kind, const char *source,\n"
          "                       size_t source_length, const char *linker, const char *entry, int engine,\n"
          "                       const char *reactor, size_t reactor_length, size_t *length, vtime_t started,\n"
          "                       const p4_compile_limits *limits, const char *arm, size_t *peak,\n"
          "                       vtime_t *evaluated) {")
    patch(typed, "      !eval_file(ctx, linker)) goto rejected;\n",
          "      !eval_file(ctx, linker)) goto rejected;\n  if (evaluated) *evaluated = port_clock();\n")
    patch(typed, "    .deadline = started + (limits ? limits->duration_us : COMPILER_US),",
          "    .deadline = started + 60000000,  /* COMPILE-BUDGET measurement image */")
    patch(typed, "  if (ready) result = JS_Call(ctx, function, JS_UNDEFINED, argc, args);",
          "  if (ready && arm) {\n"
          "    JS_FreeValue(ctx, args[2]);\n"
          "    args[2] = JS_ParseJSON(ctx, arm, strlen(arm), \"<arm>\");\n"
          "    ready = !JS_IsException(args[2]);\n"
          "    argc = 3;\n"
          "  }\n"
          "  if (ready) result = JS_Call(ctx, function, JS_UNDEFINED, argc, args);")
    patch(typed, "         (long long)(port_clock() - started), heap.peak, module ? *length : 0);\n  return module;\n}",
          "         (long long)(port_clock() - started), heap.peak, module ? *length : 0);\n"
          "  if (peak) *peak = heap.peak;\n  return module;\n}\n")
    table = ",\n".join("  " + json.dumps(json.dumps(arms[n], separators=(",", ":"))) for n in names)
    labels = ", ".join(json.dumps(n) for n in names)
    typed.write_text(typed.read_text() + f"""
/* COMPILE-BUDGET: every picked arm, then the world's own compile. */
static const char *const ccarm_options[] = {{
{table}
}};
static const char *const ccarm_names[] = {{{labels}}};
#define CCARM_N (sizeof(ccarm_options) / sizeof(*ccarm_options))
#define CCARM_ROUNDS {a.rounds}

char *p4_typed_compile(const char *app, const char *source_kind, const char *source,
                       size_t source_length, const char *linker, const char *entry, int engine,
                       const char *reactor, size_t reactor_length, size_t *length, vtime_t started,
                       const p4_compile_limits *limits) {{
  if (engine == ENG_NATIVE && (!strcmp(app, "files") || !strcmp(app, "agenda") ||
                               !strcmp(app, "editor") || !strcmp(app, "chess"))) {{
    for (int round = 0; round < CCARM_ROUNDS; round++)
      for (size_t i = 0; i < CCARM_N; i++) {{
        size_t k = round % 2 ? CCARM_N - 1 - i : i, bytes = 0, peak = 0;
        vtime_t t0 = port_clock(), evaluated = t0;
        char *module = typed_compile_once(app, source_kind, source, source_length, linker, entry, engine,
                                          reactor, reactor_length, &bytes, t0, limits, ccarm_options[k], &peak,
                                          &evaluated);
        long long us = (long long)(port_clock() - t0), eval_us = (long long)(evaluated - t0);
        uint32_t fnv = 2166136261u;
        for (size_t j = 0; module && j < bytes; j++) fnv = (fnv ^ (uint8_t)module[j]) * 16777619u;
        printf("CCARM {{\\"app\\":\\"%s\\",\\"round\\":%d,\\"arm\\":\\"%s\\",\\"status\\":\\"%s\\",\\"us\\":%lld,"
               "\\"evalUs\\":%lld,\\"peak\\":%u,\\"bytes\\":%u,\\"fnv\\":\\"%08x\\"}}\\n", app, round, ccarm_names[k],
               module ? "ok" : "failed", us, eval_us, (unsigned)peak, (unsigned)(module ? bytes : 0), (unsigned)fnv);
        free(module);
        vTaskDelay(1);
      }}
  }}
  /* The arms ran after the caller's start time; the world's own compile gets its own clock. */
  return typed_compile_once(app, source_kind, source, source_length, linker, entry, engine,
                            reactor, reactor_length, length, port_clock(), limits, NULL, NULL, NULL);
}}
""")
    shutil.copyfile(REPO / "picocalc-os/port/esp32p4/sdkconfig.agent-elf", work / "sdkconfig")  # not tracked
    flags = ["-D", f"SDKCONFIG={work / 'sdkconfig'}", "-D", "PICOCALC_HEADLESS=OFF", "-D", "PICOCALC_DEVICE_COMPILER=ON",
             "-D", "PICOCALC_RV32_CHESS=ON", "-D", "PICOCALC_RV32_AGENDA=ON", "-D", "PICOCALC_RV32_EDITOR=ON",
             "-D", "PICOCALC_RV32_FILES=ON", "-D", "PICOCALC_RV32_STREAM_FUNCTIONS=ON", "-D", "PICOCALC_AGENT_WIFI=OFF"]
    with (work / "build.log").open("wb") as log:
        subprocess.run(["bash", "-c", 'source "$1" && shift && exec idf.py "$@"', "arms", str(a.idf_export.resolve()),
                        "-C", str(os_dir / "port/esp32p4"), "-B", str(work / "build"), *flags, "build"],
                       cwd=checkout, stdout=log, stderr=subprocess.STDOUT, check=True)
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    receipt = {"revision": revision, "dirty": dirty, "arms": names, "rounds": a.rounds,
               "armOptions": {n: arms[n] for n in names},
               "firmwareSha256": digest(work / "build/picocalc-os-p4.bin"),
               "compilerSha256": {n: digest(os_dir / "compiler" / n) for n in
                                  ["typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-world.js"]}}
    (work / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
