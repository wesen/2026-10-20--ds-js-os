"""Build matched Editor firmware with one reproducible display time for pixel-exact checks."""
from pathlib import Path
import argparse
import subprocess

HERE = Path(__file__).resolve().parent
BUILDER, = HERE.parents[2].glob("18/PICOCALC-TYPED-WORLDS--*/scripts/03-build-editor-firmware.sh")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lane", type=Path)
    parser.add_argument("idf", type=Path)
    args = parser.parse_args()
    lane = args.lane.resolve()
    tree = lane / "checkout"
    port = tree / "picocalc-os/port/esp32p4/main/port_p4.c"
    if not (lane / "images/rv32/sdkconfig").exists():
        raise ValueError("build the normal firmware before applying the test clock")
    original = "int64_t port_wall_ms(void) {\n  struct timeval tv;"
    fixed = "int64_t port_wall_ms(void) {\n  return 1795147200000LL;  // Comparison fixture, 2026-11-20 04:00 UTC.\n  struct timeval tv;"
    contents = port.read_text()
    if fixed not in contents:
        if contents.count(original) != 1:
            raise ValueError("wall-clock provider changed")
        port.write_text(contents.replace(original, fixed))
    for target in ("wasm", "rv32"):
        output = lane / "fixed-wall" / target
        with (lane / (target + "-fixed-build.log")).open("wb") as log:
            subprocess.run(["bash", BUILDER, args.idf, lane / "build", lane / "sdkconfig", target, output],
                           cwd=tree, stdout=log, stderr=subprocess.STDOUT, check=True)
        for name in ("sdkconfig", "system.typed-editor.json", "partition-table.bin"):
            if (output / name).read_bytes() != (lane / "images" / target / name).read_bytes():
                raise ValueError(f"fixed clock changed {target} {name}")


if __name__ == "__main__":
    main()
