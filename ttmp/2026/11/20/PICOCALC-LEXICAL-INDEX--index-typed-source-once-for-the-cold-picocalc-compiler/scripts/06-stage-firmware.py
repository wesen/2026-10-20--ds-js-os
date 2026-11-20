"""Stage the checked lexical implementation in a detached checkout and emit its exact digests."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[5]


def edit(path, old, new):
    src=path.read_text()
    if src.count(old)!=1:
        raise ValueError(f"firmware anchor changed at {path}: {old}")
    path.write_text(src.replace(old,new))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tree",type=Path)
    parser.add_argument("--reuse-token", action="store_true", help="reuse tokens only at non-retaining compiler call sites")
    parser.add_argument("--indexed-prepass",action="store_true",help="use exact token records when scanning for asynchronous operations")
    args=parser.parse_args()
    tree=args.tree.resolve()
    if tree.is_relative_to(REPO): raise ValueError("use a detached checkout outside the product tree")
    compiler=tree/"picocalc-os/compiler/typed-wasm.js"
    port=tree/"picocalc-os/port/esp32p4/main"
    source=port/"typed_lex_index.c"
    header=port/"typed_lex_index.h"
    source.write_text((HERE/"01-typed-lex-index.c").read_text().replace('"01-typed-lex-index.h"','"typed_lex_index.h"'))
    header.write_bytes((HERE/"01-typed-lex-index.h").read_bytes())
    edit(port/"CMakeLists.txt","target_sources(${COMPONENT_LIB} PRIVATE typed_p4.c)",
         "target_sources(${COMPONENT_LIB} PRIVATE typed_p4.c typed_lex_index.c)")
    edit(port/"typed_p4.c",'#include "p4.h"', '#include "p4.h"\n#include "typed_lex_index.h"')
    edit(port/"typed_p4.c","  if (!ctx) goto done;", "  if (!ctx) goto done;\n  if (!typed_lex_index_install(ctx)) goto rejected;")
    subprocess.run(["node",HERE/"02-index-overlay.mjs",compiler],check=True)
    if args.reuse_token:
        subprocess.run(["node",HERE/"10-reuse-token-overlay.mjs",compiler.parent],check=True)
    if args.indexed_prepass:
        if not args.reuse_token:
            raise ValueError("the qualified prepass arm includes internal token reuse")
        patch, = (REPO/"ttmp/2026/11/19").glob("PICOCALC-LANGUAGE-E--*/scripts/14-indexed-prepass-overlay.mjs")
        subprocess.run(["node",patch,compiler.parent],check=True)
    print(json.dumps({str(p.relative_to(tree)):hashlib.sha256(p.read_bytes()).hexdigest()
                      for p in [source,header,port/"typed_p4.c",port/"CMakeLists.txt",compiler,
                                compiler.with_name("typed-async.js")]},indent=2))


if __name__=="__main__":main()
