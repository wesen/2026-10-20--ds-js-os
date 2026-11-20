// Host research prototype for inert, JSON-materialized screen payloads.
const observedPSIX = (() => {
    const {smallInt, emitUTF8, compareBytes} = binaryScreen.experiment;
    const {limits} = binaryScreen;
    const HEADER = 13;
    const TAG = {nil: 0, bool: 1, int: 3, float: 4, string: 5, array: 6, object: 7};
    const bounds = Object.freeze({entries: 8, bytes: 96 * 1024, planBytes: 48 * 1024, probes: 4});
    const budget = Symbol('PSIX candidate budget');

    function kind(value) {
        if (value === null) return TAG.nil;
        switch (typeof value) {
        case 'boolean': return TAG.bool;
        case 'number': return smallInt(value) ? TAG.int : TAG.float;
        case 'string': return TAG.string;
        case 'object': return Array.isArray(value) ? TAG.array : TAG.object;
        default: return -1;
        }
    }

    function route(value) {
        const kids = value?.frame?.tree?.kids;
        return Array.isArray(kids) ? kids.length : -1;
    }

    function utf8(value) {
        if (value.length > limits.stringBytes) throw budget;
        const bytes = [];
        try { emitUTF8(value, byte => bytes.push(byte)); }
        catch (error) {
            if (error.message !== 'utf8') throw error;
            throw budget;
        }
        if (bytes.length > limits.stringBytes) throw budget;
        return Uint8Array.from(bytes);
    }

    // Record shape, keys and relative byte offsets in an integer program.
    // Neither frame references nor scalar contents survive compilation.
    function compile(value, maxBytes) {
        const ints = [];
        const names = [];
        const keyIds = new Map();
        let cursor = 0, charge = 64, records = 0;

        function reserve(bytes) {
            charge += bytes;
            if (charge > maxBytes) throw budget;
        }
        function keyId(key) {
            const previous = keyIds.get(key);
            if (previous !== undefined) return previous;
            if (names.length === limits.strings) throw budget;
            const bytes = utf8(key);
            reserve(24 + 2 * key.length + bytes.length);
            const index = names.length;
            names.push({key, bytes});
            keyIds.set(key, index);
            return index;
        }
        function walk(value, ref, depth) {
            const tag = kind(value);
            if (++records > limits.values || depth > limits.depth || tag < 0) throw budget;
            const at = ints.length;
            reserve(16);
            ints.push(tag, ref, cursor, 0);
            if (tag === TAG.float) cursor += 8;
            if (tag === TAG.array) {
                const count = value.length, start = cursor;
                if (count > limits.array) throw budget;
                ints[at + 3] = count;
                cursor += 2 + 3 * count;
                for (let i = 0; i < count; i++) walk(value[i], start + 2 + 3 * i, depth + 1);
            }
            if (tag === TAG.object) {
                const keys = Object.keys(value), start = cursor;
                if (keys.length > limits.fields) throw budget;
                const entries = keys.map(keyId);
                const ordered = entries.map((id, i) => i).sort((a, b) => {
                    const left = names[entries[a]].bytes, right = names[entries[b]].bytes;
                    return compareBytes(left, 0, left.length, right, 0, right.length);
                });
                ints[at + 3] = keys.length;
                reserve(8 * keys.length);
                ints.push(...entries, ...ordered);
                cursor += 2 + 5 * keys.length;
                for (let i = 0; i < ordered.length; i++) walk(value[keys[ordered[i]]], start + 4 + 5 * i, depth + 1);
            }
            if (cursor + HEADER + 2 > limits.bytes) throw budget;
        }
        try { walk(value, -1, 0); }
        catch (error) {
            if (error === budget) return null;
            throw error;
        }
        return {program: Int32Array.from(ints), names, body: cursor, charge, route: route(value)};
    }

    // Test the full shape and gather current scalars in canonical preorder.
    function guard(plan, value, values) {
        const {program, names} = plan;
        let pc = 0, item = 0;
        function walk(value) {
            const tag = program[pc], count = program[pc + 3];
            pc += 4;
            if (kind(value) !== tag) return false;
            if (tag === TAG.array) {
                if (value.length !== count) return false;
                for (let i = 0; i < count; i++) if (!walk(value[i])) return false;
            } else if (tag === TAG.object) {
                const keys = Object.keys(value);
                if (keys.length !== count) return false;
                const first = pc;
                pc += 2 * count;
                for (let i = 0; i < count; i++) if (keys[i] !== names[program[first + i]].key) return false;
                for (let i = 0; i < count; i++) if (!walk(value[keys[program[first + count + i]]])) return false;
            } else {
                if (tag === TAG.float && !Number.isFinite(value)) return false;
                if (values) values[item++] = value;
            }
            return true;
        }
        return walk(value);
    }

    function encode(plan, values) {
        const {program, names} = plan;
        const dictionary = new Map();
        const nameIds = new Uint16Array(names.length);
        let end = HEADER + 2;
        function insert(key, bytes, name = -1) {
            end += 2 + bytes.length;
            if (dictionary.size === limits.strings || end + plan.body > limits.bytes) throw budget;
            dictionary.set(key, {bytes, name, id: -1});
        }
        try {
            for (let i = 0; i < names.length; i++) insert(names[i].key, names[i].bytes, i);
            for (const value of values) {
                if (typeof value === 'string' && !dictionary.has(value)) insert(value, utf8(value));
            }
        } catch (error) {
            if (error === budget) return null;
            throw error;
        }
        const ordered = [...dictionary.values()].sort(({bytes: a}, {bytes: b}) => compareBytes(a, 0, a.length, b, 0, b.length));
        const length = end + plan.body;
        const bytes = new Uint8Array(length);
        const data = new DataView(bytes.buffer);
        const put16 = (index, value) => data.setUint16(index, value, true);
        const putRef = (index, tag, payload = 0) => {
            bytes[index] = payload;
            bytes[index + 1] = payload >>> 8;
            bytes[index + 2] = (tag << 4) | (payload >>> 16);
        };
        bytes.set([80, 83, 73, 88, 1, 0]);
        put16(6, length);
        put16(8, ordered.length);
        let directory = HEADER + 2 * (ordered.length + 1);
        for (let i = 0; i < ordered.length; i++) {
            const entry = ordered[i];
            entry.id = i;
            if (entry.name >= 0) nameIds[entry.name] = i;
            put16(HEADER + 2 * i, directory);
            bytes.set(entry.bytes, directory);
            directory += entry.bytes.length;
        }
        put16(HEADER + 2 * ordered.length, end);
        let pc = 0, item = 0;
        while (pc < program.length) {
            const tag = program[pc++], ref = program[pc++];
            const body = end + program[pc++], count = program[pc++];
            const slot = ref < 0 ? 10 : end + ref;
            switch (tag) {
            case TAG.array:
                putRef(slot, tag, body);
                put16(body, count);
                break;
            case TAG.object:
                putRef(slot, tag, body);
                put16(body, count);
                for (let i = 0; i < count; i++) {
                    const nameId = program[pc + program[pc + count + i]];
                    put16(body + 2 + 5 * i, nameIds[nameId]);
                }
                pc += 2 * count;
                break;
            case TAG.nil:
                putRef(slot, tag);
                item++;
                break;
            case TAG.bool:
                putRef(slot, values[item++] ? 2 : 1);
                break;
            case TAG.int:
                putRef(slot, tag, values[item++] & 0xfffff);
                break;
            case TAG.float:
                putRef(slot, tag, body);
                data.setFloat64(body, values[item++], true);
                break;
            case TAG.string:
                putRef(slot, tag, dictionary.get(values[item++]).id);
                break;
            }
        }
        return bytes;
    }

    // The prefix bounds offline training. Frequency ranks fixed plans with
    // first observation as the tie-breaker.
    function train(payloads, config) {
        const learned = [];
        for (const value of payloads) {
            const key = route(value);
            const found = learned.find(entry => entry.plan.route === key && guard(entry.plan, value));
            if (found) {
                found.frequency++;
            } else {
                const plan = compile(value, config.planBytes);
                if (plan) learned.push({plan, frequency: 1});
            }
        }
        learned.sort((a, b) => b.frequency - a.frequency);
        const bank = [];
        let charge = 0;
        for (const {plan, frequency} of learned) {
            if (bank.length === config.entries) break;
            if (charge + plan.charge > config.bytes || bank.filter(entry => entry.plan.route === plan.route).length === config.probes) continue;
            charge += plan.charge;
            bank.push({plan, frequency});
        }
        return {plans: bank.map(entry => entry.plan), shapes: learned.length,
            frequency: bank.map(entry => entry.frequency)};
    }

    function create(policy, config, plans = [], clock) {
        const cache = plans.slice();
        const scalars = [];
        let bytes = cache.reduce((sum, plan) => sum + plan.charge, 0);
        const stats = {hits: 0, fallback: 0, writerRejections: 0, compileAttempts: 0,
            compiled: 0, compileDeclines: 0, evictions: 0, guardAttempts: 0,
            peakBytes: bytes, peakEntries: cache.length};
        const detail = {dispatchGuardUs: 0, hitWriterUs: 0, fallbackEncoderUs: 0, compileInstallUs: 0};

        function drop(index) {
            const [plan] = cache.splice(index, 1);
            bytes -= plan.charge;
            stats.evictions++;
        }
        function install(plan) {
            let candidates = 0, oldest = -1;
            for (let i = 0; i < cache.length; i++) {
                if (cache[i].route === plan.route) {
                    candidates++;
                    oldest = i;
                }
            }
            if (candidates === config.probes) drop(oldest);
            while (cache.length >= config.entries || bytes + plan.charge > config.bytes) drop(cache.length - 1);
            cache.unshift(plan);
            bytes += plan.charge;
            stats.peakBytes = Math.max(stats.peakBytes, bytes);
            stats.peakEntries = Math.max(stats.peakEntries, cache.length);
        }
        function write(value) {
            const start = clock ? clock() : 0;
            const key = route(value);
            let rejectWriter = false;
            for (let i = 0; i < cache.length; i++) {
                const plan = cache[i];
                if (plan.route !== key) continue;
                stats.guardAttempts++;
                scalars.length = 0;
                if (!guard(plan, value, scalars)) continue;
                const end = clock ? clock() : 0;
                if (clock) detail.dispatchGuardUs += end - start;
                const output = encode(plan, scalars);
                if (clock) detail.hitWriterUs += clock() - end;
                if (output === null) {
                    stats.writerRejections++;
                    rejectWriter = true;
                    break;
                }
                stats.hits++;
                scalars.length = 0;
                if (policy === 'adaptive' && i !== 0) cache.unshift(cache.splice(i, 1)[0]);
                return output;
            }
            scalars.length = 0;
            const miss = clock ? clock() : 0;
            if (clock && !rejectWriter) detail.dispatchGuardUs += miss - start;
            stats.fallback++;
            const output = binaryScreen.encode(value);
            const after = clock ? clock() : 0;
            if (clock) detail.fallbackEncoderUs += after - miss;
            if (policy === 'adaptive' && !rejectWriter) {
                stats.compileAttempts++;
                const plan = compile(value, Math.min(config.planBytes, config.bytes));
                if (plan) {
                    install(plan);
                    stats.compiled++;
                } else stats.compileDeclines++;
            }
            if (clock) detail.compileInstallUs += clock() - after;
            return output;
        }
        function state() {
            return {...stats, ...detail, residentBytes: bytes, residentEntries: cache.length};
        }
        return {write, state};
    }

    return {bounds, create, train};
})();
