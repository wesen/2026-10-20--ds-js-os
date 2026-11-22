"""Diff checked_shadow's last body before ordinal 17 against kernel's at 17. usage: python3 -I 10-diff-renamed-body.py TICKET"""
import difflib, gzip, json, re, sys
pipe = sys.argv[1] + "/various/llvm-pipeline/"
text = gzip.open(pipe + "checked-middle.log.gz").read().decode()
index = json.load(gzip.open(pipe + "checked-middle.index.json.gz"))
def print_of(i):
    end = index[i + 1]["offset"] if i + 1 < len(index) else len(text)
    return text[index[i]["offset"]:end]
def body(p, name):
    m = re.search(r'^(define [^\n]*@' + re.escape(name) + r'\([^\n]*)\n', p, re.M)
    if not m: return None, None
    close = p.find("\n}\n", m.end())
    return m.group(1), p[m.end():close]
last = None
for i in range(17):
    d, b = body(print_of(i), "checked_shadow")
    if b is not None: last = (i, d, b)
print("last checked_shadow print:", last[0], index[last[0]]["header"])
d17, b17 = body(print_of(17), "kernel")
print("define before:", last[1]); print("define at 17:", d17)
diff = list(difflib.unified_diff(last[2].split("\n"), b17.split("\n"), lineterm="", n=0))
print(len(diff), "diff lines"); print("\n".join(diff[:40]))
p16 = print_of(16)
print("alias lines before:", [l for l in p16.split("\n") if "@kernel" in l and ("alias" in l or "define" in l)][:3])
