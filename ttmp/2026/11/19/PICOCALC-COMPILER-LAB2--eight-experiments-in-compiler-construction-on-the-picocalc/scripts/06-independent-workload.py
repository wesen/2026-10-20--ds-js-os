"""Build a held-out fixed-point raster arithmetic workload in three source orders."""
from pathlib import Path
import argparse
import hashlib
import json
import random


def channel(index):
    # Four quantization strategies occur in independent leaf functions. Values
    # and division signs remain ordinary i32 operations of the typed language.
    prefix = f"function raster{index}(value: i32, bias: i32, scale: i32): i32 {{"
    width = (3,5,9,13,17,31,63)[index % 7]
    scheme = index % 4
    setup = [f"const width = {width};", "let acc = value;"]
    if scheme==1: setup.extend(["let divisor = width;", "if (bias < 0) { divisor = scale; }"])
    if scheme==2: setup.extend(["let divisor = 7;", "if (bias < 0) { divisor = 7; }"])
    unit = [str(width), "divisor", "divisor", "scale"][scheme]
    # Texture channels use different sample kernels across the same module.
    for x in range(14 + 3 * (index % 8)):
        if x % 3 == 0:
            setup.append(f"acc = (acc + bias) % {unit};")
        elif x % 3 == 1:
            setup.append(f"acc = (acc / {unit}) + {x + 1};")
        else:
            setup.append("acc = acc * 3 + value;")
    return "\n".join([prefix, *setup, "return acc;", "}"])


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("out",type=Path)
    out=p.parse_args().out
    out.mkdir(parents=True,exist_ok=True)
    pieces=[channel(i) for i in range(72)]
    perm=list(range(len(pieces)))
    rng=random.Random(19770923)
    rng.shuffle(perm)
    orders={"clustered":sorted(range(72),key=lambda i:i%4),"reversed":list(reversed(sorted(range(72),key=lambda i:i%4))),"shuffled":perm}
    result={}
    for name,order in orders.items():
        source="\n".join(pieces[i] for i in order)+"\n"
        (out/(name+".typed")).write_text(source)
        result[name]=dict(bytes=len(source),sha256=hashlib.sha256(source.encode()).hexdigest(),functions=len(pieces))
    (out/"orders.json").write_text(json.dumps(result,indent=2)+"\n")


if __name__=="__main__":
    main()
