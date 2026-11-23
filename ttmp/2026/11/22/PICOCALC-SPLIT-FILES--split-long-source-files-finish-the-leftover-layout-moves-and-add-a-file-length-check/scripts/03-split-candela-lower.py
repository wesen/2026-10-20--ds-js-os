#!/usr/bin/env python3
"""Split tools/gen/candela/translator/lower.js (914 lines) by construct.

usage: python3 03-split-candela-lower.py [--dry-run]       (on a clean tree)

  lower-state.js        values, f32 constant arithmetic, one entry's lowering state (EntryLowering), IR helpers
  lower-expressions.js  ExpressionLowering extends EntryLowering: expressions, calls, constructors
  lower.js              Lowerer extends ExpressionLowering: statements (blocks, declarations, if, dispatch chains,
                        Lobe runs), and the names index.js imports

Methods move unchanged; the class that held them all becomes a chain of three (Lowerer still is the one index.js
builds). The gate is `node tools/gen/candela/regenerate.mjs --check`: every generated Candela file must be
unchanged.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from splitlib import Part, split  # noqa: E402

D = "tools/gen/candela/translator/"
STATE_HEAD = """// lower-state.js: what lowering one entry works with (lower.js has the overview): value kinds and widths, f32
// constant arithmetic, the per-entry state (registers, constants, code, kernel inlining) and IR helpers.
import { SectionError, sameExpr, mentions } from './parse.js';
import * as ISA from './isa.js';

"""
STATE_TAIL = """export { WIDTH, VECW, VTYPE, isVec, isFloaty, fr, err, F, WGSL_ELEM, GENERATED, KNOWN_TYPES, sameConst, lobeNoneFields,
  mentionsAfterDecl };
"""
EXPR_HEAD = """// lower-expressions.js: the lowering of expressions (identifiers, members, swizzles, operators, calls, constructors);
// Lowerer (lower.js) adds statements on top.
import { sameExpr } from './parse.js';
import * as ISA from './isa.js';
import { EntryLowering, WIDTH, VECW, VTYPE, isVec, isFloaty, fr, err, F, WGSL_ELEM, GENERATED, INLINE_KERNEL_WGSL } from './lower-state.js';

export class ExpressionLowering extends EntryLowering {
"""
LOWER_IMPORTS = """import { sameExpr, mentions } from './parse.js';
import * as ISA from './isa.js';
import { ExpressionLowering } from './lower-expressions.js';
import { WIDTH, VECW, isVec, err, GENERATED, KNOWN_TYPES, sameConst, lobeNoneFields, mentionsAfterDecl, assignedNames,
  endsInTerminator } from './lower-state.js';

// ---------- the lowering of statements (expressions: lower-expressions.js; the entry's state: lower-state.js) ----------
export class Lowerer extends ExpressionLowering {
"""
LOWER_TAIL = """}

export { INLINE_KERNEL_WGSL, VReg, WIDTH, VECW, isVec, endsInTerminator, defArg0, assignedNames } from './lower-state.js';
"""
PARTS = [
    Part(D + "lower.js", [(1, 9), (221, 556)], between={1: LOWER_IMPORTS}, tail=LOWER_TAIL),
    Part(D + "lower-state.js", [(13, 218), (862, 913)], head=STATE_HEAD, tail=STATE_TAIL),
    Part(D + "lower-expressions.js", [(557, 861)], head=EXPR_HEAD),
]
# Lines 10-11 (imports) and 12 (blank) are re-created in each file's head; 219-220 (the section comment and the class
# line) become LOWER_IMPORTS's last two lines; 914 (the re-export) becomes STATE_TAIL and LOWER_TAIL.
split(D + "lower.js", PARTS, moved=[(10, 12), (219, 220), (914, 914)])
