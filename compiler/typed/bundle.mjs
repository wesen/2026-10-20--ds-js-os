// The one bundler of the Typed compiler's generated scripts. Three builds call it with their module lists:
//   frontend/build.mjs  typed-wasm.js      the front end and the WebAssembly backend, plain scripts in a given order
//   async/build.mjs     typed-async.js     the async lowering, plain scripts in a given order
//   rv32/build.mjs      typed-rv32*.js     the RV32 backend's ES modules: a core bundle and two pass-group bundles
// Every bundle is one script with one function scope, which every loader evaluates as it is (the tests, the bench,
// the trace REPL's module table, the tools, and the P4, which keeps its QuickJS bytecode): header comment lines,
// then `(() => { "use strict"; ... })();` holding each module after a `// LABEL` line. Each build's command is
//   node compiler/typed/NAME/build.mjs          write its bundles
//   node compiler/typed/NAME/build.mjs --check  exit 1 if a committed bundle differs from the build (make test-generated)
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join, posix, relative} from "node:path";

// The bundle's text. header: comment lines without "// "; modules: [{label, text}]; head and tail: code before
// the first module and after the last, inside the scope.
export function script({header, modules, head = "", tail = ""}) {
    return header.map(line => "// " + line + "\n").join("") + "(() => {\n\"use strict\";\n" + head +
        modules.map(({label, text}) => "\n// " + label + "\n" + text.replace(/^\n+/, "").replace(/\n*$/, "\n")).join("") +
        tail + "})();\n";
}

// Plain scripts that share the bundle's scope in the order given (no import or export): their top-level code runs
// in that order, so a module may use what an earlier one declared.
export function concatenated(root, names, label = name => "---- " + name) {
    return names.map(name => ({label: label(name), text: readFileSync(join(root, name), "utf8")}));
}

// ---- ES modules with scope hoisting ----
// A bundle holds every module its entry reaches that no earlier bundle holds, in dependency order, in one function
// scope: the import lines and the `export` keywords are removed, so every top-level name of every module must be
// unique (checked). A module scope per module cost a third more QuickJS bytecode (PICOCALC-TYPED-PIPELINE). The
// first bundle ends by publishing the names a later bundle imports from it (globalThis[registry]); a later bundle
// starts by destructuring them, so it loads only after the first. The module forms understood: `import {a, b} from
// "./path.js";`, and `export` before a top-level `function`, `class` or `const` (including `const {a, b: c} = ...`
// and `const a = 1, b = 2`), and `export {a, b};`. Anything else (renamed imports, default exports, `export let`,
// namespace imports, import cycles, an import of a name the module does not export) is an error.

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
function parse(root, path) {
    const text = readFileSync(join(root, path), "utf8");
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
function closure(root, entry, parsed) {
    const order = [], state = new Map();
    const visit = (path, chain) => {
        if (state.get(path) === "done") return;
        if (state.get(path) === "open") throw new SyntaxError("import cycle: " + [...chain, path].join(" -> "));
        state.set(path, "open");
        const module = parsed.get(path) ?? parse(root, path);
        parsed.set(path, module);
        for (const target of module.imports) visit(target, [...chain, path]);
        state.set(path, "done");
        order.push(path);
    };
    visit(entry, []);
    return order;
}

// The bundles of ES modules under root. entries: [{file, entry}], the first the core. Returns, per entry in order,
// {file, modules, head, tail} for script(); label(path) names a module's line, registry the global the core
// publishes the shared names in.
export function hoisted(root, entries, {label, registry}) {
    const parsed = new Map(), home = new Map(), bundleOf = new Map();
    const plans = entries.map(({entry}, i) => {
        const modules = closure(root, entry, parsed).filter(path => !bundleOf.has(path));
        modules.forEach(path => bundleOf.set(path, i));
        return modules;
    });
    for (const [path, {declared}] of parsed) for (const name of declared) {
        if (home.has(name)) throw new SyntaxError(name + " is declared at top level in both " + home.get(name) + " and " + path);
        home.set(name, path);
    }
    // What each bundle imports from an earlier one.
    const crossing = entries.map(() => new Set());
    for (const [path, {bindings}] of parsed) for (const {name, from} of bindings) {
        if (!parsed.get(from).exports.includes(name)) throw new SyntaxError(path + " imports " + name + ", which " + from + " does not export");
        if (bundleOf.get(from) === bundleOf.get(path)) continue;
        if (bundleOf.get(from) !== 0) throw new SyntaxError(path + " imports " + name + " from a group bundle");
        crossing[bundleOf.get(path)].add(name);
    }
    const shared = [...new Set(crossing.flatMap(names => [...names]))].sort();
    const core = entries[0].file;
    return entries.map(({file}, i) => ({
        file,
        modules: plans[i].map(path => ({label: label(path), text: parsed.get(path).body})),
        head: i === 0 ? "" : "if (!globalThis." + registry + ") throw new Error(\"load " + core + " before " + file + "\");\n" +
            "const {" + [...crossing[i]].sort().join(", ") + "} = globalThis." + registry + ";\n",
        tail: i === 0 ? "\n// The names the pass-group bundles import from this one.\nglobalThis." + registry + " = {" + shared.join(", ") + "};\n" : "",
    }));
}

// A build's command line: write each bundle ({path: text}, paths absolute), or with --check exit 1 if a committed
// one differs, naming the sources to edit and the command that rebuilds it.
export function main(importMeta, outputs, sources) {
    if (process.argv[1] !== fileURLToPath(importMeta.url)) return;
    const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const command = "node " + relative(repo, fileURLToPath(importMeta.url));
    let stale = false;
    for (const [target, text] of Object.entries(outputs)) {
        if (!process.argv.includes("--check")) writeFileSync(target, text);
        else if ((() => { try { return readFileSync(target, "utf8"); } catch { return null; } })() !== text) {
            console.error(relative(repo, target) + " differs from the build of " + sources + ". Edit those files, never the " +
                "bundle, then run " + command + ".");
            stale = true;
        }
    }
    if (stale) process.exit(1);
}
