"""Tiny client for a trace-REPL session: eval, chunked string bindings, file loading."""
import json, urllib.request
class Session:
    def __init__(self, port, sid=None):
        self.base = f"http://127.0.0.1:{port}/sessions"
        if sid is None:
            req = urllib.request.Request(self.base, data=b"", method="POST")
            sid = json.load(urllib.request.urlopen(req))["id"]
        self.sid = sid
    def eval(self, src, check=True):
        req = urllib.request.Request(f"{self.base}/{self.sid}/eval", data=json.dumps({"source": src}).encode(),
                                     headers={"Content-Type": "application/json"})
        out = json.load(urllib.request.urlopen(req))
        if check and not out.get("ok"):
            raise RuntimeError(out.get("error"))
        return out.get("value")
    def bind_string(self, path, text, step=30000):
        """Assign text to the JS expression `path` (e.g. worlds.editor) in chunks under the cell cap."""
        self.eval(f"{path} = ''; undefined")
        for i in range(0, len(text), step):
            self.eval(f"{path} += {json.dumps(text[i:i + step])}; undefined")
    def load(self, *files):
        for f in files:
            self.bind_string("globalThis.__load", open(f, encoding="utf-8").read())
            self.eval("(0, eval)(globalThis.__load); delete globalThis.__load; undefined")
