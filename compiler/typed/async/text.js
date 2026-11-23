// The lowered program as chunks: copied ranges of the original source and generated text, each with the original
// position diagnostics report (originalAt); and the text helpers of the generated functions.
class GeneratedText {
    constructor(source) {
        this.original = source;
        this.chunks = [];
        this.offset = 0;
    }

    add(text, at, copied = false) {
        if (!text) return;
        this.chunks.push({text, at, offset: this.offset, copied, length: text.length});
        this.offset += text.length;
    }

    line(text, at) { this.add(text + "\n", at); }

    copy(from, to) {
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
    }

    // The original source position of an offset in the lowered program: within a copied chunk the same character,
    // within generated text the statement the chunk was generated for.
    originalAt(offset) {
        let low = 0, high = this.chunks.length;
        while (low + 1 < high) {
            const mid = (low + high) >>> 1;
            if (this.chunks[mid].offset <= offset) low = mid;
            else high = mid;
        }
        const chunk = this.chunks[low];
        return chunk.at + (chunk.copied ? offset - chunk.offset : 0);
    }

    result(prefix, layout) {
        let whole;
        const writer = this;
        return {get source() { return whole ??= writer.range(0, writer.offset); }, layout, prefix,
            originalAt: offset => writer.originalAt(offset)};
    }
}

function render(program, data) {
    const {tokens, refs} = data;
    if (!tokens.length) return "";
    const parts = [];
    let at = tokens[0].at;
    for (const token of tokens) {
        const binding = refs.get(token.at);
        if (!binding?.alias) continue;
        parts.push(program.source.slice(at, token.at), binding.alias);
        at = token.end;
    }
    parts.push(program.source.slice(at, tokens.at(-1).end));
    return parts.join("");
}

const stateField = (frame, kind) => "state." + frame.base + kind;
const call = (name, args) => name + "(" + args.join(", ") + ")";
const formal = ({name, type}) => name + ": " + type;
const signature = (name, params, result) => "function " + name + "(" + params.map(formal).join(", ") + "): " + result + " {";

function encode(value, type) {
    if (type === "i32") return value;
    return "i32(" + value + ")";
}

function decode(program, value, type) {
    if (type === "i32") return value;
    if (type === "bool") return value + " === 1";
    return call(program.prefix + "word_" + type, [value]);
}
