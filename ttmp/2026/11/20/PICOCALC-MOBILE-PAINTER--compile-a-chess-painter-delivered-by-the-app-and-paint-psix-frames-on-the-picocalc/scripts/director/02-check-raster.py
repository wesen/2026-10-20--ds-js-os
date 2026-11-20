"""Replay compiler-qualified native words through the shipping rasterizer against archived screen pixels."""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile

p = argparse.ArgumentParser(description=__doc__)
p.add_argument(
    "compiler_fixtures", type=Path, help="binary fixtures from compiler/01-replay.mjs"
)
p.add_argument(
    "prior_replay",
    type=Path,
    help="output directory of the earlier RENDER-CHESS replay",
)
p.add_argument("receipt", type=Path)
args = p.parse_args()
here = Path(__file__).resolve().parent
ticket = here.parents[1]
nucleus = (
    Path(
        subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"], text=True
        ).strip()
    )
    / "picocalc-os/nucleus"
)
old = next(ticket.parent.glob("PICOCALC-RENDER-CHESS--*"))
digests = json.loads((old / "various/pixel-gate.json").read_text())["rows"]
frames = [
    json.loads(s)
    for s in (args.prior_replay / "control.ndjson").read_text().splitlines()
]
data = args.compiler_fixtures.read_bytes()
stride = 4 + 180 + 4 + 8192
assert len(data) == len(frames) * stride and len(frames) == len(digests) == 47
boundary_failures = [
    [],
    [99],
    [1],
    [1, 319, 0, 2, 1, 255, 4, 0],
    [1, 0, 279, 1, 2, 255, 4, 0],
    [3, 0, 0, 3, 0, 0, 0, 4, 0],
    [3, 319, 0, 0, 0, 1, 1, 65, 4, 0],
    [3, 0, 270, 0, 0, 6, 1, 65, 4, 0],
    [3, 0, 0, 0, 0, 6, 1, 31, 4, 0],
    [4, 1, 0],
    [4, 4, 65],
    [4, 0, 4, 0],
    [1, 0, 0, 1, 1, 1] * 274 + [4, 0],
    [4, 0] + [0] * 4095,
]


def sha(content):
    return hashlib.sha256(content).hexdigest()


rows = []
with tempfile.TemporaryDirectory() as work:
    exe = Path(work) / "raster"
    subprocess.run(
        [
            "cc",
            "-std=gnu11",
            "-O2",
            "-Wall",
            "-ffunction-sections",
            "-fdata-sections",
            "-I",
            nucleus,
            here / "01-raster.c",
            nucleus / "painter_commands.c",
            nucleus / "gfx.c",
            nucleus / "util.c",
            "-Wl,--gc-sections",
            "-o",
            exe,
        ],
        check=True,
    )
    for words in boundary_failures:
        bad = subprocess.run(
            [exe], input=struct.pack(f"<{len(words)}H", *words), capture_output=True
        )
        assert bad.returncode == 2 and not bad.stdout, words[:8]
    for i, (frame, witness) in enumerate(zip(frames, digests, strict=True)):
        assert frame["id"] == witness["id"]
        start = i * stride
        assert struct.unpack_from("<I", data, start)[0] == 90
        count = struct.unpack_from("<I", data, start + 184)[0]
        assert 0 < count <= 4096
        output = subprocess.check_output(
            [exe], input=data[start + 188 : start + 188 + count * 2]
        )
        pixels, hints = output[:204800], output[204800:].decode("ascii")
        ref = (args.prior_replay / "control-pixels" / f"{i:05d}.rgb565").read_bytes()
        assert sha(ref) == witness["sha256"] and len(pixels) == len(ref) == 204800
        body = slice(22 * 640, 302 * 640)
        assert pixels[body] == ref[body] and hints == frame["hints"], frame["id"]
        assert not any(pixels[: body.start] + pixels[body.stop :]), frame["id"]
        rows.append(
            {
                "position": frame["id"],
                "wordCount": count,
                "bodySha256": sha(pixels[body]),
            }
        )
report = {
    "matched": len(rows),
    "comparedPixelsPerPosition": 320 * 280,
    "hintsMatched": len(rows),
    "chromeUntouched": len(rows),
    "rejectedStreams": len(boundary_failures),
    "positions": rows,
}
args.receipt.write_text(json.dumps(report, indent=2) + "\n")
print(
    f"{len(rows)} bodies, hints and chrome guards passed; {len(boundary_failures)} malformed lists rejected"
)
