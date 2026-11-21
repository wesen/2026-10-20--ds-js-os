// Match numerical semantics on one bounded Typed numeric operation tape at a time.
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {createContext,runInContext} from "node:vm";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const maximumTapeWords = 256;

// A failed proof is an ordinary outcome for arbitrary programs, including valid
// functions whose arithmetic or control flow lies outside this small grammar.
class Decline extends Error {}
function requireProof(ok, reason) { if (!ok) throw new Decline(reason); }

class Cursor {
    constructor(ops) {
        this.ops = ops;
        this.at = 0;
        this.used = new Set([0, 1]);
    }
    operand(op) {
        const x = this.ops[this.at++];
        requireProof(x?.op === op && x.operands.length === 1, "expected " + op);
        return x.operands[0];
    }
    take(op, ...args) {
        const x = this.ops[this.at++];
        requireProof(x?.op === op && x.operands.length === args.length &&
            args.every((a, i) => x.operands[i] === a), "expected " + [op,...args].join(" "));
    }
    fresh() {
        const slot = this.operand("local.set");
        requireProof(!this.used.has(slot), "live or reserved local overwritten");
        this.used.add(slot);
        return slot;
    }
    // Each value is a triple [coefficient of i, coefficient of n, constant].
    index(iv) {
        const stack = [];
        while (this.ops[this.at]?.op !== "local.set") {
            const op = this.ops[this.at]?.op;
            if (op === "i32.const") stack.push([0, 0, this.operand(op)]);
            else if (op === "local.get") {
                const slot = this.operand(op);
                requireProof(slot === iv || slot === 1, "index reads an unproved local");
                stack.push(slot === iv ? [1,0,0] : [0,1,0]);
            } else {
                requireProof(["i32.add","i32.sub","i32.mul"].includes(op) && stack.length >= 2,
                    "index is not an affine expression");
                this.take(op);
                const b = stack.pop(), a = stack.pop();
                if (op === "i32.mul") {
                    const aConst = !a[0] && !a[1], bConst = !b[0] && !b[1];
                    requireProof(aConst || bConst, "product of two variable indices");
                    stack.push(aConst ? b.map(v => Math.imul(v,a[2])) : a.map(v => Math.imul(v,b[2])));
                } else stack.push(a.map((v,i) => (op === "i32.add" ? v+b[i] : v-b[i]) | 0));
            }
        }
        requireProof(stack.length === 1, "index leaves additional live values");
        const temp = this.fresh();
        this.take("text.checked_address",0,temp);
        return stack[0];
    }
    signedRead(iv) {
        const index = this.index(iv);
        this.take("i32.load16_u",1,4);
        const slot = this.fresh();
        this.take("local.get",slot); this.take("i32.const",32768); this.take("i32.ge_s");
        this.take("if",64); this.take("local.get",slot); this.take("i32.const",65536);
        this.take("i32.sub"); this.take("local.set",slot); this.take("end");
        return {index,slot};
    }
    lowLimit() {
        this.take("i32.const",0); this.take("i32.const",32768); this.take("i32.sub");
    }
    saturate(slot) {
        this.take("local.get",slot); this.take("i32.const",32767); this.take("i32.gt_s");
        this.take("if",64); this.take("i32.const",32767); this.take("local.set",slot); this.take("end");
        this.take("local.get",slot); this.lowLimit(); this.take("i32.lt_s");
        this.take("if",64); this.lowLimit(); this.take("local.set",slot); this.take("end");
    }
}

