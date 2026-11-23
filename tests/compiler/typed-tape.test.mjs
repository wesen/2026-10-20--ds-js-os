// The tape definition (compiler/typed/tape.js) against every tape the compiler produces.
//
// Every Typed compile unit in apps/typed is compiled under the "stock" policy (the front end's tape
// unchanged) and the "kernel" policy (every tape transform: inline, commute, conjunctions, sets,
// rotate, version, split). Each tape seen by observeTape is walked with tape.js's cell counts and
// checked as a structured, typed operand stack: every opcode is in the table, the walk ends exactly at
// the tape's end, every operation finds the operand types its row pops, every block leaves the type
// its block-type cell declares, and every branch targets an enclosing block. A wrong cell count
// misaligns the walk and fails one of these checks.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {createContext, runInContext} from "node:vm";

const root = new URL("../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
// Values from the compiler's realm, as plain values of this one (deepStrictEqual compares prototypes).
const plain = value => JSON.parse(JSON.stringify(value));

function compiler() {
    const ctx = createContext({});
    for (const file of ["tape.js", "typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-world.js"])
        runInContext(read("compiler/typed/" + file), ctx, {filename: file});
    return ctx;
}

// The compile units the firmware and the bench assemble from apps/typed.
function units(world) {
    const app = (dir, name) => read("apps/typed/" + dir + "/" + name);
    const list = dir => JSON.parse(app(dir, "app.json")).sources.map(name => app(dir, name) + "\n").join("");
    const scratch = mkdtempSync(join(tmpdir(), "typed-tape-"));
    const candela = stage => {
        const out = join(scratch, stage + ".typed");
        execFileSync("python3", [new URL("apps/typed/candela/assemble.py", root).pathname, out, "--stage", stage]);
        return readFileSync(out, "utf8");
    };
    const embedPainter = name => {
        const out = join(scratch, "painter.typed");
        execFileSync("python3", [new URL("firmware/tools/embed-chess-painter.py", root).pathname,
            new URL("apps/typed/chess/" + name, root).pathname, out]);
        return readFileSync(out, "utf8");
    };
    try {
        return {
            ray: [app("raytrace", "raytrace.typed"), []],
            material: [[["candela", "builders.typed"], ["candela", "materials.typed"], ["candela", "hand.typed"],
                ["raytrace", "raytrace.typed"], ["raytrace", "material-frame.typed"], ["raytrace", "material-phases.typed"]]
                .map(([dir, name]) => app(dir, name)).join("\n"), []],
            editor: [list("editor"), world],
            chess: [list("chess"), world],
            // The playable firmware's Chess: the 3D painter embedded as literal writes (CMakeLists.txt).
            playableChess: [list("chess").replace("function chessRender(", "function chessRenderTree(") + "\n" +
                embedPainter("painter-3d.typed") + "\n" + app("chess", "mobile-view.typed") + "\n", world],
            files: [app("files", "files.typed"), world],
            agenda: [app("agenda", "reminder.typed") + "\n" + app("agenda", "entry.typed"), []],
            painter: [app("chess", "painter.typed"), []],
            painter3d: [app("chess", "painter-3d.typed"), []],
            candelaHand: [candela("hand"), []],
            candelaFluent: [candela("fluent"), []],
            candelaCallback: [candela("callback"), []],
        };
    } finally {
        rmSync(scratch, {recursive: true});
    }
}

// Walk one tape; returns the opcodes seen. `arity(index)` is a callee's parameter count.
function check(T, code, arity, where) {
    const fail = (at, message) => assert.fail(where + " at cell " + at + ": " + message);
    const stack = [], frames = [{height: 0, result: T.I32, dead: false}], seen = new Set();
    let at = 0;
    const pop = (types, op) => {
        const frame = frames.at(-1);
        for (let i = types.length - 1; i >= 0; i--) {
            if (frame.dead && stack.length === frame.height) continue;
            if (stack.length <= frame.height) fail(at, T.name(op) + " pops below its block");
            const got = stack.pop();
            if (got !== types[i]) fail(at, T.name(op) + " pops " + got + ", expected " + types[i]);
        }
    };
    const leave = (frame, op) => {
        if (!frame.dead && stack.length !== frame.height + (frame.result === T.I32 ? 1 : 0))
            fail(at, T.name(op) + " leaves " + (stack.length - frame.height) + " values in its block");
        if (!frame.dead && frame.result === T.I32 && stack.at(-1) !== T.I32) fail(at, "block result is not i32");
        stack.length = frame.height;
    };
    while (at < code.length) {
        const op = code[at], row = T.row(op);
        if (!row) fail(at, "opcode " + op + " is not in the tape table");
        if (at + 1 + row.cells > code.length) fail(at, row.name + " is truncated");
        seen.add(op);
        const a = code[at + 1];
        if (op === T.CALL && !(a >= 0)) fail(at, "call of " + a);
        pop(row.pop ?? Array(arity(a)).fill(T.I32), op);
        const frame = frames.at(-1);
        if (op === T.BLOCK || op === T.LOOP || op === T.IF) {
            if (a !== T.I32 && a !== T.VOID) fail(at, "block type " + a);
            frames.push({height: stack.length, result: a, dead: frame.dead && stack.length === frame.height ? frame.dead : false, op});
        } else if (op === T.ELSE) {
            if (frame.op !== T.IF || frame.sawElse) fail(at, "else outside an if");
            leave(frame, op);
            frame.dead = false;
            frame.sawElse = true;
        } else if (op === T.END) {
            leave(frame, op);
            frames.pop();
            if (!frames.length) {
                if (at + 1 !== code.length) fail(at, "operations after the function's end");
                stack.push(T.I32);
            } else stack.push(...(frame.result === T.I32 ? [T.I32] : []));
        } else {
            if ((op === T.BR || op === T.BR_IF) && !(a >= 0 && a < frames.length - 1)) fail(at, row.name + " " + a + " leaves the function");
            stack.push(...row.push);
            if (op === T.BR || op === T.RETURN || op === T.UNREACHABLE) frame.dead = true;
        }
        if (frame.dead && op !== T.END && op !== T.ELSE) stack.length = Math.min(stack.length, frame.height);
        at = T.next(code, at);
    }
    if (at !== code.length) fail(at, "the walk ends past the tape");
    if (frames.length) fail(at, frames.length + " blocks are not closed");
    return seen;
}

test("the tape table is consistent", () => {
    const {typedTape: T} = compiler();
    const names = new Set(), constants = new Set();
    for (const row of T.rows) {
        assert(!names.has(row.name) && !constants.has(row.constant), row.name + " is defined twice");
        names.add(row.name);
        constants.add(row.constant);
        assert.equal(T[row.constant], row.code);
        assert.equal(T.row(row.code), row);
        assert.equal(T.name(row.code), row.name);
        assert.equal(T.cells[row.code], row.operands.length);
        assert.equal(row.cells, row.operands.length);
        assert.equal(T.effects[row.code], row.effects);
    }
    assert.equal(T.cells.filter(n => n >= 0).length, T.rows.length);
    // Effects the passes rely on: storeless() and the planner's purity test.
    const stores = plain(T.rows.filter(r => r.effects & T.STORES).map(r => r.name).sort());
    assert.deepEqual(stores, ["i32.store", "i32.store16", "text.literal_stores"]);
    assert.deepEqual(plain(T.rows.filter(r => r.effects & T.CALLS).map(r => r.name)), ["call"]);
    const code = [T.BLOCK, T.VOID, T.LOCAL_GET, 0, T.CHECKED_ADDRESS, 0, 1, T.DROP, T.END, T.I32_CONST, -3, T.END];
    assert.equal(T.close(code, 0), 8);
    assert.deepEqual(plain(T.decode(code).map(o => [o.op, ...o.operands])), [["block", 64], ["local.get", 0],
        ["text.checked_address", 0, 1], ["drop"], ["end"], ["i32.const", -3], ["end"]]);
    // In Wasm bytes the immediates are LEB128: i32.const -3 is 0x7d, a local index 200 two bytes.
    assert.deepEqual(plain(T.decode([T.I32_CONST, 0x7d, T.LOCAL_GET, 0xc8, 0x01], true).map(o => o.operands[0])), [-3, 200]);
    assert(Number.isNaN(T.next([0xff], 0)));
    assert.throws(() => T.decode([0xff]), /unknown tape opcode 255/);
});

test("every tape the compiler produces from apps/typed matches the tape table", t => {
    const ctx = compiler();
    const T = ctx.typedTape;
    const all = new Set(), wasm = new Set(), phases = new Set();
    let tapes = 0;
    for (const [unit, [source, imports]] of Object.entries(units(ctx.typedWorld.imports))) {
        // The Wasm mode's operations, decoded from its bytes with the same table (units that link only as
        // worlds, with the SDK imports, do not compile alone).
        try {
            ctx.typedWasm.compile(source, {inspect: {emit: event => {
                if (event.kind === "frontend") for (const op of event.operations) wasm.add(op.opcode);
            }}});
        } catch (error) {
            if (error.name !== "SyntaxError" && error.name !== "RangeError") throw error;
        }
        for (const policy of ["stock", "kernel"]) {
            const observed = [];
            const program = ctx.typedRv32.compile(source, imports, 1 << 20, {policy,
                observeTape: (name, phase, code) => observed.push([name, phase, code])});
            const params = [...imports.map(fn => fn.params.length), ...program.signatures.map(fn => fn.params.length)];
            for (const [name, phase, code] of observed) {
                for (const op of check(T, code, index => params[index], `${unit}/${policy} ${name} after ${phase}`)) all.add(op);
                phases.add(phase);
                tapes++;
            }
        }
    }
    assert(tapes > 2000, "checked " + tapes + " tapes");
    t.diagnostic(tapes + " tapes checked");
    assert.deepEqual([...phases].sort(), ["commute", "conjunctions", "inline", "rotate", "sets", "split", "version"]);
    // Every row is exercised, so none is dead weight: the numeric tape has every row but i32.shl, which only
    // the Wasm mode writes (it computes a UTF-16 address where the numeric tape has text.checked_address),
    // and the Wasm mode never writes a pseudo-op.
    const missing = codes => plain(T.rows.filter(row => !codes.has(row.code)).map(row => row.name));
    assert.deepEqual(missing(all), ["i32.shl"]);
    assert(wasm.has(T.I32_SHL));
    assert.deepEqual([T.CHECKED_ADDRESS, T.LITERAL_STORES, T.UNCHECKED_ADDRESS].filter(op => wasm.has(op)), []);
});

test("the walk fails on a wrong cell count", () => {
    const ctx = compiler(), T = ctx.typedTape;
    const tapes = [];
    const program = ctx.typedRv32.compile(read("apps/typed/raytrace/raytrace.typed"), [], 1 << 20,
        {policy: "kernel", observeTape: (name, phase, code) => tapes.push(code)});
    const params = program.signatures.map(fn => fn.params.length);
    for (const [op, cells] of [[T.I32_LOAD16_U, 1], [T.CHECKED_ADDRESS, 3], [T.I32_CONST, 0], [T.CALL, 2]]) {
        const row = {...T.row(op), cells};
        const wrong = {...T, row: code => code === op ? row : T.row(code),
            next: (code, at) => code[at] === op ? at + 1 + cells : T.next(code, at)};
        assert.throws(() => { for (const code of tapes) check(wrong, code, index => params[index], T.name(op)); },
            undefined, T.name(op) + " with " + cells + " cells");
    }
});
