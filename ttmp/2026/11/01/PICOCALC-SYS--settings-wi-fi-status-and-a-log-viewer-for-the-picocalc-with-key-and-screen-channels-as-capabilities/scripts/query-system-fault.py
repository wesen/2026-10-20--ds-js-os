"""Capture the running System monitor twice using the project's USB console tool."""
import argparse
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("port")
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
commands = ["1 worlds", "6 key f1", "7 key m", "13 worlds", "18 key f1", "19 key m", "26 worlds"]
with args.output.open("xb") as log:
    subprocess.run([sys.executable, str(root / "picocalc-os/tools/p4cap.py"),
                    "--no-reset", "-p", args.port, "-s", "30",
                    *(arg for command in commands for arg in ("-c", command))], stdout=log, check=True)
