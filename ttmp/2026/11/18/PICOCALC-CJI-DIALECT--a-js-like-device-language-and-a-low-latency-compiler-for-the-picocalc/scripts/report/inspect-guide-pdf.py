"""Print a layout and link receipt and optionally render PDF page grids."""
import argparse
from collections import Counter
from pathlib import Path

import fitz


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("pdf", type=Path)
parser.add_argument("--expect-figures", type=int, help="check the layout, links and this figure count")
parser.add_argument("--screenshots", type=Path, help="directory for per-page PNGs and overview")
args = parser.parse_args()
doc = fitz.open(args.pdf)
outlines = doc.get_toc()
print(f"{len(doc)} pages, {len(outlines)} outline entries")
for depth, title, page in outlines:
    print(f"  outline level={depth} page={page} {title}")

links = Counter()
outside = []
links_outside = []
overlaps = []
figure_count = 0
for page in doc:
    texts = []
    spans = []
    for block in page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]:
        for line in block["lines"]:
            values = "".join(span["text"] for span in line["spans"]).strip()
            if values:
                texts.append(values)
                spans.extend(line["spans"])
    images = page.get_image_info()
    figure_count += len(images)
    bounds = fitz.Rect()
    for span in spans:
        rect = fitz.Rect(span["bbox"])
        bounds |= rect
        if not page.rect.contains(rect):
            outside.append((page.number + 1, span["text"], str(rect)))
    text_rects = sorted(
        [(fitz.Rect(span["bbox"]), span["text"]) for span in spans if span["text"].strip()],
        key=lambda item: item[0].y0,
    )
    for index, (a, first) in enumerate(text_rects):
        for b, second in text_rects[index + 1:]:
            if b.y0 >= a.y1:
                break
            shared = a & b
            if shared.width > 6 and shared.height > 0.65 * min(a.height, b.height):
                overlaps.append((page.number + 1, first, second))
    for detail in images:
        rect = fitz.Rect(detail["bbox"])
        if not page.rect.contains(rect):
            outside.append((page.number + 1, "IMAGE", str(rect)))
    for link in page.get_links():
        kind = link["kind"]
        target = link.get("uri") or link.get("file") or link.get("name") or ""
        if kind == fitz.LINK_GOTO or "nameddest" in link:
            links["internal"] += 1
            if not 0 <= link.get("page", -1) < len(doc):
                links_outside.append((page.number + 1, link["page"]))
        elif target.startswith(("https://", "http://")):
            links["web"] += 1
        else:
            links["file-or-other"] += 1
            print(f"  file/other link p{page.number + 1}: {target}")
    image_bounds = [tuple(round(x, 1) for x in detail["bbox"]) for detail in images]
    text_bounds = tuple(round(x, 1) for x in bounds)
    print(f"p{page.number + 1:02} lines={len(texts)} text={text_bounds} images={image_bounds}")
    print(f"  first: {texts[0] if texts else ''}")
    print(f"  last:  {' / '.join(texts[-3:])}")
print(f"figures={figure_count} links={dict(links)} invalid-internal={links_outside} outside-page={outside} overlaps={overlaps}")

if args.screenshots:
    from PIL import Image, ImageDraw

    args.screenshots.mkdir(parents=True, exist_ok=True)
    tiles = []
    for page in doc:
        filename = args.screenshots / f"page-{page.number + 1:02}.png"
        page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2), alpha=False).save(filename)
        full = Image.open(filename)
        full.thumbnail((218, 282))
        tiles.append(full.copy())
    for start in range(0, len(tiles), 12):
        group = tiles[start:start + 12]
        width, height = 230, 305
        overview = Image.new("RGB", (4 * width, ((len(group) + 3) // 4) * height), "#e1e3e4")
        labels = ImageDraw.Draw(overview)
        for offset, tile in enumerate(group):
            x, y = (offset % 4) * width + 6, (offset // 4) * height + 3
            overview.paste(tile, (x, y))
            labels.text((x + 4, y + 285), f"Page {start + offset + 1}", fill="#222222")
        overview.save(args.screenshots / f"overview-{start // 12 + 1}.png")

if args.expect_figures is not None:
    if figure_count != args.expect_figures or links_outside or outside or overlaps or links["file-or-other"]:
        raise SystemExit("PDF layout or link validation failed")
    if sum(depth == 1 for depth, _, _ in outlines) != 1 or max(depth for depth, _, _ in outlines) != 2:
        raise SystemExit("Expected one title and a two-level PDF outline")
