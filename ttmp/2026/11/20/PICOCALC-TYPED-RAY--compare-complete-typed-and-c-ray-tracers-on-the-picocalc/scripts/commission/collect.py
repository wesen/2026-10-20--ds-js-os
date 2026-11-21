"""Archive the final public-topic Opus answer without CLI telemetry."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('lane', choices=['scalar','compiler','measurement'])
parser.add_argument('response', type=Path)
args=parser.parse_args()
events=json.loads(args.response.read_text())
event=next(e for e in reversed(events) if e['type']=='result') if isinstance(events,list) else events
assert not event['is_error'] and event['result']
models=', '.join(event['modelUsage'])
ticket=Path(__file__).resolve().parents[2]
out=ticket/'various'/'commission'
out.mkdir(exist_ok=True)
(out/(args.lane+'.md')).write_text(f'---\nTitle: Opus {args.lane} research consultation\nTicket: PICOCALC-TYPED-RAY\nDocType: reference\nTopics: [compiler, performance]\nStatus: complete\n---\n\nIndependent research memo. Model: {models}. Effort: high. The author received the public-topic prompt under scripts/commission/{args.lane}.txt and no project sources or raw measurements. Treat proposed methods and examples as hypotheses until checked in the project.\n\n'+event['result']+'\n')
