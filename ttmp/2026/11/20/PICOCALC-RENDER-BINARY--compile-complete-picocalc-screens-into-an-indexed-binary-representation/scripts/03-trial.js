// Shared measurements. Loaded after the codec and the production painter.
function screenPayload(row) {
    return {app: row.app, title: row.title, frame: {tree: row.tree, hints: row.hints || ''}};
}

function jsonBytes(text) {
    let n = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c < 128) n++;
        else if (c < 2048) n += 2;
        else if (c >= 0xd800 && c <= 0xdbff && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
            n += 4;
            i++;
        } else n += 3;
    }
    return n;
}

function checkScreenEnvelope(get, root, sender) {
    const app = get(root, 'app');
    const frame = get(root, 'frame');
    if (app !== sender || typeof get(root, 'title') !== 'string' || typeof get(frame, 'hints') !== 'string') throw Error('screen-envelope');
    const tree = get(frame, 'tree');
    if (tree === null || typeof tree !== 'object' || Array.isArray(tree)) throw Error('screen-tree');
    return tree;
}

const getProperty = (object, field) => object != null ? object[field] : undefined;
function admitJSON(text, sender) {
    if (text.length > binaryScreen.limits.bytes || jsonBytes(text) > binaryScreen.limits.bytes) throw Error('byte-cap');
    const root = JSON.parse(text);
    binaryScreen.checkValue(root);
    checkScreenEnvelope(getProperty, root, sender);
    return root;
}

function parseProductionJSON(text, sender) {
    const root = JSON.parse(text);
    checkScreenEnvelope(getProperty, root, sender);
    return root;
}

function createBinaryView(bytes, sender) {
    const indexed = binaryScreen.admit(bytes);
    const root = indexed.view();
    checkScreenEnvelope(getProperty, root, sender);
    return {root, indexed};
}

function atPath(value, path) {
    for (const part of path) value = value[part];
    return value;
}

function textWeight(value) {
    let sum = 0;
    for (let i = 0; i < value.length; i++) sum = (Math.imul(sum, 33) ^ value.charCodeAt(i)) | 0;
    return sum;
}
function scalarWeight(value) {
    if (typeof value === 'string') return (textWeight(value) + 41) | 0;
    if (typeof value === 'number') return (textWeight(String(value)) + 89) | 0;
    return value === null ? 151 : value === true ? 17 : value === false ? 31 : 199;
}
function fullWeight(value) {
    if (value === null || typeof value !== 'object') return scalarWeight(value);
    let result = 0;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) result = (result + Math.imul(i + 11, fullWeight(value[i]))) | 0;
        return (result + value.length + 3) | 0;
    }
    for (const key of Object.keys(value)) result = (result + Math.imul(textWeight(key) + 65537, fullWeight(value[key]))) | 0;
    return (result + 907) | 0;
}

const REPEATED_LOOKUPS = 32;
const REPEATED_PAINTS = 2;
function commandSink() {
    let hash = 0, commands = 0;
    function collect(kind, a, b, c, d, e, f) {
        commands++;
        hash = Math.imul(hash, 31) + kind | 0;
        hash = Math.imul(hash, 31) + scalarWeight(a) | 0;
        hash = Math.imul(hash, 31) + scalarWeight(b) | 0;
        hash = Math.imul(hash, 31) + scalarWeight(c) | 0;
        hash = Math.imul(hash, 31) + scalarWeight(d) | 0;
        hash = Math.imul(hash, 31) + scalarWeight(e) | 0;
        hash = Math.imul(hash, 31) + scalarWeight(f) | 0;
    }
    const fb = {
        fill: (a, b, c, d, e) => collect(1, a, b, c, d, e),
        line: (a, b, c, d, e) => collect(2, a, b, c, d, e),
        rect: (a, b, c, d, e) => collect(3, a, b, c, d, e),
        text: (a, b, c, d, e, f) => collect(4, a, b, c, d, e, f)
    };
    return {fb, result: () => ({hash, commands})};
}
function paintScreen(payload, fixture, fb) {
    const app = payload.app;
    const frame = payload.frame;
    paint({apps: {[app]: {tree: frame.tree, hints: frame.hints, title: payload.title}}, focus: app,
        battery: fixture.battery, banner: fixture.banner, crashed: {}, fb});
}

function renderLabRun(arm, reps) {
    const split = arm.lastIndexOf('-');
    const sender = arm.slice(0, split), variant = arm.slice(split + 1);
    const fixture = binaryFixtures[sender];
    if (!fixture || !['B', 'G', 'P'].includes(variant) || !Number.isInteger(reps) || reps < 1 || reps > 64) throw Error('binary-arm');
    const binary = variant === 'B';
    const stages = {encodeUs: 0, admitUs: 0, lookupUs: 0, repeatLookupUs: 0, walkUs: 0, paintUs: 0, repeatPaintUs: 0};
    let bytes, lookupHash, repeatLookupHash, walkHash, paintHash, paintCommands, repeatPaintHash, repeatPaintCommands;
    let n = 0;
    const start = labMicros();
    for (; n < reps; n++) {
        const a = labMicros();
        const wire = binary ? binaryScreen.encode(fixture.payload) : JSON.stringify(fixture.payload);
        const b = labMicros();
        const result = binary ? createBinaryView(wire, sender) : {root: variant === 'G' ? admitJSON(wire, sender) : parseProductionJSON(wire, sender)};
        const c = labMicros();
        lookupHash = scalarWeight(binary ? result.indexed.path(fixture.path) : atPath(result.root, fixture.path));
        const d = labMicros();
        repeatLookupHash = 0;
        for (let repeat = 0; repeat < REPEATED_LOOKUPS; repeat++) {
            const path = repeat & 1 ? fixture.path : fixture.firstPath;
            const value = binary ? result.indexed.path(path) : atPath(result.root, path);
            repeatLookupHash = (repeatLookupHash + scalarWeight(value)) | 0;
        }
        const e = labMicros();
        walkHash = fullWeight(result.root);
        const f = labMicros();
        const sink = commandSink();
        paintScreen(result.root, fixture, sink.fb);
        ({hash: paintHash, commands: paintCommands} = sink.result());
        const g = labMicros();
        const repeatSink = commandSink();
        for (let repeat = 0; repeat < REPEATED_PAINTS; repeat++) paintScreen(result.root, fixture, repeatSink.fb);
        ({hash: repeatPaintHash, commands: repeatPaintCommands} = repeatSink.result());
        const h = labMicros();
        bytes = binary ? wire.length : jsonBytes(wire);
        stages.encodeUs += b - a;
        stages.admitUs += c - b;
        stages.lookupUs += d - c;
        stages.repeatLookupUs += e - d;
        stages.walkUs += f - e;
        stages.paintUs += g - f;
        stages.repeatPaintUs += h - g;
        if (h - start > 850000) { n++; break; }
    }
    return JSON.stringify({bytes, ...stages, lookupHash, repeatLookupHash, walkHash, paintHash, paintCommands,
        repeatPaintHash, repeatPaintCommands, reps: n, requested: reps, fixture: fixture.id});
}
