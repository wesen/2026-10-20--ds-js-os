# reMarkable publication receipt

The 19-page guide was uploaded on 2026-11-18. The cloud copy's embedded PDF matched the reviewed file byte for byte.

| Item | Value |
| --- | --- |
| Local deliverable | [picocalc-device-language-guide.pdf](picocalc-device-language-guide.pdf) |
| Canonical Markdown SHA-256 | `8c3015be6d231a0cfc72618d3b1d3eaad67d53c8c0e673328aa2ce5bdf139c24` |
| Local and downloaded PDF SHA-256 | `37cc2e5becf1b8630f32065be9428abad8e6da918a2a9feb98d19cecd1c3eff9` |
| PDF size | 346,080 bytes |
| Cloud path | `/ai/2026/11/18/PICOCALC-CJI-DIALECT/CJI Intern Guide - Rethinking the PicoCalc Device Language` |
| Cloud document ID | `c512405e-d691-4ee4-954e-768ec2dde76e` |
| Layout checks | 19 pages, four figures, one title, two outline levels, 89 destination links, 14 web link annotations, zero out-of-page spans or overlapping text |
| Delivery check | Listed the exact title in the target folder and compared the PDF embedded in the downloaded `.rmdoc` with the local copy |

```text
OK: uploaded /tmp/picocalc-pdf-publication.orlTAD/CJI Intern Guide - Rethinking the PicoCalc Device Language.pdf -> /ai/2026/11/18/PICOCALC-CJI-DIALECT
```

The upload used the document's exact final filename and omitted the overwrite and content-replacement flags. Cloud delivery and content identity are verified. Physical tablet synchronization was outside this check.

## Reproduce the local render

From the repository root, with Remarquee, Pandoc, XeLaTeX, PyMuPDF and Pillow available:

```sh
ticket=$(find ttmp/2026/11/18 -maxdepth 1 -type d -name '*CJI-DIALECT*')
render=$(mktemp -d /tmp/picocalc-guide.XXXXXX)
python3 "$ticket/scripts/report/stage-guide-pdf.py" \
  "$ticket"/design-doc/01-*.md "$render/stage"
remarquee upload bundle "$render"/stage/*.md \
  --name 'CJI Intern Guide - Rethinking the PicoCalc Device Language' \
  --toc-depth 2 --geometry 'margin=0.85in' \
  --latex-header-file "$ticket/scripts/report/guide-layout.tex" \
  --resolve-images --pdf-only --output-dir "$render" --non-interactive
python3 "$ticket/scripts/report/inspect-guide-pdf.py" "$render"/*.pdf \
  --expect-figures 4 --screenshots "$render/pages"
```

A later render can have a different PDF checksum because XeLaTeX records the creation time. The table identifies the specific artifact delivered.
