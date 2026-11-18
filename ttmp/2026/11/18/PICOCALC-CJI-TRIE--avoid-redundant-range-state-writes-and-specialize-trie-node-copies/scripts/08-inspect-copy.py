"""Verify that the compiled clone uses the typed array helper and direct element addressing."""
import argparse
from pathlib import Path
import re

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('slir',type=Path)
args=parser.parse_args()
text=args.slir.read_text()
def body(name):
    return re.search(r'^function '+re.escape(name)+r'/[^\n]*\n.*?^end$',text,re.MULTILINE|re.DOTALL)[0]
clone_name=re.search(r'^function (cloneTrieNode\.[^/]+)/',text,re.M)[1]
clone=body(clone_name)
read_name=re.search(r'^\s*call\s+(\$read\d+\.[^/]+)/',clone,re.M)[1]
read=body(read_name)
if re.search(r'icall\s+(any_index|any_from_int)/',clone+'\n'+read):
    raise ValueError('loop retains dynamic indexing or boxing')
if 'shl' not in read or not re.search(r'mov\s+r0, \[r\d+\+8\]',read):
    raise ValueError('array addressing not recognized')
print(clone+'\n'+read)
