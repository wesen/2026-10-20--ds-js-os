function projectTypedOperations(fn) {
    if (!fn.hasTypedOperations) return;
    const projected = [];
    const code = fn.code;
    for (let at = 0; at < code.length;) {
        const op = code[at++];
        if (op === TYPED_READ) {
            const binding = code[at++];
            if (DIRECT_READ) {
                projected.push(op, binding);
                continue;
            }
            const recv = binding >> 1;
            const pos = code[at++];
            projected.push(0x21, pos,
                0x20, pos, 0x20, recv, 0x28, 2, 0, 0x4f, 0x04, 0x40, 0x00, 0x0b,
                0x20, recv, 0x20, pos, 0x41, 1, 0x74, 0x6a, 0x2f, 1, 4);
            continue;
        }
        if (op === TYPED_PREDICATE) {
            projected.push(code[at++]);
            const invert = code[at++];
            for (let i = 0; i < invert; i++) projected.push(0x45);
            projected.push(code[at++], code[at++]);
            continue;
        }
        projected.push(op);
        if (op === 0x02 || op === 0x03 || op === 0x04 || op === 0x0c || op === 0x0d ||
            op === 0x10 || op === 0x20 || op === 0x21 || op === 0x41) projected.push(code[at++]);
        else if (op === 0x28 || op === 0x2f || op === 0x36 || op === 0x3b)
            projected.push(code[at++], code[at++]);
    }
    fn.code = projected;
}
