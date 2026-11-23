#!/usr/bin/env python3
"""Bring the Candela gallery to the front (launcher, then its key "p"), so bench/board/gallery.py finds it drawing
after 06-board.py has left the launcher in front. usage: python3 07-open-gallery.py LOG"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[6] / "bench/board"))
import device  # noqa: E402

with device.acquire(), open(sys.argv[1], "wb", buffering=0) as log:
    console = device.Console(device.PORT, log)
    try:
        console.command("key f1")
        time.sleep(1.5)
        console.command("key p")
        time.sleep(2)
        print([l for l in console.command("worlds") if "gallery" in l][:1] and "gallery world present")
    finally:
        console.close()
