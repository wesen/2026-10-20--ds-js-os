"""Stage an isolated IDF port and freeze selected compiler pairs; never edit production."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
CONTROL = "40bcf850a5809ef6d839127869faa952596ed157"


def replace(path, old, new):
    source = path.read_text()
    if source.count(old) != 1:
        raise ValueError(f"{path} does not have exactly one staging anchor {old!r}")
    path.write_text(source.replace(old, new))


def frozen(path):
    return subprocess.check_output(["git", "-C", REPO, "show", f"{CONTROL}:{path}"])


def stage(work, lanes):
    if not 2 <= len(lanes) <= 4 or len(set(lanes)) != len(lanes) or next(iter(lanes)) != "base":
        raise ValueError("use base first followed by one to three unique candidates")
    if any(not re.fullmatch("[a-z][a-z0-9_]{0,15}", name) for name in lanes):
        raise ValueError("lane names must be short lowercase identifiers")
    work.mkdir(parents=True, exist_ok=True)
    tree = work / "tree"
    tree.mkdir()
    (tree/"ttmp").symlink_to(REPO/"ttmp")
    osdir = tree/"picocalc-os"
    osdir.mkdir()
    source = REPO/"picocalc-os"
    for path in source.iterdir():
        if path.name != "port" and not path.name.startswith("build"):
            (osdir/path.name).symlink_to(path)
    port = osdir/"port/esp32p4"
    port.mkdir(parents=True)
    original = source/"port/esp32p4"
    for path in original.iterdir():
        if path.name in {"main", "optional", "compiler", "managed_components"}:
            shutil.copytree(path, port/path.name, symlinks=True)
        elif path.is_file():
            shutil.copyfile(path, port/path.name)
    main = port/"main"
    cmake = main/"CMakeLists.txt"
    replace(cmake, "PRIV_REQUIRES driver", "PRIV_REQUIRES mbedtls driver")
    bundle = []
    receipt = {}
    for name, directory in lanes.items():
        hashes = {}
        for field in ("wasm", "rv32"):
            path = work/"lanes"/name/"typed"/(field+".js")
            path.parent.mkdir(parents=True, exist_ok=True)
            baseline = frozen("picocalc-os/compiler/typed-"+field+".js")
            content = (directory/"typed"/(field+".js")).read_bytes() if directory else baseline
            if name == "base" and baseline != content:
                raise ValueError("base must be byte-identical to the frozen compiler")
            path.write_bytes(content)
            hashes[field] = hashlib.sha256(content).hexdigest()
            bundle += [f'list(APPEND BUNDLE_EXTRA "exp/{name}/{field}.js={path}")',
                       f'list(APPEND BUNDLE_EXTRA_DEPS "{path}")']
        receipt[name] = hashes
    (work/"lanes.json").write_text(json.dumps(receipt, indent=2)+"\n")
    marker = "set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)"
    bundle += ["target_sources(${COMPONENT_LIB} PRIVATE lab_trials.c lab_guest.S)",
               'set_source_files_properties(lab_trials.c PROPERTIES COMPILE_OPTIONS "-O2")']
    replace(cmake, marker, "\n".join(bundle)+"\n"+marker)
    replace(main/"typed_p4.c", '#include "quickjs.h"', '#include "quickjs.h"\nextern const char *lab_front, *lab_back;')
    for key, field in [("wasm", "front"), ("rv32", "back")]:
        replace(main/"typed_p4.c", f'eval_file(ctx, "typed/{key}.js")', f'eval_file(ctx, lab_{field})')
    replace(main/"editor_p4.c", "char *p4_editor_compile(", "char *lab_editor_compile(")
    with (main/"agenda_p4.c").open("a") as stream:
        stream.write("\nchar *lab_agenda_compile(size_t *length) { vtime_t start; return (char *)compile(false, length, &start); }\n")
    shutil.copyfile(HERE/"02-trials.c", main/"lab_trials.c")
    shutil.copyfile(source/"worlds/files/slots.h", main/"lab_files_abi.h")
    subprocess.run(["node", HERE/"03-oracle.mjs", work, "--guest"], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("lanes", nargs="+", help="name=path/to/dir with typed/{wasm,rv32}.js, or name=control")
    args = parser.parse_args()
    inputs = {}
    for item in args.lanes:
        name, value = item.split("=", 1)
        if name in inputs:
            parser.error("duplicate lane")
        inputs[name] = None if value == "control" else Path(value).resolve()
    stage(args.work.resolve(), inputs)
