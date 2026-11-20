"""Extract the measurements an independent researcher needs without forwarding any device console log."""
import argparse
import json
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("workflow",type=Path)
    p.add_argument("search",type=Path)
    p.add_argument("output",type=Path)
    args=p.parse_args()
    host=json.loads(args.workflow.read_text())
    search=json.loads(args.search.read_text())
    lines=[
        "Independent Editor experiment. The original scoped hypotheses are G3/G4 in PICOCALC-NATIVE-NEXT. Use explicit clock boundaries; do not invent any interactions.",
        "Arms: pre-G complete typed Editor at 1357545 uses hand-written continuations and E1–E7, including exhaustive Find phases. Final compiled-await Editor is 2e4fee1. Same full typed app source emitted under final compiler and first combined port 7b321a9 gives byte-identical linked artifacts. The new app uses 57 declared state words and 13 generated (total 70), vs 71 pre-G. The title length is stored in an existing spare buffer cell. G3 alone uses 71. G3 added 264 native words to its E6 control (21,922 to 22,186); G4 adds 106 further (22,292). All 24 frozen host replays pass on all key revisions. The 13 Editor workflows compare the app with its JS reference. Five additional fixtures exercise timer and input order on real Wasm and emulated RV32 reactors. The controlled delivery was necessary where normal kernel routing serializes requests. Do not label injected events physical keypresses.",
        "Both engines run on the actual PicoCalc P4. The standard test covers typing, file save/readback, simple Find, Markdown preview, discard and cleanup, with three trials per engine per arm. Device firmware is separately built for the two engines. Wall time sent to the app is fixed to show the identical clock in each raw screenshot, but all timers and timeout decisions still use the actual monotonic clock. Test directory name differs between emulation engines by design, so only compare screenshots within an engine. The code to reproduce is in PICOCALC-EG-QUAL/scripts. 03-board-qualification.py replays the historical serial workflow; 05-find-observer.inc and 07-time-find.py measure Find from delivering Enter in an exact query prompt to producing a retained frame with the expected result. This elapsed clock includes scheduling; the separate Editor CPU clock includes the sum of Editor segments; engine time includes reactor and SDK execution. No logic analyzer, hardware key-to-pixel time or source compiler instruction profile measured here.",
    ]
    for engine, metrics in host["workflow"].items():
        for label in ("us","peak_js_bytes","module_bytes","workflow_cpu_ms"):
            d=metrics[label]
            lines.append(f"{engine} {label}: manual {d['before']} vs await {d['after']}; medians {d['before_median']} → {d['after_median']}; {d['percent']:+.2f}%. The us field is the compiler interval, not entire boot.")
        lines.append(f"{engine}: number of distinct raw search/preview screenshot hashes across all six runs: "+str({k:len(v) for k,v in metrics['frame_sha256'].items()}))
    lines.append("Prespecified gates computed from physical data: "+str(host['gates']))
    lines.append("The separately timed query fixture has exactly 65,536 bytes, 851 CR LF lines of repeated text plus a last nine bytes 'needlezzz'. Early query ext → column 2, line 1. Dense miss text text z exhausts its candidate positions; unique late needle → line 852, column 1. Line number alone does not predict search cost; the SDK can skip a line in one seek. Search outcomes verified on BOTH physical engines before timings accepted. One complete physical measurement per query/engine/arm unless repeated trial numbers appear below. No confidence intervals or workload-wide speed claims from such an exploratory sample.")
    for r in search['rows']:
        m=r['wall_us']; c=r['editor_cpu_us']; seg=r['editor_segments']; settle=r['settlements']
        lines.append(f"engine={r['engine']} trial={r['trial']} query={r['case']} elapsed {m['before']}→{m['after']} μs ({m['percent']:+.2f}%), Editor CPU {c['before']}→{c['after']} μs ({c['percent']:+.2f}%), Editor segments {seg['before']}→{seg['after']}, delivered settlements {settle['before']}→{settle['after']}.")
    args.output.write_text("\n\n".join(lines)+"\n")

if __name__=="__main__": main()
