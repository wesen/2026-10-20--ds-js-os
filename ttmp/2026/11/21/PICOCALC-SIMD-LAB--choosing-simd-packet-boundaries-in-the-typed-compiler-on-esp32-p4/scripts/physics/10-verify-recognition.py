#!/usr/bin/env python3
"""Independent differential and compiler decision tests over actually linked code."""
import argparse
from collections import Counter
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import re
import struct
import subprocess

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("rv_replay", HERE / "03-qualify.py")
rv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rv)

def compile_image(source, out, prefix, policy="pie"):
    out.mkdir(parents=True, exist_ok=True)
    src = out / "fixture.typed"
    src.write_text(source)
    subprocess.run(["node", HERE / "09-recognize-particles.mjs", src, out, policy],check=True)
    objects = []
    for name, code in [("guard",out/"physics-auto-checked.S"),("native",HERE/"physics.S"),("typed",out/"physics-typed.S")]:
        obj = out/(name+".o")
        subprocess.run([prefix+"-as","-march=rv32im_xesppie","-mabi=ilp32","-o",obj,code],check=True)
        objects.append(obj)
    elf = out/"module.elf"
    subprocess.run([prefix+"-ld","--no-relax","-Ttext=0","-e","0","-o",elf,*objects],check=True)
    binary = out/"module.bin"
    subprocess.run([prefix+"-objcopy","-O","binary","--only-section=.text",elf,binary],check=True)
    listing = subprocess.check_output([prefix+"-objdump","-D","-j",".text","-M","numeric,no-aliases",elf],text=True)
    ins, entries = {}, {}
    for line in listing.splitlines():
        w = re.match(r"^\s*([0-9a-f]+):\s+[0-9a-f]{8}\s+(\S+)\s*(.*?)\s*$",line)
        symbol = re.match(r"^([0-9a-f]+) <(\w+)>:$",line)
        if w: ins[int(w[1],16)] = (w[2],w[3].split(","))
        if symbol: entries[symbol[2]] = int(symbol[1],16)
    machine = rv.Machine("auto",binary.read_bytes(),entries,ins)
    decisions = json.loads((out/"physics-auto.json").read_text())["decisions"]
    return machine, {d["name"]:d for d in decisions}

def observe(machine, name, n, capacity, alignment):
    data = rv.DATA + alignment
    cells = rv.encode([rv.seed(i) for i in range(74)])
    initial = [(data-4,struct.pack("<I",capacity)+cells)]
    observation = {}
    counts = Counter()
    result = machine.run(name, [data-4,n & 0xffffffff], initial,(data,len(cells)),counts,observation)
    return result,observation,counts

