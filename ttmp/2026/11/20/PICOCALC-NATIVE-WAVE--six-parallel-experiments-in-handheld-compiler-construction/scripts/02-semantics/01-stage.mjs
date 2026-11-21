import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
function exact(source, before, after, count = 1) {
    assert.equal(source.split(before).length, count + 1, "semantics integration changed");
    return source.replaceAll(before, after);
}

export function stage() {
    let frontend = readFileSync(resolve(root, "picocalc-os/compiler/typed-wasm.js"), "utf8");
    frontend = exact(frontend,"this.codeUnitAddress(binding.index, pos);",
        'this.codeUnitAddress(binding.index, pos, "read");');
    frontend = exact(frontend, "    codeUnitAddress(receiver, position) {",
        `    codeUnitAddress(receiver, position, kind) {
        if (this.semanticPolicy === "late" || (this.semanticPolicy === "selected" && kind === "read")) {
            this.code.push(0xf1, receiver, position);
            this.semanticStats.addresses++;
            return;
        }`);
    frontend = exact(frontend,`        for (let i = 0; i < value.length; i++) {
            this.emitIndex(OP.get, address);
            this.emitConst(value.charCodeAt(i));
            this.emitMemory(0x3b, 1, 4 + 2 * i);
        }
        return value.length;`,`        if (this.semanticPolicy === "late" ||
            (this.semanticPolicy === "selected" && value.length >= 8)) {
            this.lateLiterals ??= [];
            this.code.push(0xf2, address, this.lateLiterals.push(value) - 1);
            this.semanticStats.literals++;
        } else {
            for (let i = 0; i < value.length; i++) {
                this.emitIndex(OP.get, address);
                this.emitConst(value.charCodeAt(i));
                this.emitMemory(0x3b, 1, 4 + 2 * i);
            }
        }
        return value.length;`);
    frontend = exact(frontend, "    finish(fn) { return fn; }",
        "    finish(fn) { if (this.lateLiterals) fn.lateLiterals = this.lateLiterals; return fn; }");
    frontend = exact(frontend,
        "emitSpanFunctions(lowered, functionBase, imported, numericOperands, onFunction, onSignatures)",
        "emitSpanFunctions(lowered, functionBase, imported, numericOperands, onFunction, onSignatures, options)", 2);
    frontend = exact(frontend,
        "emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures);",
        "emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures, undefined, options);");
    frontend = exact(frontend,
        "function emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures, lowered)",
        "function emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures, lowered, options)");
    frontend = exact(frontend,
        "new Emitter(lex, declared, records, edges[i], functionBase, enums, distinct).function(fn);",
        `const emitter = new Emitter(lex, declared, records, edges[i], functionBase, enums, distinct);
        if (numericOperands && options?.semanticPolicy && options.semanticPolicy !== "early") {
            emitter.semanticPolicy = options?.semanticPolicy;
            emitter.semanticStats = options?.semanticStats ?? {addresses:0,literals:0};
        }
        emitter.function(fn);`,2);

    let backend = readFileSync(resolve(root,"picocalc-os/compiler/typed-rv32.js"),"utf8");
    backend = exact(backend,"        case 0x00:", `        case 0xf1: {
            const receiver = this.cell(), position = this.cell();
            this.load(T5, 4 * position);
            this.load(T6, 4 * receiver);
            this.load(A0, 0, T6);
            this.emit(instruction.b(6, T5, A0, 8)); // unsigned position < capacity
            this.emit(0x00100073); // the same failure point as the early guard
            const out = this.resultRegister();
            this.emit(instruction.i(0x13, out, 1, T5, 1));
            this.emit(instruction.r(0x33, out, 0, T6, out));
            this.push(out);
            break;
        }
        case 0xf2: {
            const address = this.cell();
            const value = this.program.lateLiterals[this.cell()];
            this.load(T5,4 * address);
            for (let i=0;i<value.length;i++) {
                this.constant(T6,value.charCodeAt(i));
                this.store(T6,4 + 2*i,T5,1);
            }
            break;
        }
        case 0x00:`);
    backend = exact(backend, "        fn.code = null;", "        fn.code = null;\n        fn.lateLiterals = null;");
    return {"typed-wasm.js":frontend,"typed-rv32.js":backend};
}
