"""Build the closed source unit used for the programmable-frame P4 comparison."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
worlds = Path(__file__).resolve().parents[1]
inputs = ['candela/builders.typed', 'candela/materials.typed', 'candela/hand.typed',
          'raytrace/raytrace.typed', 'raytrace/material-frame.typed']
args.output.write_text('\n'.join((worlds / name).read_text() for name in inputs))
