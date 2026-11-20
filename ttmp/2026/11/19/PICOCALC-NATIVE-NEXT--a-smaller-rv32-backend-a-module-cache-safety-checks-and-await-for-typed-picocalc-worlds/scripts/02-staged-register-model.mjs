// Staged variant of PICOCALC-COMPILER-ISSUE scripts/03-register-cache-model.mjs.
// The original model is unchanged except for three switches selected by the STAGE environment variable:
//   STAGE=1  operand stack in registers, lazy constants and locals; every comparison is materialized
//            as 0 or 1 at once and every conditional branch is the two-instruction branch-over-jump form
//   STAGE=2  as 1, with pending comparisons fused into the branch; branches still in the long form
//   STAGE=3  as 2, with short branches: this is model A (and model B) of Article 5 exactly
// Run from the repository root: STAGE=3 node <this file> [--json] [--file source.typed]
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';

const os = resolve('picocalc-os');
const worldJs = readFileSync(join(os, 'compiler/typed-world.js'), 'utf8');
const importRows = [...worldJs.matchAll(/\["(typedSdk\w+)", "([^"]*)", "(\w+)"(?:, true)?\]/g)]
    .map(([, name, params, result]) => ({name, params: params ? params.split(',') : [], result}));
const sourceOf = (dir, list) => list.map(name => readFileSync(join(os, 'worlds', dir, name), 'utf8') + '\n').join('');
const editorList = readFileSync(join(os, 'worlds/editor/source.list'), 'utf8').trim().split('\n');
const apps = {
    editor: {source: sourceOf('editor', editorList), imports: importRows, max: 96 * 1024},
    files: {source: sourceOf('files', ['files.typed']), imports: [], max: 64 * 1024},
    agenda: {source: sourceOf('agenda', ['reminder.typed', 'entry.typed']), imports: [], max: 64 * 1024},
};

const fileArg = process.argv.indexOf('--file');
if (fileArg > 0) {
    for (const key of Object.keys(apps)) delete apps[key];
    apps[process.argv[fileArg + 1]] = {source: readFileSync(process.argv[fileArg + 1], 'utf8'), imports: [], max: 64 * 1024};
}
const STAGE = +(process.env.STAGE ?? 3);
const fits12 = v => v >= -2048 && v <= 2047;
const constCost = v => fits12(v) ? 1 : 2;           // addi, or lui+addi (as the shipped code does)

function walk(fn, callables, nImports) {
    const code = fn.code;
    let at = 0;
    const byte = () => code[at++];
    const leb = (signed = false) => {
        let value = 0;
        for (let shift = 0; shift < 35; shift += 7) {
            const octet = byte();
            value |= (octet & 127) << shift;
            if (octet < 128) {
                if (signed && shift < 28 && (octet & 64)) value |= -1 << (shift + 7);
                return signed ? value : value >>> 0;
            }
        }
        throw new Error('bad leb');
    };
    const nparams = fn.params.length, nlocals = nparams + fn.nlocals;

    // ---- pre-scan: static use counts per local, and whether the function makes calls
    const uses = new Array(nlocals).fill(0);
    let leaf = true, shortCircuit = 0;
    {
        let p = 0;
        const b = () => code[p++];
        const l = () => { while (code[p++] >= 128); };
        while (p < code.length) {
            const op = b();
            if (op === 0x02 || op === 0x03 || op === 0x04) { if (b() === 0x7f && op === 0x04) shortCircuit++; }
            else if (op === 0x0c || op === 0x0d) l();
            else if (op === 0x10) { l(); leaf = false; }
            else if (op === 0x20 || op === 0x21) { let v = 0, s = 0, o; do { o = b(); v |= (o & 127) << s; s += 7; } while (o >= 128); uses[v]++; }
            else if (op === 0x28 || op === 0x2f || op === 0x36 || op === 0x3b) { l(); l(); }
            else if (op === 0x41) l();
        }
    }
    // Model B register budget: a leaf keeps locals in caller-saved registers (a0-a7, t3-t6 = 12,
    // leaving t0-t2 and more for the operand stack); a non-leaf uses s1-s11 (11) and saves them.
    const budget = leaf ? 10 : 11;
    const ranked = uses.map((n, i) => [n, i]).sort((x, y) => y[0] - x[0]).slice(0, budget).filter(([n]) => n > 0).map(([, i]) => i);
    const inReg = new Set(ranked);

    const cost = {current: 0, A: 0, B: 0};
    const detail = {flushA: 0, flushB: 0, maxDepth: 0, leaf, shortCircuit, nlocals, regLocals: inReg.size};
    // prologue + epilogue
    cost.current += 2 + nparams + 3;
    cost.A += leaf ? 1 + nparams + 2 : 2 + nparams + 3;        // leaf: no ra save
    const memParamsB = [...Array(nparams).keys()].filter(i => !inReg.has(i)).length;
    cost.B += leaf
        ? (memParamsB || nlocals > inReg.size ? 2 : 0) + memParamsB + 1   // frame only if some local lives in memory; ret
        : 2 + 3 + 2 * inReg.size + (nparams - memParamsB) + memParamsB;   // sp/ra, saves+restores, param moves or spills

    const stack = [];               // abstract operand stack, shared shape for A and B
    const control = [];
    const matLocal = (m, i) => m === 'B' && inReg.has(i) ? 0 : 1;
    const mat = (m, e) => e.k === 'r' ? 0 : e.k === 'c' ? (e.v === 0 ? 0 : constCost(e.v))
        : e.k === 'l' ? matLocal(m, e.i) : condValue(m, e);
    function condValue(m, e) {
        if (e.base === 'eqz') return 1;
        const b = e.b, bZero = b.k === 'c' && b.v === 0;
        if (e.base === 'eq') return mat(m, b) + (bZero ? 1 : 2);
        if (e.base === 'lt') return e.inv ? mat(m, b) + 2 : (b.k === 'c' && fits12(b.v) && !e.swapped ? 1 : mat(m, b) + 1);
        return mat(m, b) + (e.inv ? 1 : 2);                      // le / ge / ge_u
    }
    const condBranch = (m, e) => e.base === 'eqz' ? 1 : mat(m, e.b) + 1;
    // a value that must end up in one fixed register (merge point, argument, return)
    const place = (m, e) => e.k === 'r' ? (e.fixed ? 1 : 0) : e.k === 'c' ? constCost(e.v)
        : e.k === 'l' ? 1 : condValue(m, e);
    const both = f => { cost.A += f('A'); cost.B += f('B'); };
    function flush(upto = stack.length) {      // make every pending entry a plain register before control flow splits
        for (let i = 0; i < upto; i++) {
            const e = stack[i];
            if (e.k === 'r') continue;
            const a = e.k === 'c' ? constCost(e.v) : e.k === 'l' ? 1 : condValue('A', e);
            const b = e.k === 'c' ? constCost(e.v) : e.k === 'l' ? 1 : condValue('B', e);
            cost.A += a; cost.B += b; detail.flushA += a; detail.flushB += b;
            stack[i] = {k: 'r'};
        }
    }
    const push = e => { stack.push(e); detail.maxDepth = Math.max(detail.maxDepth, stack.length); };

    while (at < code.length) {
        const op = byte();
        switch (op) {
        case 0x00: cost.current++; cost.A++; cost.B++; break;
        case 0x02: case 0x03: case 0x04: {
            const value = byte() === 0x7f;
            if (op === 0x04) {
                const e = stack.pop();
                cost.current += 3;
                flush();
                both(m => (e.k === 'cond' ? condBranch(m, e) : mat(m, e) + 1) + (STAGE <= 2 ? 1 : 0));
            } else flush();
            control.push({op, depth: stack.length, value});
            break;
        }
        case 0x05: {
            const block = control.at(-1);
            cost.current += 1;
            if (block.value && stack.length > block.depth) { const e = stack.at(-1); both(m => place(m, e)); }
            both(() => 1);
            stack.length = block.depth;
            break;
        }
        case 0x0b: {
            const block = control.pop();
            if (!block) {
                cost.current += 1;
                if (stack.length) { const e = stack.pop(); both(m => e.k === 'r' && !e.fixed ? 1 : place(m, e)); }
                at = code.length;
                break;
            }
            if (block.value && stack.length > block.depth) { const e = stack.at(-1); both(m => place(m, e)); }
            stack.length = block.depth;
            if (block.value) push({k: 'r'});
            break;
        }
        case 0x0c: case 0x0d: {
            leb();
            if (op === 0x0d) {
                const e = stack.pop();
                cost.current += 3;
                flush();
                both(m => (e.k === 'cond' ? condBranch(m, e) : mat(m, e) + 1) + (STAGE <= 2 ? 1 : 0));
            } else { cost.current += 1; both(() => 1); }
            break;
        }
        case 0x0f: {
            const e = stack.pop();
            cost.current += 2;
            both(m => (e.k === 'r' && !e.fixed ? 1 : e.k === 'r' ? 0 : place(m, e)) + 1);
            break;
        }
        case 0x10: {
            const index = leb();
            const count = callables[index].params.length;
            cost.current += count + 2;
            const args = stack.splice(stack.length - count, count);
            // registers below the arguments are caller-saved temporaries: save and reload
            for (const e of stack) if (e.k !== 'c' && e.k !== 'l') { both(m => (e.k === 'cond' ? condValue(m, e) : 0) + 2); e.k = 'r'; e.fixed = false; }
            for (const e of args) both(m => e.k === 'r' ? 1 : e.k === 'c' ? constCost(e.v) : e.k === 'l' ? 1 : condValue(m, e));
            both(() => 1);
            push({k: 'r', fixed: true});
            break;
        }
        case 0x1a: stack.pop(); break;
        case 0x20: cost.current += 2; push({k: 'l', i: leb()}); break;
        case 0x21: {
            const i = leb();
            const e = stack.pop();
            cost.current += 2;
            // pending reads of this local must be taken before it changes
            for (let s = 0; s < stack.length; s++) {
                const p = stack[s];
                if (p.k === 'l' && p.i === i) { both(() => 1); stack[s] = {k: 'r'}; }
                else if (p.k === 'cond' && p.b && p.b.k === 'l' && p.b.i === i) { both(() => 1); p.b = {k: 'r'}; }
            }
            cost.A += mat('A', e) + 1;
            cost.B += inReg.has(i)
                ? (e.k === 'r' ? (e.fixed ? 1 : 0) : e.k === 'c' ? constCost(e.v) : e.k === 'l' ? 1 : condValue('B', e))
                : mat('B', e) + 1;
            break;
        }
        case 0x28: case 0x2f: {
            leb(); leb();
            const e = stack.pop();
            cost.current += 3;
            both(m => mat(m, e) + 1);
            push({k: 'r'});
            break;
        }
        case 0x36: case 0x3b: {
            leb(); leb();
            const v = stack.pop(), a = stack.pop();
            cost.current += 3;
            both(m => mat(m, a) + mat(m, v) + 1);
            break;
        }
        case 0x41: { const v = leb(true); cost.current += constCost(v) + 1; push({k: 'c', v}); break; }
        case 0x45: {
            const e = stack.pop();
            cost.current += 3;
            if (STAGE === 1) { both(m => mat(m, e) + 1); push({k: 'r'}); }
            else if (e.k === 'cond') push({...e, inv: !e.inv, base: e.base});
            else { both(m => mat(m, e)); push({k: 'cond', base: 'eqz', inv: false}); }
            break;
        }
        default: {
            const b = stack.pop(), a = stack.pop();
            if ([0x6a, 0x6b, 0x6c, 0x6d, 0x6f, 0x74, 0x75].includes(op)) {
                cost.current += 2 + 1 + 1 + (op === 0x6d ? 2 + 7 : op === 0x6f ? 2 : 0);
                const bConst = b.k === 'c';
                both(m => {
                    let n = mat(m, a);
                    const immediate = bConst && (op === 0x6a ? fits12(b.v) : op === 0x6b ? fits12(-b.v) : (op === 0x74 || op === 0x75));
                    n += immediate ? 1 : mat(m, b) + 1;
                    if (op === 0x6d || op === 0x6f) {
                        const safe = bConst && b.v !== 0 && b.v !== -1;
                        if (!safe) n += 2 + (op === 0x6d ? 5 : 0);
                        if (bConst && b.v === 0) n += 1;        // x0 cannot be a divisor operand without a register… keep honest
                    }
                    return n;
                });
                push({k: 'r'});
            } else if (op === 0x46 || op === 0x47) {
                cost.current += 5;
                both(m => mat(m, a));
                const c = {k: 'cond', base: 'eq', b, inv: op === 0x47};
                if (STAGE === 1) { both(m => condValue(m, c)); push({k: 'r'}); } else push(c);
            } else {
                cost.current += 2 + 1 + 1 + ([0x4c, 0x4e, 0x4f].includes(op) ? 1 : 0);
                both(m => mat(m, a));
                const base = op === 0x48 || op === 0x4a ? 'lt' : 'ge';
                { const c = {k: 'cond', base, b, inv: [0x4c,0x4e,0x4f].includes(op) && false, swapped: op === 0x4a || op === 0x4c}; if (STAGE === 1) { both(m => condValue(m, c)); push({k: 'r'}); } else push(c); }
            }
        }
        }
    }
    return {cost, detail};
}

const out = {};
for (const [name, {source, imports, max}] of Object.entries(apps)) {
    const imported = imports.map((fn, index) => ({...fn, index}));
    const {functions} = typedWasm.compileFunctions(source, imports.length, imported, max);
    const program = typedRv32.compile(source, imports, max);
    const callables = [...imported, ...functions];
    const starts = functions.map(fn => program.entries[fn.name] / 4);
    const total = program.image.length / 4;
    const sum = {functions: functions.length, actual: total, current: 0, A: 0, B: 0, flushA: 0, flushB: 0,
        leaf: 0, shortCircuit: 0, mismatched: [], maxDepth: 0, localsOverBudget: 0, depthHistogram: {}};
    functions.forEach((fn, f) => {
        const actual = (f + 1 < functions.length ? starts[f + 1] : total) - starts[f];
        const {cost, detail} = walk(fn, callables, imports.length);
        if (cost.current !== actual) sum.mismatched.push({name: fn.name, model: cost.current, actual});
        sum.current += cost.current; sum.A += cost.A; sum.B += cost.B;
        sum.flushA += detail.flushA; sum.flushB += detail.flushB;
        sum.leaf += detail.leaf ? 1 : 0; sum.shortCircuit += detail.shortCircuit;
        sum.maxDepth = Math.max(sum.maxDepth, detail.maxDepth);
        sum.depthHistogram[detail.maxDepth] = (sum.depthHistogram[detail.maxDepth] || 0) + 1;
        if (detail.nlocals > detail.regLocals) sum.localsOverBudget++;
    });
    out[name] = sum;
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else for (const [name, s] of Object.entries(out)) {
    console.log(`\n== ${name}: ${s.functions} functions (${s.leaf} leaf), ${s.shortCircuit} value-producing if blocks (&& / ||)`);
    console.log(`   emitted today:            ${s.actual} instructions`);
    console.log(`   model of today's scheme:  ${s.current}  (${s.mismatched.length} functions disagree with the real image)`);
    console.log(`   model A (stack in regs):  ${s.A}  = ${(100 * s.A / s.actual).toFixed(1)}% of today, ${(s.actual / s.A).toFixed(2)}x smaller`);
    console.log(`   model B (+locals in regs): ${s.B}  = ${(100 * s.B / s.actual).toFixed(1)}% of today, ${(s.actual / s.B).toFixed(2)}x smaller`);
    console.log(`   flush cost inside A/B: ${s.flushA}/${s.flushB}; deepest operand stack: ${s.maxDepth}; functions with more locals than the register budget: ${s.localsOverBudget}`);
    console.log(`   operand-stack depth histogram (max depth: functions): ${JSON.stringify(s.depthHistogram)}`);
    if (s.mismatched.length) console.log('   first mismatches:', JSON.stringify(s.mismatched.slice(0, 5)));
}
