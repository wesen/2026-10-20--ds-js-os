import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import vm from "node:vm";

const [inputs, baseline, compact, direct] = process.argv.slice(2);
assert(inputs && baseline && compact && direct, "pass prepared source/reactor root and generated compiler roots");
const files = ["typed/wasm.js", "typed/rv32.js", "typed/world.js", "files/compile.js", "agenda/compile.js"];
function load(root, forceLittleEndianFallback = false) {
    const realm = vm.createContext();
    for (const file of files) {
        let text = readFileSync(join(root, file), "utf8");
        if (file === "typed/rv32.js" && forceLittleEndianFallback) {
            const original = text;
            text = text.replace(/const LITTLE_ENDIAN = .*;/, "const LITTLE_ENDIAN = false;");
            assert.notEqual(text, original);
        }
        vm.runInContext(text, realm, {filename: file});
    }
    return realm;
}

const compilers = [load(baseline), load(compact), load(direct), load(direct, true)];
const options = [undefined, {streamFunctions: true}, {streamFunctions: false}];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const plain = object => JSON.parse(JSON.stringify(object));

function raw(compiler, source, imports, limit, mode) {
    const {image, ...metadata} = compiler.typedRv32.compile(source, imports, limit, mode);
    assert.equal(Object.prototype.toString.call(image), "[object Uint8Array]");
    return {image: Buffer.from(image), metadata: plain(metadata)};
}

function findSlot(reactor) {
    const magic = Buffer.alloc(12);
    [0x4147454e, 0x44415256, 0x3332534c].forEach((word, i) => magic.writeUInt32LE(word, 4 * i));
    const at = reactor.indexOf(magic);
    assert(at >= 0);
    return at;
}

function signedJump(word, register) {
    assert.equal(word & 0x7f, 0x6f);
    assert.equal((word >>> 7) & 31, register);
    const imm = (((word >>> 31) & 1) << 20) | (((word >>> 21) & 0x3ff) << 1) |
        (((word >>> 20) & 1) << 11) | (word & 0xff000);
    return (imm << 11) >> 11;
}

function verifyLinked(reactor, linked, expected, entryNames) {
    const {image, metadata: {entries, relocations, importCount}} = expected;
    const slot = findSlot(reactor);
    const importOffset = 20 + 4 * entryNames.length;
    const codeOffset = importOffset + 4 * importCount;
    const at = slot + codeOffset;
    const linkedImage = Buffer.from(linked.subarray(at, at + image.length));
    assert.equal(linked.length, reactor.length);
    for (const {offset, index} of relocations) {
        assert.equal(image.readUInt32LE(offset), 0);
        assert.equal(codeOffset + offset + signedJump(linkedImage.readUInt32LE(offset), 1),
            importOffset + 4 * index);
        linkedImage.writeUInt32LE(0, offset);
    }
    assert.deepEqual(linkedImage, image);
    entryNames.forEach((name, i) => {
        const stub = 20 + 4 * i;
        assert.equal(stub + signedJump(linked.readUInt32LE(slot + stub), 0), codeOffset + entries[name]);
    });
}

