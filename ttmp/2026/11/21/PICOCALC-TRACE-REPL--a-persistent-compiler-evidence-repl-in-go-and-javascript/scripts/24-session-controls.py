#!/usr/bin/env python3
"""Check blindness and notebook isolation on the live build, outside persona rooms."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

KEY_NUMBERS = [4133, 1275560, 1233611, 41949, 3608697, 1290106]
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("receipt",type=Path)
    p.add_argument("--port",type=int,default=3791)
    p.add_argument("--build",required=True)
    args=p.parse_args()
    if args.receipt.exists():
        p.error("receipt already exists")
    base=f"http://127.0.0.1:{args.port}/sessions"
    def http(url,mode,body=None):
        data=json.dumps(body).encode() if body is not None else None
        req=Request(url,method=mode,data=data,headers={"Content-Type":"application/json"})
        with urlopen(req,timeout=30) as r:
            data=r.read()
        return json.loads(data) if data else None
    def ev(session,code):
        return http(base+"/"+session+"/eval","POST",{"source":code})
    contexts=[]
    try:
        a=http(base,"POST")["id"];contexts.append(a)
        b=http(base,"POST")["id"];contexts.append(b)
        fresh=ev(a,"const bindingForControl = 17; bindingForControl")
        persisted=ev(a,"bindingForControl")
        isolated=ev(b,"typeof bindingForControl")
        assert fresh.get("value")==17 and persisted.get("value")==17, (fresh,persisted)
        assert isolated.get("value")=="undefined", isolated
        root=ev(a,"q.help()")
        assert root.get("ok") is True, root
        value=root.get("value")
        # Discover topic names from the public entry point if provided as structured data.
        topics=value.get("topics",[]) if isinstance(value,dict) else []
        if isinstance(value, str):
            topic_line = next((ln for ln in value.splitlines() if ln.startswith("Topics:")), "")
            topics = re.findall(r'"([a-zA-Z]+)"', topic_line)
        if isinstance(topics,dict):
            topics=list(topics)
        help_texts={"root":json.dumps(value,ensure_ascii=False)}
        for name in topics:
            if isinstance(name,str):
                answer=ev(a,f"q.help({json.dumps(name)})")
                help_texts[name]=json.dumps(answer.get("value"),ensure_ascii=False)
        matches={}
        for name,content in help_texts.items():
            normalized=re.sub(r"(?<=\d)[,_](?=\d)","",content)
            matches[name]=[n for n in KEY_NUMBERS if re.search(r"(?<!\d)"+str(n)+r"(?!\d)",normalized)]
        cue_words = ["EarlyCSEPass", "SROAPass", "NoVRegs", "virtregrewriter", "at(73)", "at(74)", "at(78)",
                     "missingDebugLocations", "per-PC", "checked-llc-nolsr"]
        cues = {name: [term for term in cue_words if term.lower() in content.lower()]
                for name,content in help_texts.items()}
        out={"build":args.build,"persistent":persisted["value"],"isolatedType":isolated["value"],
             "helpKeys":list(value) if isinstance(value,dict) else [],"helpNumericalLeaks":matches,"helpTerminologyCues":cues,
             "helpReplySHA256":{k:hashlib.sha256(v.encode()).hexdigest() for k,v in help_texts.items()}}
        http(base+"/"+a,"DELETE");contexts.remove(a)
        survivor=ev(b,"13+4")
        assert survivor.get("value")==17,survivor
        out["afterOtherSessionClosed"]=survivor["value"]
        args.receipt.write_text(json.dumps(out,indent=2)+"\n")
        print(json.dumps(out))
    finally:
        for key in contexts:
            http(base+"/"+key,"DELETE")
if __name__=="__main__":
    main()
