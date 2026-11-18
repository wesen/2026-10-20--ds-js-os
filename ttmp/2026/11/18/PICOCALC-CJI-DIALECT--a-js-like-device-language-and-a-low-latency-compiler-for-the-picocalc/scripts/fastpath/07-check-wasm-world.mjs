import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import "./04-typed-wasm.js";

const dir = fileURLToPath(new URL(".", import.meta.url));
const os = fileURLToPath(new URL("../../../../../../../picocalc-os/", import.meta.url));
const host = process.argv[2] ? resolve(process.argv[2]) : join(os, "build/picocalc-host");
const tools = process.argv[3] ? resolve(process.argv[3]) : join(os, "build/wasm-toolchain");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

function command(executable, args, logPath) {
    const output = openSync(logPath, "w");
    try {
        execFileSync(executable, args, { timeout: 15000, stdio: ["ignore", output, output] });
    } catch (error) {
        throw new Error(executable + " failed:\n" + readFileSync(logPath, "utf8"), { cause: error });
    } finally {
        closeSync(output);
    }
    return readFileSync(logPath, "utf8");
}

function uleb(n) {
    const bytes = [];
    do {
        const head = n & 127;
        n >>>= 7;
        bytes.push(head | (n ? 128 : 0));
    } while (n);
    return Buffer.from(bytes);
}

class Reader {
    constructor(bytes) {
        this.bytes = Buffer.from(bytes);
        this.at = 0;
    }

    take(n) {
        assert(this.at + n <= this.bytes.length, "truncated Wasm section");
        const out = this.bytes.subarray(this.at, this.at + n);
        this.at += n;
        return out;
    }

    byte() {
        return this.take(1)[0];
    }

    uint() {
        let value = 0;
        for (let shift = 0; shift <= 28; shift += 7) {
            const byte = this.byte();
            value += (byte & 127) * 2 ** shift;
            if (!(byte & 128)) {
                assert(value <= 0xffffffff);
                return value;
            }
        }
        assert.fail("oversized Wasm u32");
    }

    vector(readElement) {
        return Array.from({ length: this.uint() }, () => readElement(this));
    }

    string() {
        return this.take(this.uint()).toString("utf8");
    }

    done() {
        return this.at === this.bytes.length;
    }
}

// Purpose-built for these two modules, which import only functions. This
// decoder locates the exported slot and copies its entire exact code body.
function inspect(bytes) {
    assert(WebAssembly.validate(bytes));
    const file = new Reader(bytes);
    const header = file.take(8);
    const sections = [];
    while (!file.done()) {
        const id = file.byte();
        sections.push({ id, content: file.take(file.uint()) });
    }
    function read(id, element, optional = false) {
        const found = sections.find(s => s.id === id);
        if (!found && optional) return [];
        assert(found, "missing Wasm section " + id);
        const section = new Reader(found.content);
        const result = section.vector(element);
        assert(section.done());
        return result;
    }

    const types = read(1, r => {
        assert.equal(r.byte(), 0x60);
        return [r.vector(x => x.byte()), r.vector(x => x.byte())];
    });
    const imported = read(2, r => {
        r.string();
        r.string();
        assert.equal(r.byte(), 0, "only function imports supported by this diagnostic");
        return r.uint();
    }, true);
    const definitions = read(3, r => r.uint());
    const exports = read(7, r => ({ name: r.string(), kind: r.byte(), index: r.uint() }));
    const bodies = read(10, r => r.take(r.uint()));
    assert.equal(bodies.length, definitions.length);
    const entry = exports.find(x => x.name === "scrollStart");
    assert.equal(entry.kind, 0);
    const bodyIndex = entry.index - imported.length;
    assert(bodyIndex >= 0 && bodyIndex < bodies.length);
    assert.deepEqual(types[definitions[bodyIndex]], [[0x7f, 0x7f, 0x7f], [0x7f]]);
    return { header, sections, bodies, bodyIndex, body: bodies[bodyIndex] };
}

function replace(compiled, shell) {
    const source = inspect(compiled);
    assert.equal(source.bodies.length, 1);
    const world = inspect(shell);
    const code = Buffer.concat([uleb(world.bodies.length), ...world.bodies.map((body, i) => {
        const out = i === world.bodyIndex ? source.body : body;
        return Buffer.concat([uleb(out.length), out]);
    })]);
    const bytes = Buffer.concat([world.header, ...world.sections.map(({id, content}) => {
        const out = id === 10 ? code : content;
        return Buffer.concat([Buffer.from([id]), uleb(out.length), out]);
    })]);
    assert.notDeepEqual(source.body, world.body);
    assert.deepEqual(inspect(bytes).body, source.body);
    return { bytes, exactBody: source.body };
}

const candidates = [
    { id: "inside", args: [15, 20, 6] },
    { id: "lower-clamp", args: [1, 20, 6] },
    { id: "upper-clamp", args: [19, 20, 6] },
    { id: "unset-selection", args: [-1, 20, 6] },
    { id: "whole-list-visible", args: [1, 5, 6] },
    { id: "max-i32", args: [2147483647, 2147483647, 1] },
];
const typedSource = readFileSync(join(dir, "scroll.typed"), "utf8");
const originalSource = readFileSync(join(os, "js/system/compositor.js"), "utf8")
    .match(/^function scrollStart\([^]*?\n}/m)[0];
assert.equal(typedSource.trimEnd().replace(/: i32/g, ""), originalSource);
const reference = vm.runInNewContext("(" + originalSource + ")");
const malformed = ["5", 10, 3];