const worlds = [];
for (const [app, entry, entryNames] of [
    ["files", "compileFilesRv32", ["filesName", "filesCompare", "filesSelect", "filesAction"]],
    ["agenda", "compileAgendaRv32", ["parseTask", "normalizeEntry", "agendaDateKey", "entryAddDays",
        "entryWeekday", "agendaMark"]],
    ["editor", "compileTypedWorldRv32", ["typedWorldMeta", "typedWorldEvent"]],
]) {
    const source = readFileSync(join(inputs, app, "program.typed"), "utf8");
    const reactor = readFileSync(join(inputs, app, "reactor.bin"));
    const enclosing = Buffer.alloc(reactor.length + 26, 0x5a);
    reactor.copy(enclosing, 11);
    const reactorView = enclosing.subarray(11, 11 + reactor.length);
    // Observe the raw call arguments selected by the production linker, including Editor's SDK imports.
    let argumentsSeen;
    const oracle = compilers[0];
    const compile = oracle.typedRv32.compile;
    oracle.typedRv32.compile = (source, imports, maxSourceLength, mode) => {
        argumentsSeen = [imports, maxSourceLength];
        return compile(source, imports, maxSourceLength, mode);
    };
    const elf = Buffer.from(oracle[entry](source, reactorView));
    oracle.typedRv32.compile = compile;
    const expected = raw(oracle, source, ...argumentsSeen);
    verifyLinked(reactor, elf, expected, entryNames);
    for (const c of compilers) {
        for (const mode of options) {
            assert.deepEqual(raw(c, source, ...argumentsSeen, mode), expected);
            assert.deepEqual(Buffer.from(c[entry](source, reactorView, mode)), elf);
            assert.deepEqual(reactorView, reactor);
        }
    }
    assert(enclosing.subarray(0, 11).every(b => b === 0x5a));
    assert(enclosing.subarray(11 + reactor.length).every(b => b === 0x5a));
    worlds.push({app, functions: expected.metadata.signatures.length, image_bytes: expected.image.length,
        image_sha256: hash(expected.image), metadata_sha256: hash(JSON.stringify(expected.metadata)),
        import_relocations: expected.metadata.relocations.length, elf_bytes: elf.length, elf_sha256: hash(elf)});
}

// Repeated division, a loop back edge, previous-function call, and a deep expression with a live call.
const imports = [{name: "sdk", params: ["i32"], result: "i32"}];
const deep = "1+(2+(3+(4+(5+(6+(7+(8+(9+sdk(x)))))))))";
const source = "record R {wide:i32; flag:bool;}" +
    "function small(n:i32):i32{return n+1;}" +
    "function large(r:R,n:i32):i32{let x=n;while(x<2){x=x+1;}" +
    "x=x/3;".repeat(600) + "r.wide=-2147483648;x=small(x);return " + deep + ";}";
const reference = raw(compilers[0], source, imports);
assert(reference.image.length > 4 * 4096);
assert.equal(reference.metadata.relocations.length, 1);
assert.equal(reference.metadata.records.R.flag.offset, 4);

const calls = [];
const backEdges = [];
const start = reference.metadata.entries.large;
for (let at = start; at < reference.image.length; at += 4) {
    const word = reference.image.readUInt32LE(at);
    if ((word & 0x7f) !== 0x6f) continue;
    const reg = (word >>> 7) & 31;
    if (reg === 1) calls.push(at + signedJump(word, 1));
    if (reg === 0 && signedJump(word, 0) < 0) backEdges.push(at + signedJump(word, 0));
}
assert.deepEqual(calls, [reference.metadata.entries.small]);
assert.equal(backEdges.length, 1);
assert(backEdges[0] >= start);

function fakeReactor(capacity) {
    const slot = 96;
    const reactor = Buffer.alloc(slot + capacity);
    reactor.writeUInt32LE(0x464c457f, 0);
    reactor[4] = reactor[5] = 1;
    reactor.writeUInt16LE(3, 16);
    reactor.writeUInt16LE(243, 18);
    reactor.writeUInt32LE(52, 28);
    reactor.writeUInt32LE(2, 36);
    reactor.writeUInt16LE(32, 42);
    reactor.writeUInt16LE(1, 44);
    reactor.writeUInt32LE(1, 52);
    reactor.writeUInt32LE(slot, 56);
    reactor.writeUInt32LE(capacity, 68);
    reactor.writeUInt32LE(1, 76);
    [0x4147454e, 0x44415256, 0x3332534c, capacity, 65537, 0x00100073, 0x6f].forEach(
        (word, i) => reactor.writeUInt32LE(word, slot + 4 * i));
    return reactor;
}

const exact = fakeReactor(28 + reference.image.length);
const tooSmall = fakeReactor(24 + reference.image.length);
const entries = ["large"];
const expectedElf = Buffer.from(compilers[0].typedRv32.linkSlot(
    compilers[0].typedRv32.compile(source, imports), exact, entries));
