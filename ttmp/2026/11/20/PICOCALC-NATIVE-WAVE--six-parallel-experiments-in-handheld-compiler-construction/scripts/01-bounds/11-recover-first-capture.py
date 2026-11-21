"""Recover completed rows from the first capture without retaining unrelated UART lines."""
import importlib.util
import json
from pathlib import Path
import sys

capture, output = map(Path,sys.argv[1:])
device = Path(__file__).with_name("07-device.py")
spec = importlib.util.spec_from_file_location("wave_device",device)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
result=json.loads((capture/"receipt.json").read_text())
result.update({
    "nativeBatchCycles":{}, "compileSamples":[], "nativeChecked":None,
    "completed":False, "passed":False,
    "missing":{"world":"editor","arm":"bounds-selected","block":5},
    "observation":"The original reader's 280s deadline expired before the final result and combined completion check.",
})
for line in (capture/"uart.log").read_text(errors="replace").splitlines():
    runner.observations(result,line)
assert len(result["compileSamples"]) == 59
assert sum(len(arm) for endpoint in result["nativeBatchCycles"].values() for arm in endpoint.values()) == 165
assert not result["completed"] and result["restoreReadback"]
output.write_text(json.dumps(result,indent=2)+"\n")
