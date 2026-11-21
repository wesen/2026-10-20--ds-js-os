#!/usr/bin/env python3
"""Drive the RGB565 simulator with keys and compare its panel crop to the C reference."""
import argparse
import ctypes
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

SIDE = 160
VIEW = (40, 32, 280, 272)
SCENES = {
    "start": (68, 61, 31, 25),
    "sphere": (76, 61, 31, 25),
    "light": (76, 61, 31, 17),
    "reset": (68, 61, 31, 25),
}


class Scene(ctypes.Structure):
    _fields_ = [(name, ctypes.c_int) for name in ("sphere_x", "sphere_y", "light_x", "light_y")]


def reference(render, scene):
    pixels = (ctypes.c_uint16 * (SIDE * SIDE))()
    if not render(pixels, SIDE, ctypes.byref(Scene(*scene)), 0, None):
        raise ValueError(f"reference rejected {scene}")
    return [pixels[(2 * y // 3) * SIDE + 2 * x // 3] for y in range(240) for x in range(240)]


def capture(output, name):
    with Image.open(output / f"raytrace-{name}.png") as image:
        if image.size != (320, 320):
            raise ValueError(f"{name} capture dimensions {image.size}")
        return image.convert("RGB")


def check(repo, output, work):
    os_dir = repo / "picocalc-os"
    subprocess.run(["make", "-s", "-j4"], cwd=os_dir, check=True)
    subprocess.run(["./build/picocalc-host", "-o", str(output), "-u", str(work / "uart.log"),
                    "-s", str(work / "store"), "scripts/raytrace.txt"], cwd=os_dir, check=True)
    library = work / "reference.so"
    subprocess.run(["cc", "-std=c11", "-O2", "-shared", "-fPIC", "nucleus/raytrace_demo.c", "-o", str(library)],
                   cwd=os_dir, check=True)
    render = ctypes.CDLL(str(library)).raytrace_demo_render
    render.argtypes = [ctypes.POINTER(ctypes.c_uint16), ctypes.c_size_t, ctypes.POINTER(Scene),
                       ctypes.c_int, ctypes.c_void_p]
    render.restype = ctypes.c_bool
    rows = {}
    previous = None
    for name, scene in SCENES.items():
        actual = capture(output, name).crop(VIEW).tobytes()
        expected = reference(render, scene)
        mismatches = 0
        for i, value in enumerate(expected):
            rgb = ((value >> 11) * 255 // 31, ((value >> 5) & 63) * 255 // 63, (value & 31) * 255 // 31)
            mismatches += tuple(actual[i * 3:i * 3 + 3]) != rgb
        if mismatches:
            raise ValueError(f"{name}: {mismatches} viewport pixels differ from the scalar reference")
        rows[name] = {"scene": scene, "compared_pixels": len(expected), "mismatches": mismatches,
                      "viewport_rgb888_sha256": hashlib.sha256(actual).hexdigest()}
        if previous is not None:
            rows[name]["changed_pixels_from_previous"] = sum(a != b for a, b in zip(previous, expected))
        previous = expected

    title_area = (0, 0, 120, 22)
    launcher = capture(output, "launcher").crop(title_area).tobytes()
    if capture(output, "home").crop(title_area).tobytes() != launcher:
        raise ValueError("F1 did not restore the launcher title")
    if capture(output, "start").crop(title_area).tobytes() == launcher:
        raise ValueError("v left the launcher title visible")
    return {"target": "Linux PicoCalc simulator, QuickJS, scalar RGB565",
            "viewport_xywh": [40, 32, 240, 240], "input_sequence": ["f1", "v", "right", "w", "r", "f1"],
            "launcher_title_restored": True, "frames": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="directory for PNG captures and summary.json")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    repo = next(p for p in Path(__file__).resolve().parents if (p / "picocalc-os/Makefile").is_file())
    with tempfile.TemporaryDirectory(prefix="picocalc-raytrace-host-") as temp:
        summary = check(repo, output, Path(temp))
    data = json.dumps(summary, indent=2) + "\n"
    (output / "summary.json").write_text(data)
    print(data, end="")


if __name__ == "__main__":
    main()
