// select.facts: division and remainder by a positive constant whose dividend is never
// negative, so the emitter can drop the rounding bias and the sign correction. Two steps:
// localRanges gives every local one interval, the join of every value written to it anywhere,
// on the tape after rotation and before versioning; divisionFacts then evaluates the final tape
// (after versioning and splitting) with those intervals. Versioning and splitting change where a
// value is computed and which local holds it, never which values a local can hold, so the
// intervals stay valid: a split local takes the interval of the local it came from.
const RANGE_TOP = Object.freeze([-2147483648, 2147483647]);
const rangeFits = (lo, hi) => lo >= -2147483648 && hi <= 2147483647 ? [lo, hi] : RANGE_TOP;
const rangeJoin = (x, y) => !x ? y : !y ? x : [Math.min(x[0], y[0]), Math.max(x[1], y[1])];

// One abstract interpretation of a tape over intervals; null is "no value yet" (bottom).
// rangeOf(local) answers reads, onWrite(at, local, value) sees each local.set, and
// onDivide(at, dividend) each division or remainder by a positive constant. Buffer reads are
// [0, 65535], comparisons [0, 1], arithmetic that could leave the i32 range is unknown. Value
// blocks join the values reaching their end. Returns false on an operation it does not model.
function rangePass(code, arity, rangeOf, onWrite, onDivide) {
    const stack = [], blocks = [];
    let dead = false;
    const pop = () => stack.length ? stack.pop() : RANGE_TOP;
    const top = () => stack.length ? stack.at(-1) : RANGE_TOP;
    const reach = target => { if (target?.value) target.result = rangeJoin(target.result, top()); };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at], a = code[at + 1];
        if (dead && op !== 0x05 && op !== 0x0b && !(op >= 0x02 && op <= 0x04)) continue;
        if (dead && op >= 0x02 && op <= 0x04) { blocks.push({op, value: false, height: stack.length, result: null, deadEntry: true}); continue; }
        switch (op) {
        case 0x41: stack.push([a, a]); break;
        case 0x20: stack.push(rangeOf(a)); break;
        case 0x21: onWrite(at, a, pop()); break;
        case 0x1a: pop(); break;
        case 0x0d: pop(); reach(blocks[blocks.length - 1 - a]); break;
        case 0x0c: reach(blocks[blocks.length - 1 - a]); dead = true; break;
        case 0x0f: pop(); dead = true; break;
        case 0x00: dead = true; break;
        case 0x45: pop(); stack.push([0, 1]); break;
        case 0x28: pop(); stack.push(RANGE_TOP); break;
        case 0x2f: pop(); stack.push([0, 65535]); break;
        case 0x36: case 0x3b: pop(); pop(); break;
        case 0xf1: case 0xf3: stack.push(RANGE_TOP); break;
        case 0xf2: break;
        case 0x10: for (let i = arity(a); i > 0; i--) pop(); stack.push(RANGE_TOP); break;
        case 0x02: case 0x03: case 0x04:
            if (op === 0x04) pop();
            blocks.push({op, value: a === 0x7f, height: stack.length, result: null});
            break;
        case 0x05: case 0x0b: {
            const block = op === 0x05 ? blocks.at(-1) : blocks.pop();
            if (!block) break;
            if (block.value && !dead) block.result = rangeJoin(block.result, top());
            stack.length = block.height;
            dead = block.deadEntry ?? false;
            if (op === 0x0b && block.value) stack.push(block.result ?? RANGE_TOP);
            break;
        }
        default: {
            if (!((op >= 0x46 && op <= 0x4f) || (op >= 0x6a && op <= 0x75))) return false;
            const y = pop(), x = pop();
            let r = RANGE_TOP;
            if (op <= 0x4f) r = [0, 1];
            else if (!x || !y) r = null;
            else if (op === 0x6a) r = rangeFits(x[0] + y[0], x[1] + y[1]);
            else if (op === 0x6b) r = rangeFits(x[0] - y[1], x[1] - y[0]);
            else if (op === 0x6c) {
                const p = [x[0] * y[0], x[0] * y[1], x[1] * y[0], x[1] * y[1]];
                r = rangeFits(Math.min(...p), Math.max(...p));
            } else if ((op === 0x6d || op === 0x6f) && y[0] === y[1] && y[0] > 0) {
                const d = y[0];
                onDivide(at, x);
                r = op === 0x6d ? [Math.trunc(x[0] / d), Math.trunc(x[1] / d)]
                    : x[0] >= 0 ? [0, Math.min(x[1], d - 1)] : [-(d - 1), d - 1];
            } else if (op === 0x75 && y[0] === y[1] && y[0] >= 0 && y[0] < 32) r = [x[0] >> y[0], x[1] >> y[0]];
            else if (op === 0x71 && y[0] === y[1] && y[0] >= 0) r = [0, y[0]];
            stack.push(r);
        }
        }
    }
    return true;
}

