// Bundle the RV32 backend's ES modules (this directory) into plain scripts for QuickJS, goja and node:vm.
//   node compiler/typed/rv32/build.mjs          write the bundles
//   node compiler/typed/rv32/build.mjs --check  exit 1 if a committed bundle is stale
//
// BUNDLES lists each bundle's entry module. A bundle holds every module its entry reaches that no earlier
// bundle holds, in dependency order, in one function scope (scope hoisting): the import lines and the `export`
// keywords are removed, so every top-level name of every module must be unique (the build checks). A module
// scope per module cost a third more QuickJS bytecode (367 KB against 260 KB for the core).
// The core bundle ends by publishing the names a later bundle imports from it (globalThis.typedRv32Modules);
// a group bundle starts by destructuring them, so it loads only after typed-rv32.js. The module forms this
// understands: `import {a, b} from "./path.js";`, and `export` before a top-level `function`, `class` or `const`
// (including `const {a, b: c} = ...` and `const a = 1, b = 2`). Anything else (renamed imports, default
// exports, `export let`, namespace imports, import cycles, an import of a name the module does not export) is
// an error. The modules are also plain ES modules for Node (package.json: "type": "module"), given
// globalThis.typedTape and typedWasm; tests/compiler/typed-rv32.test.mjs runs them unbundled.
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
    const bindings = [];
    let body = text.replace(/^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";[ \t]*\n?/gm, (_, list, from) => {
        if (!from.startsWith(".")) throw new SyntaxError(path + ": import from " + from + " is not relative");
        const target = posix.normalize(posix.join(posix.dirname(path), from));
        for (const name of list.split(",").map(s => s.trim()).filter(Boolean)) {
            if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new SyntaxError(path + ": unsupported import " + name);
            bindings.push({name, from: target});
        }
        imports.push(target);
        return "";
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
    // Every top-level declaration, exported or not: they share the bundle's scope.
    const declared = [];
    for (const match of body.matchAll(/^(function|class|const|let) /gm)) {
        const at = match.index + match[0].length;
        if (match[1] === "const" || match[1] === "let") declared.push(...constNames(body, at, path));
        else declared.push(/^[A-Za-z_$][\w$]*/.exec(body.slice(at))[0]);
    }
    return {path, imports, bindings, exports, declared, body};
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
    const parsed = new Map(), home = new Map(), bundleOf = new Map(), out = {};
    const plans = BUNDLES.map(({file, entry}, i) => {
        const modules = closure(entry, parsed).filter(path => !bundleOf.has(path));
        modules.forEach(path => bundleOf.set(path, i));
        return modules;
    });
    for (const [path, {declared}] of parsed) for (const name of declared) {
        if (home.has(name)) throw new SyntaxError(name + " is declared at top level in both " + home.get(name) + " and " + path);
        home.set(name, path);
    }
    // What each bundle imports from an earlier one.
    const crossing = BUNDLES.map(() => new Set());
    for (const [path, {bindings}] of parsed) for (const {name, from} of bindings) {
        if (!parsed.get(from).exports.includes(name)) throw new SyntaxError(path + " imports " + name + ", which " + from + " does not export");
        if (bundleOf.get(from) === bundleOf.get(path)) continue;
        if (bundleOf.get(from) !== 0) throw new SyntaxError(path + " imports " + name + " from a group bundle");
        crossing[bundleOf.get(path)].add(name);
    }
    const shared = [...new Set(crossing.flatMap(names => [...names]))].sort();
    for (const [i, {file, what}] of BUNDLES.entries()) {
        const parts = plans[i].map(path => "\n// rv32/" + path + "\n" + parsed.get(path).body.replace(/^\n+/, "").replace(/\n*$/, "\n"));
        const head = i === 0 ? "" : "if (!globalThis.typedRv32Modules) throw new Error(\"load typed-rv32.js before " + file + "\");\n" +
            "const {" + [...crossing[i]].sort().join(", ") + "} = globalThis.typedRv32Modules;\n";
        const tail = i === 0 ? "\n// The names the pass-group bundles import from this one.\nglobalThis.typedRv32Modules = {" + shared.join(", ") + "};\n" : "";
        out[file] = "// Generated from compiler/typed/rv32/ by compiler/typed/rv32/build.mjs. Edit those files, not this one.\n" +
            "// " + what + "\n// This code executes in the host tools and can execute in a bare QuickJS realm.\n" +
            "(() => {\n\"use strict\";\n" + head + parts.join("") + tail + "})();\n";
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
