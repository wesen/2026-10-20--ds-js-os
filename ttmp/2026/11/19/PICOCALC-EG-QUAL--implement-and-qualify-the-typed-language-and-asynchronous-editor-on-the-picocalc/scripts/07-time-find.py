"""Time three complete searches through the real Editor reactor on each physical engine."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy

HERE=Path(__file__).resolve().parent
MATCHED=runpy.run_path(str(HERE/"03-board-qualification.py"))
BOARD=MATCHED["BOARD"]
CAPACITY,=HERE.parent.parent.glob("PICOCALC-EDITOR-CAPACITY--*/scripts/03-check-large-preview-on-p4.py")
UPLOAD=runpy.run_path(str(CAPACITY))["stage_document"]
DOC=(b"text "*15+b"\r\n")*851+b"needlezzz"
QUERIES=(("early","ext"),("miss","text text z"),("late","needle"))


def exercise(args, engine, trial, out):
    image=args.images/engine/"picocalc-os-p4.bin"
    BOARD["flash"](args,out,image,"find")
    def capture(name,seconds,commands,shots=False):
        return BOARD["capture"](args.port,out,name,seconds,commands,screenshots=shots)
    boot=capture("boot",18,["1 reboot","15 worlds"])
    expected_engine="native" if engine=="rv32" else "wasm"
    app,=(w for w in json.loads(next(x for x in boot.splitlines() if x.startswith('[{"name":'))) if w["name"]=="editor")
    if app["engine"]!=expected_engine or app["last_error"]: raise ValueError("benchmark boot failed")
    # Unique names prevent a saved cursor from giving an earlier trial's position to the next one.
    prefix = "b" if args.kind == "control" else "g"
    tag=f"{prefix}{engine[0]}{trial}"
    directory="eg-find-"+tag
    leaf=tag+".txt"
    path=directory+"/"+leaf
    missing="no directory "+directory+"\n#OK ls"
    found=capture("preflight",1.5,["0.3 ls "+directory])
    if missing in found:
        setup=capture("setup",7,["0.4 key f1","1.1 key d","1.9 key f3","2.5 type "+directory,
                                "4.7 key enter","6 ls "+directory])
        if missing in setup or "#OK ls" not in setup: raise ValueError("Files did not create the scratch directory")
    else:
        # Recover only the empty directory which an earlier, recorded trial created.
        prior=args.resume_empty
        if not prior or found.strip()!="#OK ls" or missing not in (prior/"preflight.log").read_text() or (
                "fs: op 5 on "+directory+" took ") not in (prior/"setup.log").read_text():
            raise ValueError("benchmark directory already exists")
        listing=capture("root",3,["0.3 key f1","0.8 key d","2 ls"])
        folders=sorted(re.findall(r"^  ([^/\n]+)/$",listing,re.M))
        position=folders.index(directory)
        # Fresh Files selects row zero. Directories come first, sorted by code unit.
        if position>=25 or not all(name.isascii() for name in folders): raise ValueError("unexpected root ordering")
        if position:
            capture("select",position*0.4+1,[f"{0.3+i*0.4:.2f} key down" for i in range(position)])
    with (out/"put.log").open("wb") as log: UPLOAD(args.port,log,path,DOC)
    listing=capture("staged",2,["0.3 ls "+directory])
    if not re.search(rf"^  {re.escape(leaf)}\s+65536$",listing,re.M): raise ValueError("staged file length differs")
    opened=capture("open",7,["0.3 key enter","1.8 key enter","6 worlds"])
    if "editor crashed" in opened: raise ValueError("Editor failed to open the document")
    rows=[]
    for index,(case,query) in enumerate(QUERIES):
        # F3, Escape cancels the existing query and empties its buffer. Reopen the prompt when needed.
        commands=(["0.25 key f3","0.9 key esc","1.6 key f3"] if index else ["1.6 key f3"])
        commands += ["2.35 type "+query,"4.1 egfind "+case+" "+leaf,"4.5 key enter","14 shot","18 worlds"]
        result=capture(case,19.5,commands,True)
        observation=re.findall(r"^EGFIND (\w+) (\d+) (\d+) (\d+) (\d+) (\d+)$",result,re.M)
        if len(observation)!=1 or observation[0][0]!=case or "EGBAD" in result or "editor crashed" in result:
            raise ValueError(f"{case}: did not observe the expected prompt, Enter and completed status")
        _,wall,cpu,execution,segments,settlements=observation[0]
        # The capture tool numbers images from one per command invocation.
        shot=out/f"{case}.png"
        (out/"shot-1.png").replace(shot)
        if "crc ok" not in (out/f"{case}-capture.log").read_text(): raise ValueError("unverified screenshot")
        values=dict(wall_us=int(wall),editor_cpu_us=int(cpu),engine_us=int(execution),
                    editor_segments=int(segments),settlements=int(settlements))
        # A late unique hit can skip almost a whole line in one SDK seek.
        # Only the dense miss forces more than one application work slice.
        if not 0<values["engine_us"]<=values["editor_cpu_us"]<=values["wall_us"] or (case=="miss" and values["settlements"]<1):
            raise ValueError(f"{case}: impossible time accounting or missing yields: {values}")
        rows.append(dict(case=case,query=query,frame=hashlib.sha256(shot.read_bytes()).hexdigest(),**values))
    clean=capture("cleanup",9,["0.4 key esc","1.2 key f5","2 key f5","3.3 key backspace",
                              "4.1 key f5","4.9 key f5","7 ls "+directory])
    if missing not in clean: raise ValueError("scratch cleanup failed")
    return dict(engine=engine,trial=trial,document=leaf,image=hashlib.sha256(image.read_bytes()).hexdigest(),rows=rows)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for n in ("images","output","backup","esptool"):p.add_argument("--"+n,type=Path,required=True)
    p.add_argument("--port",default="/dev/ttyACM0");p.add_argument("--kind",choices=["control","candidate"],required=True)
    p.add_argument("--repetitions",type=int,default=1,choices=range(1,4))
    p.add_argument("--resume-empty",type=Path,help="prior trial with proof it created an empty scratch directory")
    a=p.parse_args()
    a.esptool_python=a.esptool.parent/"python"
    original=MATCHED["validate"](a)
    a.output.mkdir(parents=True,exist_ok=False)
    result=dict(kind=a.kind,input_bytes=len(DOC),sha256=hashlib.sha256(DOC).hexdigest(),trials=[],restored=False)
    def save(): MATCHED["write_json"](a.output/"physical.json",result)
    save()
    try:
        for trial in range(1,a.repetitions+1):
            engines=["rv32","wasm"] if (a.kind=="control")==(trial%2==1) else ["wasm","rv32"]
            for engine in engines:
                sub=a.output/(engine+str(trial));sub.mkdir()
                result["trials"].append(exercise(a,engine,trial,sub));save()
    finally:
        BOARD["flash"](a,a.output,original,"restore")
        result["worlds"]=MATCHED["worlds"](BOARD["capture"](a.port,a.output,"restored",18,["14 worlds"]))
        result["restored"]=True;save()


if __name__=="__main__":main()
