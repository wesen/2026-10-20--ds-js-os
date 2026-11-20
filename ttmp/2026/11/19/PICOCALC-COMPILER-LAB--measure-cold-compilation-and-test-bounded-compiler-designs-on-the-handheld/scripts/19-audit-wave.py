"""Replay the supervisor's integrity checks for the six ticket documents and published findings."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy

import yaml

HERE = Path(__file__).resolve().parent
TICKET = HERE.parent
DAY = TICKET.parent
EVIDENCE = TICKET / "various"
STUDIES = ("COMPILER-LAB", "FRONTEND-COLD", "STAGED-RV32", "BOUNDED-FACTS", "FUNCTION-REBUILD", "LAB-REVIEW")
GENERIC = ("scanner-independent", "native", "bounded")


def documents():
    counts = {}
    for name in STUDIES:
        ticket, = DAY.glob("PICOCALC-"+name+"--*")
        docs = [ticket/"index.md"]
        for directory in ("design-doc", "analysis", "reference"):
            docs.extend((ticket/directory).glob("*.md"))
        for path in docs:
            text = path.read_text()
            _, header, body = text.split("---\n",2)
            assert yaml.safe_load(header)["Ticket"]=="PICOCALC-"+name
            for ref in re.findall(r"\]\(([^)\n]+)\)",body):
                if ref.startswith(("https:", "http:", "#", "repo:")):
                    continue
                assert (path.parent/ref.split("#")[0]).exists(), f"{path}: {ref}"
        counts[name] = len(docs)
    return counts


def boards():
    summarize = runpy.run_path(str(HERE/"05-summarize.py"))["summarize"]
    counts = {}
    for name in GENERIC:
        raw = json.loads((EVIDENCE/(name+"-physical.json")).read_text())
        assert len(raw["boots"])==2 and raw["restored"]
        assert summarize(raw)==json.loads((EVIDENCE/(name+"-summary.json")).read_text())
        counts[name] = sum(len(boot["rows"]) for boot in raw["boots"])
    return counts


def live():
    results = {}
    for item, filename, expected in (("small","slot80-physical.json",3), ("select","select-world.json",1),
                                     ("standard","staged-standard-world.json",3)):
        receipt = json.loads((EVIDENCE/filename).read_text())
        assert receipt["restored"] and receipt["control_after"]["engine"]=="native"
        assert len(receipt["boots"])==expected
        assert len({b["compiled_sha256"] for b in receipt["boots"]})==1
        results[item] = receipt
        if item != "standard":
            assert receipt["preview"]["input_bytes"]==65536 and receipt["preview"]["scratch_removed"]
            assert receipt["pixels"]["all_pixels_outside_clock_match"]
    sha = hashlib.sha256((EVIDENCE/"editor-small-slot-preview.png").read_bytes()).hexdigest()
    assert sha==results["small"]["preview"]["screenshots"]["shot-1.png"]
    for small, standard in zip(results["small"]["boots"],results["standard"]["boots"]):
        assert standard["module_bytes"]-small["module_bytes"]==144*1024
        assert standard["world_kib"]-small["world_kib"]==144
    return {k:r["boots"][0]["world_kib"] for k,r in results.items()}


def incremental():
    functions=runpy.run_path(str(HERE/"17-compare-rebuild.py"))
    lane,=DAY.glob("PICOCALC-FUNCTION-REBUILD--*")
    expected=json.loads((EVIDENCE/"incremental-comparisons.json").read_text())
    counts={}
    for name,key,estimator in (("p4-rebuild","components","paired"),("p4-endpoint","continuous","continuous")):
        raw=functions["read"](lane/"various"/(name+".json.gz"))
        assert raw["restored"] and len(raw["boots"])==2
        assert [functions[estimator](boot) for boot in raw["boots"]]==expected[key]
        counts[key]=sum(len(boot["rows"]) for boot in raw["boots"])
    return {"component_requests":counts["components"],"continuous_edited_executions":counts["continuous"]}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--include-live",action="store_true")
    args=parser.parse_args()
    receipt={"checked_documents":documents(),"generic_board_compiles":boards()}
    if args.include_live:
        receipt["normal_editor_world_kib"]=live()
        receipt["incremental"]=incremental()
    print(json.dumps(receipt,indent=2))
