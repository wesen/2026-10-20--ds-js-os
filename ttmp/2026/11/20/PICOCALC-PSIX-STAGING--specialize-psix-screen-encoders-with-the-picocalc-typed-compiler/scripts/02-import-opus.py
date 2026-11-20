"""Keep only externally authored public prose and model/effort provenance in the ticket."""
import argparse, hashlib, json
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('role',choices=['design','results']);parser.add_argument('response',type=Path)
a=parser.parse_args()
ticket=Path(__file__).resolve().parents[1]
raw=json.loads(a.response.read_text())
reply=raw[-1] if isinstance(raw,list) else raw
if reply.get('is_error') or not reply.get('result'):raise RuntimeError('response contains no public article')
prose=reply['result'].strip()
meta={'model':list(reply.get('modelUsage',{})),'effort':'high','publicSha256':hashlib.sha256(prose.encode()).hexdigest()}
def doc(file,title,cat,body):
    file.write_text('---\nTitle: '+json.dumps(title)+'\nTicket: PICOCALC-PSIX-STAGING\nStatus: complete\nTopics: [picocalc]\nDocType: '+cat+'\nIntent: long-term\nOwners: []\nRelatedFiles: []\nExternalSources: []\nSummary: ""\nLastUpdated: 2026-11-20\nWhatFor: ""\nWhenToUse: ""\n---\n\n'+body.strip()+'\n')
diary=ticket/'reference/07-opus-research-diary.md'
if a.role=='design':
    text,notebook=prose.split('## Appendix: Lab notebook',1)
    header='''# Independent experimental design for staged binary writers

This is the source-blind commission returned by Opus High. Its proposed format assumptions and planned controls describe a hypothetical design. For the actual implemented protocol, use the director guide and the source measurements. In particular PSIX v1 packs a four-bit tag and 20-bit payload, uses absolute packet offsets, and puts indirect numeric bodies in preorder. No measurements were supplied to this investigator at the design stage.

'''
    doc(ticket/'design-doc/07-independent-experimental-design.md','Independent experimental design for staged binary writers','design-doc',header+text[text.index('## 0. Reading guide'):])
    doc(diary,'Opus High design and results diary','reference','# Opus High design and results diary\n\n## Step 1: Design before seeing measurements\n\nThe following is the investigator’s original notebook accompanying the source-blind design. The director supplied an abstract description and performed the hardware work.\n\n'+notebook)
else:
    text,notebook=prose.split('## Research diary',1)
    doc(ticket/'analysis/07-independent-specialization-results.md','Specializing a binary writer on a handheld processor','analysis',text)
    with diary.open('a') as out:out.write('\n## Step 2: Review the returned measurements\n\n'+notebook.strip()+'\n')
(ticket/'various'/('opus-'+a.role+'.json')).write_text(json.dumps(meta,indent=2)+'\n')
