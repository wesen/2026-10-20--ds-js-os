"""Apply independent source edits to a scratch copy of the guarded range analyzer."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("variant", choices=("reuse", "typed", "both"))
args = parser.parse_args()
text = args.source.read_text()

def replace_once(old, new):
    global text
    if text.count(old) != 1:
        raise ValueError(f"source anchor mismatch: {old[:80]}")
    text = text.replace(old, new)

if args.variant in ("reuse", "both"):
    replace_once(
        """    const copy = node === undefined ? new Array(32) : node.slice();
    const i = (k >>> (5 * level)) & 31;
    copy[i] = level === 0 ? v : trieSet(node?.[i], k, v, level - 1);""",
        """    const i = (k >>> (5 * level)) & 31;
    const previous = node?.[i];
    const child = level === 0 ? v : trieSet(previous, k, v, level - 1);
    if (node !== undefined && previous === child) return node;
    const copy = node === undefined ? new Array(32) : node.slice();
    copy[i] = child;""")
if args.variant in ("typed", "both"):
    replace_once("export const LIM = 2 ** 53;", """export const LIM = 2 ** 53;

// Every node has 32 tagged slots. A missing child and an undefined slot read alike.
function cloneTrieNode(node /*: Any[] */) /*: Any[] */ {
  const copy /*: Any[] */ = new Array(32);
  for (let i = 0; i < 32; i++) copy[i] = node[i];
  return copy;
}""")
    replace_once("new Array(32) : node.slice()", "new Array(32) : cloneTrieNode(node)")
args.source.write_text(text)
