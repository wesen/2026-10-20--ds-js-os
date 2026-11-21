"""Make a looping, nearest-neighbor enlarged GIF from an ordered set of ray tracer captures."""
import argparse
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("frames", nargs="+", type=Path)
parser.add_argument("--scale", type=int, default=2)
parser.add_argument("--milliseconds", type=int, default=160)
args = parser.parse_args()
frames = []
for path in args.frames:
    with Image.open(path) as source:
        image = source.convert("RGB")
    if frames and image.size != original_size:
        raise ValueError("Frame dimensions changed")
    original_size = image.size
    frames.append(image.resize((image.width * args.scale, image.height * args.scale), Image.Resampling.NEAREST))
args.output.parent.mkdir(exist_ok=True, parents=True)
frames[0].save(args.output, save_all=True, append_images=frames[1:], loop=0, duration=args.milliseconds, disposal=2)
