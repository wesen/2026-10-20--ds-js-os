// The fields pass: an f32 field that a function reads more than once is loaded once.
import {opNext, CELLS, BLOCK, IF, END, CALL, LOCAL_GET, LOCAL_SET, F32_LOAD, EFFECTS, STORES} from "../encoding/tape.js";

// `get r; f32.load a off` reads the same value every time when r is a parameter the function never writes and nothing
// in the function stores to memory or calls a function that may (storeless). The first read of each (r, off) at the
// function's top level, outside every block, runs before any later operation, so it becomes
// `get r; f32.load a off; set t; get t` and every later read `get t`, for a fresh f32 local t. Integer loads stay as
// they are: their images are pinned (PICOCALC-TYPED-F32; widening this to i32.load is a separate measurement).
export function reuseFloatFields(fn, storeless) {
    const code = fn.code, params = fn.params.length;
    if (!code.includes(F32_LOAD)) return null;
    const written = new Set(), firsts = new Map(), count = new Map();
    let depth = 0;
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (!(CELLS[op] >= 0)) return null;
        if (EFFECTS[op] & STORES) return null;
        if (op === CALL && !storeless(code[at + 1])) return null;
        if (op === LOCAL_SET) written.add(code[at + 1]);
        if (op >= BLOCK && op <= IF) depth++;
        else if (op === END) depth--;
        if (op === LOCAL_GET && code[at + 1] < params && code[at + 2] === F32_LOAD) {
            const key = code[at + 1] * 4096 + code[at + 4];
            count.set(key, (count.get(key) ?? 0) + 1);
            if (!firsts.has(key)) firsts.set(key, depth === 0 ? at : -1);
        }
    }
    const reused = new Map();
    let fresh = params + fn.nlocals;
    for (const [key, at] of firsts)
        if (at >= 0 && count.get(key) > 1 && !written.has(Math.floor(key / 4096)) && code[at + 4] < 4096) reused.set(key, {at, local: fresh++});
    if (!reused.size) return null;
    const out = [];
    for (let at = 0; at < code.length;) {
        const next = opNext(code, at);
        if (code[at] === LOCAL_GET && code[at + 2] === F32_LOAD) {
            const hit = reused.get(code[at + 1] * 4096 + code[at + 4]);
            if (hit) {
                if (hit.at === at) out.push(LOCAL_GET, code[at + 1], F32_LOAD, code[at + 3], code[at + 4], LOCAL_SET, hit.local);
                out.push(LOCAL_GET, hit.local);
                at = opNext(code, next);
                continue;
            }
        }
        for (let k = at; k < next; k++) out.push(code[k]);
        at = next;
    }
    const localTypes = (fn.localTypes ?? Array(fn.nlocals).fill("i32")).slice();
    for (let i = fn.nlocals; i < fresh - params; i++) localTypes[i] = "f32";
    return {code: out, nlocals: fresh - params, localTypes};
}
