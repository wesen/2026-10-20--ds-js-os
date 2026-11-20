"""Render the release compiler's measured literal expansion for the lab article."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ticket = Path(__file__).resolve().parents[2]
rows = json.loads((ticket / "various/literal-growth.json").read_text())["rows"]
fig, ax = plt.subplots(figsize=(7.2, 4), layout="constrained")
for copies, color in [(1, "#176d69"), (2, "#3665a4"), (4, "#9b481e")]:
    group = [row for row in rows if row["copies"] == copies]
    ax.plot([r["units"] for r in group], [r["rv32Bytes"] / 1024 for r in group],
            marker="o", label=f"{copies} {'function' if copies == 1 else 'functions'}",
            color=color)
ax.set(xlabel="UTF-16 code units in each literal", ylabel="RV32 code (KiB)",
       title="Repeating the same literal in separate functions")
ax.legend(frameon=False)
ax.grid(axis="y", alpha=0.2)
fig.savefig(ticket / "various/release-literal-growth.png", dpi=150)
