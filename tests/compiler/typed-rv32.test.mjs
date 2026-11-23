// Policies, the pass pipeline, its bundles and the pinned image of each policy.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import {createContext, runInContext, runInThisContext} from "node:vm";
import {adjustsStack, compiler, destination, opcode, sourceRegister, words} from "./rv32-helpers.mjs";

test("the default policy applies the qualified options and stock reproduces the earlier default", () => {
    const {typedRv32} = compiler();
    const src = readFileSync(new URL("../../apps/typed/raytrace/raytrace.typed", import.meta.url), "utf8");
    const qualified = {inlineGuardedReturns: true, passes: ["inline", "commute", "rotate", "version", "split"],
        operandLocations: {forward: true, capacity: true, homes: true, saved: true, direct: true, capacities: true, nested: true,
            constants: true, share: true, pointers: true},
        select: {immediates: true, divisions: true, branches: true, results: true, leafParams: true, shortBranches: true}};
    const image = options => typedRv32.compile(src, [], 65536, options).image;
    // The default with some qualified passes, selections and locations switched off.
    const without = (passes, select, locations) => ({disable: passes,
        select: {...qualified.select, ...Object.fromEntries(select.map(k => [k, false]))},
        operandLocations: {...qualified.operandLocations, ...Object.fromEntries(locations.map(k => [k, false]))}});
    assert.deepEqual(image(), image({policy: "stock", ...qualified}));
    assert.deepEqual(image({policy: "default"}), image());
    assert.notDeepEqual(image({policy: "stock"}), image());
    // Explicit fields override the policy, and an explicit undefined leaves it unchanged.
    assert.deepEqual(image({operandLocations: false, inlineGuardedReturns: false, select: false, passes: []}), image({policy: "stock"}));
    assert.deepEqual(image({operandLocations: undefined}), image());
    assert.equal(image({policy: "stock"}).length, 9564);
    const sha = options => createHash("sha256").update(image(options)).digest("hex");
    // PICOCALC-RAY-PARITY Step 13 timed this image on the P4 (board mode 2: 16.26 ms per frame).
    assert.equal(sha(), "d9c25ef928d70c4ca46f065a18396c6f3df6fafaaf021bd2e840318be844b8f3");
    // Step 11's image (19.31 ms): without versioned loops and split locals. The named "balanced"
    // policy, which Chess compiles with on the device, is exactly this set.
    assert.equal(sha(without(["version", "split"], [], [])), "4fa61ed11a0c1f940b8a4e8ff74c27e443d432184ec3eac8e3dac4831ce2d984");
    assert.equal(sha({policy: "balanced"}), "4fa61ed11a0c1f940b8a4e8ff74c27e443d432184ec3eac8e3dac4831ce2d984");
    // Step 10's image (20.20 ms): also without pointer homes.
    assert.equal(sha(without(["version", "split"], [], ["pointers"])), "e7e33cd0c2cb8fcea41c7a2143a031b62dc8ba827814c83cdf503479e799d1e7");
    // Step 8's image (22.43 ms): also without shared homes and short forward branches.
    assert.equal(sha(without(["version", "split"], ["shortBranches"], ["pointers", "share"])),
        "7c660e876a8c1211b853e9c8b7aff4b2fd400b2431500fce753fa7e55d5ab201");
    // Step 7's image (24.18 ms): also without loop rotation and constant homes.
    assert.equal(sha(without(["version", "split", "rotate"], ["shortBranches"], ["pointers", "share", "constants"])),
        "4e7eb52aee07cf8fd5e6a3a96733d100241b10fe445030793a73513229fb676c");
    // Step 6's image (31.51 ms): also without inlining and the Step 7 options. The named
    // "interactive" policy, which the device's boot worlds compile with, is exactly this set.
    assert.equal(sha(without(["version", "split", "rotate", "commute", "inline"], ["shortBranches"],
        ["pointers", "share", "constants", "capacities", "nested"])),
        "6b8545125fa8d2d004a57135125ebe0bf77bb6a2763e8de97336d17b2350451f");
    assert.equal(sha({policy: "interactive"}), "6b8545125fa8d2d004a57135125ebe0bf77bb6a2763e8de97336d17b2350451f");
    // The "kernel" policy adds division facts (board run 10 timed that image at 15.27 ms, Step 15),
    // value sets (board run 11: 13.84 ms, Step 17), hoisted loop invariants (board run 12:
    // 12.45 ms, Step 18), and fused conjunctions with loads into homes (below).
    const kernel = typedRv32.policies.kernel, before = {...kernel.operandLocations, pointerOnly: false, reuseArgs: false};
    const step18 = {...kernel.select, loadHomes: false};
    const old = (disable, select = kernel.select) => sha({policy: "kernel", disable, select, operandLocations: before});
    assert.equal(old(["induction", "conjunctions", "sets", "hoist"], step18), "22c20887acf2f0c8931e58978aee9399fb45b9e1558eeacd59bb98095feafebc");
    assert.equal(old(["induction", "conjunctions", "hoist"], step18), "a5eb06b25026ea4f3fa85f8941fd062718b6fed3665ca38ba70944b73b122dc3");
    assert.equal(old(["induction", "conjunctions"], step18), "3e18e5099c990fb168e24f8637ddf7110f931edf980b92b4f7383dda6adbf6d7");
    // Fused conjunctions and loads into homes (board run 13: 11.43 ms, Step 19).
    assert.equal(old(["induction"]), "245edbc1333519b3d78baa792e2317a6ba407f36fff682b078dd653bc5f097a0");
    // Induction variables and pointer-only sources (board run 14: 11.17 ms, Step 20).
    assert.equal(sha({policy: "kernel", operandLocations: {...kernel.operandLocations, reuseArgs: false}}),
        "8eaa40605e4bca96872b309aa87a39bfaf6312079822f9c1e4a134a63398fcdc");
    // Locals in the argument registers of unhomed parameters (board run 15: 10.99 ms, Step 21).
    assert.equal(sha({policy: "kernel"}), "4323938e38a4ef2a44c80103bf43680b506195762d6faa0f5834b41c86e9d2a5");
    assert.throws(() => typedRv32.compile(src, [], 65536, {policy: "fast"}), /unknown RV32 code-generation policy/);
});

