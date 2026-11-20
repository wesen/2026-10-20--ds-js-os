"""Flash a scratch application, capture the common control and both candidates, replay Editor, and restore."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import statistics
import subprocess
import sys
import time

here = Path(__file__).resolve().parent
day = here.parent.parent
repo = day.parents[3]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("work", type=Path)
p.add_argument("port")
p.add_argument("esptool")
p.add_argument("--analyze",type=Path,help="analyze a completed capture without opening a device")
args = p.parse_args()
work = args.work.resolve()
app = work / "build/picocalc-os-p4.bin"
saved = work / "original/factory-original.bin"
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def py(*args):
    return [sys.executable, "-B", *args]
def run_json(*cmd):
    return json.loads(subprocess.check_output(cmd,text=True))
def write(name, payload):
    (work / name).write_text(json.dumps(payload,indent=2)+"\n")
def capture(name, seconds, commands):
    cmd=py(repo / "picocalc-os/tools/p4cap.py","--no-reset","-p",args.port,"-s",str(seconds))
    for c in commands:
        cmd.extend(["-c",c])
    file=work / (name+".log")
    with file.open("wb") as stream:
        subprocess.run(cmd,stdout=stream,check=True)
    return file.read_text(errors="replace")
def hold(label):
    for n in range(8):
        log=capture(f"{label}-hold-{n}",2,["0.2 hold"])
        if "#OK hold" in log and "i2c0 held between transactions" in log:
            return
        time.sleep(3)
    raise RuntimeError(f"{label}: console did not confirm keyboard bus hold")
def flash(label, path):
    log=work / (label+"-flash.log")
    with log.open("wb") as out:
        subprocess.run([args.esptool,"--chip","esp32p4","-p",args.port,"-b","921600",
                        "write_flash","0x10000",path],stdout=out,stderr=subprocess.STDOUT,check=True)
    assert "Hash of data verified" in log.read_text(errors="replace")
def worlds(log):
    for line in log.splitlines():
        if line.startswith('[{"name":'):
            apps={w["name"]:w for w in json.loads(line)}
            return all(apps[k]["engine"]=="native" and apps[k]["file"]==k+"/compiled.bin"
                       and not apps[k]["last_error"] for k in ("editor","agenda","files"))
    return False
def analyze(log, oracle):
    measures=re.findall(r"^(base|branch|compact|direct|pb|pd) compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)$",log,re.M)
    digests=re.findall(r"^LABSHA (\d+) (\d+) (\w+) ([a-f0-9]{64})$",log,re.M)
    assert len(digests)==20 and len(measures)>=20 and "LABCOMPLETE" in log
    rows=[]
    order=["base branch direct compact","branch compact base direct","compact direct branch base","direct base compact branch","pb pd","pd pb"]
    slots=[(i,j,l) for i,r in enumerate(order) for j,l in enumerate(r.split())]
    for (lane,us,peak,size),(b,pos,who,digest),expected in zip(measures,digests,slots):
        assert lane==who and (int(b),int(pos),lane)==expected
        assert oracle["lanes"][lane]=={"size":int(size),"sha256":digest}
        rows.append(dict(block=int(b),position=int(pos),lane=lane,us=int(us),peak=int(peak),size=int(size),sha256=digest))
    phases=re.findall(r"^LABPHASE (pb|pd) (\d+) (\d+) (\d+) (\d+)$",log,re.M)
    assert len(phases)==48
    for k,row in enumerate(rows[16:]):
        batch=phases[k*12:k*12+12]
        assert [int(x[1]) for x in batch]==list(range(12)) and all(x[0]==row["lane"] for x in batch)
        row["phases"]=[dict(phase=int(i),visits=int(v),us=int(t),peak=int(h)) for _,i,v,t,h in batch]
        assert max(x["peak"] for x in row["phases"])==row["peak"]
        assert abs(sum(x["us"] for x in row["phases"])-row["us"])<15000
    return rows

assert (work/"build/partition_table/partition-table.bin").read_bytes().ljust(4096,b"\xff")==(work/"original/partition-table.bin").read_bytes()
assert saved.stat().st_size==8*1024**2 and 0<app.stat().st_size<saved.stat().st_size
oracle=run_json("node",here/"oracle.mjs",work)
prior,=day.glob("PICOCALC-COMPILER-INTEGRATION--*/scripts/files-compare-p4")
probe=work/"tree/picocalc-os/port/esp32p4/main/lab"
# Reuse the independently written linked-symbol and alignment validator against the exact trial ELF.
audit=work/"probe-elf-audit"
(audit/"build").mkdir(parents=True,exist_ok=True)
for alias,target in [(audit/"manifest.json",probe/"manifest.json"),
                     (audit/"build/files_compare_cycles.elf",app.with_suffix(".elf")),
                     (audit/"build/files_compare_cycles.bin",app)]:
    if not alias.exists():
        alias.symlink_to(target)
    assert alias.resolve()==target.resolve()
subprocess.run(py(prior/"check-elf.py",audit),check=True)
receipt=dict(oracle=oracle,original_partition_sha256=sha(saved),trial_firmware_sha256=sha(app))
def observations(logfile):
    log=logfile.read_text(errors="replace")
    assert worlds(log), "missing native worlds after trial"
    receipt["rows"]=analyze(log,oracle)
    # The OS kernel task is pinned to 1 in main_p4.c. The standalone leaf
    # benchmark runs in the IDF main task, which its own config pins to 0.
    original=(prior/"summarize.py").read_text()
    key='int(meta["core"]) == 0'
    assert original.count(key)==1
    validator=work/"validate-kernel-pairs.py"
    validator.write_text(original.replace(key,'int(meta["core"]) == 1'))
    receipt["cycles"]=run_json(*py(validator,logfile,probe/"manifest.json"))
    receipt["pairs"]=[s for s in log.splitlines() if s.startswith("FCBENCH PAIR ")]
if args.analyze:
    observations(args.analyze)
    write("observations-"+args.analyze.stem+".json",receipt)
    sys.exit(0)
write("study.json",receipt)
hold("start")
try:
    flash("experiment",app)
    log=capture("first-boot",84,["80 worlds"])
    name="first-boot"
    if "LABSHA 0 0 base " not in log and worlds(log):
        capture("full-boot",84,["0.4 reboot","80 worlds"])
        name="full-boot"
    observations(work/(name+".log"))
    write("study.json",receipt)
    checker,=day.glob("PICOCALC-EDITOR-CAPACITY--*/scripts/03-check-large-preview-on-p4.py")
    subprocess.run(py(checker,"--engine","native","--port",args.port,"--output",work/"preview","--long-inline"),check=True)
    verify,=day.glob("PICOCALC-COMPILER-THESIS--*/scripts/supervisor/p4-verify-preview.py")
    receipt["preview"]=run_json(*py(verify,work/"preview"))
finally:
    hold("restore")
    flash("restore",saved)
    restored=capture("restore-worlds",17,["14 worlds"])
    assert worlds(restored), "restored firmware did not report all three compiled native worlds"
    receipt["verified_factory_restore"]=True
    write("study.json",receipt)
