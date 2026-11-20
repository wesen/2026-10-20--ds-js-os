"""Use the prior independent chunk/diagnostic suite with fusion held constant in both arms."""
from pathlib import Path
import argparse
import shutil
import subprocess
import json

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("work",type=Path)
work=p.parse_args().work.resolve()
day=Path(__file__).resolve().parents[2]
suite,=day.glob("PICOCALC-RV32-STUDIES--*/scripts/examiner")
dest=work/"correctness/boundaries"
dest.mkdir()
shutil.copyfile(suite/"compiler.mjs",dest/"compiler.mjs")
contents=(suite/"output.mjs").read_text()
key="const {realm:base}=compiler(),"
assert contents.count(key)==1
runner=dest/"output.mjs"
runner.write_text(contents.replace(key,"const {realm:base}=compiler(process.argv[5]),"))
result=json.loads(subprocess.check_output(["node",runner,"compact",work/"lanes/both",work/"build/esp-idf/main",work/"lanes/branch"],text=True))
result["mode"]="fusion plus compact versus fusion alone"
result["control_backend_sha256"]=json.loads((work/"compilers.json").read_text())["branch"]
(work/"correctness/boundaries.json").write_text(json.dumps(result,indent=2)+"\n")
