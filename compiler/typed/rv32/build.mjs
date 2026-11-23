// Bundle the RV32 backend's ES modules (this directory) into plain scripts for QuickJS, goja and node:vm.
//   node compiler/typed/rv32/build.mjs          write the bundles
//   node compiler/typed/rv32/build.mjs --check  exit 1 if a committed bundle is stale
//
// BUNDLES lists each bundle's entry module. A bundle holds every module its entry reaches that no earlier
// bundle holds, in dependency order, each in its own function scope:
//
//     modules["emit/stack.js"] = (() => {
//     const {SP, instruction} = modules["encoding/registers.js"];   // was: import {SP, instruction} from "../encoding/registers.js";
//     ...the module, `export` removed...
//     return {StackMethods};
//     })();
//
// The core bundle creates the module table (globalThis.typedRv32Modules); a group bundle adds its modules to
// it and imports the core's from it, so it loads only after typed-rv32.js. The module forms this understands:
// `import {a, b as c} from "./path.js";`, and `export` before a top-level `function`, `class` or `const`
// (including `const {a, b: c} = ...` and `const a = 1, b = 2`). Anything else (default exports, `export let`,
// namespace imports, import cycles) is an error. The modules are also plain ES modules for Node
// (package.json: "type": "module"), given globalThis.typedTape and typedWasm.
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join, posix} from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const BUNDLES = [
    {file: "typed-rv32.js", entry: "index.js",
        what: "The RV32 backend's core: encoding, the emitters, the planner, the pass registry, policies, compile, linkSlot."},
    {file: "typed-rv32-inline.js", entry: "passes/inline-group.js",
        what: "The RV32 passes of the \"inline\" group: inline, commute, rotate. Load after typed-rv32.js."},
    {file: "typed-rv32-loops.js", entry: "passes/loops-group.js",
        what: "The RV32 passes of the \"loops\" group: conjunctions, sets, ranges, version, hoist, induction, split, facts. Load after typed-rv32.js."},
];

// Skip a string, template literal or comment starting at i; returns the index after it, or i.
function skip(text, i) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") { const j = text.indexOf("\n", i); return j < 0 ? text.length : j; }
    if (c === "/" && text[i + 1] === "*") return text.indexOf("*/", i + 2) + 2;
    if (c === "\"" || c === "'" || c === "`") {
        let j = i + 1;
        while (text[j] !== c) j += text[j] === "\\" ? 2 : 1;
        return j + 1;
    }
    return i;
}

// The names a top-level `const` declaration starting at `at` (just after "const ") binds.
function constNames(text, at, where) {
    const names = [];
    let depth = 0, expectName = true;
    for (let i = at; i < text.length;) {
        const after = skip(text, i);
        if (after !== i) { i = after; continue; }
        const c = text[i];
        if (expectName && depth === 0 && /\s/.test(c)) { i++; continue; }
        if (expectName && depth === 0 && c === "{") {
            // A destructuring pattern {a, b: c}: the binding is the name after the last colon.
            const end = text.indexOf("}", i);
            for (const part of text.slice(i + 1, end).split(",")) if (part.trim()) names.push(part.split(":").at(-1).trim());
            i = end + 1;
            expectName = false;
            continue;
        }
        if (expectName && depth === 0) {
            const name = /^[A-Za-z_$][\w$]*/.exec(text.slice(i))?.[0];
            if (!name) throw new SyntaxError(where + ": cannot read the const declaration at " + text.slice(at, at + 40));
            names.push(name);
            i += name.length;
            expectName = false;
            continue;
        }
        if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) depth--;
        else if (c === "," && depth === 0) expectName = true;
        else if (c === ";" && depth === 0) return names;
        i++;
    }
    throw new SyntaxError(where + ": unterminated const declaration");
}

// Parse one module: its imports (resolved module paths and bindings), exported names and transformed body.
function parse(path) {
    const text = readFileSync(join(here, path), "utf8");
    const imports = [];
    const exports = [];
    let body = text.replace(/^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";[ \t]*$/gm, (_, list, from) => {
        if (!from.startsWith(".")) throw new SyntaxError(path + ": import from " + from + " is not relative");
        const target = posix.normalize(posix.join(posix.dirname(path), from));
        const bindings = list.split(",").map(s => s.trim()).filter(Boolean).map(s => {
            const [name, local = name] = s.split(/\s+as\s+/);
            return name === local ? name : name + ": " + local;
        });
        imports.push(target);
        return "const {" + bindings.join(", ") + "} = modules[" + JSON.stringify(target) + "];";
    });
    if (/^\s*import\b/m.test(body)) throw new SyntaxError(path + ": unsupported import form");
    body = body.replace(/^export (function|class|const) /gm, (match, kind, offset) => {
        if (kind === "const") exports.push(...constNames(body, offset + match.length, path));
        else exports.push(/^[A-Za-z_$][\w$]*/.exec(body.slice(offset + match.length))[0]);
        return kind + " ";
    });
    body = body.replace(/^export \{([^}]*)\};[ \t]*\n?/gm, (_, list) => {
        exports.push(...list.split(",").map(s => s.trim()).filter(Boolean));
        return "";
    });
    if (/^\s*export\b/m.test(body)) throw new SyntaxError(path + ": unsupported export form");
    return {path, imports, exports, body};
}

// Every module an entry reaches, dependencies first.
function closure(entry, parsed) {
    const order = [], state = new Map();
    const visit = (path, chain) => {
        if (state.get(path) === "done") return;
        if (state.get(path) === "open") throw new SyntaxError("import cycle: " + [...chain, path].join(" -> "));
        state.set(path, "open");
        const module = parsed.get(path) ?? parse(path);
        parsed.set(path, module);
        for (const target of module.imports) visit(target, [...chain, path]);
        state.set(path, "done");
        order.push(path);
    };
    visit(entry, []);
    return order;
}

export function bundles() {
    const parsed = new Map(), placed = new Set(), out = {};
    for (const [i, {file, entry, what}] of BUNDLES.entries()) {
        const modules = closure(entry, parsed).filter(path => !placed.has(path));
        modules.forEach(path => placed.add(path));
        const table = i === 0 ? "const modules = globalThis.typedRv32Modules = Object.create(null);\n" :
            "const modules = globalThis.typedRv32Modules;\n" +
            "if (!modules) throw new Error(\"load typed-rv32.js before " + file + "\");\n";
        const parts = modules.map(path => {
            const {exports, body} = parsed.get(path);
            return "\n// rv32/" + path + "\nmodules[" + JSON.stringify(path) + "] = (() => {\n" + body.replace(/\n*$/, "\n") +
                "return {" + exports.join(", ") + "};\n})();\n";
        });
        out[file] = "// Generated from compiler/typed/rv32/ by compiler/typed/rv32/build.mjs. Edit those files, not this one.\n" +
            "// " + what + "\n// This code executes in the host tools and can execute in a bare QuickJS realm.\n" +
            "(() => {\n\"use strict\";\n" + table + parts.join("") + "})();\n";
    }
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const built = bundles();
    const check = process.argv.includes("--check");
    let stale = false;
    for (const [file, text] of Object.entries(built)) {
        const target = join(here, "..", file);
        if (!check) writeFileSync(target, text);
        else if ((() => { try { return readFileSync(target, "utf8"); } catch { return null; } })() !== text) {
            console.error("compiler/typed/" + file + " differs from the build of compiler/typed/rv32/. Edit the files in " +
                "compiler/typed/rv32/, never the bundles, then run node compiler/typed/rv32/build.mjs.");
            stale = true;
        }
    }
    if (stale) process.exit(1);
}
