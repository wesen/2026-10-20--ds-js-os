const boundsWidths = new Map([
    [0x00,1],[0x02,2],[0x03,2],[0x04,2],[0x05,1],[0x0b,1],
    [0x0c,2],[0x0d,2],[0x0f,1],[0x10,2],[0x1a,1],[0x20,2],[0x21,2],
    [0x28,3],[0x2f,3],[0x36,3],[0x3b,3],[0x41,2],[0x45,1],[0x46,1],
    [0x47,1],[0x48,1],[0x4a,1],[0x4c,1],[0x4e,1],[0x4f,1],[0x6a,1],
    [0x6b,1],[0x6c,1],[0x6d,1],[0x6f,1],[0x74,1],[0x75,1],
]);
const boundsBarriers = new Set([0x00,0x02,0x03,0x04,0x05,0x0b,0x0c,0x0d,0x0f,0x10,0x36,0x3b]);

function reuseBounds(fn, stats) {
    const cells = fn.code;
    const bindings = new Map(), savedPositions = new Set(), checked = new Set();
    const removed = [];
    let number = 0, previous = -1;
    const binding = slot => {
        if (!bindings.has(slot)) bindings.set(slot, ++number);
        return bindings.get(slot);
    };
    for (let at = 0; at < cells.length;) {
        const op = cells[at];
        const width = boundsWidths.get(op);
        if (!width || width + at > cells.length) {
            stats.bailed++;
            return fn;
        }
        const position = cells[at+1], receiver = cells[at+3];
        const guard = [0x20,position,0x20,receiver,0x28,2,0,0x4f,0x04,0x40,0,0x0b];
        if (op === 0x20 && savedPositions.has(position) &&
            guard.every((cell,i) => cell === cells[at+i])) {
            const key = binding(receiver) + ":" + binding(position);
            stats.guards++;
            if (checked.has(key)) removed.push({start:at, end:at+guard.length});
            else checked.add(key);
            stats.visited += guard.length;
            at += guard.length;
            previous = -1;
            continue;
        }
        if (op === 0x21) {
            const slot = cells[at+1], origin = cells[previous];
            if (origin === 0x20 || origin === 0x41) {
                bindings.set(slot, origin === 0x20 ? binding(cells[previous+1]) : "c"+cells[previous+1]);
                savedPositions.add(slot);
            } else {
                bindings.set(slot, ++number);
                savedPositions.delete(slot);
            }
        }
        if (boundsBarriers.has(op)) {
            checked.clear();
            savedPositions.clear();
            bindings.clear();
        }
        previous = at;
        at += width;
        stats.visited += width;
    }
    if (!removed.length) return fn;
    stats.removed += removed.length;
    const code = [];
    let at = 0;
    for (const {start,end} of removed) {
        while (at < start) code.push(cells[at++]);
        at = end;
    }
    while (at < cells.length) code.push(cells[at++]);
    return {...fn, code};
}

function boundsSelector(options) {
    const policy = options?.boundsPolicy ?? "never";
    if (!["never","always","order","selected"].includes(policy))
        throw new RangeError("unknown bounds policy");
    const stats = {functions:0, accepted:0, charged:0, visited:0, guards:0, removed:0, bailed:0};
    if (options?.boundsStats) Object.assign(options.boundsStats,{bounds:stats});
    const changedFunctions = options?.boundsStats?.changedFunctions;
    let available = 640;
    return fn => {
        stats.functions++;
        if (policy === "never") return fn;
        const size = fn.code.length;
        if (policy !== "always" && size > available) return fn;
        if (policy === "selected" && (size < 24 || size > 192 ||
            !fn.params.some(type => type === "buffer" || type === "string"))) return fn;
        stats.accepted++;
        stats.charged += size;
        available -= size;
        const candidate = reuseBounds(fn, stats);
        if (candidate !== fn && changedFunctions) changedFunctions.push(fn.name);
        return candidate;
    };
}
