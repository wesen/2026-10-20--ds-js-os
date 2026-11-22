// Describe a tiny unary integer helper only after its verified operation tape is available.
// Accepted body: if (x <relation> K) return -x or C; return x.
// The branch below skips the taken action when the source predicate is false.
const GUARDED_FALSE = new Map([
    [0x46,[1,false]], [0x47,[0,false]], // eq: bne, ne: beq
    [0x48,[5,false]], [0x4a,[5,true]],  // lt: bge x,K; gt: bge K,x
    [0x4c,[4,true]], [0x4e,[4,false]],  // le: blt K,x; ge: blt x,K
]);

function guardedReturnSummary(fn) {
    const t = fn.code;
    if (fn.nlocals || fn.params.length !== 1 || fn.params[0] !== "i32" || fn.result !== "i32" ||
        (t.length !== 14 && t.length !== 17)) return null;
    const branch = GUARDED_FALSE.get(t[4]);
    if (!branch || t[0] !== 0x20 || t[1] !== 0 || t[2] !== 0x41 || t[5] !== 0x04 ||
        t[6] !== 0x40 || t[7] !== 0x41) return null;
    const negate = t.length === 17;
    if (negate && (t[8] !== 0 || t[9] !== 0x20 || t[10] !== 0 || t[11] !== 0x6b)) return null;
    const tail = t.length - 5;
    if (t[tail] !== 0x0f || t[tail+1] !== 0x0b || t[tail+2] !== 0x20 ||
        t[tail+3] !== 0 || t[tail+4] !== 0x0b) return null;
    return {kind: branch[0], swap: branch[1], limit: t[3], negate, literal: t[8]};
}

class GuardedReturnCode extends FunctionCode {
    call(index) {
        const summary = this.starts[index].guardedReturn;
        if (!summary) return super.call(index);
        // pop/push preserve every lower stack operand, including any frame spills.
        const x = this.pop(T5);
        const out = this.resultRegister();
        this.move(out, x);
        const limit = summary.limit === 0 ? ZERO : T6;
        if (limit !== ZERO) this.constant(limit, summary.limit);
        const branch = this.words.length;
        this.emit(0);
        if (summary.negate) this.emit(instruction.r(0x33, out, 0, ZERO, x, 0x20));
        else this.constant(out, summary.literal);
        this.words[branch] = instruction.b(summary.kind, summary.swap ? limit : x,
            summary.swap ? x : limit, 4 * (this.words.length - branch)) >>> 0;
        this.push(out);
        if (this.inspection) this.inlinedGuard = true;
    }
}

// An allowlist keeps any new operation with a possible frame dependency on the
// ordinary path until its frameless lowering is reviewed.
const LEAF_OPERANDS = new Map([
    [0x02,1],[0x04,1],[0x05,0],[0x0b,0],[0x0c,1],[0x0d,1],[0x0f,0],
    [0x1a,0],[0x20,1],[0x41,1],[0x45,0],
    [0x46,0],[0x47,0],[0x48,0],[0x4a,0],[0x4c,0],[0x4e,0],[0x4f,0],
    ...Array.from(ALU.keys(), op => [op,0]),
]);
const LEAF_SPILL = Symbol("frameless function needs an operand spill");
const SHORT_BRANCH_RANGE = Symbol("a forward branch target is beyond the conditional-branch range");

class LeafCode extends FunctionCode {
    spill() { throw LEAF_SPILL; }

    step(op) {
        if (op !== 0x20) return super.step(op);
        const local = this.cell();
        if (local >= this.program.params.length) throw LEAF_SPILL;
        // select.leafParams: a frameless leaf never writes a parameter, so reads use it in place.
        if (this.select?.leafParams) this.pushHome(A0 + local);
        else this.push(A0 + local);
        return false;
    }

    lower() {
        this.frameless = true;
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        if (this.at !== this.program.code.length || this.control.length) throw LEAF_SPILL;
        this.mark(this.exit);
        this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
        this.patchBranches();
        return this;
    }
}

