// Keep the checked-out backend as the unmodified control.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createContext, runInContext} from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, "../../../../../../..");
const compiler = name => readFileSync(resolve(root, "picocalc-os/compiler", name), "utf8");

function once(text, old, next) {
    assert.equal(text.split(old).length, 2, old);
    return text.replace(old, () => next);
}

const leafEmitter = String.raw`
const LEAF_ARGS = new Map([
    [0x02,1],[0x04,1],[0x05,0],[0x0b,0],[0x0c,1],[0x0d,1],[0x0f,0],
    [0x1a,0],[0x20,1],[0x41,1],[0x45,0],
    [0x46,0],[0x47,0],[0x48,0],[0x4a,0],[0x4c,0],[0x4e,0],[0x4f,0],
    ...Array.from(ALU.keys(), op => [op,0]),
]);
const FULL = Symbol("leaf operand spill");
class LeafCode extends FunctionCode {
    spill() { throw FULL; }
    step(op) {
        if (op === 0x20) {
            const local = this.cell();
            if (local >= this.program.params.length) throw FULL;
            this.push(A0 + local);
            return false;
        }
        return super.step(op);
    }
    lower() {
        this.leafOnly = true;
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        if (this.at !== this.program.code.length || this.control.length) throw FULL;
        this.mark(this.exit);
        this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
        return this;
    }
}
function leafRecipe(fn, callables, targets) {
    if (fn.nlocals || fn.code.length > 128 || fn.params.length > 8 ||
        !fn.params.every(type => type === "i32" || type === "bool")) return null;
    for (let at = 0; at < fn.code.length;) {
        const op = fn.code[at++];
        const count = LEAF_ARGS.get(op);
        if (count === undefined) return null;
        at += count;
    }
    try { return new LeafCode(fn, callables, targets).lower(); }
    catch (error) { if (error !== FULL) throw error; return null; }
}

function copyLeaf(caller, recipe) {
    const start = caller.words.length;
    for (let i = 0; i < recipe.words.length - 1; i++) caller.emit(recipe.words[i]);
    for (const {from,target,rd} of recipe.calls) {
        if (target.global || target.importIndex !== undefined || target.at === undefined)
            throw new Error("leaf has a nonlocal target");
        caller.calls.push({from: start + from, target: {at: start + target.at}, rd});
    }
}

`;

export function context(candidate, overrides = {}) {
    const load = name => overrides[name] ?? compiler(name);
    const ctx = createContext({});
    for (const file of ["typed-wasm.js", "typed-async.js", "typed-world.js"])
        runInContext(load(file), ctx, {filename:file});
    let rv = load("typed-rv32.js");
    if (candidate) {
        rv = once(rv, "function compile(source, imports = [], maxSourceLength, options) {",
            leafEmitter + "function compile(source, imports = [], maxSourceLength, options) {");
        rv = once(rv, "this.constant(A0, -1);\n                this.branch(1, b, A0, safe);\n                this.constant(A0, -2147483648);\n                this.emit(instruction.b(1, a, A0, 8));",
            "const check = this.leafOnly ? T5 : A0;\n                this.constant(check, -1);\n                this.branch(1, b, check, safe);\n                this.constant(check, -2147483648);\n                this.emit(instruction.b(1, a, check, 8));");
        rv = once(rv, "        this.jump(this.starts[index], RA);",
            "        const recipe = this.inline?.(this.functions[index].name);\n        if (recipe) copyLeaf(this, recipe);\n        else this.jump(this.starts[index], RA);");
        rv = once(rv, "    function lower(fn) { code.push(new FunctionCode(fn, callables, targets).lower()); }",
            String.raw`    const arm = options?.leafExperiment;
    const recipes = new Map();
    const leafStats = {leaves:[], sites:[], addedWords:0};
    function lower(fn) {
        const leaf = arm === "inline" ? recipes.get(fn.name) :
            arm === "leaf" ? leafRecipe(fn, callables, targets) : null;
        if (leaf) {
            leafStats.leaves.push(fn.name);
            code.push(leaf);
            return;
        }
        const normal = new FunctionCode(fn, callables, targets);
        if (arm === "inline") normal.inline = name => {
            const recipe = recipes.get(name);
            if (!recipe || recipe.words.length > 21) return null;
            const added = Math.max(0, recipe.words.length - 2);
            if (leafStats.sites.length === 32 || leafStats.addedWords + added > 96) return null;
            leafStats.sites.push({caller:fn.name,callee:name,addedWords:added});
            leafStats.addedWords += added;
            return recipe;
        };
        code.push(normal.lower());
    }`);
        rv = once(rv, "const stream = options?.streamFunctions ?? true;",
            "const stream = arm !== 'inline' && (options?.streamFunctions ?? true);");
        rv = once(rv, "    if (!stream) {\n        for (const fn of functions) lower(fn);\n    }",
            "    if (!stream) {\n        if (arm === 'inline') {\n            for (const fn of functions) recipes.set(fn.name, leafRecipe(fn, callables, targets));\n        }\n        for (const fn of functions) lower(fn);\n    }");
        rv = once(rv, "return {image, entries, records:", "return {image, entries, leafStats, records:");
    }
    runInContext(rv, ctx, {filename:candidate ? "typed-rv32-candidate.js" : "typed-rv32.js"});
    return ctx;
}
