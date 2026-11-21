import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, "../../../../../../..");

function replace(source, before, after) {
    assert.equal(source.split(before).length, 2, "bounds integration changed");
    return source.replace(before, after);
}

export function stage(source = readFileSync(resolve(root, "picocalc-os/compiler/typed-rv32.js"), "utf8")) {
    source = replace(source, "function compile(source, imports = [], maxSourceLength, options) {",
        readFileSync(resolve(here,"analysis.inc"),"utf8") +
        "\nfunction compile(source, imports = [], maxSourceLength, options) {\n    const selectBounds = options?.boundsPolicy ? boundsSelector(options) : null;");
    return replace(source, "    function lower(fn) { code.push(new FunctionCode(fn, callables, targets).lower()); }",
        `    function lower(fn) {
        const candidate = selectBounds ? selectBounds(fn) : fn;
        code.push(new FunctionCode(candidate, callables, targets).lower());
        if (candidate !== fn) candidate.code = null;
    }`);
}
