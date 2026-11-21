// Injected inside the async compiler closure. All names resolve via its parser.
const BUFFER_METHODS = new Set(["charCodeAt", "setCharCodeAt", "writeLiteral"]);
const NON_RETAINING_IMPORTS = new Map([
    ["typedSdkBuffer", "i32:buffer"],
    ["typedSdkEventText", "i32,buffer,i32,buffer:i32"],
]);

function turnParameter(fn, param) {
    const policy = globalThis.turnExperiment;
    if (!policy || param.ambient || param.type !== "buffer") return false;
    return policy.mode === "inferred" || policy.declarations?.includes(fn.name + "." + param.name);
}

function verifyTurnParameters(program, ordinary) {
    const policy = globalThis.turnExperiment;
    if (!policy) return;
    const targets = [...program.functions.values()].filter(fn =>
        fn.async && fn.params.some(param => turnParameter(fn, param)));
    const proved = new Set();
    const active = new Set();
    const stats = {functions: targets.length, parameters:0, helperSummaries:0, tokens:0, calls:0};
    policy.metrics = stats;
    const diagnostic = (at, message) => fail(program.source, at, "turn buffer: " + message);
    function tokenCost(tokens, at) {
        stats.tokens += tokens.length;
        if (stats.tokens > 200000) diagnostic(at, "inspection budget exceeded");
    }
    function nearSignature(fn) {
        return fn.params.includes("buffer") || fn.result === "buffer";
    }
    function summary(fn, at) {
        if (proved.has(fn)) return;
        if (active.has(fn) || active.size >= 24 || active.size + proved.size >= 128)
            diagnostic(at, "bounded helper proof exceeded at " + fn.name);
        if (fn.result !== "buffer" && !scalar(fn.result, program.types))
            diagnostic(at, "unproved helper result type at " + fn.name);
        active.add(fn);
        let body;
        try {
            const details = {
                ...fn, ordinaryBody:true, waits:[], bindings:[],
                tokens:tokensFrom(program.source, fn.bodyAt, fn.end),
                params:fn.sig.params.map((type, index) => ({type, name:fn.sig.paramNames[index],
                    at:fn.sig.paramAts[index], ambient:false})),
            };
            tokenCost(details.tokens, at);
            body = new AsyncBody(program, details, ordinary).parse();
        } catch (error) {
            diagnostic(at, "unproved helper " + fn.name + " (" + error.message + ")");
        }
        inspect(body);
        active.delete(fn);
        proved.add(fn);
        stats.helperSummaries++;
    }
    function expression(data) {
        if (!data) return;
        const {tokens, refs} = data;
        tokenCost(tokens, tokens[0]?.at ?? 0);
        for (let i = 0; i + 1 < tokens.length; i++) {
            const token = tokens[i];
            if (token.kind !== "id" || tokens[i + 1].value !== "(") continue;
            if (tokens[i - 1]?.value === ".") {
                const receiver = refs.get(tokens[i - 2]?.at);
                if (receiver?.type === "buffer" && !BUFFER_METHODS.has(token.value))
                    diagnostic(token.at, "unproved buffer method " + token.value);
                continue;
            }
            const sdk = program.imports.get(token.value);
            if (sdk && nearSignature(sdk)) {
                stats.calls++;
                const signature = sdk.params.join(",") + ":" + sdk.result;
                if (NON_RETAINING_IMPORTS.get(sdk.name) !== signature)
                    diagnostic(token.at, "unproved reference import " + sdk.name);
                continue;
            }
            const callee = program.functions.get(token.value);
            if (callee && !callee.async) {
                stats.calls++;
                summary(callee, token.at);
            }
        }
    }
    function argumentsOf(tokens) {
        const segments = [[]];
        let depth = 0;
        for (const token of tokens) {
            if (!depth && token.value === ",") { segments.push([]); continue; }
            if (token.value === "(") depth++;
            if (token.value === ")") depth--;
            segments.at(-1).push(token);
        }
        return segments;
    }
    function inspect(nodes) {
        for (const node of nodes) {
            expression(node.data);
            expression(node.cond);
            expression(node.value);
            if (node.kind === "simple" && !node.def &&
                node.data.tokens[1]?.value === "." && node.data.tokens[3]?.value === "=" &&
                [...node.data.refs.values()].some(binding => binding.type === "buffer"))
                diagnostic(node.at, "unproved retained store");
            if (node.kind === "await") {
                expression(node.args);
                if (node.callee) {
                    const segments = argumentsOf(node.args.tokens);
                    node.callee.params.forEach((param, index) => {
                        if (param.type !== "buffer" || turnParameter(node.callee, param)) return;
                        const args = segments[index];
                        const ref = args?.length === 1 && node.args.refs.get(args[0].at);
                        if (!param.ambient || !ref?.ambient || ref.name !== param.name)
                            diagnostic(node.at, "unproved async buffer target " + param.name);
                    });
                } else {
                    const sdk = program.imports.get(node.name);
                    if (sdk && nearSignature(sdk))
                        diagnostic(node.at, "unproved awaitable reference import " + sdk.name);
                }
            }
            if (node.init) inspect([node.init]);
            if (node.step) inspect([node.step]);
            if (node.body) inspect(node.body);
            if (node.yes) inspect(node.yes);
            if (node.no) inspect(node.no);
            for (const arm of node.arms ?? []) inspect(arm.body);
        }
    }
    for (const fn of targets) {
        stats.parameters += fn.params.filter(param => turnParameter(fn, param)).length;
        inspect(fn.body);
    }
}
