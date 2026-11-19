// Exercise production world linkers and compare exact native results with buffered 4452064.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import vm from "node:vm";

const args = process.argv.slice(2);
const checkDefault = args.at(-1) === "--check-streaming-default";
if (checkDefault) args.pop();
const [reactors, candidateRevision] = args;
assert(reactors, "pass the ESP-IDF build/esp-idf/main directory with the three native reactors");
const controlRevision = "4452064";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const osPath = path => "picocalc-os/" + path;
const read = path => readFileSync(osPath(path));
const sourceAt = (revision, path) => revision
    ? execFileSync("git", ["show", revision + ":" + osPath(path)])
    : read(path);
const plain = value => JSON.parse(JSON.stringify(value));

function compiler(revision) {
    const ctx = vm.createContext();
    for (const path of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "compiler/typed-world.js",
        "worlds/files/compile.js", "worlds/agenda/compile.js"]) {
        vm.runInContext(sourceAt(revision, path).toString(), ctx, {filename: path});
    }
    return ctx;
}

const control = compiler(controlRevision);
const candidate = compiler(candidateRevision);
const options = {streamFunctions: true};

// The wrapping code is part of the test only. It observes the original consumer
// synchronously, without synthesizing a compiler callback in the buffered mode.
let observed = 0;
const parse = candidate.typedWasm.compileFunctions;
candidate.typedWasm.compileFunctions = (...args) => {
    const consume = args[5];
    if (consume) args[5] = fn => {
        assert(Array.isArray(fn.code) && fn.code.length);
        consume(fn);
        assert.equal(fn.code, null);
        observed++;
    };
    return parse(...args);
};

function result(program) {
    const {image, ...metadata} = program;
    return {image: Buffer.from(image), metadata: plain(metadata)};
}

function world(ctx, entry, source, reactor, mode) {
    const compile = ctx.typedRv32.compile;
    let generated;
    ctx.typedRv32.compile = (...args) => {
        const program = compile(...args);
        generated = result(program);
        return program;
    };
    try {
        const linked = Buffer.from(ctx[entry + "Rv32"](source, reactor, mode));
        assert(generated);
        return {linked, ...generated};
    } finally {
        ctx.typedRv32.compile = compile;
    }
}

const worlds = [];
for (const [directory, names, binary, entry] of [
    ["files", ["files.typed"], "files-reactor", "compileFiles"],
    ["agenda", ["reminder.typed", "entry.typed"], "agenda-reactor", "compileAgenda"],
    ["editor", read("worlds/editor/source.list").toString().trim().split("\n"), "typed-world-reactor", "compileTypedWorld"],
]) {
    const source = names.map(name => read("worlds/" + directory + "/" + name).toString() + "\n").join("");
    const reactor = readFileSync(join(reactors, binary + ".elf"));
    const expected = world(control, entry, source, reactor);
    observed = 0;
    assert.deepEqual(world(candidate, entry, source, reactor, {streamFunctions: false}), expected);
    assert.equal(observed, 0);
    assert.deepEqual(world(candidate, entry, source, reactor, options), expected);
    assert.equal(observed, expected.metadata.signatures.length);
    if (checkDefault) {
        for (const omitted of [undefined, {}]) {
            observed = 0;
            assert.deepEqual(world(candidate, entry, source, reactor, omitted), expected);
            assert.equal(observed, expected.metadata.signatures.length);
        }
    }
    const wasm = read("build/" + binary + ".wasm");
    const expectedWasm = Buffer.from(control[entry](source, wasm));
    assert.deepEqual(Buffer.from(candidate[entry](source, wasm)), expectedWasm);
    assert(WebAssembly.validate(expectedWasm));
    worlds.push({directory, functionsConsumed: observed, imageBytes: expected.image.length,
        imageSha256: digest(expected.image), elfBytes: expected.linked.length, elfSha256: digest(expected.linked),
        metadataSha256: digest(JSON.stringify(expected.metadata)), wasmSha256: digest(expectedWasm)});
}

const imports = [{name: "sdk", params: ["i32"], result: "i32"}];
const fields = Array.from({length: 35}, (_, i) => "f" + i + ": i32;").join("");
const locals = Array.from({length: 140}, (_, i) => "const x" + i + "=" + i + ";").join("");
const funcs = Array.from({length: 135}, (_, i) => "function f" + i + "():i32 {return " + i + ";}").join("\n");
const wide = "record R {" + fields + "}\n" + funcs +
    "\nfunction pick(r:R):i32 {" + locals + " r.f34=-2147483648; return f134()+x139+sdk(r.f34);}";
const expected = result(control.typedRv32.compile(wide, imports));
assert(expected.metadata.relocations.length > 0);
observed = 0;
assert.deepEqual(result(candidate.typedRv32.compile(wide, imports, undefined, {streamFunctions: false})), expected);
assert.equal(observed, 0);
assert.deepEqual(result(candidate.typedRv32.compile(wide, imports, undefined, options)), expected);
assert.equal(observed, 136);

const nine = "function nine(" + Array.from({length: 9}, (_,i) => "a" + i + ":i32").join(",") + "):i32{return a0;}";
const huge = "function huge():i32{" + Array.from({length: 520}, (_,i) => "const v" + i + "=0;").join("") + "return 0;}";
const bad = "\nfunction late():i32{return true;}";
const rejects = [
    [nine, undefined, "up to eight register arguments"], [huge, undefined, "frame exceeds"],
    [nine + huge, undefined, "up to eight register arguments"], [huge + nine, undefined, "frame exceeds"],
    [nine + bad, undefined, "expected i32, got bool"], [nine + nine, undefined, "duplicate function nine"],
    ["function f():i32{return g();} function g():i32{return 1;}", undefined, "unknown function g"],
    [nine + bad, 4, "input limit exceeded"],
];

function rejected(fn) {
    try { fn(); } catch (e) { return {name: e.name, message: e.message}; }
    assert.fail("expected rejection");
}

const diagnostics = [];
for (const [source, limit, text] of rejects) {
    const baseline = rejected(() => control.typedRv32.compile(source, [], limit));
    assert.equal(baseline.name, "SyntaxError");
    assert(baseline.message.includes(text));
    assert.deepEqual(rejected(() => candidate.typedRv32.compile(source, [], limit)), baseline);
    assert.deepEqual(rejected(() => candidate.typedRv32.compile(source, [], limit, options)), baseline);
    assert.deepEqual(rejected(() => candidate.typedRv32.compile(source, [], limit, {streamFunctions: false})), baseline);
    diagnostics.push(baseline.message);
}
console.log(JSON.stringify({control: controlRevision, candidate: candidateRevision ?? "worktree", worlds,
    wide: {functions: 136, imageBytes: expected.image.length, relocations: expected.metadata.relocations.length},
    diagnostics}, null, 2));