// Interval of every local that is written before it is read in tape order; a local missing
// from the result is unknown. The counter k of a rotated counted loop (the shape versionLoops
// matches: the test k < N enters the loop, its only write of k is a final k = k + s, and N is a
// constant or a local the loop does not write) is bounded by max(N) - 1 + s instead of growing
// pass by pass, since the increment only runs after k < N held.
function localRanges(code, params, arity) {
    // Most functions divide by no constant: one scan, and no intervals to compute.
    let divides = false;
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        if (!(OPERAND_CELLS[code[at]] >= 0)) return null;
        if (code[at] === 0x41 && code[at + 1] > 0 && (code[at + 2] === 0x6d || code[at + 2] === 0x6f)) divides = true;
    }
    if (!divides) return null;
    const counters = new Map();
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        if (code[at] !== 0x02 || code[at + 1] !== 0x40 || code[at + 2] !== 0x20 || code[at + 6] !== 0x48 || code[at + 7] !== 0x45 ||
            code[at + 8] !== 0x0d || code[at + 9] !== 0 || code[at + 10] !== 0x03 || code[at + 11] !== 0x40) continue;
        const k = code[at + 3], boundOp = code[at + 4], bound = code[at + 5];
        if (boundOp !== 0x41 && boundOp !== 0x20) continue;
        const loopEnd = opClose(code, at + 10);
        if (loopEnd < 0 || opClose(code, at) !== loopEnd + 1) continue;
        const inc = loopEnd - 14;
        if (inc < at + 12 || code[inc] !== 0x20 || code[inc + 1] !== k || code[inc + 2] !== 0x41 || code[inc + 4] !== 0x6a ||
            code[inc + 5] !== 0x21 || code[inc + 6] !== k || !(code[inc + 3] >= 1 && code[inc + 3] <= 64)) continue;
        if (code[inc + 7] !== 0x20 || code[inc + 8] !== k || code[inc + 9] !== boundOp || code[inc + 10] !== bound ||
            code[inc + 11] !== 0x48 || code[inc + 12] !== 0x0d || code[inc + 13] !== 0) continue;
        let writes = 0, boundWritten = false;
        for (let p = at + 12; p < loopEnd; p = opNext(code, p)) if (code[p] === 0x21) {
            if (code[p + 1] === k) writes++;
            if (boundOp === 0x20 && code[p + 1] === bound) boundWritten = true;
        }
        if (writes === 1 && !boundWritten)
            counters.set(inc + 5, {bound: boundOp === 0x41 ? [bound, bound] : null, local: bound, step: code[inc + 3]});
    }
    const seen = new Set(), unknown = new Set();
    const touch = (x, write) => { if (x >= params && !seen.has(x) && !write) unknown.add(x); seen.add(x); };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (op === 0x20 || op === 0xf2) touch(code[at + 1], false);
        else if (op === 0x21) touch(code[at + 1], true);
        else if (op === 0xf1 || op === 0xf3) { touch(code[at + 1], false); touch(code[at + 2], false); }
    }
    const ranges = new Map();
    const rangeOf = local => local < params || unknown.has(local) ? RANGE_TOP : ranges.get(local) ?? null;
    // Intervals only grow. From the third pass a bound that still moves is widened: a falling
    // lower bound to 0 when it is still non-negative (the property divisions need), otherwise to
    // the i32 limit, and a rising upper bound to the i32 limit. Each bound then moves at most
    // twice more, so the passes are bounded. Without a fixed point there are no intervals.
    for (let round = 0; round < 16; round++) {
        const next = new Map();
        const onWrite = (at, local, value) => {
            const counter = counters.get(at);
            if (counter) {
                const k = rangeOf(local), n = counter.bound ?? rangeOf(counter.local);
                value = k && n ? rangeFits(k[0] + counter.step, n[1] + counter.step - 1) : null;
            }
            if (value) next.set(local, rangeJoin(next.get(local), value));
        };
        if (!rangePass(code, arity, rangeOf, onWrite, () => {})) return null;
        let stable = true;
        for (const [local, value] of next) {
            const old = ranges.get(local);
            let merged = rangeJoin(old, value);
            if (!old || old[0] !== merged[0] || old[1] !== merged[1]) {
                stable = false;
                if (round >= 2 && old) merged = [merged[0] < old[0] ? (merged[0] >= 0 ? 0 : RANGE_TOP[0]) : old[0],
                    merged[1] > old[1] ? RANGE_TOP[1] : old[1]];
            }
            ranges.set(local, merged);
        }
        if (stable) {
            for (const local of unknown) ranges.delete(local);
            return ranges;
        }
    }
    return null;
}

// Offsets of the division and remainder operations of the final tape whose dividend is known
// non-negative. origin maps a local of the final tape to the local of localRanges' tape.
function divisionFacts(code, params, arity, ranges, origin) {
    const facts = new Set();
    const rangeOf = local => local < params ? RANGE_TOP : ranges.get(origin(local)) ?? RANGE_TOP;
    return rangePass(code, arity, rangeOf, () => {}, (at, x) => { if (x && x[0] >= 0) facts.add(at); }) ? facts : null;
}

