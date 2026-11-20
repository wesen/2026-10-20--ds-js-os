#!/usr/bin/env python3
"""Stage ordinary signature and source-span experiments without changing shipping files."""

import argparse
import importlib.util
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SNAPSHOT = "2e4fee1"
sys.dont_write_bytecode = True


def load_stage_helpers():
    spec = importlib.util.spec_from_file_location("signature_stage", HERE / "05-signature-reuse-experiment.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def change(source, before, after):
    if source.count(before) != 1:
        raise ValueError("expected one compiler anchor: " + before[:100])
    return source.replace(before, after, 1)


def alter(path, transform):
    path.write_text(transform(path.read_text()))


def reuse_signatures(source):
    return change(source,
        "    const functions = scanSignatures(lex, records, declared, functionBase, enums, distinct);",
        """    const functions = lowered?.ordinarySignatures ?? [];
    for (const [ordinal, signature] of functions.entries()) {
        signature.index = functionBase + ordinal;
        declared.set(signature.name, signature);
    }
    if (lowered) {
        lex.offset = lowered.generatedAt;
        lex.next();
    }
    for (const signature of scanSignatures(lex, records, declared,
        functionBase + functions.length, enums, distinct)) functions.push(signature);""")


def reuse_rewrite_at_snapshot(source, helper):
    source = change(source,
        "    return {...writer.result(program.prefix, allocation.layout), startFields};",
        "    return writer.result(program.prefix, allocation.layout);")
    return change(helper(source),
        "ordinarySignatures, generatedAt};", "ordinarySignatures, generatedAt, startFields};")


def span_rewrite(source, helper):
    source = reuse_rewrite_at_snapshot(source, helper)
    source = change(source,
        '''        this.chunks.push({text, at, offset: this.offset, copied});''',
        '''        this.chunks.push({text, at, offset: this.offset, copied, length: text.length});''')
    source = change(source,
        '''    copy(from, to) { this.add(this.original.slice(from, to), from, true); }''',
        '''    copy(from, to) {
        if (from >= to) return;
        this.chunks.push({at: from, offset: this.offset, copied: true, length: to - from});
        this.offset += to - from;
    }

    range(from, to) {
        const parts = [];
        for (const chunk of this.chunks) {
            const first = Math.max(from, chunk.offset);
            const last = Math.min(to, chunk.offset + chunk.length);
            if (last <= first) continue;
            const begin = first - chunk.offset;
            const end = last - chunk.offset;
            parts.push(chunk.copied ? this.original.slice(chunk.at + begin, chunk.at + end) : chunk.text.slice(begin, end));
        }
        return parts.join("");
    }''')
    source = change(source,
        '''        const source = this.chunks.map(chunk => chunk.text).join("");
        const remap = error => {''',
        '''        let whole;
        const materialize = () => whole ??= this.range(0, this.offset);
        const remap = error => {
            const source = materialize();''')
    source = change(source,
        "        return {source, layout, prefix, remap};",
        "        return {get source() { return materialize(); }, layout, prefix, remap};")
    source = change(source,
        "    const ordinarySignatures = [];",
        "    const ordinarySignatures = [], bodies = [];")
    source = change(source,
        "        ordinarySignatures.push({name, params, paramNames, result, bodyAt: writer.offset + fn.bodyAt - at});",
        """        const outputAt = writer.offset + fn.bodyAt - at;
        ordinarySignatures.push({name, params, paramNames, result, bodyAt: outputAt});""")
    source = change(source,
        '''            at = op.end;
        }
    }
    writer.copy(at, source.length);''',
        '''            at = op.end;
        }
        bodies.push(fn.replacements.length ? {from: outputAt, to: writer.offset + fn.end - at}
            : {originalAt: fn.bodyAt});
    }
    writer.copy(at, source.length);''')
    return change(source,
        "    return {...writer.result(program.prefix, allocation.layout), ordinarySignatures, generatedAt, startFields};",
        """    const lowered = writer.result(program.prefix, allocation.layout);
    Object.assign(lowered, {startFields, ordinarySignatures, generatedAt});
    lowered.plan = {
        original: source, declarations: program.types, fields,
        bodies: bodies.map(body => body.originalAt === undefined
            ? {text: writer.range(body.from, body.to), at: 0} : {at: body.originalAt}),
        generated: writer.range(generatedAt, writer.offset),
    };
    return lowered;""")


def span_frontend(source):
    source = change(source,
        """        const program = emitFunctions(lowered?.source ?? source, functionBase, imported,
            numericOperands, onFunction, onSignatures, lowered);""",
        """        const program = lowered
            ? emitSpanFunctions(lowered, functionBase, imported, numericOperands, onFunction, onSignatures)
            : emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures);""")
    source = change(source,
        """    } catch (error) {
        throw lowered?.remap(error) ?? error;
    }
}

function emitFunctions""",
        """    } catch (error) {
        if (!lowered || !(error instanceof SyntaxError)) throw error;
        // The ordinary checker replays the canonical source for diagnostic order
        // and mapping. It never replays a backend callback.
        try {
            emitFunctions(lowered.source, functionBase, imported, numericOperands, undefined, undefined, lowered);
        } catch (canonical) {
            throw lowered.remap(canonical);
        }
        throw new Error("span emitter rejected the canonical program", {cause: error});
    }
}

function configureGeneratedLexer(lex, lowered) {
    const generatedPrefix = lowered.prefix;
    lex.isGeneratedLocal = name => name.startsWith(generatedPrefix + "local_");
    lex.generatedWordType = name => name.startsWith(generatedPrefix + "word_")
        ? name.slice(generatedPrefix.length + "word_".length) : null;
    lex.generatedStartFields = lowered.startFields;
    return lex;
}

function emitSpanFunctions(lowered, functionBase, imported, numericOperands, onFunction, onSignatures) {
    const Emitter = numericOperands ? NumericFunctionEmitter : FunctionEmitter;
    const {original, declarations, fields, bodies, generated} = lowered.plan;
    const {enums, distinct} = declarations;
    const records = new Map(declarations.records);
    if (fields.length) {
        const state = new Map(records.get("WorldState"));
        for (const {name, type} of fields) state.set(name, {type, offset: state.size * 4});
        records.set("WorldState", state);
    }
    const declared = new Map(imported.map(fn => [fn.name, fn]));
    for (const name of distinct)
        if (declared.has(name)) throw new SyntaxError("duplicate imported function " + name);

    const functions = lowered.ordinarySignatures.slice();
    for (const [ordinal, fn] of functions.entries()) {
        fn.index = functionBase + ordinal;
        declared.set(fn.name, fn);
    }
    const originalLex = configureGeneratedLexer(new Lexer(original, 0, original.length, true), lowered);
    const generatedLex = configureGeneratedLexer(new Lexer(generated, 0, generated.length, true), lowered);
    const ordinaryCount = functions.length;
    for (const fn of scanSignatures(generatedLex, records, declared, functionBase + ordinaryCount, enums, distinct)) {
        fn.bodyAt += lowered.generatedAt;
        functions.push(fn);
    }
    if (!functions.length) throw new SyntaxError("expected a function");
    if (onSignatures) onSignatures(functions);
    const edges = functions.map(() => []);
    for (const [i, fn] of functions.entries()) {
        const virtualAt = fn.bodyAt;
        let lex = originalLex;
        if (i >= ordinaryCount) {
            lex = generatedLex;
            fn.bodyAt -= lowered.generatedAt;
        } else {
            const body = bodies[i];
            if (body.text !== undefined) lex = configureGeneratedLexer(new Lexer(body.text, 0, body.text.length, true), lowered);
            fn.bodyAt = body.at;
        }
        try {
            new Emitter(lex, declared, records, edges[i], functionBase, enums, distinct).function(fn);
        } finally {
            fn.bodyAt = virtualAt;
        }
        if (onFunction) onFunction(fn);
    }
    return {functions, records, enums, distinct, edges, order: checkAcyclic(functions, edges)};
}

function emitFunctions""")
    # Keep the canonical error path on the stock full-text checker.
    return source


def indexed_span_frontend(source):
    # Reuse the same span emitter code with a different scoped caller.
    unindexed = span_frontend(load_stage_helpers().git_text(SNAPSHOT, Path("picocalc-os/compiler/typed-wasm.js")))
    emitter = unindexed[unindexed.index("function configureGeneratedLexer"):unindexed.index("function emitFunctions(")]
    begin = source.index("        // The rewrite retains original source for diagnostics")
    end = source.index("    });", begin)
    caller = '''        try {
            const program = lowered
                ? emitSpanFunctions(lowered, functionBase, imported, numericOperands, onFunction, onSignatures)
                : emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures);
            if (lowered) {
                program.asyncLayout = lowered.layout;
                if (options?.asyncSource) program.asyncSource = lowered.source;
            }
            return program;
        } catch (error) {
            if (!lowered || !(error instanceof SyntaxError)) throw error;
            lexicalScope?.sources.clear();
            try {
                emitFunctions(lowered.source, functionBase, imported, numericOperands, undefined, undefined, lowered);
            } catch (canonical) {
                throw lowered.remap(canonical);
            }
            throw new Error("span emitter rejected the canonical program", {cause: error});
        }
'''
    source = source[:begin] + caller + source[end:]
    return change(source, "function emitFunctions(", emitter + "function emitFunctions(")


def apply_spans(directory, helper):
    alter(directory / "typed-async.js", lambda s: span_rewrite(s, helper.reuse_rewrite))
    alter(directory / "typed-wasm.js", lambda s: indexed_span_frontend(s)
          if "function withLexIndices(" in s else span_frontend(s))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--revision", default=SNAPSHOT)
    parser.add_argument("--apply-existing", action="store_true", help="apply spans to an already staged compiler")
    args = parser.parse_args()
    helper = load_stage_helpers()
    if args.apply_existing:
        apply_spans(args.work, helper)
        return
    args.work.mkdir(parents=True, exist_ok=True)
    for lane in ("stock", "headers", "spans"):
        directory = args.work / lane
        if directory.exists():
            raise ValueError(f"lane already exists: {directory}")
        helper.stage(args.work, lane, args.revision, True)
        if lane == "headers":
            alter(directory / "typed-async.js", lambda s: reuse_rewrite_at_snapshot(s, helper.reuse_rewrite))
            alter(directory / "typed-wasm.js", reuse_signatures)
        if lane == "spans":
            apply_spans(directory, helper)
        print(directory)
    if args.revision == SNAPSHOT:
        subprocess.run(["git", "rev-parse", args.revision], check=True)


if __name__ == "__main__":
    main()
