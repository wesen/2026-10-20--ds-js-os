"""Verify the two physical receipts and plot block-level Chess encoder measurements."""
import json
import statistics
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ticket = Path(__file__).resolve().parent.parent
data = ticket / "various"
windows = [json.loads((data / name).read_text()) for name in ("physical.json", "physical-followup.json")]
labels = {
    "pG": "Generic C, resident tree",
    "pN": "Generated typed RV32",
    "pR": "GCC layout table, loaded ELF",
    "pT": "GCC layout table, firmware",
    "pF": "Two cached layouts, firmware",
}
med = statistics.median

def select(window, arm, n):
    rows = [r for r in window["rows"] if r["arm"] == arm]
    assert sorted(r["block"] for r in rows) == list(range(n)), arm
    return sorted(rows, key=lambda r: r["block"])

def summary(values):
    return {"median": med(values), "min": min(values), "max": max(values)}

for w in windows:
    assert w["restored"] and w["baselineVerified"] and "error" not in w
    assert w["before"] == w["after"] and all(pair[1] == "" for pair in w["after"].values())
assert windows[0]["playable"] == windows[1]["playable"]
assert len(windows[0]["rows"]) == 28 and len(windows[0]["adaptive"]) == 42
assert len(windows[1]["rows"]) == 120
results = {}
series = {}
for index, (window, blocks, arms) in enumerate(zip(windows, [7, 10], ["G N T".split(), [*labels, "cT", "cF", "sT", "sF"]])):
    w = {}
    for arm in arms:
        rows = select(window, arm, blocks)
        calls = {"p": 47, "s": 20, "c": 24}.get(arm[0], 188)
        assert all(r["count"] == calls for r in rows)
        values = [r["encodeUs"] / calls for r in rows]
        series[arm] = values
        w[arm] = {"usPerFrame": summary(values), "verifiedEncodes": calls * blocks}
        if arm in ("pF", "sF", "cF"):
            hits = {"pF": 40, "sF": 16, "cF": 0}[arm]
            assert all((r["hits"], r["misses"]) == (hits, calls - hits) for r in rows)
            w[arm].update(hitsPerBlock=hits, missesPerBlock=calls-hits, cacheBytes=rows[0]["cacheBytes"])
    ins = select(window, "install", blocks)
    w["installUs"] = {field: summary([r[field] for r in ins]) for field in
                      ["prepUs", "generateUs", "compileUs", "qualifyLoadUs", "totalUs"]}
    if index == 1:
        for arm in ("prebuilt", "tableload"):
            rows = select(window, arm, blocks)
            w[arm] = {"loadUs": summary([r["loadUs"] for r in rows]), "elfBytes": rows[0]["bytes"]}
    results["first" if index == 0 else "followup"] = w
# Ratios use medians of block means. Also preserve paired ratios so readers can compare.
for arm, control in [("pN", "pG"), ("pT", "pG"), ("pR", "pG"), ("pF", "pG"),
                     ("pF", "pT"), ("pR", "pT"), ("pN", "pR"), ("cF", "cT"), ("sF", "sT")]:
    results.setdefault("timeChangePercent", {})[arm + "_vs_" + control] = {
        "ratioOfMedians": 100*(med(series[arm])/med(series[control])-1),
        "pairedBlocks": summary([100*(x/y-1) for x,y in zip(series[arm], series[control])])}
(data / "physical-summary.json").write_text(json.dumps(results, indent=2) + "\n")
plt.rcParams.update({"font.size": 10, "font.family": "DejaVu Sans"})
fig, (ax, bx) = plt.subplots(2, 1, figsize=(8.8, 6.5), layout="constrained",
                             gridspec_kw={"height_ratios": [2.5, 1.5]})
for i, arm in enumerate(labels):
    vals = series[arm]
    mid = med(vals)
    ax.barh(i, mid, color=("#344e65" if arm == "pG" else "#087c77" if arm == "pF" else "#649bb3"))
    ax.scatter(vals, [i+.13]*len(vals), color="#253947", s=7, zorder=3, alpha=.65)
    ax.text(max(vals)+2, i, f"{mid:.1f} µs", va="center")
ax.set_yticks(range(len(labels)), list(labels.values()))
ax.set_xlim(0, max(max(series[a]) for a in labels)*1.20)
ax.invert_yaxis()
ax.set_title("Encoding one semantic Chess frame on ESP32-P4", loc="left", fontweight="bold")
ax.set_xlabel("Microseconds per encode   ·   dots are 10 block means, bars show medians")
for j, prefix in enumerate(["p", "s", "c"]):
    for k, t in enumerate(["T", "F"]):
        val = med(series[prefix+t])
        bx.barh(j-.16+.32*k, val, height=.28, color=["#649bb3", "#087c77"][k],
                label=["Table", "Cached"][k] if j==0 else None)
        bx.text(val+.4, j-.16+.32*k, f"{val:.1f}", va="center", fontsize=9)
bx.set_yticks([0,1,2], ["Recorded game · 40/47 hits", "Rook sequence · 16/20 hits", "Cyclic sample · 0/24 hits"])
bx.invert_yaxis()
bx.legend(frameon=False, loc="lower right")
bx.set_xlim(0, max(max(series[a]) for a in ("pT","pF","sT","sF","cT","cF"))*1.5)
bx.set_title("Cost of a two-entry cache at three observed hit rates", loc="left", fontweight="bold")
bx.set_xlabel("Microseconds per encode, including each cache miss")
for a in (ax,bx):
    a.spines[["right","top","left"]].set_visible(False)
    a.tick_params(axis="y", length=0)
fig.savefig(data/"psix-staging-p4.png", dpi=180)
