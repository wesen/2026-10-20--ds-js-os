"""One private, loopback-only JS session exposed via a single MCP tool."""
import json
import sys
import urllib.request
BASE = "http://127.0.0.1:3792/sessions"
def req(method, path, data=None):
    r = urllib.request.Request(path, method=method,
           data=json.dumps(data).encode() if data is not None else None,
           headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(r, timeout=25) as h:
        raw = h.read()
    return json.loads(raw) if raw else None
def main():
    session = BASE + "/" + req("POST", BASE)["id"]
    try:
        for line in sys.stdin:
            m = json.loads(line)
            if "id" not in m:
                continue
            method=m["method"]
            if method=="initialize":
                reply={"protocolVersion":m["params"]["protocolVersion"],"capabilities":{"tools":{}},"serverInfo":{"name":"physics-evidence","version":"1"}}
            elif method=="tools/list":
                reply={"tools":[{"name":"eval","description":"Evaluate JS in your persistent physics research REPL","inputSchema":{"type":"object","properties":{"source":{"type":"string"}},"required":["source"]}}]}
            elif method=="tools/call":
                source=m["params"]["arguments"]["source"]
                result=req("POST",session+"/eval",{"source":source})
                reply={"content":[{"type":"text","text":json.dumps(result)[:10000]}]}
                with open("physics-repl.jsonl","a") as h: h.write(json.dumps({"source":source,"result":result})+"\n")
            else:
                reply={}
            print(json.dumps({"jsonrpc":"2.0","id":m["id"],"result":reply}),flush=True)
    finally:
        req("DELETE",session)
if __name__=="__main__":
    main()
