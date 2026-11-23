// The whole-program pre-pass: which functions are async, the task operations (start, cancel, pending, resume)
// in every body, the call graph and its acyclicity. The front end streams each function to the backend, so the
// generated functions and the frames must be known before the first ordinary body is compiled.
// Existing typed sources use start and pending as locals and record fields.
const candidate = /\b(?:async|await)\b|\b(?:start|cancel)\b\s*(?:\/\/[^\n]*\n\s*)*[a-zA-Z_]\w*|\b(?:resume|pending)\b\s*(?:\/\/[^\n]*\n\s*)*\(/;
const ambient = new Map([["event", "WorldEvent"], ["state", "WorldState"],
    ["output", "buffer"], ["hints", "buffer"]]);
const completion = 4;
const ordinaryCall = /\/\/[^\n]*|"(?:[^"\\\r\n]|\\.)*"|(?<member>\.\s*(?:\/\/[^\n]*\n\s*)*)?(?<name>\b[a-zA-Z_]\w*)\s*(?:\/\/[^\n]*\n\s*)*\(/g;

function isOperation(tokens, i) {
    const {value} = tokens[i];
    const next = tokens[i + 1];
    if (value === "async" || value === "await") return true;
    if (value === "start" || value === "cancel") return next?.kind === "id";
    if (value === "resume" || value === "pending") return next?.value === "(";
    return false;
}

function startNeedsGuard(tokens, open) {
    // Calls, record loads, and arithmetic can have effects before the wrapper
    // has a chance to reject a busy start. Plain argument words cannot.
    for (let i = open + 1, word = true; i < tokens.length; i++, word = !word) {
        const token = tokens[i];
        if (token.value === ")") return false;
        if (word ? token.kind !== "id" && token.kind !== "int" : token.value !== ",") return true;
    }
    return false;
}

function location(source, at) {
    const prefix = source.slice(0, at);
    return prefix.split("\n").length + ":" + (at - prefix.lastIndexOf("\n"));
}

function fail(source, at, message) {
    throw new SyntaxError(location(source, at) + ": " + message);
}

function tokensFrom(source, from, to) {
    const tokens = [];
    const lex = new typedWasm.Lexer(source, from, to);
    for (; lex.token.kind !== "eof"; lex.next()) {
        lex.token.end = lex.offset;
        tokens.push(lex.token);
    }
    return tokens;
}

// Reuse C-produced lexically valid rows. A null body result requests the old
// candidate regexp and token/operator scan, with the same diagnostic precedence.
function indexedBodies(source, lex, signatures) {
    const index = lex.index;
    if (!index) return null;
    const {rows, symbols} = index;
    const known = new Map(signatures.map(fn => [fn.name, fn.index + 1]));
    const marks = new Uint8Array(symbols.length / 3);
    const targets = new Uint32Array(marks.length);
    let paren = -1, dot = -1;
    for (let cell = 0; cell < symbols.length; cell += 3) {
        const kind = symbols[cell + 2];
        if (kind !== 1 && kind !== 4) continue;
        const ordinal = cell / 3;
        const value = source.slice(symbols[cell], symbols[cell + 1]);
        if (kind === 4) {
            if (value === "(") paren = ordinal;
            if (value === ".") dot = ordinal;
            continue;
        }
        targets[ordinal] = known.get(value) ?? 0;
        if (value === "async" || value === "await") marks[ordinal] = 1;
        else if (value === "start" || value === "cancel") marks[ordinal] = 2;
        else if (value === "resume" || value === "pending") marks[ordinal] = 3;
    }
    return sig => {
        if (sig.async) return null;
        const first = lex.findIndexRow(sig.bodyAt);
        const end = (rows[first + 3] - 1) * 4;
        if (rows[first] !== sig.bodyAt || end <= first || rows[end + 1] !== sig.end) return null;
        const calls = [];
        for (let row = first + 4; row < end; row += 4) {
            const ordinal = rows[row + 2];
            const mark = marks[ordinal], target = targets[ordinal];
            if (!mark && !target) continue;
            const next = rows[row + 6], previous = rows[row - 2];
            // Only the predicate for a task form is needed. The parser handles
            // the complete form, its source-gate regexp, and all errors.
            if (mark === 1 || (mark === 2 && symbols[next * 3 + 2] === 1) ||
                (mark === 3 && next === paren)) return null;
            if (target && next === paren && previous !== dot) {
                // E.g. 1helper() has an identifier token but no regexp word
                // boundary. Comment/literal markers influence the legacy scan
                // selection in these invalid bodies, so preserve that path.
                if (rows[row - 3] === rows[row] && symbols[previous * 3 + 2] === 2) return null;
                calls.push(target - 1, rows[row]);
            }
        }
        return calls;
    };
}

