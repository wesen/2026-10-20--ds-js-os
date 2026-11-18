"""Check the captured cycles, then print per-world statistics in milliseconds."""
from collections import defaultdict
import csv
import json
from pathlib import Path
from statistics import median
import sys

rows = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines()]
worlds = json.loads(Path("picocalc-os/js/system.json").read_text())["worlds"]
groups = defaultdict(list)
for row in rows:
    groups[row["world"]].append(row)
assert [*groups] == [w["name"] for w in worlds]
writer = csv.writer(sys.stdout, lineterminator="\n")
writer.writerow(("world","trials","source_bytes","bytecode_bytes","compile_min_ms","compile_median_ms","compile_max_ms","encode_median_ms","decode_median_ms","prelude_median_ms","register_median_ms","ready_min_ms","ready_median_ms","ready_max_ms","behavior"))
for name, group in groups.items():
    assert len(group) == 3 and len({r["trial"] for r in group}) == 3
    assert all(r["ok"] == 1 and r["bytes"] > 0 and r["ready_us"] > 0 for r in group)
    assert all(len({r[k] for r in group}) == 1 for k in ("source","bytecode","size","bytes","witness"))
    assert group[0]["witness"] == (1 if name in ("agenda", "files", "flaky") else -1)
    values = lambda field: [r[field + "_us"] / 1000 for r in group]
    triple = lambda field: [fn(values(field)) for fn in (min, median, max)]
    metrics = triple("compile") + [median(values(k)) for k in ("write","read","prelude","init")] + triple("ready")
    writer.writerow((name,len(group),group[0]["size"],group[0]["bytes"],*(f"{v:.3f}" for v in metrics),
                     "passed" if group[0]["witness"] == 1 else "registration"))
