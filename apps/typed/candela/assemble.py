"""Assemble one complete Typed source unit for a measured authoring stage."""
import argparse
from pathlib import Path

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--stage", choices=("hand", "fluent", "callback"), default="callback")
args = parser.parse_args()
declarations = []
implementations = ["builders.typed", "materials.typed"]
shared, tile = "candelaHandShared", "candelaHandTile"
if args.stage != "hand":
    declarations.append("fluent-types.typed")
    implementations.append("fluent.typed")
    shared = "candelaFluentShared"
if args.stage == "callback":
    declarations.insert(0,"pattern-types.typed")
    implementations.append("patterns.typed")
    tile = "candelaCapturedTile"
sources = [(here / filename).read_text() for filename in declarations + implementations]
# Include only the selected fixture bodies. Cold timings should not pay to compile
# superseded hand-authored versions of the same scene.
if args.stage != "callback":
    hand = (here / "hand.typed").read_text()
    if args.stage == "fluent":
        start = hand.index("function candelaHandTile(")
        hand = hand[start:]
    sources.append(hand)
sources.append(f"""function candelaBuildScene(graph: buffer, fixture: i32): i32 {{
    if (fixture === 0) {{ return {shared}(graph); }}
    if (fixture === 1) {{ return {tile}(graph); }}
    return 0;
}}""")
args.output.write_text("\n".join(sources)+"\n")