function classify(fn, decoder) {
    const words = fn.code.length;
    const answer = {name:fn.name, tapeWords:words};
    try {
        requireProof(fn.params.join(",") === "buffer,i32" && fn.result === "i32", "ABI outside candidate class");
        requireProof(words <= maximumTapeWords, "per-function tape budget exceeded");
        const c = new Cursor(decoder(fn.code));
        c.take("i32.const",0);
        const iv = c.fresh();
        c.take("block",64); c.take("loop",64); c.take("local.get",iv); c.take("local.get",1);
        c.take("i32.lt_s"); c.take("i32.eqz"); c.take("br_if",1);
        const left = c.signedRead(iv), right = c.signedRead(iv);
        const lhs = c.operand("local.get"), rhs = c.operand("local.get");
        requireProof(lhs !== rhs && [left.slot,right.slot].includes(lhs) && [left.slot,right.slot].includes(rhs),
            "sum does not consume both signed loads");
        c.take("i32.add");
        const sum = c.fresh(); c.saturate(sum);
        const output = c.index(iv);
        c.take("local.get",sum); c.take("i32.store16",1,4);
        c.take("local.get",iv); c.take("i32.const",1); c.take("i32.add"); c.take("local.set",iv);
        c.take("br",0); c.take("end"); c.take("end"); c.take("local.get",1); c.take("end");
        requireProof(c.at === c.ops.length, "additional effects after the candidate loop");
        const addresses = [left.index.join(","),right.index.join(",")].sort().join(";");
        const layouts = [
            ["aos","2,0,0;2,0,1","2,0,0","even positions and odd velocities"],
            ["soa","1,0,0;1,1,0","1,0,0","position interval [0,n) disjoint from velocity interval [n,2n)"],
        ];
        const matched = layouts.find(([,inputs,dst]) => addresses === inputs && output.join(",") === dst);
        requireProof(matched, "address families lack a qualified independence and disjointness proof");
        return {...answer,layout:matched[0],reads:[left.index,right.index],writes:[output],widthBits:16,
            signedness:"explicit sign extension",arithmetic:"widen, add, saturate i16",aliases:matched[3]};
    } catch (e) {
        if (!(e instanceof Decline)) throw e;
        return {...answer,decline:e.message};
    }
}

const [input,destination,policy = "pie"] = process.argv.slice(2);
if (!input || !destination || !["pie","scalar","stock"].includes(policy))
    throw Error("usage: node 09-recognize-particles.mjs SOURCE OUTDIR [pie|scalar|stock]");
mkdirSync(destination,{recursive:true});
const vm = createContext({});
runInContext(readFileSync("picocalc-os/compiler/typed-wasm.js","utf8"),vm);
const decisions = [], counts = new Map();
const manual = readFileSync(resolve(here,"board/physics_checked.S"),"utf8");
const guardMacro = manual.slice(manual.indexOf(".section"),manual.indexOf(".endm")+5);
const declarations = [guardMacro];
vm.typedWasm.compileFunctions(readFileSync(input,"utf8"),0,[],undefined,true,fn => {
    const decision = classify(fn,vm.typedWasm.decodeNumericOperations);
    const fallback = "physics_typed_" + fn.name;
    decision.entry = fallback;
    if (decision.layout && policy !== "stock") {
        const prior = counts.get(decision.layout) || 0;
        counts.set(decision.layout,prior + 1);
        const stem = "guarded_" + decision.layout + (prior ? "_" + prior : "");
        for (const mode of ["scalar","pie"])
            declarations.push("guarded " + stem + "_" + mode + ",particle_" + decision.layout + "_" + mode + "," + fallback);
        decision.entry = stem + "_" + policy;
    }
    decisions.push(decision);
    fn.code = null;
});
declarations.push(".option pop");
writeFileSync(resolve(destination,"physics-auto-checked.S"),declarations.join("\n")+"\n");
writeFileSync(resolve(destination,"physics-auto.json"),JSON.stringify({policy,maximumTapeWords,decisions},null,2)+"\n");
// An experiment-only link step leaves unmatched entry points in the ordinary
// compiled module. Internal calls in that module continue to target its stock bodies.
execFileSync(process.execPath,[resolve(here,"02-build-typed.mjs"),input,destination],{stdio:"inherit"});
