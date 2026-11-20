"""Assemble unaltered native-resolution captures into two looping annotated GIFs."""
import argparse
import json
from pathlib import Path
from shutil import copyfile
from PIL import Image, ImageDraw, ImageFont


def make(dir, rows, dest, output, duration=950):
    frames = []
    for row in rows:
        with Image.open(dir/(row["label"]+".png")) as src:
            assert src.size == (320,320)
            frame = Image.new("RGB",(320,345),"#ede9de")
            frame.paste(src.convert("RGB"))
        draw = ImageDraw.Draw(frame)
        draw.text((9,325),row["caption"],fill="#272725",font=ImageFont.load_default(size=13))
        frames.append(frame)
    frames[0].save(dest/output, save_all=True, append_images=frames[1:], duration=duration, loop=0, disposal=2, optimize=False)
    with Image.open(dest/output) as gif:
        assert gif.n_frames == len(frames) and gif.info["loop"] == 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("match","screens","out"):
        p.add_argument(name,type=Path)
    a = p.parse_args()
    rows = {r["label"]:r for r in json.loads((a.match/"match.json").read_text())}
    a.out.mkdir(parents=True,exist_ok=True)
    make(a.screens,[rows[k] for k in ("opening","turn-1","turn-2","turn-3","turn-4")],a.out,"gameplay.gif")
    make(a.screens,[rows[k] for k in ("turn-4","yaw-1","yaw-2","yaw-3")],a.out,"rotation.gif")
    for name in rows:
        copyfile(a.screens/(name+".png"),a.out/(name+".png"))
    if (a.screens/"smooth-rotation.json").exists():
        # Keep the panel-paced frames and palette verified by the physical recorder.
        receipt = json.loads((a.screens/"smooth-rotation.json").read_text())
        assert len(receipt["frames"]) == 33
        for file in ("smooth-rotation.gif","smooth-rotation.json"):
            copyfile(a.screens/file,a.out/file)
        for img in a.screens.glob("phase-*.png"):
            copyfile(img,a.out/img.name)
    elif (a.screens/"phase-31.png").exists():
        stages = [{"label":f"phase-{i:02}", "caption":f"4. O-O d5   /   camera {(i*360/32):g} degrees"} for i in range(32)]
        make(a.screens,stages,a.out,"smooth-rotation.gif",duration=80)
