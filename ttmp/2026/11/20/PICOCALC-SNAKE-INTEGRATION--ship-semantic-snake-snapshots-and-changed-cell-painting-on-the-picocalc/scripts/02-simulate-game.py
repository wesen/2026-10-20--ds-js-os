"""Compare complete simulated panel captures from the previous and current PicoCalc sources."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("work", type=Path)
args = parser.parse_args()
root = Path(subprocess.check_output(["git","rev-parse","--show-toplevel"],text=True).strip())
osdir = root / "picocalc-os"
work = args.work.resolve()
work.mkdir(parents=True, exist_ok=True)
script = """wait 1200
key s
wait 250
capture moving.png 1
wait 2500
capture game-over.png 1
key enter
wait 200
capture restarted.png 1
key p
wait 1400
capture autopilot.png 1
key f1
wait 400
capture launcher.png 1
stats
"""
report = {}
for mode in ["original","candidate"]:
    d = work / mode
    d.mkdir(exist_ok=True)
    js = osdir / "js"
    if mode == "original":
        archive = subprocess.Popen(["git","archive","e339b6a","picocalc-os/js"],cwd=root,stdout=subprocess.PIPE)
        subprocess.run(["tar","-x","-C",d],stdin=archive.stdout,check=True)
        assert archive.wait()==0
        js = d / "picocalc-os/js"
    shutil.copytree(osdir / "fs-seed", d / "fs", dirs_exist_ok=True)
    proc = subprocess.run([osdir/"build/picocalc-host","-j",js,"-o",d,"-f",d/"fs","-"],cwd=osdir,
                          input=script,text=True,capture_output=True,check=True)
    (d/"simulator.log").write_text(proc.stdout+proc.stderr)
    frames = {}
    for filename in ("moving.png","game-over.png","restarted.png","autopilot.png","launcher.png"):
        with Image.open(d/filename) as im:
            assert im.size==(320,320)
            frames[filename]=hashlib.sha256(im.convert("RGB").tobytes()).hexdigest()
    assert len(set(frames.values()))==5
    report[mode]=frames
report["match"]={name: report["original"][name]==value for name,value in report["candidate"].items()}
(work/"simulator.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report["match"]))
assert all(report["match"].values()), "a simulated panel differed from the original game"
