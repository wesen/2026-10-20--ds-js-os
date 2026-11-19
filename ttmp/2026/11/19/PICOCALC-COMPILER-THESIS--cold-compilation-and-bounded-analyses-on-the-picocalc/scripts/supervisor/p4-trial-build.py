"""Stage four compiler configurations in a disposable copy of the firmware port."""
import shutil
import subprocess
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "representation"))
from variants import frontend, native, replace_once

root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
out = Path(sys.argv[1]).resolve()
out.mkdir()
(out / "ttmp").symlink_to(root / "ttmp")
osdir = out / "picocalc-os"
osdir.mkdir()
src = root / "picocalc-os"
for item in src.iterdir():
    if item.name != "port" and not item.name.startswith("build"):
        (osdir / item.name).symlink_to(item)
port = osdir / "port/esp32p4"
port.mkdir(parents=True)
original = src / "port/esp32p4"
for name in ["main","optional","managed_components","compiler"]:
    shutil.copytree(original / name, port / name, symlinks=True)
for item in original.iterdir():
    if item.is_file():
        shutil.copyfile(item, port / item.name)
main = port / "main"
shutil.copyfile(here / "p4-editor-trials.c", main / "editor_p4.c")
cmake = main / "CMakeLists.txt"
cfg = replace_once(cmake.read_text(), "PRIV_REQUIRES driver", "PRIV_REQUIRES mbedtls driver")
typed = main / "typed_p4.c"
core = typed.read_text()
front, back = [], []
entries = []
for name, rev, lane in [("original","dd69a81","bytes"), ("register","f0846ba","bytes"),
                         ("packed","f0846ba","packed"), ("stream","f0846ba","stream")]:
    for kind, transform, paths in [("wasm",frontend,front), ("rv32",native,back)]:
        source = subprocess.check_output(["git","-C",root,"show",f"{rev}:picocalc-os/compiler/typed-{kind}.js"],text=True)
        key = f"trials/{name}-{kind}.js"
        file = main / f"{name}-{kind}.js"
        file.write_text(transform(source,lane))
        paths.append(f'!strcmp(app, "{name}") ? "{key}" : ')
        entries.append(f'list(APPEND BUNDLE_EXTRA "{key}={file}")\nlist(APPEND BUNDLE_EXTRA_DEPS "{file}")')
for kind, pieces in [("wasm",front),("rv32",back)]:
    original_path = f'"typed/{kind}.js"'
    core = replace_once(core, "eval_file(ctx, " + original_path + ")", "eval_file(ctx, " + "".join(pieces) + original_path + ")")
typed.write_text(core)
line = "set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)"
cmake.write_text(replace_once(cfg,line,"\n".join(entries)+"\n"+line))