function runWorld(root, label, bytes, expected) {
    const base = join(root, label);
    mkdirSync(base);
    mkdirSync(join(base, "fs"));
    copyFileSync(join(os, "js/prelude.js"), join(base, "prelude.js"));
    writeFileSync(join(base, "scroll.wasm"), bytes);
    writeFileSync(join(base, "system.json"), JSON.stringify({ worlds: [
        { name: "scroll-leaf", file: "scroll.wasm", engine: "wasm", mem_kb: 512 },
        { name: "peer", file: "peer.js", claims: ["sys.read"], mem_kb: 512 },
    ] }));
    writeFileSync(join(base, "peer.js"), `
service("peer").onStart(async () => {
  await sleep(100);
  const info = sys.worlds().find(w => w.name === "scroll-leaf");
  log("SCROLL_ENGINE " + JSON.stringify([info.engine, info.state, info.kind]));
  for (const row of ${JSON.stringify(candidates)}) {
    const reply = await ask("scroll-leaf", "scroll", row.args);
    log("SCROLL_RESULT " + JSON.stringify([row.id, reply]));
  }
  try {
    await ask("scroll-leaf", "scroll", ${JSON.stringify(malformed)});
    log("SCROLL_REJECT unexpected success");
  } catch (error) {
    log("SCROLL_REJECT " + error.message);
  }
});
`);
    const output = join(base, "out");
    command(host, ["-vv", "-j", base, "-o", output, "-f", join(base, "fs"), "-t", "1000"],
            join(base, "host.log"));
    const log = readFileSync(join(output, "uart.log"), "utf8");
    assert.match(log, /scroll-leaf: typed scroll diagnostic initialized/);
    assert.doesNotMatch(log, /crashed|SCROLL_REJECT unexpected success/);
    const world = log.match(/SCROLL_ENGINE (.+)$/m);
    assert(world, "peer did not observe the initialized Wasm service");
    const [engine, state, kind] = JSON.parse(world[1]);
    assert.deepEqual([engine, state, kind], ["wasm", "idle", "service"]);
    assert.match(log, /SCROLL_REJECT expected three i32 values/);
    const rows = [...log.matchAll(/SCROLL_RESULT (.+)$/gm)].map(m => JSON.parse(m[1]));
    assert.deepEqual(rows, expected);
    const messages = [...log.matchAll(/scroll-leaf: (\d+) WebAssembly instructions \(event 0, scroll\)/g)]
        .map(m => Number(m[1]));
    assert.equal(messages.length, candidates.length + 1);
    return {
        world: { engine, state, kind },
        replies: rows,
        rejected: "expected three i32 values",
        per_message_wasm_instructions: messages,
    };
}

assert(existsSync(host), "build the host simulator or pass its path as argument");
assert(existsSync(join(tools, "root/usr/lib/llvm-18/bin/wasm-ld")),
       "set up the repository's Clang 18 WASI toolchain or pass its root as second argument");
const scratch = mkdtempSync(join(tmpdir(), "picocalc-scroll-world-"));
try {
    const shellPath = join(scratch, "shell.wasm");
    const sdk = join(os, "sdk");
    const sysroot = join(tools, "root/usr");
    const clang = "clang-18";
    command(clang, [
        "--target=wasm32-wasi", "--sysroot=" + sysroot, "-resource-dir", join(tools, "res"),
        "-B" + join(sysroot, "lib/llvm-18/bin"), "-O2", "-Wall", "-Wextra", "-Wno-unused-parameter", "-I" + sdk,
        "-mexec-model=reactor", "-Wl,--stack-first", "-Wl,-z,stack-size=16384", "-Wl,--strip-all",
        join(dir, "06-wasm-scroll-world.c"), join(dir, "06-wasm-scroll-placeholder.c"),
        join(sdk, "nw_wasm.c"), "-o", shellPath,
    ], join(scratch, "build.log"));
    const clangVersion = command(clang, ["--version"], join(scratch, "clang-version")).split("\n")[0];
    const shell = readFileSync(shellPath);
    const generated = globalThis.compileTyped(typedSource);
    const previous = JSON.parse(readFileSync(join(dir, "../../various/fastpath/typed-wasm.json"), "utf8"));
    assert.equal(sha(generated), previous.scroll.wasm_sha256);
    const { bytes, exactBody } = replace(generated, shell);
    const expected = candidates.map(({id,args}) => [id, reference(...args)]);
    const negative = runWorld(scratch, "placeholder", shell, candidates.map(({id}) => [id, -999]));
    const actual = runWorld(scratch, "typed", bytes, expected);
    console.log(JSON.stringify({
        node: process.version,
        clang: clangVersion,
        wamr: readFileSync(join(os, "third_party/wamr/VERSION"), "utf8").split("\n")[0],
        host_sha256: sha(readFileSync(host)),
        typed_source_sha256: sha(typedSource),
        standalone_wasm_sha256: sha(generated),
        exact_scroll_body_bytes: exactBody.length,
        exact_scroll_body_sha256: sha(exactBody),
        shell_sha256: sha(shell),
        patched_module_bytes: bytes.length,
        patched_module_sha256: sha(bytes),
        candidates: candidates.map(({ id, args }, i) => ({ id, args, expected: expected[i][1] })),
        typed: actual,
        placeholder_control: negative,
    }, null, 2));
} finally {
    rmSync(scratch, { recursive: true, force: true });
}
