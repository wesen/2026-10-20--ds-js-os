"""Apply an experimental source-frontend policy to the existing combined control."""
import argparse
from pathlib import Path


def replace(source, before, after):
    if source.count(before) != 1:
        raise ValueError(f"expected one source anchor for {before!r}")
    return source.replace(before, after)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("policy", choices=["local", "proof-off"])
args = parser.parse_args()

infer = args.source / "src/infer.js"
source = infer.read_text()
source = replace(source, "const sc = sidecarSession();",
                 "const sc = sidecarSession();\n"
                 "  if (sc) throw new CompileError('numeric experiment does not support proof sidecars');")
source = replace(source, "  if (receiverOnly && !needsKeyProof && !demote.ranges) return { program: write(), fresh: 0 };",
                 "  return { program: { ...write(), inferRounds: rounds, rangeRounds: 0 }, fresh: 0 };")
if args.policy == "local":
    source = "import { needsNumber } from './local-numbers.js';\n" + source
    source = replace(source, "demote.ops.has(e) ? NUM : t;", "needsNumber(e) ? NUM : t;")
    source = replace(source, "demote.ops.has(e)) out.double = true;", "needsNumber(e)) out.double = true;")
infer.write_text(source)

library = args.source / "src/library.js"
source = library.read_text()
source = replace(source, "  const deferProof = !sidecarSession();\n  let expanded = false;\n", "")
source = replace(source, "  const episodes = memo ? { store: store ?? memoryStore() } : null;\n", "")
source = replace(source, "      expanded = true;\n      p = inferTypes(input, episodes, true, deferProof);",
                 "      p = inferTypes(input, null, true);")
source = replace(source, "      if (episodes) dropEpisodes(episodes);   // (lane 5: the memo's last texts and episodes leave the store with the pass)\n"
                 "      return expanded && deferProof ? inferTypes({ ...p, body }, null, true) : { ...p, body };",
                 "      return { ...p, body };")
library.write_text(source)
