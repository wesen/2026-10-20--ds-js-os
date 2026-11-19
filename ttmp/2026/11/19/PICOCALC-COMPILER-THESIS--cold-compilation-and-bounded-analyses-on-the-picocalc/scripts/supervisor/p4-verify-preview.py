"""Compare the physical preview screenshots to the qualified image, excluding only the clock digits."""
from pathlib import Path
import json
import sys
from PIL import Image, ImageChops

ticket = Path(__file__).resolve().parents[2]
reference, = ticket.parent.glob("PICOCALC-EDITOR-INLINE--*/various/p4-full-inline.png")
expected = Image.open(reference).convert("RGB")
assert expected.size == (640, 640)
results = {}
for shot in ("shot-1.png", "shot-2.png"):
    captured = Image.open(Path(sys.argv[1]) / shot).convert("RGB")
    assert captured.size == expected.size
    bbox = ImageChops.difference(captured, expected).getbbox()
    if bbox and not (546 <= bbox[0] < bbox[2] <= 630 and 6 <= bbox[1] < bbox[3] <= 36):
        raise ValueError(f"{shot}: pixels outside the status clock changed: {bbox}")
    results[shot] = bbox
print(json.dumps({"changed_pixel_bounds":results, "all_pixels_outside_clock_match":True}, indent=2))
