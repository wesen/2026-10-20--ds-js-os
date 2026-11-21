// Injected inside the ordinary RV32 backend closure by make-backends.mjs.
// The selected function is leaf code. a2 through a7 are free volatile homes.
const rowHomes = new Map([[0,12], [2,13], [15,14], [16,15], [17,16], [18,17]]);
const rowBinaryOps = new Set([0x46,0x47,0x48,0x4a,0x4c,0x4e,0x4f,...ALU.keys()]);

class FactorRow extends FunctionCode {
    constructor(fn, functions, targets, flags) {
        super(fn, functions, targets);
        this.flags = flags;
        this.borrowed = [];
    }

    home(offset, base, kind) {
        if (this.flags.registers && base === SP && kind === 2) return rowHomes.get(offset / 4);
    }

    load(rd, offset, base = SP, kind = 2) {
        const reg = this.home(offset, base, kind);
        if (reg !== undefined) this.move(rd, reg);
        else super.load(rd, offset, base, kind);
    }

    store(rs, offset, base = SP, kind = 2) {
        const reg = this.home(offset, base, kind);
        if (reg !== undefined) this.move(reg, rs);
        else super.store(rs, offset, base, kind);
    }

    local(local, scratch) {
        const reg = this.home(4 * local, SP, 2);
        if (reg !== undefined) return reg;
        this.load(scratch, 4 * local);
        return scratch;
    }

    pop(scratch) {
        const depth = this.depth - 1;
        const reg = this.borrowed[depth];
        if (reg === undefined) return super.pop(scratch);
        this.borrowed[depth] = undefined;
        this.depth = depth;
        return reg;
    }

    step(op) {
        if (op === 0x20 && this.flags.registers) {
            const code = this.program.code;
            const home = rowHomes.get(code[this.at]);
            const next = code[this.at + 1];
            // Between a borrowed read and its consuming binary operator there
            // can be at most one pure local read or literal. No write or call.
            if (home !== undefined && (rowBinaryOps.has(next) ||
                ((next === 0x20 || next === 0x41) && rowBinaryOps.has(code[this.at + 3])))) {
                this.cell();
                this.borrowed[this.depth++] = home;
                return false;
            }
        }
        if (op !== 0xf1) return super.step(op);
        const receiver = this.cell(), position = this.cell();
        const index = this.local(position,T5), buffer = this.local(receiver,T6);
        if (!this.flags.hoist) {
            this.load(A0,0,buffer);
            this.emit(instruction.b(6,index,A0,8));
            this.emit(0x00100073);
        }
        const out = this.resultRegister();
        this.emit(instruction.i(0x13,out,1,index,1));
        this.emit(instruction.r(0x33,out,0,buffer,out));
        this.push(out);
        return false;
    }
}

function rowAdmission(fn, callables, targets, reject) {
    const guard = new FunctionCode(fn,callables,targets);
    const capacity=5, limit=6, count=7, ptr=28, field=29, bound=30;
    guard.load(capacity,0,A0);
    guard.constant(limit,1865);
    guard.branch(6,capacity,limit,reject);
    guard.constant(limit,159);
    guard.branch(6,limit,A0+1,reject);
    guard.load(count,36,A0,5);
    guard.constant(limit,3);
    guard.branch(6,limit,count,reject);
    guard.emit(instruction.i(0x13,ptr,0,A0,6));
    const loop={}, done={};
    guard.mark(loop);
    guard.branch(0,count,ZERO,done);
    for (const [offset,maximum] of [[2,159],[6,32]]) {
        guard.load(field,offset,ptr,5);
        guard.constant(bound,maximum);
        guard.branch(6,bound,field,reject);
    }
    guard.emit(instruction.i(0x13,ptr,0,ptr,10));
    guard.emit(instruction.i(0x13,count,0,count,-1));
    guard.jump(loop);
    guard.mark(done);
    return guard;
}

function shiftRowBody(body, offset) {
    const visited = new Set();
    for (const call of body.calls) {
        call.from += offset;
        if (!call.target.global && call.target.importIndex === undefined && !visited.has(call.target)) {
            call.target.at += offset;
            visited.add(call.target);
        }
    }
}

function lowerFactorRow(fn, callables, targets, options) {
    if (fn.name !== 'typedRayComputeRow' || fn.params.length !== 2 || fn.params[0] !== 'buffer' ||
        fn.params[1] !== 'i32' || fn.result !== 'i32' || fn.nlocals !== 24 ||
        fn.code.length !== factorTemplate.length || !factorTemplate.every((v,i)=>fn.code[i]===v)) return null;
    const fallback = new FunctionCode(fn,callables,targets).lower();
    let active = fn;
    if (factorFlags.skip) {
        // Enclose the original inner loop (166..303) in if (row >= 0).
        const ir = Array.from(fn.code);
        active = {...fn,code:[...ir.slice(0,166),0x20,15,0x41,0,0x4e,0x04,0x40,
                             ...ir.slice(166,304),0x0b,...ir.slice(304)]};
    }
    const fast = new FactorRow(active,callables,targets,factorFlags).lower();
    const reject = {};
    const guard = rowAdmission(fn,callables,targets,reject);
    const fastAt = guard.words.length, fallbackAt = fastAt + fast.words.length;
    reject.at = fallbackAt;
    shiftRowBody(fast,fastAt);
    shiftRowBody(fallback,fallbackAt);
    if (options?.onScalarRowLowered) options.onScalarRowLowered({
        fastAt,fallbackAt,fastWords:fast.words.length,fallbackWords:fallback.words.length,
        guardWords:guard.words.length,flags:factorFlags
    });
    guard.words.push(...fast.words,...fallback.words);
    guard.calls.push(...fast.calls,...fallback.calls);
    return guard;
}
