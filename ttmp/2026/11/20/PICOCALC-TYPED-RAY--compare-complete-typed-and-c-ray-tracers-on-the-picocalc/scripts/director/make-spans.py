"""Replace the scalar row computation with the independently checked span arm."""
import argparse
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args=parser.parse_args()
source=Path('picocalc-os/worlds/raytrace/raytrace.typed').read_text()
row=Path(__file__).with_name('row-spans.typed').read_text().rstrip()
source, count=re.subn(r'^function typedRayComputeRow\([^\n]+\n.*?^\}', lambda _:row,
                      source, flags=re.MULTILINE | re.DOTALL)
assert count == 1
args.output.write_text(source)
