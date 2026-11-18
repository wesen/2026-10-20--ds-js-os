"""Render the guide's two grayscale-readable diagrams with Graphviz."""
from pathlib import Path
import subprocess
dest = Path(__file__).resolve().parents[1]/'various'
def draw(name, body):
    graph = 'digraph G { graph [rankdir=TB, bgcolor=white, pad=0.15, dpi=160]; node [shape=box,style="rounded,filled",fillcolor="#e7f1f3",color="#45656c",fontname="DejaVu Sans",fontsize=12]; edge [fontname="DejaVu Sans",fontsize=10,color="#35434b"];\n'+body+'}'
    subprocess.run(['dot','-Tpng','-o',dest/(name+'.png')],input=graph,text=True,check=True)
draw('compile-levels','''
build [label="Workstation: compile the CJI frontend itself"];
stage [label="Board: execute that compiled frontend"];
input [label="Input: Agenda.js"];
ir [label="Agenda SLIR"];
module [label="Link prelude and assemble Agenda module"];
build -> stage [label=" stage-1 machine code"]; input -> stage;
stage -> ir [label=" measured frontend time"]; ir -> module;
''')
draw('proof-queue',r'''
d [label="Choose helper or arithmetic instruction"];
q [label="Request receiver kind or\nexact-integer proof"];
r [label="Evaluate definitions\nand shared summaries"];
u [label="Publish change\nSchedule readers"];
e [label="Proved\nEmit specialized code"];
g [label="Unknown\nEmit general code or guard"];
d -> q; q -> r; r -> u [label=" change"]; u -> r; r -> e [label=" stable"]; r -> g [label=" inconclusive"];
''')
