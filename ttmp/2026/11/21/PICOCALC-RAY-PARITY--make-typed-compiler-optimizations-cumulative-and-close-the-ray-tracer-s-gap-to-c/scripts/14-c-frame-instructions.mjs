// Executed RV32 instructions of the scalar C frame against the Typed default frame.
// usage (repo root): node 14-c-frame-instructions.mjs <P4-GCC> <rv32emu> [GCC flags...]
// GCC builds picocalc-os/nucleus/raytrace_demo.c with scripts/14-c-frame-runner.c twice, with
// and without the render (-DBASELINE); the difference is the frame. The board's C frame is the
// same call: SHADOW-CODEGEN's 02-build.sh copies raytrace_demo.c into the app as production.inc,
// bench.c includes it, and main/CMakeLists.txt adds -O3 after ESP-IDF's -O2, so -O3 is the
// default here (-march there is rv32imafc_zicsr_zifencei_xesppie; the scalar frame uses
// neither F nor PIE, and C only changes code size). The C pixels must
// equal the Typed opening frame's pixel cells. Typed options come from TYPED_RV32_OPTIONS.
import {execFileSync, spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {runInThisContext} from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../../..");
const [gcc, emu, ...extra] = process.argv.slice(2);
const flags = extra.length ? extra : ["-O3"];
const temp = mkdtempSync(join(tmpdir(), "ray-c-frame-"));
try {
    writeFileSync(join(temp, "sdkconfig.h"), "");
    const run = baseline => {
        const elf = join(temp, baseline ? "base.elf" : "frame.elf");
        execFileSync(gcc, ["-march=rv32im", "-mabi=ilp32", ...flags, "-nostdlib", "-msmall-data-limit=0", "-mno-relax",
            "-Wl,-Ttext=0x10000", "-Wl,-e,_start", "-I", temp, "-I", join(root, "picocalc-os/nucleus"),
            ...(baseline ? ["-DBASELINE"] : []), join(here, "14-c-frame-runner.c"), join(root, "picocalc-os/nucleus/raytrace_demo.c"),
            "-o", elf]);
        const out = spawnSync(resolve(emu), [elf], {maxBuffer: 1 << 20, env: {...process.env, RV32_STEPS: "1"}});
        if (out.status !== 0) throw new Error("rv32emu failed: " + out.stderr);
        return {steps: Number(/rv32emu: (\d+) instructions/.exec(out.stderr.toString())[1]), pixels: out.stdout};
    };
    const frame = run(false), base = run(true);
    for (const f of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js", "tools/typed-ray-bench.js"])
        runInThisContext(readFileSync(join(root, "picocalc-os", f), "utf8"), {filename: f});
    const options = process.env.TYPED_RV32_OPTIONS ? JSON.parse(process.env.TYPED_RV32_OPTIONS) : undefined;
    const program = typedRv32.compile(readFileSync(join(root, "picocalc-os/worlds/raytrace/raytrace.typed"), "utf8"), [], 65536, options);
    const typed = typedRayBench.openingFrame(program);
    const cells = Buffer.from(typed.bytes.subarray(64 + 4, 64 + 4 + 2 * 25600));
    console.log(JSON.stringify({gccFlags: flags, cFrameInstructions: frame.steps - base.steps,
        typedFrameInstructions: typed.steps, ratio: +(typed.steps / (frame.steps - base.steps)).toFixed(3),
        pixelsEqual: cells.equals(frame.pixels)}));
} finally { rmSync(temp, {recursive: true, force: true}); }
