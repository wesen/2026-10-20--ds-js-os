// Feed real C-produced index rows into historical Node execution fixtures.
// This bridge is for tests. Timing runs use the direct in-process C function.
import {execFileSync} from "node:child_process";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const nativeRunner = process.env.PICOCALC_LEX_INDEX_QJS;
if (!nativeRunner) throw new Error("PICOCALC_LEX_INDEX_QJS must name the vendored QuickJS harness");
const work = mkdtempSync(join(tmpdir(), "picocalc-native-index-"));
const input = join(work, "source.json");
const driver = join(work, "dump-index.js");
writeFileSync(driver, `
const index = __typedLexIndex(JSON.parse(readText(scriptArgs[0])));
print(JSON.stringify(index && index.map(buffer => Array.from(new Uint32Array(buffer)))));
`);
process.once("exit", () => rmSync(work, {recursive: true, force: true}));

globalThis.__typedLexIndex = source => {
    writeFileSync(input, JSON.stringify(source));
    const output = execFileSync(nativeRunner, ["INDEX", driver, "--", input], {
        encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    });
    const rows = JSON.parse(output);
    return rows && rows.map(buffer => Uint32Array.from(buffer).buffer);
};
