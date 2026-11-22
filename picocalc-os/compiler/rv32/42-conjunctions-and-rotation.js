// select.conjunctions: the frontend lowers `a && b` to a value if, `a; if (result i32) b else
// const 0 end`, whose 0/1 result a following `if` or `br_if` tests again. Fused, the value is
// never materialized:
//   a; if (result i32) b else const 0 end; if BODY end   ->   a; if b; if BODY end end
//   a; if (result i32) b else const 0 end; br_if L       ->   a; if b; br_if L+1 end
// b runs exactly when a holds in both forms. BODY sits one construct deeper, so its branches
// that leave it gain one level; b keeps its depth (it was inside the value if, now inside the
// outer if). A consumer `if` with an else arm is left alone (fusing would duplicate the arm).
function fuseConjunctions(code) {
    for (let at = 0; at < code.length; at = opNext(code, at)) if (!(OPERAND_CELLS[code[at]] >= 0)) return null;
    let changed = false;
    for (let round = 0; round < 64; round++) {
        let rewritten = null;
        for (let s = 0; s < code.length && !rewritten; s = opNext(code, s)) {
            if (code[s] !== 0x04 || code[s + 1] !== 0x7f) continue;
            const t = opClose(code, s);
            let e = -1;
            for (let k = s + 2, depth = 0; k < t; k = opNext(code, k)) {
                const op = code[k];
                if (op >= 0x02 && op <= 0x04) depth++;
                else if (op === 0x0b) depth--;
                else if (op === 0x05 && depth === 0) e = k;
            }
            if (e < 0 || t !== e + 3 || code[e + 1] !== 0x41 || code[e + 2] !== 0) continue;
            const c = t + 1;
            if (code[c] === 0x0d) {
                rewritten = [...code.slice(0, s), 0x04, 0x40, ...code.slice(s + 2, e), 0x0d, code[c + 1] + 1, 0x0b, ...code.slice(c + 2)];
            } else if (code[c] === 0x04 && code[c + 1] === 0x40) {
                const u = opClose(code, c);
                if (u < 0) return null;
                const body = [];
                let otherwise = false;
                for (let k = c + 2, depth = 0; k < u; k = opNext(code, k)) {
                    const op = code[k];
                    if (op === 0x05 && depth === 0) otherwise = true;
                    if ((op === 0x0c || op === 0x0d) && code[k + 1] > depth) body.push(op, code[k + 1] + 1);
                    else for (let j = k; j < opNext(code, k); j++) body.push(code[j]);
                    if (op >= 0x02 && op <= 0x04) depth++;
                    else if (op === 0x0b) depth--;
                }
                if (otherwise) continue;
                rewritten = [...code.slice(0, s), 0x04, 0x40, ...code.slice(s + 2, e), 0x04, 0x40, ...body, 0x0b, 0x0b, ...code.slice(u + 1)];
            }
        }
        if (!rewritten) break;
        code = rewritten;
        changed = true;
    }
    return changed ? code : null;
}

function rotateLoops(code) {
    const next = at => at + 1 + OPERAND_CELLS[code[at]];
    // Matching `end` of the block or loop opened at `at`.
    function close(at) {
        let depth = 0;
        for (let k = at; k < code.length; k = next(k)) {
            const op = code[k];
            if (op >= 0x02 && op <= 0x04) depth++;
            else if (op === 0x0b && --depth === 0) return k;
        }
        return -1;
    }
    let changed = false;
    function emit(from, to, out) {
        for (let at = from; at < to;) {
            if (code[at] === 0x02 && code[at + 1] === 0x40 && code[at + 2] === 0x03 && code[at + 3] === 0x40) {
                const loopEnd = close(at + 2), blockEnd = close(at);
                if (loopEnd > 0 && blockEnd === loopEnd + 1 && code[loopEnd - 2] === 0x0c && code[loopEnd - 1] === 0) {
                    // C: from the loop body's start to the first top-level `eqz; br_if 1`.
                    let depth = 0, k = at + 4, condEnd = -1, internal = true;
                    for (; k < loopEnd; k = next(k)) {
                        const op = code[k];
                        if (depth === 0 && op === 0x45 && code[k + 1] === 0x0d && code[k + 2] === 1) { condEnd = k; break; }
                        if (op >= 0x02 && op <= 0x04) depth++;
                        else if (op === 0x0b) depth--;
                        else if ((op === 0x0c || op === 0x0d) && code[k + 1] >= depth) internal = false;
                        else if (op === 0x0f || op === 0x00) internal = false;
                    }
                    if (condEnd > 0 && internal) {
                        const cond = code.slice(at + 4, condEnd);
                        out.push(0x02, 0x40, ...cond, 0x45, 0x0d, 0, 0x03, 0x40);
                        emit(condEnd + 3, loopEnd - 2, out);
                        out.push(...cond, 0x0d, 0, 0x0b, 0x0b);
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
    for (let at = 0; at < code.length; at = next(at)) if (OPERAND_CELLS[code[at]] < 0) return null;
    const out = [];
    emit(0, code.length, out);
    return changed ? out : null;
}

