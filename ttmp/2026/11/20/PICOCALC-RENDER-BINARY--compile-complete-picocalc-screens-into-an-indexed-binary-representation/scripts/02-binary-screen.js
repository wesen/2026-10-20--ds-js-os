// Indexed screen format research prototype. No application table or TextEncoder dependency.
const binaryScreen = (() => {
    const limits = Object.freeze({bytes: 32768, depth: 24, values: 8192, array: 1024, fields: 64,
        strings: 4096, stringBytes: 2048});
    const reject = code => { throw Error(code); };
    const TAG = Object.freeze({null: 0, false: 1, true: 2, int: 3, float: 4, string: 5, array: 6, object: 7});

    function emitUTF8(text, emit) {
        for (let i = 0; i < text.length; i++) {
            let c = text.charCodeAt(i);
            if (c < 128) emit(c);
            else if (c < 2048) {
                emit(0xc0 | (c >> 6));
                emit(0x80 | (c & 63));
            } else if (c >= 0xd800 && c <= 0xdfff) {
                const lower = text.charCodeAt(++i);
                if (c > 0xdbff || !(lower >= 0xdc00 && lower <= 0xdfff)) reject('utf8');
                c = 0x10000 + (c - 0xd800) * 1024 + lower - 0xdc00;
                emit(0xf0 | (c >> 18));
                emit(0x80 | ((c >> 12) & 63));
                emit(0x80 | ((c >> 6) & 63));
                emit(0x80 | (c & 63));
            } else {
                emit(0xe0 | (c >> 12));
                emit(0x80 | ((c >> 6) & 63));
                emit(0x80 | (c & 63));
            }
        }
    }
    function utf8String(bytes, start, end, decode) {
        let text = '';
        while (start < end) {
            const first = bytes[start++];
            let code = first;
            if (first >= 128) {
                let extras, min;
                if (first >= 0xc2 && first < 0xe0) { extras = 1; min = 0x80; code = first & 31; }
                else if (first >= 0xe0 && first < 0xf0) { extras = 2; min = 0x800; code = first & 15; }
                else if (first >= 0xf0 && first <= 0xf4) { extras = 3; min = 0x10000; code = first & 7; }
                else reject('utf8');
                if (start + extras > end) reject('utf8');
                for (; extras; extras--) {
                    const cont = bytes[start++];
                    if ((cont & 0xc0) !== 0x80) reject('utf8');
                    code = (code << 6) | (cont & 63);
                }
                if (code < min || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) reject('utf8');
            }
            if (decode) text += String.fromCodePoint(code);
        }
        return text;
    }
    function compareBytes(a, aStart, aEnd, b, bStart, bEnd) {
        while (aStart < aEnd && bStart < bEnd) {
            const diff = a[aStart++] - b[bStart++];
            if (diff) return diff;
        }
        return (aEnd - aStart) - (bEnd - bStart);
    }
    function smallInt(value) {
        return Number.isInteger(value) && value >= -524288 && value <= 524287;
    }
    function checkValue(value, forEncoding = false) {
        const strings = new Map();
        let values = 0, body = 0, wire = 15;
        function charge(bytes) {
            wire += bytes;
            if (forEncoding && wire > limits.bytes) reject('byte-cap');
        }
        function string(value) {
            if (value.length > limits.stringBytes) reject('string-cap');
            if (strings.has(value)) return;
            if (strings.size === limits.strings) reject('strings-cap');
            const bytes = [];
            let size = 0;
            emitUTF8(value, byte => { size++; if (forEncoding) bytes.push(byte); });
            if (size > limits.stringBytes) reject('string-cap');
            charge(2 + size);
            strings.set(value, bytes);
        }
        function visit(value, depth) {
            if (++values > limits.values || depth > limits.depth) reject('tree-cap');
            if (value === null || typeof value === 'boolean') return;
            if (typeof value === 'string') { string(value); return; }
            if (typeof value === 'number') {
                if (!Number.isFinite(value)) reject('number');
                if (!smallInt(value)) { body += 8; charge(8); }
                return;
            }
            if (Array.isArray(value)) {
                if (value.length > limits.array) reject('array-cap');
                body += 2 + 3 * value.length;
                charge(2 + 3 * value.length);
                for (let i = 0; i < value.length; i++) visit(value[i], depth + 1);
                return;
            }
            if (typeof value !== 'object') reject('value-type');
            const keys = Object.keys(value);
            if (keys.length > limits.fields) reject('field-cap');
            body += 2 + 5 * keys.length;
            charge(2 + 5 * keys.length);
            for (const key of keys) {
                string(key);
                visit(value[key], depth + 1);
            }
        }
        visit(value, 0);
        return {body, strings};
    }


    // Header: "PSIX", version byte, flags byte, byte count, string count, root reference.
    // String directory: N+1 absolute starts. A string's end is the next start.
    // Body: preorder records. Array slots and map values each occupy three bytes.
    const HEADER = 13;
    const ROOT = 10;
    const PAYLOAD = 0xfffff;
    const u24 = (bytes, at) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);

    function encode(value) {
        const {body, strings} = checkValue(value, true);
        const directory = [...strings].sort(([, a], [, b]) => compareBytes(a, 0, a.length, b, 0, b.length));
        let total = HEADER + 2 * (directory.length + 1) + body;
        for (const [, bytes] of directory) total += bytes.length;
        if (total > limits.bytes) reject('byte-cap');
        const bytes = new Uint8Array(total);
        const data = new DataView(bytes.buffer);
        const strIds = new Map();
        const put16 = (at, value) => { data.setUint16(at, value, true); };
        const putRef = (at, tag, payload = 0) => {
            bytes[at] = payload;
            bytes[at + 1] = payload >>> 8;
            bytes[at + 2] = (tag << 4) | (payload >>> 16);
        };
        bytes.set([80, 83, 73, 88, 1, 0]);
        put16(6, total);
        put16(8, directory.length);
        let cursor = HEADER + 2 * (directory.length + 1);
        for (let i = 0; i < directory.length; i++) {
            const [s, utf8] = directory[i];
            strIds.set(s, i);
            put16(HEADER + 2 * i, cursor);
            bytes.set(utf8, cursor);
            cursor += utf8.length;
        }
        put16(HEADER + 2 * directory.length, cursor);
        function write(at, value) {
            if (value === null) putRef(at, TAG.null);
            else if (typeof value === 'boolean') putRef(at, value ? TAG.true : TAG.false);
            else if (typeof value === 'string') putRef(at, TAG.string, strIds.get(value));
            else if (typeof value === 'number') {
                if (smallInt(value)) putRef(at, TAG.int, value & PAYLOAD);
                else {
                    putRef(at, TAG.float, cursor);
                    data.setFloat64(cursor, value, true);
                    cursor += 8;
                }
            } else {
                const start = cursor;
                const array = Array.isArray(value);
                const keys = array ? null : Object.keys(value).sort((a, b) => strIds.get(a) - strIds.get(b));
                const count = array ? value.length : keys.length;
                putRef(at, array ? TAG.array : TAG.object, start);
                put16(start, count);
                cursor += 2 + count * (array ? 3 : 5);
                for (let i = 0; i < count; i++) {
                    if (array) write(start + 2 + i * 3, value[i]);
                    else {
                        const key = keys[i], slot = start + 2 + 5 * i;
                        put16(slot, strIds.get(key));
                        write(slot + 2, value[key]);
                    }
                }
            }
        }
        write(ROOT, value);
        return bytes;
    }

    function admit(input) {
        if (!(input instanceof Uint8Array)) reject('wire-type');
        if (input.length > limits.bytes) reject('byte-cap');
        if (input.length < HEADER + 2) reject('header');
        const bytes = new Uint8Array(input);
        const data = new DataView(bytes.buffer);
        const get16 = at => data.getUint16(at, true);
        const getRef = at => u24(bytes, at);
        const strStart = id => get16(HEADER + 2 * id);
        const count = get16(8);
        if (data.getUint32(0, false) !== 0x50534958 || bytes[4] !== 1 || bytes[5] !== 0 || get16(6) !== bytes.length) reject('header');
        if (count > limits.strings || HEADER + (count + 1) * 2 > bytes.length) reject('strings-cap');
        if (strStart(0) !== HEADER + (count + 1) * 2) reject('string-directory');
        for (let i = 0; i < count; i++) {
            const from = strStart(i), to = strStart(i + 1);
            if (from > to || to > bytes.length || to - from > limits.stringBytes) reject('string-directory');
            if (i && compareBytes(bytes, strStart(i - 1), from, bytes, from, to) >= 0) reject('string-order');
            utf8String(bytes, from, to, false);
        }
        let cursor = strStart(count), values = 0;
        function validate(ref, depth) {
            if (++values > limits.values || depth > limits.depth) reject('tree-cap');
            const tag = ref >>> 20, arg = ref & PAYLOAD;
            if (tag <= TAG.true) {
                if (arg) reject('immediate');
            } else if (tag === TAG.int) {
                return;
            } else if (tag === TAG.string) {
                if (arg >= count) reject('string-id');
            } else if (tag === TAG.float) {
                if (arg !== cursor || arg + 8 > bytes.length) reject('float-offset');
                const value = data.getFloat64(arg, true);
                if (!Number.isFinite(value) || smallInt(value)) reject('number');
                cursor += 8;
            } else if (tag === TAG.array || tag === TAG.object) {
                if (arg !== cursor || arg + 2 > bytes.length) reject('node-offset');
                const array = tag === TAG.array, size = get16(arg), step = array ? 3 : 5;
                if (size > (array ? limits.array : limits.fields)) reject(array ? 'array-cap' : 'field-cap');
                cursor += 2 + size * step;
                if (cursor > bytes.length) reject('node-size');
                let pastKey = -1;
                for (let i = 0; i < size; i++) {
                    const slot = arg + 2 + i * step;
                    if (!array) {
                        const id = get16(slot);
                        if (id <= pastKey || id >= count) reject('field-order');
                        pastKey = id;
                    }
                    validate(getRef(slot + (array ? 0 : 2)), depth + 1);
                }
            } else reject('tag');
        }
        const root = getRef(ROOT);
        validate(root, 0);
        if (cursor !== bytes.length) reject('trailing');

        const readString = id => utf8String(bytes, strStart(id), strStart(id + 1), true);
        function field(ref, key) {
            if ((ref >>> 20) !== TAG.object || typeof key !== 'string' || key.length > limits.stringBytes) return undefined;
            const start = ref & PAYLOAD;
            let lo = 0, hi = get16(start) - 1;
            let nonASCII = false;
            for (let i = 0; i < key.length; i++) if (key.charCodeAt(i) > 127) { nonASCII = true; break; }
            const utf8 = nonASCII ? [] : null;
            if (utf8) {
                try { emitUTF8(key, byte => utf8.push(byte)); }
                catch (e) { return undefined; }
            }
            while (lo <= hi) {
                const mid = (lo + hi) >> 1, slot = start + 2 + 5 * mid;
                const id = get16(slot), from = strStart(id), to = strStart(id + 1);
                let cmp = 0;
                if (utf8) cmp = compareBytes(utf8, 0, utf8.length, bytes, from, to);
                else {
                    const size = to - from, common = Math.min(size, key.length);
                    for (let i = 0; i < common; i++) {
                        cmp = key.charCodeAt(i) - bytes[from + i];
                        if (cmp) break;
                    }
                    if (!cmp) cmp = key.length - size;
                }
                if (!cmp) return getRef(slot + 2);
                if (cmp < 0) hi = mid - 1;
                else lo = mid + 1;
            }
        }
        function index(ref, i) {
            if ((ref >>> 20) !== TAG.array || !Number.isInteger(i) || i < 0) return undefined;
            const start = ref & PAYLOAD;
            if (i < get16(start)) return getRef(start + 2 + i * 3);
        }
        function scalar(ref) {
            if (ref === undefined) return undefined;
            const tag = ref >>> 20, arg = ref & PAYLOAD;
            if (tag === TAG.null) return null;
            if (tag === TAG.false) return false;
            if (tag === TAG.true) return true;
            if (tag === TAG.int) return (arg << 12) >> 12;
            if (tag === TAG.float) return data.getFloat64(arg, true);
            if (tag === TAG.string) return readString(arg);
            return view(ref);
        }
        function path(parts) {
            let ref = root;
            for (const p of parts) {
                if (ref === undefined) return undefined;
                ref = typeof p === 'number' ? index(ref, p) : field(ref, p);
            }
            return scalar(ref);
        }
        function view(ref) {
            const tag = ref >>> 20, start = ref & PAYLOAD;
            if (tag !== TAG.object && tag !== TAG.array) return scalar(ref);
            const array = tag === TAG.array, size = get16(start), target = array ? new Array(size) : {};
            function resolve(key) {
                if (typeof key !== 'string') return undefined;
                if (!array) return field(ref, key);
                const pos = Number(key);
                if (String(pos) === key) return index(ref, pos);
            }
            function keys() {
                const names = new Array(size + (array ? 1 : 0));
                for (let i = 0; i < size; i++) names[i] = array ? String(i) : readString(get16(start + 2 + i * 5));
                if (array) names[size] = 'length';
                return names;
            }
            return new Proxy(target, {
                get(target, key, receiver) {
                    const slot = resolve(key);
                    return slot === undefined ? Reflect.get(target, key, receiver) : scalar(slot);
                },
                has(target, key) { return resolve(key) !== undefined || Reflect.has(target, key); },
                ownKeys: keys,
                getOwnPropertyDescriptor(target, key) {
                    const slot = resolve(key);
                    if (slot === undefined) return Reflect.getOwnPropertyDescriptor(target, key);
                    return {value: scalar(slot), configurable: true, enumerable: true, writable: false};
                },
                set: () => false, deleteProperty: () => false, defineProperty: () => false,
                setPrototypeOf: () => false, preventExtensions: () => false
            });
        }
        return Object.freeze({path, view: () => view(root)});
    }
    return Object.freeze({encode, admit, limits, checkValue, version: 1});
})();
