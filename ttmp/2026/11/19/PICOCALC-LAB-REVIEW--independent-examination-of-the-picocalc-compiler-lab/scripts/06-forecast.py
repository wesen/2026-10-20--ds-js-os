"""Recalculate the masked forecast grade and leave-one-application sensitivity."""
import json
import sys
from pathlib import Path
from statistics import mean, median

archive, packets = map(Path, sys.argv[1:])
rows = json.loads(archive.read_bytes())['boots'][1]['rows']
truth = {}
for label, app in [('small','files'),('medium','agenda'),('large','editor')]:
    by_variant = {(r['block'],r['lane']):r for r in rows if r['app']==app}
    truth[label] = {}
    for field, metric in [('us','time_pct'),('peak','heap_pct')]:
        paired = []
        for block in range(4):
            a=by_variant[(block,'base')][field]
            b=by_variant[(block,'both')][field]
            paired.append(100*(b-a)/a)
        truth[label][metric]=median(paired)
grade = {}
for who in ['opus','sol']:
    forecast=json.loads((packets/(who+'.json')).read_bytes())
    errors={app:[abs(forecast[app][k]-v) for k,v in measures.items()] for app,measures in truth.items()}
    mae=lambda excluded:mean(e for app,values in errors.items() if app!=excluded for e in values)
    grade[who]={'meanAbsoluteErrorPP':mae(None),'dropOneApp':{app:mae(app) for app in truth}}
    published=json.loads((packets/'scores.json').read_bytes())['scores'][who]['overall_mae_pp']
    assert abs(grade[who]['meanAbsoluteErrorPP']-published)<1e-8
print(json.dumps({'truthPct':truth,'grades':grade},indent=2))
