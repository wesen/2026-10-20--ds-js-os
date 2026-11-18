"""Count emitted operations as code-shape evidence, independent of execution frequency."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("units", nargs="+", help="NAME=directory containing agenda.slir and files.slir")
args = parser.parse_args()
result = {}
for item in args.units:
    name, directory = item.split("=", 1)
    for world in ("agenda", "files"):
        ir = (Path(directory) / f"{world}.slir").read_text()
        calls = Counter(re.findall(r"^ +icall +([a-z0-9_]+)/", ir, flags=re.MULTILINE))
        operations = Counter(re.findall(r"^ +(fadd|fsub|fmul|fdiv|i2f|add|sub|mul) +", ir, flags=re.MULTILINE))
        data = {k: calls[k] for k in ("num_to_int", "any_to_int", "num_mod", "int_mod", "num_to_str", "int_to_str")}
        data.update({k: operations[k] for k in ("fadd", "fsub", "fmul", "fdiv", "i2f", "add", "sub", "mul")})
        result.setdefault(world, {})[name] = data
print(json.dumps(result, indent=2))
