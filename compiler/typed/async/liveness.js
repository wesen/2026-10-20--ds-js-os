// Liveness over the statement skeleton: the bindings live after each wait, which a frame saves in WorldState.
function contains(sequence, property) {
    return sequence.some(node => node[property]);
}

function merge(...sets) {
    const combined = new Set();
    for (const set of sets) for (const binding of set) combined.add(binding);
    return combined;
}

function without(set, binding) {
    const result = new Set(set);
    result.delete(binding);
    return result;
}

function liveSequence(nodes, out, loopExit) {
    for (let i = nodes.length - 1; i >= 0; i--) out = liveBefore(nodes[i], out, loopExit);
    return out;
}

function liveBefore(node, out, loopExit) {
    switch (node.kind) {
    case "simple":
        return merge(without(out, node.def), node.data.uses);
    case "return":
        return node.data.uses;
    case "break":
        return loopExit;
    case "await":
        node.after = without(out, node.target);
        return merge(node.after, node.args.uses);
    case "if":
        return merge(node.cond.uses, liveSequence(node.yes, out, loopExit), liveSequence(node.no, out, loopExit));
    case "match": {
        const uses = new Set(node.value.uses);
        for (const {body} of node.arms)
            for (const binding of liveSequence(body, out, loopExit)) uses.add(binding);
        return uses;
    }
    case "while":
    case "for": {
        const base = merge(node.cond.uses, out);
        let live = base;
        while (true) {
            const bodyEnd = node.step ? liveBefore(node.step, live, out) : live;
            const next = merge(base, liveSequence(node.body, bodyEnd, out));
            if (next.size === live.size) break;
            live = next;
        }
        return node.init ? liveBefore(node.init, live, loopExit) : live;
    }
    default:
        throw new Error("unknown continuation statement " + node.kind);
    }
}

function analyze(program) {
    const ordinary = sourceCallables(program);
    for (const fn of program.functions.values()) {
        if (!fn.async) continue;
        fn.body = new AsyncBody(program, fn, ordinary).parse();
        fn.tokens = null;
        liveSequence(fn.body, new Set(), new Set());
        const saved = new Set();
        for (const wait of fn.waits) {
            wait.saved = fn.bindings.filter(binding => wait.after.has(binding) && !binding.ambient);
            for (const binding of wait.saved) {
                if (!scalar(binding.type, program.types)) {
                    const line = location(program.source, wait.at).split(":")[0];
                    fail(program.source, wait.at, binding.name + " is live across the wait at line " + line +
                        "; obtain it again after the wait");
                }
                saved.add(binding);
            }
        }
        fn.saved = fn.bindings.filter(binding => saved.has(binding));
    }
}
