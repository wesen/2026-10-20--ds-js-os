// The rotate pass.
import {CELLS, BLOCK, IF, END, VOID, LOOP, BR, I32_EQZ, BR_IF, RETURN, UNREACHABLE} from "../encoding/tape.js";

// the rotate pass: the frontend emits every loop as
//     block; loop; C; eqz; br_if 1; B; br 0; end; end
// which runs C, a taken skip over the exit jump, B and a taken jump back per iteration.
// Rotated, the loop is
//     block; C; eqz; br_if 0; loop; B; C; br_if 0; end; end
// and each iteration ends in one backward conditional branch. C is evaluated at the same
// points as before (once before every iteration and once to exit). Labels inside B keep
// their meaning; C is copied only if every branch in it targets a block inside C.

export function rotateLoops(code) {
    const next = at => at + 1 + CELLS[code[at]];
    // Matching `end` of the block or loop opened at `at`.
    function close(at) {
        let depth = 0;
        for (let k = at; k < code.length; k = next(k)) {
            const op = code[k];
            if (op >= BLOCK && op <= IF) depth++;
            else if (op === END && --depth === 0) return k;
        }
        return -1;
    }
    let changed = false;
    function emit(from, to, out) {
        for (let at = from; at < to;) {
            if (code[at] === BLOCK && code[at + 1] === VOID && code[at + 2] === LOOP && code[at + 3] === VOID) {
                const loopEnd = close(at + 2), blockEnd = close(at);
                if (loopEnd > 0 && blockEnd === loopEnd + 1 && code[loopEnd - 2] === BR && code[loopEnd - 1] === 0) {
                    // C: from the loop body's start to the first top-level `eqz; br_if 1`.
                    let depth = 0, k = at + 4, condEnd = -1, internal = true;
                    for (; k < loopEnd; k = next(k)) {
                        const op = code[k];
                        if (depth === 0 && op === I32_EQZ && code[k + 1] === BR_IF && code[k + 2] === 1) { condEnd = k; break; }
                        if (op >= BLOCK && op <= IF) depth++;
                        else if (op === END) depth--;
                        else if ((op === BR || op === BR_IF) && code[k + 1] >= depth) internal = false;
                        else if (op === RETURN || op === UNREACHABLE) internal = false;
                    }
                    if (condEnd > 0 && internal) {
                        const cond = code.slice(at + 4, condEnd);
                        out.push(BLOCK, VOID, ...cond, I32_EQZ, BR_IF, 0, LOOP, VOID);
                        emit(condEnd + 3, loopEnd - 2, out);
                        out.push(...cond, BR_IF, 0, END, END);
                        changed = true;
                        at = blockEnd + 1;
                        continue;
                    }
                }
            }
            const n = next(at);
            for (let j = at; j < n; j++) out.push(code[j]);
            at = n;
        }
    }
    for (let at = 0; at < code.length; at = next(at)) if (CELLS[code[at]] < 0) return null;
    const out = [];
    emit(0, code.length, out);
    return changed ? out : null;
}