function readProgram(source, imported) {
    const lex = new typedWasm.Lexer(source, 0, source.length, true);
    const recordEnds = new Map();
    const types = typedWasm.parseDeclarations(lex, recordEnds);
    const imports = new Map(imported.map(fn => [fn.name, fn]));
    const signatures = typedWasm.scanSignatures(lex, types.records, new Map(imports), 0,
        types.enums, types.distinct, true);
    const inspectBody = indexedBodies(source, lex, signatures);
    const functions = new Map();
    let foundOperation = false;
    for (const sig of signatures) {
        const {name, result, start, end, bodyAt, async, index} = sig;
        const calls = inspectBody?.(sig) ?? null;
        let tokens;
        if (async || (calls === null && candidate.test(source.slice(bodyAt, end)))) {
            tokens = tokensFrom(source, bodyAt, end);
            foundOperation ||= async || tokens.some((_, i) => isOperation(tokens, i));
        }
        const params = async ? sig.params.map((type, i) => {
            const name = sig.paramNames[i];
            return {type, name, at: sig.paramAts[i], ambient: ambient.get(name) === type};
        }) : null;
        functions.set(name, {name, result, start, end, bodyAt, async, index, tokens, calls, sig,
            params, edges: new Set(), waits: async ? [] : null, bindings: async ? [] : null, replacements: []});
    }
    if (!foundOperation) return null;
    let prefix = "__typed_async_";
    while (source.includes(prefix)) prefix += "_";
    return {source, types, functions, imports, prefix, signatures,
        stateEnd: recordEnds.get("WorldState"), tasks: new Set(),
        stateFields: types.records.get("WorldState")?.size ?? 0};
}

function scalar(type, {enums, distinct}) {
    return type === "i32" || type === "bool" || enums.has(type) || distinct.has(type);
}

function sourceCallables(program) {
    const functions = new Map(program.imports);
    for (const fn of program.functions.values()) {
        if (fn.async) continue;
        functions.set(fn.name, fn.sig);
    }
    return functions;
}

// A synchronous body with no task syntax needs only its call edges here.
// Skip strings, comments, and method syntax without allocating lexer tokens.
function scanOrdinaryCalls(source, fn, functions) {
    ordinaryCall.lastIndex = fn.bodyAt;
    for (let match; (match = ordinaryCall.exec(source)) && match.index < fn.end;) {
        const {name, member} = match.groups;
        if (!name || member) continue;
        const target = functions.get(name);
        if (!target) continue;
        if (target.async)
            fail(source, match.index, "call async function " + name + " with start or await");
        fn.edges.add(target);
    }
}

function scanOperations(program) {
    const {source, functions, tasks} = program;
    for (const fn of functions.values()) {
        const {tokens} = fn;
        if (!tokens) {
            if (fn.calls === null) {
                scanOrdinaryCalls(source, fn, functions);
            } else {
                for (let i = 0; i < fn.calls.length; i += 2) {
                    const target = functions.get(program.signatures[fn.calls[i]].name);
                    if (target.async)
                        fail(source, fn.calls[i + 1], "call async function " + target.name + " with start or await");
                    fn.edges.add(target);
                }
            }
            continue;
        }
        for (let i = 1; i < tokens.length - 1; i++) {
            const {value, at} = tokens[i];
            const next = tokens[i + 1];
            if (value === "async") fail(source, at, "async can only introduce a function");
            if (value === "await" && !fn.async) fail(source, at, "await is only allowed in an async function");
            if ((value === "start" || value === "cancel") && isOperation(tokens, i)) {
                if (fn.async) fail(source, at, value + " is only allowed in an ordinary function");
                const target = functions.get(next?.value);
                if (!target?.async) fail(source, at, "expected an async function after " + value);
                if (value === "start") {
                    if (tokens[i + 2]?.value !== "(") fail(source, at, "expected arguments after start " + target.name);
                    fn.edges.add(target);
                    tasks.add(target);
                } else if (![";", "{", "}"].includes(tokens[i - 1]?.value) || tokens[i + 2]?.value !== ";") {
                    fail(source, at, "cancel must be a statement");
                }
                fn.replacements.push({kind: value, at, end: next.end, target,
                    guard: value === "start" && startNeedsGuard(tokens, i + 2)});
                i++;
                continue;
            }
            if ((value === "resume" || value === "pending") && isOperation(tokens, i)) {
                if (fn.async) fail(source, at, value + " is only allowed in an ordinary function");
                if (value === "resume" && fn.name !== "typedWorldEvent")
                    fail(source, at, "resume is only allowed in typedWorldEvent");
                if (next?.value !== "(" || tokens[i + 2]?.value !== ")")
                    fail(source, at, "expected " + value + "()");
                fn.replacements.push({kind: value, at, end: tokens[i + 2].end});
                i += 2;
                continue;
            }
            if (next?.value === "(" && tokens[i - 1]?.value !== ".") {
                const target = functions.get(value);
                if (!target) continue;
                if (target.async && tokens[i - 1]?.value !== "await")
                    fail(source, at, "call async function " + value + " with start or await");
                fn.edges.add(target);
            }
        }
        if (!fn.async) fn.tokens = null;
    }
    for (const fn of functions.values()) {
        for (const op of fn.replacements) {
            if (op.kind === "cancel" && !tasks.has(op.target))
                fail(source, op.at, "cancel requires a task named by start: " + op.target.name);
            if (op.kind === "resume") for (const task of tasks) fn.edges.add(task);
        }
    }
}

function assertAcyclic({functions}) {
    const signatures = [...functions.values()];
    const edges = signatures.map(fn => [...fn.edges].map(target => target.index));
    typedWasm.checkAcyclic(signatures, edges);
}
