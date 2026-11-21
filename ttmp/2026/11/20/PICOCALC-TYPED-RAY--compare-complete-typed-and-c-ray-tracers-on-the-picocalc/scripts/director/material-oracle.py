"""Create independent full-image oracles using the completed Candela review."""
import json
from pathlib import Path
import sys

here = Path(__file__).resolve()
sys.path.insert(0, str(next(here.parents[3].glob('PICOCALC-CANDELA--*')) / 'scripts/review'))
from oracle import Graph, fixture, image

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
cases = []
for scene, weights in [('shared', [0, 128, 256]), ('tile', [64, 73, 128])]:
    for weight in weights:
        cells = fixture(scene, weight)
        light = (31, 25) if weight != 73 else (31, 17)
        graph = Graph(cells)
        filename = f'{scene}-{weight}.rgb565'
        (out / filename).write_bytes(image(graph, light))
        cases.append(dict(scene=scene, weight=weight, light=light, pixels=filename, graph=cells))
(out / 'cases.json').write_text(json.dumps(cases))
