// A function the inliner may copy: short, no literal stores (their table is per function),
// no calls to itself, and not an async state machine. Records which parameters the body
// writes and which it uses as checked-address operands.
function inlineCandidate(fn, code, limits, guarded) {
    if (fn.async || guarded || fn.literals || code.length > limits.calleeCells) return null;
    const written = fn.params.map(() => false), addressed = fn.params.map(() => false);
    for (let at = 0; at < code.length;) {
        const op = code[at], n = OPERAND_CELLS[op];
        if (n < 0 || op === 0xf2 || (op === 0x10 && code[at + 1] === fn.index)) return null;
        if (op === 0x21 && code[at + 1] < fn.params.length) written[code[at + 1]] = true;
        if (op === 0xf1) for (const v of [code[at + 1], code[at + 2]]) if (v < fn.params.length) addressed[v] = true;
        at += 1 + n;
    }
    return {params: fn.params.length, written, addressed};
}

