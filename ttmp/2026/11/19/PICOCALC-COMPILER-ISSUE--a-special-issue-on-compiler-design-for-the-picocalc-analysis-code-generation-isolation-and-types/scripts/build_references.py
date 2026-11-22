#!/usr/bin/env python3
"""Build the issue's consolidated reference list.

Collects the "References" section of every article, removes duplicates, and attaches a DOI or URL
to each entry by looking its title up in the verified bibliography notes under sources/.
Writes sources/issue/12-references.md. Entries with no link found are listed at the end of the run.
"""
import re
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
ISSUE = TICKET / "sources" / "issue"
bib = "\n".join(p.read_text() for p in sorted((TICKET / "sources").glob("bib-*.md")))
bib_norm = re.sub(r"[^a-z0-9 ]+", " ", bib.lower())
bib_norm = re.sub(r"\s+", " ", bib_norm)


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", text.lower())).strip()


# Links checked by hand against Crossref or the source itself, for works outside the three verification notes.
EXTRA = {
    "Georges et al. 2007": "https://doi.org/10.1145/1297027.1297033",
    "Mytkowicz et al. 2009": "https://doi.org/10.1145/1508284.1508275",
    "Maranget 2007": "https://doi.org/10.1017/S0956796807006223",
    "Waterman 2011": "https://www2.eecs.berkeley.edu/Pubs/TechRpts/2011/EECS-2011-63.html",
    "Cooper & Torczon 2023": "ISBN 978-0-12-815412-0",
    "Herman et al. 2014": "https://github.com/asm-js/spec",
}
HEADING = re.compile(r"^#{2,4} ", re.M)
BARE_DOI = re.compile(r"DOI:\*{0,2}\s*(10\.\d{4,9}/[^\s;,)]+)")
URL = re.compile(r"https?://[^\s)>\]`,;*]+")


def link_for(title: str) -> str | None:
    key = norm(title)
    if len(key) < 12:
        return None
    pattern = r"[^a-z0-9]*".join(re.escape(w) for w in key.split())
    match = re.search(pattern, bib, re.I)
    if not match:
        return None
    # the verification note's entry that contains the title: from the previous heading to the next
    starts = [m.start() for m in HEADING.finditer(bib)]
    begin = max([i for i in starts if i <= match.start()], default=0)
    finish = min([i for i in starts if i > match.start()], default=len(bib))
    urls = [(abs(m.start() - match.start()), m.group(0).rstrip(".")) for m in URL.finditer(bib, begin, finish)]
    urls += [(abs(m.start() - match.start()), "https://doi.org/" + m.group(1).rstrip(".")) for m in BARE_DOI.finditer(bib, begin, finish)]
    if not urls:
        return None
    dois = [u for u in urls if "doi.org" in u[1]]
    return min(dois or urls)[1]


entries: dict[str, tuple[str, set[str]]] = {}
for article in sorted(ISSUE.glob("[0-9][0-9]-*.md")):
    text = article.read_text()
    section = re.search(r"^## References\n(.*)\Z", text, re.S | re.M)
    if not section:
        continue
    number = str(int(article.name[:2]))
    for line in section.group(1).splitlines():
        if not line.startswith("- "):
            continue
        body = line[2:].strip()
        key_match = re.match(r"\[([^\]]+)\]", body)
        key = key_match.group(1) if key_match else body[:60]
        if key in entries:
            old_body, where = entries[key]
            where.add(number)
            if len(body) > len(old_body):
                entries[key] = (body, where)
        else:
            entries[key] = (body, {number})

lines = ["# References", "",
         "Every work cited in the issue, in alphabetical order of citation key. The numbers in brackets at the end of an entry",
         "are the articles that cite it. Bibliographic details and the stated findings were checked against publisher records,",
         "the papers' own text or official documentation on 19 November 2026; the three verification notes are reproduced in the",
         "appendix, including the four corrections they produced.", ""]
missing = []
for key in sorted(entries, key=lambda k: norm(k)):
    body, where = entries[key]
    title = re.search(r"\"([^\"]+)\"", body) or re.search(r"\*([^*]+)\*", body)
    link = EXTRA.get(key) or (link_for(title.group(1).rstrip(".")) if title else None)
    if not link:
        missing.append(key)
    cited = ", ".join(sorted(where, key=int))
    lines.append(f"- {body}{' ' + link if link and link not in body else ''} [{cited}]")
(ISSUE / "12-references.md").write_text("\n".join(lines) + "\n")
print(f"{len(entries)} entries; {len(missing)} without a link: {missing}")
