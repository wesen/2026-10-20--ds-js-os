// The RV32 conformance suite on rv32emu's processor (bench/emu): bench/emu/build/rv32emu-vectors executes each
// vector of bench/reference/rv32/vectors.jsonl and prints the state after it; the comparison is the suite's own
// (bench/rv32/vectors.mjs check), the same as for the reference interpreter and pkg/tracerv32.
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {repoPath} from "../../bench/lib/repo.mjs";
import {load, check} from "../../bench/rv32/vectors.mjs";

const hex = n => (n >>> 0).toString(16);

test("rv32emu passes every conformance vector", () => {
    execFileSync("make", ["-s", "-C", repoPath("bench/emu"), "build/rv32emu-vectors"], {stdio: "inherit"});
    const vectors = load();
    const input = vectors.map(v => {
        const x = Array.from({length: 32}, (_, r) => hex(v.x[r] ?? 0)), f = Array.from({length: 32}, (_, r) => hex(v.f[r] ?? 0));
        const mem = v.mem ? Array.from(v.mem, b => b.toString(16).padStart(2, "0")).join("") : "-";
        return [hex(v.word), hex(v.fcsr), ...x, ...f, mem].join(" ");
    }).join("\n") + "\n";
    const output = execFileSync(repoPath("bench/emu/build/rv32emu-vectors"), {input, maxBuffer: 1 << 28}).toString().trim().split("\n");
    assert.equal(output.length, vectors.length);
    const failures = [];
    vectors.forEach((v, i) => {
        const line = output[i];
        let got;
        if (line.startsWith("fault ")) got = {fault: line.slice(6)};
        else {
            const w = line.split(" ");
            const n = s => parseInt(s, 16) >>> 0;
            got = {next: n(w[1]), fcsr: n(w[2]), x: w.slice(3, 35).map(n), f: w.slice(35, 67).map(n),
                mem: Uint8Array.from(w[67].match(/../g), b => parseInt(b, 16))};
        }
        const problems = check(v, got);
        if (problems.length) failures.push(`${v.id}: ${problems.join("; ")}`);
    });
    assert.deepEqual(failures.slice(0, 20), [], `${failures.length} of ${vectors.length} vectors fail on rv32emu`);
});
