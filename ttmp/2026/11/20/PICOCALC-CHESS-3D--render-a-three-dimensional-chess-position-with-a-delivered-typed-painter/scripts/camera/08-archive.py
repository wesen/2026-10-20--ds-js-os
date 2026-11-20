"""Archive just the 33 recorded unmodified camera frames and their UART packets."""
import argparse
import gzip
import io
from pathlib import Path
import re
import tarfile


def pack(capture, target):
    raw = (capture/"uart.log").read_bytes()
    marker = b"CAMSTATE 33 0 0 0"
    before, _, after = raw.partition(marker)
    frames = [line for line in before.splitlines() if line.startswith(b"CAMFRAME ")][-33:]
    shots = re.findall(rb"#SHOT 320 320\r?\n(.*?)#END ([0-9a-fA-F]{8}) ([0-9]+)",after,re.S)[:33]
    assert len(frames) == len(shots) == 33
    lines = frames+[marker]
    for payload, crc, count in shots:
        lines.append(b"#SHOT 320 320")
        lines.extend(line.strip() for line in payload.splitlines() if re.fullmatch(rb"[A-Za-z0-9+/]+=*",line.strip()))
        lines.append(b"#END "+crc+b" "+count)
    with target.open("wb") as file, gzip.GzipFile(fileobj=file,mode="wb",mtime=0,filename="") as zipped:
        with tarfile.open(fileobj=zipped,mode="w|",format=tarfile.USTAR_FORMAT) as archive:
            def add(name, data):
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info,io.BytesIO(data))
            add("uart.log",b"\n".join(lines)+b"\n")
            for phase in range(33):
                name = (f"phase-{phase:02}" if phase<32 else "phase-32-wrap")+".rgb565"
                add(name,(capture/name).read_bytes())


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("capture",type=Path)
    p.add_argument("archive",type=Path)
    a=p.parse_args()
    pack(a.capture,a.archive)
