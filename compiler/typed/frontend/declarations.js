// The signature pass: records, value records, enums, distinct types, member aliases, function signatures, and the call
// graph's acyclicity check; and the layouts the backends publish.
//
// A value record parameter is its leaves, consecutive parameters in field order (fn.params, fn.paramNames "v.x"); the
// signature as written is fn.sourceParams and fn.sourceNames, present only when a value record appears. A value record
// result is fn.result (its name) and fn.results, the types of its leaves.
function scanSignatures(lex, records, declared, functionBase, enums, distinct, asyncSpans = false, values) {
    const functions = [];
    while (lex.token.kind !== "eof") {
        const start = lex.token.at;
        const async = asyncSpans && (lex.token.value === "async" && (lex.next(), true));
        { if (lex.token.value !== "function") lex.fail("expected function"); lex.next(); }
        const name = lex.ident();
        if (name === "memory") lex.fail("reserved memory export");
        if (declared.has(name) || distinct.has(name) || values?.has(name)) lex.fail("duplicate function " + name);
        const params = [], paramNames = [];
        const paramAts = asyncSpans ? [] : null;
        let sourceParams, sourceNames;
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        if (!(lex.token.value === ")" && (lex.next(), true))) {
            const names = [], types = [];
            do {
                paramAts?.push(lex.token.at);
                const id = lex.ident();
                { if (lex.token.value !== ":") lex.fail("expected :"); lex.next(); }
                const type = lex.type(records, enums, distinct, values);
                if (names.includes(id)) lex.fail("duplicate local " + id);
                names.push(id);
                types.push(type);
                const value = values?.get(type);
                if (value) {
                    sourceParams = types;
                    for (let k = 0; k < value.leaves.length; k++) {
                        params.push(value.leaves[k]);
                        paramNames.push(id + "." + value.paths[k]);
                    }
                } else {
                    params.push(type);
                    paramNames.push(id);
                }
            } while ((lex.token.value === "," && (lex.next(), true)));
            { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
            if (sourceParams) sourceNames = names;
        }
        { if (lex.token.value !== ":") lex.fail("expected :"); lex.next(); }
        const result = lex.type(records, enums, distinct, values);
        if (lex.token.value !== "{") lex.fail("expected {");
        const fn = {name, index: functionBase + functions.length, params, paramNames, result, bodyAt: lex.token.at};
        if (sourceParams) Object.assign(fn, {sourceParams, sourceNames});
        if (values?.has(result)) fn.results = values.get(result).leaves;
        declared.set(name, fn);
        functions.push(fn);
        const end = lex.skipBody();
        if (asyncSpans) {
            if (end === undefined) lex.fail("unterminated function body");
            Object.assign(fn, {start, end, async, paramAts});
        }
    }
    return functions;
}

function checkAcyclic(functions, edges) {
    const colors = new Uint8Array(functions.length);
    const order = [], path = [], positions = [];
    for (let root = 0; root < functions.length; root++) {
        if (colors[root]) continue;
        path.push(root);
        positions.push(0);
        colors[root] = 1;
        while (path.length) {
            const at = path.length - 1;
            const fn = path[at];
            const to = edges[fn][positions[at]++];
            if (to === undefined) {
                path.pop();
                positions.pop();
                colors[fn] = 2;
                order.push(fn);
            } else if (colors[to] === 1) {
                const cycle = path.slice(path.indexOf(to)).concat(to);
                throw new SyntaxError("recursive call cycle: " + cycle.map(i => functions[i].name).join(" -> "));
            } else if (!colors[to]) {
                colors[to] = 1;
                path.push(to);
                positions.push(0);
            }
        }
    }
    return order;
}

function parseEnum(lex, name) {
    { if (lex.token.value !== "{") lex.fail("expected {"); lex.next(); }
    const members = new Map();
    const values = new Set();
    let next = 0;
    while (!(lex.token.value === "}" && (lex.next(), true))) {
        const member = lex.ident();
        if (members.has(member)) lex.fail("duplicate member " + member + " in " + name);
        if ((lex.token.value === "=" && (lex.next(), true))) {
            const negative = (lex.token.value === "-" && (lex.next(), true));
            if (lex.token.kind !== "int") lex.fail("expected integer enum value");
            next = lex.integerValue() * (negative ? -1 : 1);
            lex.next();
        }
        if (next < -2147483648 || next > 2147483647) lex.fail("i32 enum value out of range");
        if (values.has(next)) lex.fail("duplicate enum value " + next + " in " + name);
        members.set(member, next | 0);
        values.add(next++);
        if (!(lex.token.value === "," && (lex.next(), true))) {
            { if (lex.token.value !== "}") lex.fail("expected }"); lex.next(); }
            break;
        }
    }
    if (!members.size) lex.fail("empty enum " + name);
    return members;
}

// Aliases live only in compiler metadata. Receiver and options signatures
// are checked once the normal forward-signature pass has seen every target.
function parseMembers(lex, members, owner, records) {
    if (members.has(owner)) lex.fail("duplicate member group " + owner);
    const entries = new Map();
    members.set(owner, entries);
    lex.expect("{");
    while (!lex.accept("}")) {
        const name = lex.ident();
        if (entries.has(name)) lex.fail("duplicate member " + owner + "." + name);
        let options = null;
        if (lex.accept("(")) {
            options = lex.ident();
            if (!records.get(options)?.size) lex.fail("expected a nonempty options record " + options);
            lex.expect(")");
        }
        lex.expect("=");
        const target = lex.ident();
        entries.set(name, {target, options, at: lex.token.at});
        lex.expect(";");
    }
}

function checkMembers(lex, aliases, declared, records) {
    if (!aliases) return;
    for (const groups of [aliases.namespaces, aliases.methods]) {
        const receiver = groups === aliases.methods;
        for (const [owner, members] of groups) for (const [name, member] of members) {
            const fail = message => { lex.token.at = member.at; lex.fail(owner + "." + name + ": " + message); };
            const fn = declared.get(member.target);
            if (!fn) fail("unknown target " + member.target);
            if (receiver && (fn.sourceParams ?? fn.params)[0] !== owner) fail("target must take " + owner + " as its first parameter");
            if (member.options) {
                const fields = records.get(member.options);
                const first = fn.params.length - fields.size;
                if (first < (receiver ? 1 : 0)) fail("too few parameters for " + member.options);
                let i = first;
                for (const [field, layout] of fields) {
                    if (fn.params[i++] !== layout.type) fail("wrong target type for option " + field);
                }
            }
        }
    }
}

// value record Name { field: type; ... }: a record whose variables are values, not references to memory. Its layout:
// fields (name -> {type, offset, width}, offset and width in leaves), leaves (the scalar type of each leaf, nested
// value records flattened in field order) and paths ("o.x", for parameter names).
function parseValueRecord(lex, name, records, enums, distinct, values) {
    const fields = new Map(), leaves = [], paths = [];
    lex.expect("{");
    while (lex.token.value !== "}") {
        const field = lex.ident();
        if (fields.has(field)) lex.fail("duplicate field " + field + " in " + name);
        lex.expect(":");
        const type = lex.type(records, enums, distinct, values);
        lex.expect(";");
        const nested = values.get(type);
        fields.set(field, {type, offset: leaves.length, width: nested ? nested.leaves.length : 1});
        if (nested) {
            leaves.push(...nested.leaves);
            for (const path of nested.paths) paths.push(field + "." + path);
        } else {
            leaves.push(type);
            paths.push(field);
        }
    }
    lex.next();
    if (!fields.size) lex.fail("empty value record " + name);
    return {fields, leaves, paths};
}

function parseDeclarations(lex, recordEnds) {
    const records = new Map();
    const enums = new Map();
    const distinct = new Set();
    const values = new Map();
    let aliases;
    while (lex.token.value === "record" || lex.token.value === "enum" || lex.token.value === "type" ||
           lex.token.value === "namespace" || lex.token.value === "methods" || lex.token.value === "value") {
        const kind = lex.token.value;
        lex.next();
        if (kind === "value") lex.expect("record");
        const name = lex.ident();
        if (kind === "methods" || kind === "namespace") {
            aliases ??= {namespaces: new Map(), methods: new Map()};
            if (kind === "methods") {
                if (!records.has(name) && !distinct.has(name) && !enums.has(name) && !values.has(name))
                    lex.fail("unknown receiver type " + name);
                parseMembers(lex, aliases.methods, name, records);
            } else {
                if (records.has(name) || enums.has(name) || distinct.has(name) || values.has(name))
                    lex.fail("namespace collides with type " + name);
                parseMembers(lex, aliases.namespaces, name, records);
            }
            continue;
        }
        if (records.has(name) || enums.has(name) || distinct.has(name) || values.has(name) || aliases?.namespaces.has(name))
            lex.fail("duplicate " + kind + " " + name);
        if (kind === "value") {
            values.set(name, parseValueRecord(lex, name, records, enums, distinct, values));
            continue;
        }
        if (kind === "enum") {
            enums.set(name, parseEnum(lex, name));
            continue;
        }
        if (kind === "type") {
            { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
            { if (lex.token.value !== "distinct") lex.fail("expected distinct"); lex.next(); }
            { if (lex.token.value !== "i32") lex.fail("expected i32"); lex.next(); }
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            distinct.add(name);
            continue;
        }
        const fields = new Map();
        { if (lex.token.value !== "{") lex.fail("expected {"); lex.next(); }
        while (lex.token.value !== "}") {
            const field = lex.ident();
            if (fields.has(field)) lex.fail("duplicate field " + field + " in " + name);
            { if (lex.token.value !== ":") lex.fail("expected :"); lex.next(); }
            const type = lex.type(records, enums, distinct);
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            fields.set(field, {type, offset: fields.size * 4});
        }
        recordEnds?.set(name, lex.token.at);
        { if (lex.token.value !== "}") lex.fail("expected }"); lex.next(); }
        records.set(name, fields);
    }
    return {records, enums, distinct, aliases, values};
}

function recordLayouts(records) {
    return Object.fromEntries(Array.from(records, ([name, fields]) => [name, Object.fromEntries(fields)]));
}

function enumLayouts(enums) {
    return Object.fromEntries(Array.from(enums, ([name, members]) => [name, Object.fromEntries(members)]));
}