verifyLinked(exact, expectedElf, reference, entries);
for (const c of compilers) {
    for (const mode of options) {
        const rawResult = c.typedRv32.compile(source, imports, undefined, mode);
        const alternate = c.typedRv32.compileForSlot ?? c.typedRv32.compile;
        const program = alternate(source, imports, undefined, mode);
        assert.deepEqual(raw(c, source, imports, undefined, mode), reference);
        assert.deepEqual(Buffer.from(c.typedRv32.linkSlot(program, exact, entries)), expectedElf);
        assert.deepEqual(rejection(() => c.typedRv32.linkSlot(program, tooSmall, entries)),
            {name: "SyntaxError", message: "RV32 program does not fit the reactor slot"});
        c.typedRv32.compile("function second():i32{return 42;}");
        assert.deepEqual(Buffer.from(rawResult.image), reference.image);
    }
}

const nine = "function nine(" + Array.from({length: 9}, (_, i) => "a" + i + ":i32").join(",") +
    "):i32{return a0;}";
const many = "function many():i32{" + Array.from({length: 520}, (_, i) => "const l" + i + "=0;").join("") +
    "return 0;}";
const far = "function early():i32{return 1;}function giant(n:i32):i32{let x=n;" +
    "x=x/3;".repeat(23500) + "return early();}";
const late = "function late():i32{return true;}";
const rejects = [
    [nine, undefined, "up to eight register arguments"],
    [many, undefined, "frame exceeds"],
    [nine + many, undefined, "up to eight register arguments"],
    [many + nine, undefined, "frame exceeds"],
    [nine + late, undefined, "expected i32, got bool"],
    [nine + nine, undefined, "duplicate function nine"],
    ["function f():i32{return g();}function g():i32{return 1;}", undefined, "unknown function g"],
    ["function self():i32{return self();}", undefined, "unknown function self"],
    [nine + late, 4, "input limit exceeded"],
    [far, 4e5, "RV32 jump exceeds the instruction range"],
    [far + nine, 4e5, "up to eight register arguments"],
    [far + late, 4e5, "expected i32, got bool"],
];

function rejection(fn) {
    try { fn(); } catch (error) { return {name: error.name, message: error.message}; }
    assert.fail("expected rejection");
}

const diagnostics = [];
for (const [input, limit, message] of rejects) {
    const expected = rejection(() => compilers[0].typedRv32.compile(input, [], limit));
    assert(expected.message.includes(message), JSON.stringify(expected));
    for (const c of compilers) {
        for (const mode of options) {
            assert.deepEqual(rejection(() => c.typedRv32.compile(input, [], limit, mode)), expected);
        }
    }
    diagnostics.push(expected.message);
}

const malformed = [
    ["function a():i32{return true;}", Buffer.alloc(0), "expected i32, got bool"],
    ["function a():i32{return 0;}", Buffer.alloc(0), "requires the shared WorldEvent record"],
    [readFileSync(join(inputs, "editor", "program.typed"), "utf8"), Buffer.alloc(0), "expected an ELF32"],
];
for (const [input, reactor, message] of malformed) {
    const expected = rejection(() => compilers[0].compileTypedWorldRv32(input, reactor));
    assert(expected.message.includes(message));
    for (const c of compilers) {
        for (const mode of options) {
            assert.deepEqual(rejection(() => c.compileTypedWorldRv32(input, reactor, mode)), expected);
        }
    }
    diagnostics.push(expected.message);
}

console.log(JSON.stringify({worlds, fixture: {image_bytes: reference.image.length,
    image_sha256: hash(reference.image), elf_bytes: expectedElf.length, elf_sha256: hash(expectedElf),
    resolved_calls: calls.length, loop_back_edges: backEdges.length},
    options: ["omitted", "streamed", "buffered"], simulated_explicit_little_endian_fallback: true,
    diagnostics}, null, 2));
