import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const compilerPath = 'picocalc-os/compiler/typed-wasm.js';
// The instrumentation matches the exact frontend used to derive the published results.
export const referenceFrontend = execFileSync('git', ['show', 'e202e94:' + compilerPath], {encoding: 'utf8'});

const opaque = (...children) => ({ kind: 'opaque', children });
const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
const local = (id, type) => ({ kind: 'local', id, type });
const length = id => ({ kind: 'length', id });
const integer = value => ({ kind: 'integer', value });
const effects = (children, barrier) => ({ kind: 'effects', children, barrier });

// Separate global storage keeps the counters out of the receiver's memory.
// global.get 0; i32.const 1; i32.add; global.set 0
const countCheck = [0x23, 0, 0x41, 1, 0x6a, 0x24, 0];

class Trace {
    constructor() {
        this.checks = [];
        this.statements = [];
        this.expr = opaque();
    }

    access(start, end) {
        const site = this.checks.at(-1);
        const check = { start, end };
        if (site && start < site.end) throw new Error('overlapping check ranges');
        this.checks.push(check);
        return check;
    }
}

function instrument(original) {
    let source = original;
    function edit(before, after, matches = 1) {
        const parts = source.split(before);
        if (parts.length !== matches + 1) {
            throw new Error('compiler anchor occurrence mismatch: ' + JSON.stringify(before));
        }
        source = parts.join(after);
    }
    edit('        this.depth = 0;', '        this.depth = 0;\n        this.trace = new lab.Trace();');

    edit('        this.emitLocal(OP.set, a);', '        const left = this.trace.expr;\n        this.emitLocal(OP.set, a);');
    edit('        this.emitLocal(OP.set, b);', '        const right = this.trace.expr;\n        this.emitLocal(OP.set, b);');
    edit('        this.emitLocal(OP.get, name === "min" ? b : a);\n        this.code.push(OP.end);',
        '        this.emitLocal(OP.get, name === "min" ? b : a);\n        this.code.push(OP.end);\n' +
        '        this.trace.expr = lab.binary(name, left, right);');

    edit('    prefix() {\n        const lex = this.lex;', '    prefix() {\n        const lex = this.lex;\n' +
        '        this.trace.expr = lab.opaque();\n        const at = lex.token.at;');
    edit('            this.code.push(OP.eqz);\n            return "bool";',
        '            this.code.push(OP.eqz);\n            this.trace.expr = { kind: "not", value: this.trace.expr };\n            return "bool";');
    edit('                this.code.push(OP.sub);\n', '                this.code.push(OP.sub);\n' +
        '                this.trace.expr = lab.opaque(this.trace.expr);\n');
    edit('            this.emitConst(value);\n            lex.next();',
        '            this.emitConst(value);\n            this.trace.expr = lab.integer(value);\n            lex.next();');
    edit('                this.code.push(0x28, 2, 0);\n                return "i32";',
        '                this.code.push(0x28, 2, 0);\n                this.trace.expr = lab.length(binding.index);\n                return "i32";');
    edit('            this.codeUnitAddress(binding.index, pos);',
        '            const index = this.trace.expr;\n' +
        '            const check = this.codeUnitAddress(binding.index, pos);\n' +
        '            this.trace.expr = { kind: "read", index, check, receiver: binding.index, at };');
    edit('        this.emitLocal(OP.get, binding.index);\n        return binding.type;',
        '        this.emitLocal(OP.get, binding.index);\n        this.trace.expr = lab.local(binding.index, binding.type);\n        return binding.type;');

    edit('            this.lex.next();\n            if (op === "&&" || op === "||") {',
        '            this.lex.next();\n            const left = this.trace.expr;\n            if (op === "&&" || op === "||") {');
    edit('            type = result;', '            this.trace.expr = lab.binary(op, left, this.trace.expr);\n            type = result;');
    edit('        if (branch) this.code.push(OP.return);',
        '        if (branch) this.code.push(OP.return);\n' +
        '        this.trace.statements.push({ kind: "return", value: this.trace.expr });');

    edit('    codeUnitAddress(receiver, position) {\n', '    codeUnitAddress(receiver, position) {\n' +
        '        const start = this.code.length;\n');
    edit('        this.code.push(0x28, 2, 0, 0x4f, OP.if, VOID, 0x00, OP.end);\n        this.emitLocal(OP.get, receiver);',
        '        this.code.push(0x28, 2, 0, 0x4f, OP.if, VOID, 0x00, OP.end);\n' +
        '        const check = this.trace.access(start, this.code.length);\n' +
        '        this.emitLocal(OP.get, receiver);');
    edit('        this.code.push(0x74, OP.add);\n    }', '        this.code.push(0x74, OP.add);\n        return check;\n    }');
    edit('    bufferWrite(receiver) {\n        const lex = this.lex;', '    bufferWrite(receiver, at) {\n        const lex = this.lex;');
    edit('        this.codeUnitAddress(receiver, position);\n        this.want(this.expr(), "i32");',
        '        const index = this.trace.expr;\n' +
        '        const check = this.codeUnitAddress(receiver, position);\n' +
        '        const read = { kind: "read", index, check, receiver, at };\n' +
        '        this.want(this.expr(), "i32");\n' +
        '        this.trace.expr = lab.effects([read, this.trace.expr], true);');
    edit('        if (!value.length) return 0;',
        '        this.trace.expr = lab.effects([this.trace.expr], value.length !== 0);\n        if (!value.length) return 0;');
    edit('        this.emitLocal(OP.get, position);\n        this.emitConst(value.length - 1);',
        '        const endCheckStart = this.code.length;\n' +
        '        this.emitLocal(OP.get, position);\n        this.emitConst(value.length - 1);');
    edit('        for (let i = 0; i < value.length; i++) {',
        '        this.trace.access(endCheckStart, this.code.length);\n        for (let i = 0; i < value.length; i++) {');

    edit('        if (!callee) lex.fail("unknown function " + name);',
        '        if (!callee) lex.fail("unknown function " + name);\n        const args = [];');
    edit('            this.want(this.expr(), callee.params[i]);',
        '            this.want(this.expr(), callee.params[i]);\n            args.push(this.trace.expr);');
    edit('        return callee.result;',
        '        this.trace.expr = lab.effects(args, true);\n        return callee.result;');

    edit('        const enclosing = this.locals;',
        '        const enclosing = this.locals;\n        const parent = this.trace.statements;\n        this.trace.statements = [];');
    edit('        this.locals = enclosing;',
        '        this.locals = enclosing;\n        const list = this.trace.statements;\n        this.trace.statements = parent;');
    edit('        this.depth--;\n    }\n\n    statement', '        this.depth--;\n        return list;\n    }\n\n    statement');
    edit('    statement(result) {\n        const lex = this.lex;',
        '    statement(result) {\n        const lex = this.lex;\n        const at = lex.token.at;');
    edit('            this.want(this.expr(), "bool");\n            lex.expect(")");',
        '            this.want(this.expr(), "bool");\n            const condition = this.trace.expr;\n            lex.expect(")");', 2);
    edit('            if (lex.token.value === "{") this.block(result);\n            else this.result(result, true);',
        '            if (lex.token.value === "{") {\n' +
        '                const body = this.block(result);\n' +
        '                this.trace.statements.push({ kind: "if", condition, body });\n' +
        '            } else {\n' +
        '                this.result(result, true);\n' +
        '                const body = [this.trace.statements.pop()];\n' +
        '                this.trace.statements.push({ kind: "if", condition, body });\n' +
        '            }');
    edit('            this.block(result);\n            this.code.push(0x0c',
        '            const body = this.block(result);\n' +
        '            this.trace.statements.push({ kind: "while", condition, body, at });\n' +
        '            this.code.push(0x0c');
    edit('            this.emitLocal(OP.set, this.local(id, type, mutable));',
        '            const target = this.local(id, type, mutable);\n' +
        '            this.emitLocal(OP.set, target);\n' +
        '            this.trace.statements.push({ kind: "assign", target, type, value: this.trace.expr });');
    edit('                this.code.push(0x1a);',
        '                this.trace.statements.push({ kind: "expr", value: this.trace.expr });\n' +
        '                this.code.push(0x1a);');
    edit('                    this.bufferWrite(local.index);',
        '                    this.bufferWrite(local.index, at);\n' +
        '                    this.trace.statements.push({ kind: "expr", value: this.trace.expr });');
    edit('                    this.code.push(0x36, 2, ...unsigned(field.offset));',
        '                    this.code.push(0x36, 2, ...unsigned(field.offset));\n' +
        '                    this.trace.statements.push({ kind: "expr", value: lab.effects([this.trace.expr], true) });');
    edit('                this.emitLocal(OP.set, local.index);',
        '                this.emitLocal(OP.set, local.index);\n' +
        '                this.trace.statements.push({ kind: "assign", target: local.index, type: local.type, value: this.trace.expr });');
    edit('        const nlocals = this.nextLocal - params.length;',
        '        this.code = lab.finish(name, this.trace, this.code);\n        const nlocals = this.nextLocal - params.length;');

    edit('        ...section(7, vec([...names,',
        '        ...lab.counterSection(section),\n        ...section(7, vec([...lab.counterExport(vec), ...names,');
    return source;
}

export function compiler({ analyze, instrumentCounts = false } = {}) {
    const original = referenceFrontend;
    if (!analyze && instrumentCounts) throw new Error('counter instrumentation needs the lab analyzer');
    const lab = {
        Trace, opaque, binary, local, length, integer, effects,
        finish(name, trace, code) {
            analyze(name, trace);
            const result = [];
            let cursor = 0;
            for (const check of trace.checks) {
                result.push(...code.slice(cursor, check.start));
                if (!check.removed) {
                    if (instrumentCounts) result.push(...countCheck);
                    result.push(...code.slice(check.start, check.end));
                }
                cursor = check.end;
            }
            result.push(...code.slice(cursor));
            return result;
        },
        counterSection: section => instrumentCounts ? section(6, [1, 0x7f, 1, 0x41, 0, 0x0b]) : [],
        counterExport: vec => instrumentCounts ? [[...vec(Array.from('__checks', c => c.charCodeAt(0))), 3, 0]] : [],
    };
    const ctx = vm.createContext({ lab });
    vm.runInContext(analyze ? instrument(original) : original, ctx, { filename: compilerPath });
    return ctx.typedWasm;
}
