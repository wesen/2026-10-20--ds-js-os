"""Enable the experimental P4 target for the mobile linker and identify its output."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("tree", type=Path)
tree = parser.parse_args().tree.resolve()
workspace = next(parent for parent in Path(__file__).resolve().parents if (parent / ".git").exists())
if tree == workspace or workspace.is_relative_to(tree):
    raise SystemExit("choose an isolated staging tree")
system = tree / "picocalc-os"


def replace(path, before, after):
    code = path.read_text()
    if code.count(before) != 1:
        raise ValueError(f"{path}: integration anchor changed")
    path.write_text(code.replace(before, after))


replace(
    system / "compiler/mobile-painter.js",
    "    const program = typedRv32.compile(source, [], 16384, options);",
    """    const pieDiagnostics = [];
    const program = typedRv32.compile(source, [], 16384, {...options, pie: true, pieDiagnostics});
    if (pieDiagnostics.length !== 0)
        throw new SyntaxError("3D trial expected a scalar image even with PIE enabled");""",
)
identity = """static uint32_t trial_hash(const void *bytes, size_t length) {
  const uint8_t *p = bytes;
  uint32_t hash = UINT32_C(2166136261);
  for (size_t i = 0; i < length; ++i) hash = (hash ^ p[i]) * UINT32_C(16777619);
  return hash;
}

"""
path = system / "port/esp32p4/main/mobile_painter_p4.c"
replace(path, "typedef int (*paint_entry)", "#include <inttypes.h>\n\n" + identity + "typedef int (*paint_entry)")
replace(
    path,
    "  free(reactor);",
    '''  if (image.bytes)
    printf("chess3d-target=pie source-bytes=%zu source-fnv=%08" PRIx32
           " linked-bytes=%zu linked-fnv=%08" PRIx32 "\\n", length,
           trial_hash(source, length), image.length, trial_hash(image.bytes, image.length));
  free(reactor);''',
)