def verify_outputs(machine, decision):
    positive, traps, pie = 0, 0, 0
    for n in [-1,0,1,7,8,9,15,16,31,32]:
        for cap in [0,3,7,15,32,64]:
            for align in [0,2]:
                a = observe(machine,decision["entry"],n,cap,align)
                b = observe(machine,"physics_typed_"+decision["name"],n,cap,align)
                assert a[:2] == b[:2], (decision,n,cap,align,a[1],b[1])
                positive += 1
                traps += bool(a[1].get("trap"))
                pie += sum(c for pc,c in a[2].items() if machine.instructions[pc][0]=="esp.vadd.s16")
    return dict(comparisons=positive,firstTraps=traps,packedAdds=pie)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("out",type=Path)
    ap.add_argument("toolchain",help="Espressif binutils path prefix without trailing hyphen")
    args=ap.parse_args()
    original=(HERE/"physics.typed").read_text()
    match=re.search(r"function particleSoA\b.*?\n}",original,re.S)
    soa=match[0]
    preamble="function relocate(z:i32):i32 { return z+3; }\n"
    # Cases independent of source spelling, module offset and array alignment.
    accepted={
        "renamed":re.sub(r"\bi\b","tick",soa),
        "commute":soa.replace("n + i","i + n").replace("x + v","v + x"),
        "swapped":soa.replace("charCodeAt(i);","charCodeAt(TEMP);").replace("charCodeAt(n + i);","charCodeAt(i);").replace("charCodeAt(TEMP);","charCodeAt(i + n);"),
    }
    rejected={
        "shifted_read":soa.replace("n + i","n + i - 1"),
        "overlap":soa.replace("n + i","i + 1"),
        "wrong_destination":soa.replace("setCharCodeAt(i, s)","setCharCodeAt(n + i, s)"),
        "bad_sign":soa.replace(">= 32768","> 32768",1),
        "bad_ceiling":soa.replace("s = 32767","s = 32766"),
        "bad_floor":soa.replace("s = -32768","s = -32767"),
        "duplicate_lane":soa.replace("x + v","x + x"),
        "extra_write":soa.replace("b.setCharCodeAt(i, s);","b.setCharCodeAt(i, 0); b.setCharCodeAt(i, s);"),
        "different_return":soa.replace("return n;","return n - 1;"),
        "nonlinear":soa.replace("n + i","n * i"),
        "budget":soa.replace("let s = x + v;","let s = x + v; "+"s = s + 0; "*50),
    }
    aos=re.search(r"function particleAoS\b.*?\n}",original,re.S)[0]
    accepted["affine_aos"]=aos.replace("2 * i","i + i").replace("particleAoS","particleSoA")
    witnesses = {}
    baseline, decisions = compile_image(original,args.out/"original",args.toolchain)
    calibrated = json.loads((HERE.parent.parent/"various/physics/host-summary.json").read_text())["images"]["guard"]
    assert baseline.sha == calibrated,(baseline.sha,calibrated)
    assert decisions["contacts"]["entry"] == "physics_typed_contacts"
    for name,layout in [("particleAoS","aos"),("particleSoA","soa")]:
        assert decisions[name]["layout"] == layout
        witnesses[name] = verify_outputs(baseline,decisions[name])
    # Compile all alternatives into one module to exercise function relocation
    # and collision-free linker labels for several loops with identical layout.
    fixture=preamble
    for name,src in {**accepted,**rejected}.items():
        fixture+=src.replace("particleSoA",name)+"\n"
    machine,decisions2=compile_image(fixture,args.out/"renamed",args.toolchain)
    assert decisions2["relocate"]["entry"]=="physics_typed_relocate"
    for name in accepted:
        d=decisions2[name]
        assert d.get("layout")==("aos" if name=="affine_aos" else "soa"),d
        witnesses[name]=verify_outputs(machine,d)
        assert witnesses[name]["packedAdds"]>0
    for name in rejected:
        d=decisions2[name]
        assert d.get("decline") and d["entry"]=="physics_typed_"+name,d
        witnesses[name]=verify_outputs(machine,d)
        assert witnesses[name]["packedAdds"]==0
    # The rejected program intentionally computes a different saturating sum.
    # Validate its *actual* return memory against an independently calculated pair.
    cell=rv.encode([32767,3])
    def pair(name):
        return machine.run(decisions2[name]["entry"],[rv.DATA-4,1],[(rv.DATA-4,struct.pack("<I",2)+cell)],(rv.DATA,4),Counter())
    assert pair("bad_ceiling")==rv.encode([32766,3])
    assert pair("renamed")==rv.encode([32767,3])
    policy_checks={}
    for mode in ["scalar","stock"]:
        m,d=compile_image(soa,args.out/mode,args.toolchain,mode)
        result=verify_outputs(m,d["particleSoA"])
        assert result["packedAdds"]==0
        policy_checks[mode]={"entry":d["particleSoA"]["entry"],**result}
    summary={"calibratedLinkedImageSHA256":calibrated,"originalAutoLinkedSHA256":baseline.sha,
        "relocatedImageSHA256":machine.sha,"originalBytes":len(baseline.image),
        "decisionRecords":decisions,"relocatedDecisions":decisions2,"outcomes":witnesses,"policyControls":policy_checks,
        "comparisons":sum(x["comparisons"] for x in [*witnesses.values(),*policy_checks.values()]),
        "temporalScope":"host recognition and native image replay; runtime board timings refer to original calibrated code"}
    (args.out/"recognition-summary.json").write_text(json.dumps(summary,indent=2)+"\n")
    print("recognition: matched",len(accepted)+2,"ordinary functions; rejected",len(rejected),
        "near-matches;",summary["comparisons"],"paired comparisons; image",baseline.sha)

if __name__=="__main__": main()