// Wrap only the selected instance. The ordinary emitter and the leaf emitter
// keep their real instruction loop, including lookahead and zero-word ops.
function observeSteps(fn) {
    const step = fn.step;
    const ranges = [];
    fn.inspection = {ranges, trackedWords: fn.words};
    fn.step = function(op) {
        const inputStart = this.at - 1;
        let start = this.words.length * 4;
        const live = this.depth;
        const done = step.call(this, op);
        const decisions = [];
        if (op === 0x10 && this.inlinedGuard) {
            decisions.push("inline guarded return from verified i32 helper");
            this.inlinedGuard = false;
        } else if (op === 0x10) {
            const args = this.functions[this.program.code[inputStart + 1]].params.length;
            decisions.push("preserve " + Math.min(Math.max(0, live - args), STACK_REGISTERS.length) +
                " register-held operands across call");
        }
        if (this.loopRanges) {
            ranges.push(...this.loopRanges);
            start = ranges.at(-1).end;
            this.loopRanges = null;
        }
        ranges.push({inputStart, inputEnd: this.at, start, end: this.words.length * 4,
            role: "operation", decisions});
        return done;
    };
}

// Ranges use byte offsets in the final image; tape offsets stay function-local.
// Research lowerings may supply multiple segments when an admitted fast path
// precedes a fallback. Never attach the old positions to replacement words.
function nativeEmission(fn, start, inspect) {
    const ranges = [];
    const length = fn.words.length * 4;
    const ordinary = fn.inspection && fn.inspection.trackedWords === fn.words;
    const segments = fn.inspectionSegments ?? (ordinary ?
        [{offset: 0, ranges: fn.inspection.ranges}] : []);
    let cursor = 0;
    function gap(end, role) {
        if (end > cursor) ranges.push({start: start + cursor, end: start + end, role});
        cursor = end;
    }
    for (const segment of segments) {
        for (const r of segment.ranges) {
            const lo = segment.offset + r.start, hi = segment.offset + r.end;
            if (lo < cursor || hi < lo || hi > length) throw new Error("invalid RV32 inspection segment");
            gap(lo, ordinary && !fn.inspectionSegments ? "prologue" : "specialized code");
            ranges.push({...r, start: start + lo, end: start + hi, segment: segment.label ?? r.segment});
            cursor = hi;
        }
    }
    gap(length, ordinary && !fn.inspectionSegments ? "epilogue" : "specialized code");
    inspect.emit({kind: "emission", target: "rv32", function: fn.program.name,
        start, end: start + length, localCount: fn.locals, frame: fn.frameless ? "leaf" : "framed",
        leafDecision: fn.program.nativeInspection.leafDecision, loops: fn.program.loopDecisions, ranges});
}

function declineLeaf(fn, reason) {
    if (fn.nativeInspection) fn.nativeInspection.leafDecision = reason;
    return null;
}

function lowerLeaf(fn, callables, targets, select, facts) {
    if (fn.nlocals) return declineLeaf(fn, "function declares frame locals");
    if (fn.code.length > 128) return declineLeaf(fn, "operation tape exceeds 128 cells");
    if (fn.params.length > 8 || !fn.params.every(type => type === "i32" || type === "bool"))
        return declineLeaf(fn, "argument list outside leaf convention");
    for (let at = 0; at < fn.code.length;) {
        const operands = LEAF_OPERANDS.get(fn.code[at++]);
        if (operands === undefined || at + operands > fn.code.length)
            return declineLeaf(fn, "operation outside frameless allowlist");
        at += operands;
    }
    try {
        const leaf = new LeafCode(fn, callables, targets);
        leaf.select = select;
        leaf.facts = facts;
        return leaf.lower();
    } catch (error) {
        if (error !== LEAF_SPILL) throw error;
        return declineLeaf(fn, "leaf requires frame storage");
    }
}