test("policies are pass lists that options edit by name, and every stage reports its time", () => {
    const {typedRv32} = compiler();
    const src = readFileSync(new URL("../../apps/typed/raytrace/raytrace.typed", import.meta.url), "utf8");
    const image = options => typedRv32.compile(src, [], 65536, options).image;
    const {policies} = typedRv32;
    assert.deepEqual([...policies.default.passes], ["inline", "commute", "rotate", "version", "split"]);
    assert.deepEqual([...policies.interactive.passes], []);
    // enable and disable edit the policy's list; an added pass takes its place in pipeline order.
    assert.deepEqual(image({policy: "balanced", enable: ["split", "version"]}), image());
    assert.deepEqual(image({disable: ["version", "split"]}), image({policy: "balanced"}));
    assert.deepEqual(image({policy: "kernel", passes: [...policies.default.passes]}),
        image({policy: "kernel", disable: ["conjunctions", "sets", "ranges", "hoist", "induction", "facts"]}));
    assert.throws(() => image({passes: ["fold"]}), /unknown RV32 pass fold/);
    assert.throws(() => image({passes: ["rotate", "commute"]}), /pipeline order/);
    assert.throws(() => image({passes: ["version"]}), /version needs rotate/);
    assert.throws(() => image({policy: "kernel", disable: ["ranges"]}), /facts needs ranges/);
    assert.throws(() => image({select: {rotate: true}}), /select.rotate is the RV32 pass/);
    assert.throws(() => image({operandLocations: {homes: true, split: true}}), /operandLocations.split/);
    assert.throws(() => image({inline: true}), /inliner's limits/);
    // Timing: one row per stage a function runs, and one for the whole call; the image is unchanged.
    let tick = 0;
    const timing = [];
    assert.deepEqual(image({policy: "kernel", timing, clock: () => tick++}), image({policy: "kernel"}));
    const compile = timing.filter(row => row.fn === null);
    assert.equal(compile.length, 1);
    assert.equal(compile[0].pass, "compile");
    const stages = new Set(timing.filter(row => row.fn !== null).map(row => row.pass));
    for (const pass of ["storeless", "inline", "guarded", "commute", "conjunctions", "sets", "rotate", "ranges", "version",
        "split", "facts", "leaf", "plan", "emit", "candidate"]) assert(stages.has(pass), pass);
    for (const row of timing) if (row.fn !== null) assert.equal(row.ms, 1, row.pass);
    assert.equal(compile[0].ms, 2 * (timing.length - 1) + 1);
    const interactive = [];
    typedRv32.compile(src, [], 65536, {policy: "interactive", timing: interactive});
    assert.deepEqual([...new Set(interactive.map(row => row.pass))].sort(), ["compile", "emit", "guarded", "leaf", "plan"]);
});

test("the core bundle compiles interactive alone and loads a pass group through typedRv32Load", () => {
    const read = file => readFileSync(new URL("../../compiler/typed/" + file, import.meta.url), "utf8");
    const src = read("../../apps/typed/raytrace/raytrace.typed");
    const core = () => {
        const ctx = createContext({});
        for (const file of ["tape.js", "typed-wasm.js", "typed-rv32.js"]) runInContext(read(file), ctx, {filename: file});
        return ctx;
    };
    const all = compiler().typedRv32;
    const sha = program => createHash("sha256").update(program.image).digest("hex");
    const alone = core();
    assert.equal(sha(alone.typedRv32.compile(src, [], 65536, {policy: "interactive"})),
        "6b8545125fa8d2d004a57135125ebe0bf77bb6a2763e8de97336d17b2350451f");
    assert.throws(() => alone.typedRv32.compile(src, [], 65536, {policy: "balanced"}), /needs typed-rv32-inline.js/);
    // A host that loads files on demand defines typedRv32Load(file); the compile asks for each group once.
    const lazy = core(), asked = [];
    lazy.typedRv32Load = file => { asked.push(file); runInContext(read(file), lazy, {filename: file}); };
    assert.equal(sha(lazy.typedRv32.compile(src, [], 65536, {policy: "balanced"})), sha(all.compile(src, [], 65536, {policy: "balanced"})));
    assert.deepEqual(asked, ["typed-rv32-inline.js"]);
    assert.equal(sha(lazy.typedRv32.compile(src, [], 65536, {policy: "kernel"})),
        "4323938e38a4ef2a44c80103bf43680b506195762d6faa0f5834b41c86e9d2a5");
    assert.deepEqual(asked, ["typed-rv32-inline.js", "typed-rv32-loops.js"]);
    assert.deepEqual(Object.fromEntries(all.passes.map(pass => [pass.name, pass.file])).version, "typed-rv32-loops.js");
});

test("the rv32/ modules run as ES modules and compile what the bundles compile", async () => {
    // tape.js and typed-wasm.js are scripts that publish globals; the modules read them when they load.
    const read = file => readFileSync(new URL("../../compiler/typed/" + file, import.meta.url), "utf8");
    for (const file of ["tape.js", "typed-wasm.js"]) runInThisContext(read(file), {filename: file});
    const bundled = compiler().typedRv32;
    const saved = globalThis.typedRv32;
    await import(new URL("../../compiler/typed/rv32/index.js", import.meta.url));
    await import(new URL("../../compiler/typed/rv32/passes/inline-group.js", import.meta.url));
    await import(new URL("../../compiler/typed/rv32/passes/loops-group.js", import.meta.url));
    const modular = globalThis.typedRv32;
    globalThis.typedRv32 = saved;
    const src = read("../../apps/typed/raytrace/raytrace.typed");
    for (const policy of Object.keys(bundled.policies))
        assert.equal(Buffer.compare(Buffer.from(modular.compile(src, [], 65536, {policy}).image),
            Buffer.from(bundled.compile(src, [], 65536, {policy}).image)), 0, policy);
});

test("compiler/typed/typed-rv32*.js are the current build of compiler/typed/rv32/", async () => {
    const {bundles} = await import(new URL("../../compiler/typed/rv32/build.mjs", import.meta.url));
    for (const [file, text] of Object.entries(bundles()))
        assert(readFileSync(new URL("../../compiler/typed/" + file, import.meta.url), "utf8") === text,
            "compiler/typed/" + file + " differs from the build of compiler/typed/rv32/: edit the modules there, never a " +
            "bundle, then run node compiler/typed/rv32/build.mjs");
});
