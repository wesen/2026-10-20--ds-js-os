"""Plot three original-size game screenshots from the measured simulator workflow."""

import argparse
import json
from pathlib import Path
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("run", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
assert all(json.loads((args.run / "simulator.json").read_text())["match"].values())
fig, axes = plt.subplots(1, 3, figsize=(9.6, 3.65), layout="constrained")
for axis, (filename, title) in zip(
    axes,
    [
        ("moving", "Moving"),
        ("game-over", "After collision"),
        ("autopilot", "Autopilot"),
    ],
):
    axis.imshow(
        Image.open(args.run / "candidate" / (filename + ".png")),
        interpolation="nearest",
    )
    axis.set_title(title, loc="left", fontsize=12)
    axis.set_axis_off()
fig.suptitle("Snake through the PicoCalc simulator’s display controller", fontsize=16)
fig.savefig(args.output, dpi=140)
