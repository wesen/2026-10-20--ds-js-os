"""Score each physical screenshot against the legacy Wasm Chess host result."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
from PIL import Image

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("expected",type=Path)
p.add_argument("observed",type=Path)
p.add_argument("output",type=Path)
a=p.parse_args()
results={}
for stage in ("e2","e3","f3"):
    host=Image.open(a.expected/(stage+".png")).convert("RGB")
    if host.size!=(640,640):
        raise ValueError("expected 2x simulator capture")
    # The simulator writes four identical pixels for every physical pixel.
    small=host.resize((320,320),Image.Resampling.NEAREST)
    if small.resize(host.size,Image.Resampling.NEAREST).tobytes()!=host.tobytes():
        raise ValueError("host is not a nearest-neighbor 2x capture")
    expected=b"".join(struct.pack("<H", ((r>>3)<<11)|((g>>2)<<5)|(b>>3))
                      for r,g,b in small.get_flattened_data())
    actual=(a.observed/(stage+".rgb565")).read_bytes()
    if len(actual)!=320*320*2:
        raise ValueError("invalid physical capture length")
    def diff(start,stop):
        return [i for i in range(start,stop) if actual[i*2:i*2+2]!=expected[i*2:i*2+2]]
    changed=diff(22*320,320*320)
    top=diff(0,22*320)
    results[stage]={"examinedPixels":(320-22)*320,"different":len(changed),"statusBarDifferent":len(top),
                    "appSha256":hashlib.sha256(actual[22*640:]).hexdigest(),
                    "expectedSha256":hashlib.sha256(expected[22*640:]).hexdigest(),
                    "firstDifference":[changed[0]%320,changed[0]//320] if changed else None}
a.output.write_text(json.dumps(results,indent=2)+"\n")
if any(v["different"] for v in results.values()):
    raise SystemExit("pixel mismatch")
