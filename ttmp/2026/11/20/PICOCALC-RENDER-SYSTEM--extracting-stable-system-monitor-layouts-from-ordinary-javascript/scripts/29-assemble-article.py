"""Combine two commissioned Opus High article sections and preserve model receipts."""
from pathlib import Path
import json, sys

ticket=Path(__file__).resolve().parents[1]
def load(name,p):
    ev=json.loads(Path(p).read_text());init=ev[0];result=ev[-1]
    assert init['model'].startswith('claude-opus') and not result['is_error'] and init['tools']==[]
    info={k:result.get(k) for k in ['session_id','duration_ms','usage','modelUsage','is_error']}
    info.update(model=init['model'],requestedEffort='high',availableTools=init['tools'])
    (ticket/'various'/('opus-'+name+'-authorship.json')).write_text(json.dumps(info,indent=2)+'\n')
    return result['result'].strip()
def body(path):
    _,front,old=path.read_text().split('---\n',2)
    return '---\n'+front+'---\n\n',old.strip()
def edit(text,pairs):
    for a,b in pairs:text=text.replace(a,b)
    return text
host=load('final-host',sys.argv[1]);device=load('physical',sys.argv[2]);hardware,milestone=device.split('<<<DIARY>>>')
hardware=edit(hardware,[('so all receivers rebuilt identical trees','matching the digest obtained from the independently checked host trees'),
    ('was performed separately on the host, not on the handheld','used the native host rasterizer in the separate pixel trial'),
    ('The grounded decision is to integrate M at the publication boundary, keep G available as a fallback, and drop A.',
     'M merits a live publication-boundary trial with G as the fallback. A fails the measured performance gates.'),
    ('The next step is to measure M on the live display path, because its receiver cost and worst receiver segment both increased.',
     'The live trial should check the compositor’s turn allowance because M increased the receiver cost and its worst observed single receiver segment.')]).strip()
host=edit(host,[
 ("The kernel is running 28 worlds","The frozen sample lists 28 worlds"),
 ("Now restart one process. If the monitor app restarts, it must recover the active tab and the selected row, then rebuild the view from kernel data. If the compositor restarts, it knows nothing until a message arrives, and that one message must be enough to paint every pixel again.","Now restart the compositor while the monitor is idle. The kernel must replay a message that lets the new compositor repaint the highlighted row, even if the monitor never publishes again."),
 ("Each selected app runs in its own world","Each application in this study runs in its own world"),
 ("An app never writes pixels. It calls UI constructors","System describes its screen through UI constructors"),
 ("It keeps a retained screen, which is the latest complete message from the app.","The kernel keeps a retained screen, the latest complete publication from the app. The compositor reads it on restart."),
 ("The monitor and the scripted kernel data are real code with deterministic sampled states.","The experiment runs the production monitor code with deterministic kernel records."),
 ("Every timing and heap figure below was taken on a host, not on the P4. The physical stage is covered in a companion section by its author.","The host trials cover the full corpus. A separate physical trial times the same producer and receiver logic on the ESP32-P4."),
 ("the histogram limit of 48","the graph history limit of 48 samples"),
 ("Why A factors bytes, not arguments","Where automatic factoring preserves JavaScript effects"),
 ("Math.min(Math.max(s.sel - 4, 0), s.worlds.length - 8)","Math.max(0, Math.min(s.worlds.length - 8, s.sel - 4))"),
 ('{ title: "ID", w: 3 }, { title: "World", w: 14 }, { title: "State", w: 8 }','{ label: "world", w: 72 }, { label: "state", w: 62 }, { label: "turns", align: "right" }'),
 ("{ selected: s.sel - top }","{ sel: s.sel - top }"),
 ('t.columns[2].title = "State*"','t.cols[1].label = "state*"'),
 ("t retains RESIDENT.cols3, so every later frame inherits","t retains RESIDENT.cols3, so later calls share"),
 ("The column titles and the mutation are illustrative.","The example shortens the real seven-column descriptor to three columns and adds an illustrative mutation."),
 ("Seven explicit effect traces, including coercion and getter cases, confirm this. Ten guard tests also pass, including one post-construction mutation, an unknown version and an unknown slot.","Seven observed cases include getter and coercion traces. Ten separate tests cover unsupported literal forms and bindings. Additional probes exercise post-construction mutation, a wrong catalog version and an invalid slot."),
 ("| 72,093 | not recorded |","| 72,093 | 62,885 |"),("| 30,850 | not recorded |","| 30,850 | 34,710 |"),("| 23,335 | not recorded |","| 23,335 | 21,547 |"),
 ("P5 predicted zero pixel divergences. It holds for every tested case and for idle replay.","P5 predicted zero visual differences. All raster fixtures match. On an idle receiver restart, the retained message also reconstructed the exact expected tree."),
 ("An A/A control gave","Two identical generic controls gave"),
 ("Measurements taken on the device appear only in the companion section.","The physical trial below uses these counts to validate every repetition."),
 ("All timings are host figures.","The host and physical stage clocks both exclude live publish-to-panel latency."),
 ("Within the component and layout input stage, M is the protocol to carry forward, and it is eligible for physical evidence on the P4.","The physical stage result qualifies M for an integrated publication trial with the existing generic painter. Shipping that change would require a live cross-world comparison and recovery tests."),
 ("A separate reproduction document is forthcoming.","The complete reproduction guide is reference/04-reproduction.md, with the physical importer in scripts/26-read-board.py.")
])
report=next((ticket/'analysis').glob('01-*'))
front,orig=body(report)
# Insert the separately authored device evidence immediately before the article's final
# decision or reproduction section. Each heading is a Markdown H2.
sections=host.split('\n## ')
index=next((i for i in range(1,len(sections)) if any(
    word in sections[i].split('\n',1)[0].lower() for word in ['decision','reproduc','conclusion','where to go','what to ship'])),len(sections))
before='\n## '.join(sections[:index]).strip()
after='## '+'\n## '.join(sections[index:]) if index<len(sections) else ''
report.write_text(front+before+'\n\n'+hardware+'\n\n'+after.strip()+'\n')
diary=next((ticket/'reference').glob('02-*'))
front,old=body(diary)
old=old.split('\n## Step 5')[0].rstrip()
diary.write_text(front+old+'\n\n## Step 5 — Physical measurements\n\n'+milestone.strip()+'\n')
