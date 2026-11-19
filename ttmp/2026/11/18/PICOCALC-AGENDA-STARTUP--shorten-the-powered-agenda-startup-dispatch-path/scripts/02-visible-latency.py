#!/usr/bin/env python3
"""Bound physical key-to-LCD latency from frame indices annotated in a video."""
import argparse
import json
from pathlib import Path
from statistics import median
import subprocess


def timestamps(video):
    probe = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
         "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(video)]
    )
    return [float(frame["best_effort_timestamp_time"]) for frame in json.loads(probe)["frames"]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--trial", type=int, nargs=2, action="append", required=True,
                        metavar=("KEY_FRAME", "LCD_FRAME"),
                        help="first zero-based frame with key visibly depressed and first displaying Agenda")
    parser.add_argument("--capture-fps", type=float,
                        help="known sensor rate for a retimed clip retaining every captured frame")
    args = parser.parse_args()
    frames = timestamps(args.video)
    if args.capture_fps is not None:
        if args.capture_fps <= 0:
            parser.error("capture rate must be positive")
        frames = [index / args.capture_fps for index in range(len(frames))]
    if any(a >= b for a, b in zip(frames, frames[1:])):
        parser.error("frame timestamps must be strictly increasing")

    rows = []
    for key, lcd in args.trial:
        if not 0 < key <= lcd < len(frames):
            parser.error("require 0 < key frame <= LCD frame < video length")
        low = max(0, frames[lcd - 1] - frames[key]) * 1000
        high = (frames[lcd] - frames[key - 1]) * 1000
        rows.append({
            "key_frame": key, "lcd_frame": lcd, "lower_ms": round(low, 3),
            "upper_ms": round(high, 3), "midpoint_ms": round((low + high) / 2, 3),
        })
    print(json.dumps({
        "time_base": "verified sensor rate" if args.capture_fps else "real-time video presentation timestamps",
        "capture_fps": args.capture_fps, "frame_count": len(frames),
        "median_midpoint_ms": median(row["midpoint_ms"] for row in rows), "trials": rows,
    }, indent=2))


if __name__ == "__main__":
    main()
