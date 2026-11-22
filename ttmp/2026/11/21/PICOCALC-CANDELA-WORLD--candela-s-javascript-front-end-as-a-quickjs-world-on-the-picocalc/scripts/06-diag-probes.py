"""Diagnostic probes: scenes with a known mistake on a known line, for the Candela world and for Node.

usage: python3 -I 06-diag-probes.py OUT_DIR
Writes OUT_DIR/06-diag-probes.json (the probes) and OUT_DIR/06-diag-probes.txt (a picocalc-host script that
builds each one in the world; the same lines, without "wait", go to the device console). Every line of the
script fits the device console's 1,024-byte line.
"""
import json
import sys
from pathlib import Path

PROBES = {
    "P-throw": {"expect": "E000 at scene.js:4",
                "files": {"scene.js": "import { scene } from 'candela';\n\nconst x = 1;\nthrow new Error('boom');\nexport default scene();\n"}},
    "P-method": {"expect": "E104 at scene.js:4",
                 "files": {"scene.js": "import { scene, shape, material } from 'candela';\n\n\nexport default scene().add(shape.sphere(1).materail(material.pbr()));\n"}},
    "P-torus": {"expect": "E790 (T1 torus) at scene.js:5",
                "files": {"scene.js": "import { scene, shape, material, light } from 'candela';\n\nexport default scene()\n  .add(shape.sphere(1).material(material.pbr()))\n  .add(shape.torus(1, 0.3).at(0, 2, 0).material(material.pbr()))\n  .light(light.daylight());\n"}},
    "P-field": {"expect": "E790 (T2 surface field) at scene.js:5",
                "files": {"scene.js": "import { scene, shape, material, bsdf, light, fx } from 'candela';\n\nconst gold = bsdf.conductor({ ior: 'Au', roughness: 0.2 });\nexport default scene()\n  .add(shape.sphere(0.5).material(material(bsdf.mix(bsdf.lambert('#1d4f9a'), gold, p => fx.stripes(p.P.y, 7, 0.7)))))\n  .light(light.daylight());\n"}},
    "P-syntax": {"expect": "E001",
                 "files": {"scene.js": "import { scene } from 'candela';\nconst a = ;\nexport default scene();\n"}},
}


def main():
    out = Path(sys.argv[1])
    (out / "06-diag-probes.json").write_text(json.dumps(PROBES, indent=1) + "\n")
    lines = ["# picocalc-host script: the diagnostic probes of 06-diag-probes.json", "wait 1500", "send candela load", "wait 300"]
    for k, v in PROBES.items():
        lines.append("send candela build " + json.dumps({"id": k, "files": v["files"], "render": False}, separators=(",", ":")))
        lines.append("wait 2000")
    lines.append("quit")
    assert max(len(line) for line in lines) < 1000
    (out / "06-diag-probes.txt").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
