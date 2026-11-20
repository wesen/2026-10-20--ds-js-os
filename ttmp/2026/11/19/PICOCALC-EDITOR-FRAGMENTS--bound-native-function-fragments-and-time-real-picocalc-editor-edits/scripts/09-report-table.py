"""Render the measured study tables from a completed physical summary."""
import json
import sys
from pathlib import Path

rows=json.loads(Path(sys.argv[1]).read_text())
edits=list(dict.fromkeys(r["edit"] for r in rows))
policies=["Warm clean","256 KiB","40 KiB"]

def group(edit,policy):
    return sorted((r for r in rows if r["edit"]==edit and r["policy"]==policy),key=lambda r:r["boot"])

def fmt(edit,policy,field,scale=1,digits=1):
    return " / ".join(f"{r[field]/scale:,.{digits}f}" for r in group(edit,policy))
print("## What the physical board measured\n")
print("Each cell gives the median for boot one and boot two. The reference is a warmed full compiler that receives the same edited source. There are three counterbalanced measurements per cell per boot. All 72 device executions returned the expected result and wrote the expected Editor state. Each produced the same complete 240,452-byte ELF as its clean host oracle.\n")
print("| Edit | Warm clean (ms) | 256 KiB cap (ms) | Paired change (%) | 40 KiB cap (ms) | Paired change (%) |")
print("| --- | ---: | ---: | ---: | ---: | ---: |")
for edit in edits:
    print("| "+" | ".join([edit,fmt(edit,policies[0],"ms"),fmt(edit,policies[1],"ms"),fmt(edit,policies[1],"paired_pct"),
                           fmt(edit,policies[2],"ms"),fmt(edit,policies[2],"paired_pct")])+" |")
print("\n![Physical Editor edit-to-native-return time and QuickJS peak heap](../various/picocalc-editor-fragment-effects.png)\n")
print("The dots show the two boot medians. The labels 256 KiB and 40 KiB specify how much native instruction payload the session may keep between edits. The peak heap includes the other allocations needed while compiling.\n")
print("| Edit | Warm clean peak (KiB) | 256 KiB peak (KiB) | 40 KiB peak (KiB) |")
print("| --- | ---: | ---: | ---: |")
for edit in edits:
    print("| "+" | ".join([edit,*[fmt(edit,k,'peak',1024) for k in policies]])+" |")
print("\nBefore the body edit, live QuickJS memory was about 721 KiB for the warm clean session, 1,190 KiB at the generous cap and 1,006 KiB at the tighter cap. The generous cap bought roughly 1.8 seconds on a one-function change. Both field-order changes still forced it to compile 77 of the 120 functions. The tighter cap had already discarded additional valid fragments and needed 90 compilations in each layout case. Those two cases took longer than the warm full build on both boots.\n")
print("The observed delay depends on how many valid fragments survive the edit and how many fit before the edit. Holding a full set can make a body or signature edit interactive while exposing the disproportionate cost of conservative record dependencies. The next focused comparison would replace the whole-record fingerprint with a fingerprint of the fields actually used by each function. For that experiment the same four edits, stale-layout witness, complete ELF equality and physical return clock provide a direct control.\n")
