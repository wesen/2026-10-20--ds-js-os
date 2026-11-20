"""Import public prose only. Strip all Claude CLI private runtime metadata."""
from pathlib import Path
import hashlib,json,sys
t=Path(__file__).resolve().parent.parent
def read(f):
    raw=json.loads(Path(f).read_text());r=raw[-1] if isinstance(raw,list) else raw
    assert not r['is_error'] and r['result'];return r['result'].strip(),list(r['modelUsage'])
def write_body(file,body):
    src=file.read_text();head=src[:src.index('---',4)+3];file.write_text(head+'\n\n'+body.strip()+'\n')
host,models=read(sys.argv[1]);board,models2=read(sys.argv[2])
article1,log1=host.split('## Experiment log',1);article2,log2=board.split('## Physical experiment log',1)
paper=article1.strip()+'\n\n'+article2.strip()
# Host-scope text precedes a later physical section.
paper=paper.replace('No physical board timing is claimed','The host comparison measures Node')
write_body(next((t/'analysis').glob('01-*')),paper)
blind=(t/'various/representation-blind.md').read_text().split('# Step 1 Diary',1)[1].strip()
diary='''# Representation researcher experiment diary

## Step 1: Freeze predictions and representation alternatives

'''+blind+'''

## Step 2: Compare canonical trees, drawing operations and retained bytes

### Prompt Context

The lab commissioned the representation researcher to interpret public aggregate measurements. An operator ran the code and retained the evidence. The commissioned report concerns screen representation on the host and the P4.

### What I did

'''+log1.strip()+'''

### Why

Charge both validation and the deferred conversion needed to paint. Measure actual retained memory on the same inputs across all representations.

### What worked

The corpus and the isolated retained-generation model supplied deterministic outputs and meaningful failure cases.

### What didn't work

The fixed generic index exceeded the control's retained memory on several applications. Lazy field access increased full painting time on each host specimen.

### What I learned

Token density, index capacity and the renderer's access order jointly determine the result.

### What was tricky to build

The renderer revisits arrays through JavaScript property accesses and iteration. Multiple correct representations can have very different costs.

### What warrants a second pair of eyes

Collector overhead, placement of the ingress boundary and use of native parsing in the optimized baseline all affect interpretation.

### What should be done in the future

Compare a binary reader with direct offsets at the same measured producer and consumer boundaries.

### Code review instructions

Inspect scripts 10–12, 15–17 and the cross-workload results under various.

### Technical details

The input string was resident before the host allocator comparison. The fixed index reserves 32 KiB even for the smallest fixture.

## Step 3: Read the physical replay

### Prompt Context

The operator supplied matched physical measurements for parse plus full scalar access and sparse widget-kind lookup.

### What I did

'''+log2.strip()+'''

### Why

Receiver CPU matters on a serial event dispatcher. Native CJI event traces put the controlled QuickJS experiments in their system context.

### What worked

Every scalar checksum matched across five blocks on the P4.

### What didn't work

Paying to index every token outweighed deferred conversion even when the receiver read only one root field.

### What I learned

The same JavaScript scanner benefits from skipping tree materialization. The existing native JSON parser remains faster for this implementation.

### What was tricky to build

A comparable scanner control must charge field conversion on both sides. Array reservation was outside the physical time interval.

### What warrants a second pair of eyes

Deploying a C or binary reader changes both representation and execution cost. Supply a materializing control behind the same boundary.

### What should be done in the future

Give the binary study a complete sender-to-reader contract and independently replay a held-out screen.

### Code review instructions

Match the tested operations in scripts 12 and 20 to the physical-blocks and physical-summary receipts.

### Technical details

The public article and both experiment logs were written by Opus High. The operator arranged the log in the project's diary format.
'''
write_body(next((t/'reference').glob('02-*')),diary)
digest=lambda v:hashlib.sha256(v.encode()).hexdigest()
(t/'various/opus-authorship.json').write_text(json.dumps({'models':models,'boardModels':models2,'effort':'high','hostPublicSHA256':digest(host),'p4PublicSHA256':digest(board),'articleBodySHA256':digest(paper),'attribution':'Opus authored both public pieces and logs; operator arranged the diary and labeled host scope. Initial combined request declined; public experimental reporting succeeded.'},indent=2)+'\n')
