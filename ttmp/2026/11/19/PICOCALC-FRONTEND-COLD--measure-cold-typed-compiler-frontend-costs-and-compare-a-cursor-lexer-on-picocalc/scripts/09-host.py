"""Replay the oracle and compare clean frontend variants using vendored QuickJS."""
import argparse
import hashlib
from itertools import permutations
import json
from pathlib import Path
from statistics import median
import subprocess

HERE = Path(__file__).resolve().parent
VARIANTS = ("base", "cursor", "cursor_fresh")
APPS = ("files", "agenda", "editor")


def sha(bytes_):
    return hashlib.sha256(bytes_).hexdigest()


def run(*args):
    return subprocess.check_output(args)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--cc", default="cc")
    args = parser.parse_args()

    work = args.work.resolve()
    scratch = work / "host"
    scratch.mkdir(exist_ok=True)
    osdir = work / "tree/picocalc-os"
    reactors = work / "build/esp-idf/main"
    fixture = work / "quickjs-fixture.js"
    oracle = json.loads(run("node", HERE / "06-oracle.mjs", work, reactors, fixture))
    quickjs = osdir / "third_party/quickjs"
    runner = work / "front-quickjs"
    version = (quickjs / "VERSION").read_text().strip()
    sources = ("quickjs", "libregexp", "libunicode", "cutils", "dtoa")
    subprocess.run([
        args.cc, "-O2", "-fwrapv", "-fno-strict-aliasing", "-D_GNU_SOURCE",
        f'-DCONFIG_VERSION="{version}"', "-I", quickjs, HERE / "08-quickjs.c",
        *(quickjs / (source + ".c") for source in sources),
        "-lm", "-lpthread", "-ldl", "-o", runner,
    ], check=True)

    paths = {variant: work / "lanes" / variant for variant in VARIANTS}
    lex_receipt = {}
    for variant, lane in paths.items():
        output = scratch / (f"lex-{variant}.json")
        run(runner, "lex", lane / "typed/wasm.js", lane / "typed/rv32.js", fixture, output)
        lex_receipt[variant] = sha(output.read_bytes())
    assert len(set(lex_receipt.values())) == 1

    world = osdir / "worlds"
    agenda = scratch / "agenda.typed"
    agenda.write_bytes(b"\n".join((world / "agenda" / name).read_bytes() for name in ("reminder.typed", "entry.typed")))
    sources = {
        "files": (world / "files/files.typed", "files-reactor.elf", "files/compile.js", "compileFilesRv32"),
        "agenda": (agenda, "agenda-reactor.elf", "agenda/compile.js", "compileAgendaRv32"),
        "editor": (reactors / "editor.typed", "typed-world-reactor.elf", "typed/world.js", "compileTypedWorldRv32"),
    }
    timings = {}
    for app in APPS:
        source, reactor_file, linker, entry = sources[app]
        assert sha(source.read_bytes()) == oracle["inputs"][app]["sourceSha256"]
        reactor = reactors / reactor_file
        assert sha(reactor.read_bytes()) == oracle["inputs"][app]["reactorSha256"]
        rows = []
        for order in list(permutations(VARIANTS)) * 2:
            row = {"wall_us": {}, "cpu_us": {}}
            for variant in order:
                lane = paths[variant]
                output = scratch / f"{app}-{variant}.elf"
                times = run(runner, "compile", lane / "typed/wasm.js", lane / "typed/rv32.js",
                            lane / linker, source, reactor, entry, output)
                assert sha(output.read_bytes()) == oracle["outputs"][app][variant]["sha256"]
                row["wall_us"][variant], row["cpu_us"][variant] = map(int, times.split())
            rows.append({"order": order, **row})
        timings[app] = {"samples": rows}
        for field in ("wall_us", "cpu_us"):
            timings[app][field] = {
                "medians": {v: median(row[field][v] for row in rows) for v in VARIANTS},
                "paired_delta_medians": {
                    v: median(row[field][v] - row[field]["base"] for row in rows) for v in VARIANTS[1:]
                },
            }
    print(json.dumps({
        "note": "Host monotonic and process CPU times cover input reads and fresh QuickJS creation through teardown, excluding process launch and file write.",
        "quickjs": version, "cc": run(args.cc, "--version").decode().splitlines()[0],
        "lexical_cases": oracle["lexicalCases"], "compilation_cases": oracle["compilationCases"],
        "lexical_and_compiler_result_sha256": lex_receipt, "cold_run_times": timings,
    }, indent=2))


if __name__ == "__main__":
    main()
