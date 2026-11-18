// Passes that work on a function body at a time apply themselves to every definition.

import { FunDef, ProgramDefs } from './ast.js';

export const mapDefs = (p, body) => ProgramDefs(p.defs.map((d) => FunDef(d.name, d.params, d.retType, body(d.body, d))));
