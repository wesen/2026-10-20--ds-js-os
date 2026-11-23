// The compile units of tests/compiler/typed-tape.test.mjs (the firmware's and the bench's assemblies of
// apps/typed), and a loader that evaluates a list of compiler files into a fresh node:vm realm.
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createContext, runInContext} from "node:vm";

export const root = new URL("../../../../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

// files: paths of the compiler's classic scripts, in load order (tape.js first).
export function realm(files) {
    // performance: the timers read performance.now (a bare vm realm has only Date.now, 1 ms).
    const ctx = createContext({performance});
    for (const file of files) runInContext(readFileSync(file, "utf8"), ctx, {filename: file});
    return ctx;
}

export function units(world) {
    const app = (dir, name) => read("apps/typed/" + dir + "/" + name);
    const list = dir => app(dir, "source.list").trim().split("\n").map(name => app(dir, name) + "\n").join("");
    const scratch = mkdtempSync(join(tmpdir(), "typed-pipeline-"));
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
