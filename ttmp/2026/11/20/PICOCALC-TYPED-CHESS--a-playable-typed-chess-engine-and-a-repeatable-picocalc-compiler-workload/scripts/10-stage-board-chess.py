"""Build an isolated PicoCalc Chess measurement image without accessing a board."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]


def insert(path, anchor, replacement):
    source = path.read_text()
    if source.count(anchor) != 1:
        raise ValueError(f"observer anchor changed at {path}: {anchor}")
    path.write_text(source.replace(anchor, replacement))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--idf-export", type=Path, required=True)
    p.add_argument("--sdkconfig", type=Path,
                   default=REPO / "picocalc-os/port/esp32p4/sdkconfig.agent-elf")
    p.add_argument("--target", choices=("rv32", "wasm"), default="rv32")
    a = p.parse_args()
    work = a.output.resolve()
    work.mkdir(parents=True)
    checkout = work / "checkout"
    checkout.mkdir()
    cji = REPO / "cji"
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z", "picocalc-os", str(cji.relative_to(REPO))], cwd=REPO)
    for name in tracked.decode().strip("\0").split("\0"):
        origin = REPO / name
        dest = checkout / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origin, dest, follow_symlinks=False)
    os = checkout / "picocalc-os"
    kernel = os / "nucleus/kernel.c"
    shutil.copyfile(HERE / "09-chess-observer.inc", kernel.with_name("p4_chess_observer.inc"))
    insert(kernel, "static void run_segment(world_t *W, bool is_settle) {",
           '#include "p4_chess_observer.inc"\n\nstatic void run_segment(world_t *W, bool is_settle) {')
    insert(kernel, "  K.cur = W; K.seg_cost = 0; K.segments++;",
           "  chess_observe_begin(W, is_settle);\n  K.cur = W; K.seg_cost = 0; K.segments++;")
    insert(kernel, "  W->cpu_us += cost;", "  W->cpu_us += cost;\n  chess_observe_end(W, is_settle);")
    p4 = os / "port/esp32p4"
    insert(p4 / "main/main_p4.c", '  if (!strcmp(cmd, "stats")) kernel_stats_print();',
           '  if (!strcmp(cmd, "chessarm")) { extern void chess_observe_arm(void); chess_observe_arm(); }\n'
           '  else if (!strcmp(cmd, "stats")) kernel_stats_print();')
    if a.target == "wasm":
        reactor = os / "build/typed-world-reactor.wasm"
        reactor.parent.mkdir(exist_ok=True)
        shutil.copyfile(REPO / "picocalc-os/build/typed-world-reactor.wasm", reactor)

    config = work / "sdkconfig"
    shutil.copyfile(a.sdkconfig, config)
    build = work / "build"
    options = ["-D", f"SDKCONFIG={config}", "-D", "PICOCALC_TYPED_CHESS=ON",
               "-D", f"PICOCALC_RV32_CHESS={'ON' if a.target == 'rv32' else 'OFF'}",
               "-D", "PICOCALC_RV32_EDITOR=ON", "-D", "PICOCALC_RV32_FILES=ON",
               "-D", "PICOCALC_RV32_AGENDA=ON", "-D", "PICOCALC_DEVICE_COMPILER=ON",
               "-D", "PICOCALC_COMPILER_PROFILE=ON", "-D", "PICOCALC_AGENT_WIFI=OFF"]
    with (work / "build.log").open("wb") as log:
        subprocess.run(["bash", "-c", 'source "$1" && shift && exec idf.py "$@"', "chess",
                        str(a.idf_export.resolve()), "-C", str(p4), "-B", str(build), *options, "build"],
                       cwd=checkout, stdout=log, stderr=subprocess.STDOUT, check=True)

    main_dir = build / "esp-idf/main"
    source_dir = os / "worlds/chess"
    source = b"".join((source_dir / name).read_bytes() + b"\n"
                      for name in (source_dir / "source.list").read_text().splitlines())
    assert (main_dir / "chess.typed").read_bytes() == source
    manifest = main_dir / "system.typed-agenda.json"
    worlds = {x["name"]: x for x in json.loads(manifest.read_text())["worlds"]}
    assert worlds["chess"]["engine"] == ("native" if a.target == "rv32" else "wasm")
    assert worlds["chess"]["file"] == "chess/compiled.bin"
    assert {"chess", "editor", "files", "agenda"} <= worlds.keys()
    image = work / "image"
    image.mkdir()
    for item in (build / "picocalc-os-p4.bin", build / "partition_table/partition-table.bin", config, manifest):
        shutil.copyfile(item, image / item.name)
    def digest(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    reactor = (main_dir / "typed-world-reactor.elf" if a.target == "rv32"
               else os / "build/typed-world-reactor.wasm")
    compilers = ["typed-wasm.js", "typed-async.js", "typed-world.js"]
    if a.target == "rv32":
        compilers.append("typed-rv32.js")
    receipt = {"target": a.target, "sourceBytes": len(source), "sourceSha256": hashlib.sha256(source).hexdigest(),
               "firmwareSha256": digest(image / "picocalc-os-p4.bin"), "reactorSha256": digest(reactor),
               "compilerSha256": {name: digest(os / "compiler" / name) for name in compilers}}
    (image / "build.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
