"""Reorder only the fixed-material floor shadow traversal in an experiment."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('input', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
source = args.input.read_text()
for before, after in [
    ('if (typedRayInShadow(work, x, y))', 'if (work.charCodeAt(1865 + x) !== 0)'),
    ('function typedRayLitRow(pixels: buffer, work: buffer, y: i32, stride: i32): i32 {',
     'function typedRayLitRow(pixels: buffer, work: buffer, y: i32, stride: i32): i32 {\n    typedRayShadowRow(work, y);'),
    ('typedRayBuildLight(work, lightX, lightY);\n    for (let y = 0; y < 160; y = y + 1) {',
     'typedRayBuildLight(work, lightX, lightY);\n    for (let y = 0; y < 160; y = y + 1) {\n        typedRayShadowRow(work, y);'),
]:
    assert source.count(before) == 1, before
    source = source.replace(before, after)
args.output.write_text(source+'\n'+Path(__file__).with_name('shadow-row.typed').read_text())
