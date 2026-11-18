"""Relink the existing headless app with one diagnostic callback; leave production files untouched."""
from pathlib import Path
import argparse
import hashlib
import json
import shlex
import shutil
import subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("build",type=Path)
parser.add_argument("out",type=Path)
parser.add_argument("--typed",nargs=2,type=Path,metavar=("EMITTER_JS","INPUT"))
args=parser.parse_args()
b=args.build.resolve()
out=args.out.resolve()
out.mkdir(parents=True,exist_ok=True)
probe=Path(__file__).resolve().with_name("qjs_probe.c")
worlds=json.loads(Path("picocalc-os/js/system.json").read_text())["worlds"]
(out/"probe_manifest.inc").write_text("".join(
    "    {"+json.dumps(w["name"])+", "+json.dumps(w["file"])+", "+str(w.get("mem_kb",1024))+"},\n" for w in worlds))
extra=[]
unit="/perf_p4.c"
if args.typed:
    core, source = args.typed
    extra=[core.resolve(),source.resolve()]
    probe=probe.with_name("typed_probe.c")
    unit="/native_wasm.c"
    with (out/"typed_input.inc").open("w") as generated:
        for name, path in (("emitter",core),("source",source)):
            data=path.read_bytes()+bytes([0])
            generated.write("static const char "+name+"[] = {\n")
            for start in range(0,len(data),24):
                generated.write(",".join(str(b) for b in data[start:start+24])+",\n")
            generated.write("};\n")
commands=json.loads((b/"compile_commands.json").read_text())
row=next(r for r in commands if r["file"].endswith(unit))
cc=shlex.split(row["command"])
cc[cc.index("-o")+1]=str(out/"probe.o")
cc[cc.index("-c")+1]=str(probe)
subprocess.run(cc+["-I"+str(out)],cwd=row["directory"],check=True)

lines=subprocess.check_output(["ninja","-C",b,"-t","commands","app"],text=True).splitlines()
link=next(s for s in reversed(lines) if "-Wl,--Map=" in s and " -o picocalc-os-p4.elf" in s)
cmd=shlex.split(link)
if cmd[:2]!=[':', '&&'] or cmd[-2:]!=['&&',':']:
    raise ValueError("unexpected CMake link rule")
cmd=cmd[2:-2]
cmd[cmd.index("-o")+1]=str(out/"picocalc-os-p4.elf")
idx=next(i for i,v in enumerate(cmd) if v.startswith("-Wl,--Map="))
cmd[idx]="-Wl,--Map="+str(out/"probe.map")
first=next(i for i,v in enumerate(cmd) if v.endswith(".obj"))
cmd[first:first]=[str(out/"probe.o"),"-Wl,--wrap=vm_calibrate"]
subprocess.run(cmd,cwd=b,check=True)
line=next(s for s in reversed(lines) if " --chip esp32p4 elf2image " in s)
parts=shlex.split(line)
i=parts.index("&&")+1
cmd=parts[i:parts.index("&&",i)]
cmd[cmd.index("-o")+1]=str(out/"picocalc-os-p4.bin")
cmd[-1]=str(out/"picocalc-os-p4.elf")
subprocess.run(cmd,cwd=b,check=True)
(out/"esp-idf/main").mkdir(parents=True,exist_ok=True)
for f in ("CMakeCache.txt","esp-idf/main/system.cji.json"):
    shutil.copyfile(b/f,out/f)
artifacts=[probe,*extra,out/"probe_manifest.inc",out/"picocalc-os-p4.elf",out/"picocalc-os-p4.bin"]
(out/"identities.sha256").write_text("".join(hashlib.sha256(p.read_bytes()).hexdigest()+"  "+str(p)+"\n" for p in artifacts))
