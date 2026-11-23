// The native inspection view: per-operation word ranges for typed-inspect and the workbench.
import {STACK_REGISTERS} from "../encoding/registers.js";
import {CALL} from "../encoding/tape.js";

// Wrap only the selected instance. The ordinary emitter and the leaf emitter
// keep their real instruction loop, including lookahead and zero-word ops.
export function observeSteps(fn) {
    const step = fn.step;
    const ranges = [];
    fn.inspection = {ranges, trackedWords: fn.words};
    fn.step = function(op) {
        const inputStart = this.at - 1;
        let start = this.words.length * 4;
        const live = this.depth;
        const done = step.call(this, op);
        const decisions = [];
        if (op === CALL && this.inlinedGuard) {
            decisions.push("inline guarded return from verified i32 helper");
            this.inlinedGuard = false;
        } else if (op === CALL) {
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
export function nativeEmission(fn, start, inspect) {
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
