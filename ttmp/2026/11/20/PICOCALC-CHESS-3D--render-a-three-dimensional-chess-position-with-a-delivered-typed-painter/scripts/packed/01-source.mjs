import {globSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ticketRoot = resolve(here, "../../..");
const [pie] = globSync("PICOCALC-TYPED-PIE--*", {cwd: ticketRoot});
export const pieScripts = resolve(ticketRoot, pie, "scripts");
export const scene = resolve(here, "../scene/isometric.typed");

function replaceOnce(source, before, after) {
    const start = source.indexOf(before);
    if (start < 0 || source.indexOf(before, start + before.length) >= 0)
        throw new Error("Frozen scene integration point changed");
    return source.replace(before, after);
}

const lattice = `
function packedGround(sx: buffer, sy: buffer, i: i32, pitch: i32): i32 {
    const u = sx.charCodeAt(i) - 224;
    const v = 42 + (sy.charCodeAt(i) - 640) * pitch / 8;
    return v * 512 + u;
}

function paintChess(state: buffer, out: buffer, xs: buffer, ys: buffer, zs: buffer,
                    sx: buffer, sy: buffer, depth: buffer): i32 {
    const pitch = ys.charCodeAt(81);
    for (let i = 0; i < 81; i = i + 1) {
        xs.setCharCodeAt(i, i % 9 * 16);
        ys.setCharCodeAt(i, 0);
        zs.setCharCodeAt(i, i / 9 * 16);
    }
    project(xs, ys, zs, sx, sy, depth, 81);`;

export function packedSource() {
    let source = readFileSync(scene, "utf8");
    source = replaceOnce(source, "function paintPose(state: buffer, out: buffer, pitch: i32): i32 {",
        lattice.trimStart());
    source = replaceOnce(source, `    const lipA = projectPoint(0, 0, 128, pitch);
    const lipB = projectPoint(128, 0, 128, pitch);
    const lipC = projectPoint(128, 0, 0, pitch);`, `    const lipA = packedGround(sx, sy, 72, pitch);
    const lipB = packedGround(sx, sy, 80, pitch);
    const lipC = packedGround(sx, sy, 8, pitch);`);
    source = replaceOnce(source, `        const x = file * 16;
        const z = rank * 16;
        const a = projectPoint(x, 0, z, pitch);
        const b = projectPoint(x + 16, 0, z, pitch);
        const c = projectPoint(x + 16, 0, z + 16, pitch);
        const d = projectPoint(x, 0, z + 16, pitch);`, `        const corner = rank * 9 + file;
        const a = packedGround(sx, sy, corner, pitch);
        const b = packedGround(sx, sy, corner + 1, pitch);
        const c = packedGround(sx, sy, corner + 10, pitch);
        const d = packedGround(sx, sy, corner + 9, pitch);`);
    const project = readFileSync(resolve(pieScripts, "01-vertices.typed"), "utf8");
    return replaceOnce(source, `function paintChess(state: buffer, out: buffer): i32 {
    return paintPose(state, out, 5);
}`, project.trimEnd());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (!process.argv[2]) throw new Error("usage: node 01-source.mjs OUTPUT.typed");
    writeFileSync(process.argv[2], packedSource());
}
