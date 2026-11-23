// Before/after digests of everything the Typed compiler writes, for PICOCALC-TYPED-FRONTEND.
//
//   node 01-digests.mjs --compiler DIR [--out FILE]     (run from the repository root)
//
// DIR holds the compiler files to load (tape.js, typed-wasm.js, typed-async.js, typed-rv32.js, typed-world.js,
// typed-pie-loops.js): compiler/typed of this checkout, or of a `git worktree` at the base commit. The sources,
// the reactors (firmware/build/*.wasm) and the generators come from the current checkout, so the only variable
// is the compiler.
//
// Digests, each a sha256 prefix:
//   rv32/UNIT/POLICY   the RV32 image and every tape observeTape reports (13 units x 6 policies, as TAPE's harness)
//   wasm/UNIT          typedWasm.compile bytes, for the units that compile alone
//   world/NAME         the linked Wasm worlds: Editor, Chess, the playable Chess (compileTypedWorld), Files and Agenda
//                      (typedWasm.linkWorld with their reactors)
//   inspect-wasm/UNIT  every event typedWasm.compile(source, {inspect}) emits, as JSON
//   inspect-tape/UNIT  every event typedRv32.compile(source, ..., {inspect}) emits, with the frontend event's target
//                      label removed (this ticket renames it from "rv32" to "tape")
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {createContext, runInContext} from "node:vm";

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const dir = resolve(option("--compiler") ?? "compiler/typed");
const out = option("--out");
const read = path => readFileSync(path, "utf8");
const hash = data => createHash("sha256").update(data).digest("hex").slice(0, 16);

const ctx = createContext({});
for (const file of ["tape.js", "typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-world.js", "typed-pie-loops.js"])
    runInContext(read(join(dir, file)), ctx, {filename: file});
for (const file of ["apps/typed/files/compile.js", "apps/typed/agenda/compile.js"])
    runInContext(read(file), ctx, {filename: file});

const app = (d, name) => read("apps/typed/" + d + "/" + name);
const list = d => app(d, "source.list").trim().split("\n").map(name => app(d, name) + "\n").join("");
const scratch = mkdtempSync(join(tmpdir(), "frontend-digests-"));
const candela = stage => {
    const file = join(scratch, stage + ".typed");
    execFileSync("python3", ["apps/typed/candela/assemble.py", file, "--stage", stage]);
    return read(file);
};
const embedPainter = name => {
    const file = join(scratch, "painter.typed");
    execFileSync("python3", ["firmware/tools/embed-chess-painter.py", "apps/typed/chess/" + name, file]);
    return read(file);
};
const world = ctx.typedWorld.imports;
const playableChess = list("chess").replace("function chessRender(", "function chessRenderTree(") + "\n" +
    embedPainter("painter-3d.typed") + "\n" + app("chess", "mobile-view.typed") + "\n";
const units = {
    ray: [app("raytrace", "raytrace.typed"), []],
    material: [[["candela", "builders.typed"], ["candela", "materials.typed"], ["candela", "hand.typed"],
        ["raytrace", "raytrace.typed"], ["raytrace", "material-frame.typed"], ["raytrace", "material-phases.typed"]]
        .map(([d, name]) => app(d, name)).join("\n"), []],
    editor: [list("editor"), world],
    chess: [list("chess"), world],
    playableChess: [playableChess, world],
    files: [app("files", "files.typed"), world],
    agenda: [app("agenda", "reminder.typed") + "\n" + app("agenda", "entry.typed"), []],
    painter: [app("chess", "painter.typed"), []],
    painter3d: [app("chess", "painter-3d.typed"), []],
    candelaHand: [candela("hand"), []],
    candelaFluent: [candela("fluent"), []],
    candelaCallback: [candela("callback"), []],
};
rmSync(scratch, {recursive: true});
units.agendaReminder = [app("agenda", "reminder.typed"), []];

const policies = {stock: {policy: "stock"}, interactive: {policy: "interactive"}, balanced: {policy: "balanced"},
    default: {}, kernel: {policy: "kernel"}, kernelPie: {policy: "kernel", pieLoops: "pie"}};
const digests = {};
const attempt = (key, run) => {
    try { digests[key] = run(); } catch (error) { digests[key] = "ERR " + error.message; }
};
for (const [unit, [source, imports]] of Object.entries(units)) {
    for (const [name, options] of Object.entries(policies)) {
        attempt("rv32/" + unit + "/" + name, () => {
            const h = createHash("sha256");
            const program = ctx.typedRv32.compile(source, imports, 1 << 20, {...options,
                observeTape: (fn, phase, code, nlocals) => h.update(fn + "/" + phase + "/" + nlocals + ":" + code.join(",") + ";")});
            return hash(program.image) + "+" + h.digest("hex").slice(0, 16);
        });
    }
    attempt("wasm/" + unit, () => hash(ctx.typedWasm.compile(source).bytes));
    attempt("inspect-wasm/" + unit, () => {
        const events = [];
        ctx.typedWasm.compile(source, {inspect: {emit: event => events.push(event)}});
        return hash(JSON.stringify(events));
    });
    attempt("inspect-tape/" + unit, () => {
        const events = [];
        ctx.typedRv32.compile(source, imports, 1 << 20, {inspect: {emit: event => {
            if (event.kind === "frontend") delete event.target;
            events.push(event);
        }}});
        return hash(JSON.stringify(events));
    });
}
const reactor = name => readFileSync("firmware/build/" + name);
attempt("world/editor", () => hash(ctx.compileTypedWorld(units.editor[0], reactor("typed-world-reactor.wasm"))));
attempt("world/chess", () => hash(ctx.compileTypedWorld(units.chess[0], reactor("typed-world-reactor.wasm"))));
attempt("world/playableChess", () => hash(ctx.compileTypedWorld(playableChess, reactor("typed-world-reactor.wasm"))));
attempt("world/files", () => hash(ctx.compileFiles(units.files[0], reactor("files-reactor.wasm"))));
attempt("world/agenda", () => hash(ctx.compileAgenda(units.agenda[0], reactor("agenda-reactor.wasm"))));
attempt("world/editor-inspect", () => {
    const events = [];
    const bytes = ctx.compileTypedWorld(units.editor[0], reactor("typed-world-reactor.wasm"),
        {inspect: {emit: event => events.push(event)}});
    return hash(bytes) + "+" + hash(JSON.stringify(events));
});

const text = JSON.stringify(digests, null, 1) + "\n";
if (out) writeFileSync(out, text);
const values = Object.values(digests);
console.log(values.length + " digests, " + values.filter(v => v.startsWith("ERR")).length + " errors" + (out ? " -> " + out : ""));
if (!out) process.stdout.write(text);
