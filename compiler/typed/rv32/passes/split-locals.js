// The split pass.
import {opNext, CELLS, ELSE, END, LOCAL_GET, LITERAL_STORES, LOCAL_SET, CHECKED_ADDRESS, UNCHECKED_ADDRESS, BLOCK, IF} from "../encoding/tape.js";

// operandLocations.split: give every web of a local its own local id. A web starts at a write;
// every later occurrence inside the region that holds that write (a block, loop, if-arm or
// else-arm, or the body) belongs to it, because in structured code the write precedes them on
// every path through that region. An occurrence outside the current web's region starts a new
// web if it is a write; a read there makes the local unsplittable. Webs never read each other's
// writes, so the renaming is exact. Two inlined copies of one callee, or the two copies of a
// versioned loop, then have separate intervals for share.
export function splitLocals(code, params, nlocals) {
    const uses = new Map(), path = [];
    let region = 0;
    const note = (cell, write) => {
        const id = code[cell];
        if (id < params) return;
        if (!uses.has(id)) uses.set(id, []);
        uses.get(id).push({cell, write, path: path.slice()});
    };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (!(CELLS[op] >= 0)) return null;
        if (op === ELSE) { path.pop(); path.push(region++); }
        else if (op === END) path.pop();
        if (op === LOCAL_GET || op === LITERAL_STORES) note(at + 1, false);
        else if (op === LOCAL_SET) note(at + 1, true);
        else if (op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) { note(at + 1, false); note(at + 2, false); }
        if (op >= BLOCK && op <= IF) path.push(region++);
    }
    const inside = (outer, inner) => outer.length <= inner.length && outer.every((x, i) => inner[i] === x);
    const out = code.slice();
    let fresh = params + nlocals;
    const origin = [];
    for (const [local, occurrences] of uses) {
        const webs = [];
        let current = null, splittable = true;
        for (const o of occurrences) {
            if (current && inside(current.path, o.path)) { current.cells.push(o.cell); continue; }
            if (!o.write) { splittable = false; break; }
            current = {path: o.path, cells: [o.cell]};
            webs.push(current);
        }
        if (!splittable || webs.length < 2) continue;
        for (const web of webs.slice(1)) {
            const id = fresh++;
            origin.push(local);
            for (const cell of web.cells) out[cell] = id;
        }
    }
    // origin[i] is the local that fresh local params + nlocals + i was split from.
    return fresh === params + nlocals ? null : {code: out, nlocals: fresh - params, origin};
}

