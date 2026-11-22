"""Find function renames in a ROW-IR-style pass-dump stream. usage: python3 -I 09-find-renames.py TICKET VARIANT PHASE"""
import gzip, hashlib, json, re, sys
ticket, variant, phase = sys.argv[1:4]
pipe = ticket + "/various/llvm-pipeline/"
text = gzip.open(pipe + f"{variant}-{phase}.log.gz").read().decode()
index = json.load(gzip.open(pipe + f"{variant}-{phase}.index.json.gz"))
define = re.compile(r'^define [^@]*@("(?:[^"\\]|\\.)*"|[-\w$.]+)\(', re.M)
latest, prev_module, edges = {}, None, []
for i, item in enumerate(index):
    end = index[i + 1]["offset"] if i + 1 < len(index) else len(text)
    body = text[item["offset"]:end]
    defs = []
    for m in define.finditer(body):
        start = body.index("\n", m.start()) + 1
        close = body.find("\n}\n", start)
        defs.append((m.group(1).strip('"'), hashlib.sha256(body[start:close].encode()).hexdigest()))
    module = "; ModuleID = " in body
    if module:
        names = {n for n, _ in defs}
        if prev_module is not None:
            gone = prev_module - names
            for n, d in defs:
                if n not in prev_module:
                    cands = [f for f in gone if latest.get(f) == d]
                    edges.append({"ordinal": i, "pass": item["header"], "to": n, "from": cands, "goneAll": sorted(gone)})
        prev_module = names
    for n, d in defs:
        latest[n] = d
print(json.dumps({"dumps": len(index), "edges": edges[:20]}, indent=1))
