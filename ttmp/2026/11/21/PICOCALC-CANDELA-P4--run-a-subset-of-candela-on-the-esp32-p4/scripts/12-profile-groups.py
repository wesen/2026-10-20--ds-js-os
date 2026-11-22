#!/usr/bin/env python3
"""12-profile-groups.py: group a 06-rv32imfc-count profile (instructions per function, exclusive) into
the parts of Candela's kernel, per camera sample.

usage: python3 -I 12-profile-groups.py SAMPLES PROFILE.tsv [PROFILE.tsv ...]

GCC inlines freely, so a group holds what remained a separate function: `main` contains the inlined
renderPixel, cameraRay and most of tracePath. The libm groups are exact (newlib is not inlined)."""
import re
import sys

GROUPS = [
    ("trig argument reduction (large sin)", r"__kernel_rem_pio2f|scalbnf"),
    ("libm exp/log/pow", r"expf|logf|powf|__ieee754_exp|__ieee754_log|__ieee754_pow|exp2f|log2f"),
    ("libm sin/cos/tan", r"sinf|cosf|tanf|__kernel_sin|__kernel_cos|__kernel_tan|__ieee754_rem_pio2f"),
    ("libm acos/asin/atan", r"acosf|asinf|atanf|atan2f|__ieee754_acos|__ieee754_asin|__ieee754_atan"),
    ("libm floor/misc", r"floorf|ceilf|fabsf|finitef|copysignf|__fpclassify|memset|memcpy"),
    ("traversal and intersection", r"traceAll|hitObj|hitAABB|xfP|xfD|xfN|traceScene|occluded|finishHit|hitMesh|sdLocal|sdNormal|sdBox|poseQ|poseT|qrot|noHit"),
    ("environment and sun", r"envL|skyL|perez|studioL|sunL|hdri|envRot|nLightChoices"),
    ("materials and lobes", r"evalMaterial|mat_\d|evalLobe|pdfLobe|sampleLobe|sampleVNDF|ggx|fresnel|schlick|condF|msComp|dielTrans|airy|filmR|f0ToN|lobeNone|frameT|frameOf|toLocal|toWorld|cosHemi|tangentWorld|metalAt|hitAlbedo|hitEmission|spec\b|bumpN|bumpH|noise3|fbm3|gnoise|hash3|hash13|voronoi"),
    ("light sampling and MIS", r"neeAt|sampleLight|lightPdfAt|sampleSphereDir|uniformCone|misW|lightSpec|shadowTr|fogSeg|hgPhase|sampleHG"),
    ("path loop, camera, RNG (main)", r"^main$|tracePath|renderPixel|cameraRay|rnd|pcgH|customKernel|traceAOV"),
]


def group(name):
    for label, pat in GROUPS:
        if re.search(pat, name):
            return label
    return "other: " + name


samples = int(sys.argv[1])
for path in sys.argv[2:]:
    tot = {}
    allc = 0
    for line in open(path):
        n, name = line.rstrip("\n").split("\t")
        n = int(n)
        allc += n
        tot[group(re.sub(r"^_ZN3cdlL\d+", "", name))] = tot.get(group(re.sub(r"^_ZN3cdlL\d+", "", name)), 0) + n
    print(f"{path}: {allc / samples:.0f} instructions per sample")
    for k, v in sorted(tot.items(), key=lambda kv: -kv[1]):
        if v / samples >= 20:
            print(f"  {v / samples:8.0f}  {100 * v / allc:5.1f}%  {k}")
