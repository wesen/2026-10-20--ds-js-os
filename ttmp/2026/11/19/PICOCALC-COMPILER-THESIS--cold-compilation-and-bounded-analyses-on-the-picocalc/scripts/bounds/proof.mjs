const ZERO = '0';
const scalar = id => 'i' + id;
const header = id => 'l' + id;
const MAX_FACTS = 64;
const MAX_HOPS = 6;
const MAX_EVENTS = 50_000;

function term(expr) {
    if (expr.kind === 'local' && expr.type === 'i32') return scalar(expr.id);
    if (expr.kind === 'length') return header(expr.id);
    if (expr.kind === 'integer' && expr.value === 0) return ZERO;
    return null;
}

function discard(facts, writes) {
    const killed = new Set([...writes].flatMap(id => [scalar(id), header(id)]));
    return facts.filter(edge => !killed.has(edge.from) && !killed.has(edge.to));
}

function add(facts, from, to, strict = false) {
    if (from === null || to === null || from === to) return facts;
    const existing = facts.find(edge => edge.from === from && edge.to === to);
    if (existing) {
        if (!strict || existing.strict) return facts;
        facts = facts.filter(edge => edge !== existing);
    }
    if (facts.length >= MAX_FACTS) return facts;
    return [...facts, { from, to, strict }];
}

function join(left, right) {
    if (left === null) return right;
    if (right === null) return left;
    return left.flatMap(a => {
        const b = right.find(edge => edge.from === a.from && edge.to === a.to);
        return b ? [{ ...a, strict: a.strict && b.strict }] : [];
    });
}

function atom(expr, facts) {
    if (expr.kind !== 'binary') return [facts, facts];
    const a = term(expr.left);
    const b = term(expr.right);
    switch (expr.op) {
    case '<': return [add(facts, a, b, true), add(facts, b, a)];
    case '<=': return [add(facts, a, b), add(facts, b, a, true)];
    case '>': return [add(facts, b, a, true), add(facts, a, b)];
    case '>=': return [add(facts, b, a), add(facts, a, b, true)];
    case '===': return [add(add(facts, a, b), b, a), facts];
    default: return [facts, facts];
    }
}

// Each queue state records whether any edge in the path was strict.
function path(facts, from, to, needsStrict, hops, work) {
    const queue = [{ node: from, strict: false, path: [] }];
    const seen = new Set([from + ':false']);
    for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        for (const edge of facts) {
            if (work.steps === work.budget) {
                work.exhausted = true;
                return null;
            }
            work.steps++;
            if (edge.from !== current.node) continue;
            const strict = current.strict || edge.strict;
            const witness = [...current.path, edge];
            if (edge.to === to && (strict || !needsStrict)) return witness;
            if (witness.length === hops) continue;
            const key = edge.to + ':' + strict;
            if (seen.has(key)) continue;
            seen.add(key);
            queue.push({ node: edge.to, strict, path: witness });
        }
    }
    return null;
}

function children(expr) {
    switch (expr.kind) {
    case 'binary': return [expr.left, expr.right];
    case 'not': return [expr.value];
    case 'read': return [expr.index];
    default: return expr.children ?? [];
    }
}

function describeLoop(loop, tick) {
    const writes = new Map();
    let barrier = false;
    const pending = [loop.condition, ...loop.body];
    while (pending.length) {
        const item = pending.pop();
        tick();
        if (item.barrier) barrier = true;
        switch (item.kind) {
        case 'if':
        case 'while':
            pending.push(item.condition, ...item.body);
            break;
        case 'assign': {
            const updates = writes.get(item.target) ?? [];
            updates.push(item);
            writes.set(item.target, updates);
            pending.push(item.value);
            break;
        }
        case 'expr':
        case 'return':
            pending.push(item.value);
            break;
        default:
            pending.push(...children(item));
        }
    }
    return { writes, barrier };
}

// A true conjunction implies every conjunct actually ran and was true.
function conjuncts(expr, tick) {
    const result = [];
    const pending = [expr];
    while (pending.length) {
        const item = pending.pop();
        tick();
        if (item.kind === 'binary' && item.op === '&&') {
            pending.push(item.right, item.left);
        } else {
            result.push(item);
        }
    }
    return result;
}

function signedStrict(expr) {
    if (expr.kind !== 'binary') return null;
    if (expr.op === '<') return [term(expr.left), term(expr.right)];
    if (expr.op === '>') return [term(expr.right), term(expr.left)];
    return null;
}

function isIncrement(statement) {
    const value = statement.value;
    return value.kind === 'binary' && value.op === '+' && term(value.left) === scalar(statement.target)
        && value.right.kind === 'integer' && value.right.value === 1;
}

function loopHead(loop, incoming, guardAtoms, tick) {
    const { writes, barrier } = describeLoop(loop, tick);
    let facts = barrier ? [] : discard(incoming, writes.keys());
    for (const [id, updates] of writes) {
        const update = updates[0];
        if (updates.length !== 1 || !loop.body.includes(update) || !isIncrement(update)) continue;
        const counter = scalar(id);
        if (!incoming.some(edge => edge.from === ZERO && edge.to === counter)) continue;
        if (!guardAtoms.some(pair => pair[0] === counter && pair[1] !== null)) continue;
        // True signed counter < bound implies counter <= INT32_MAX - 1.
        // The sole update adds one; the next iteration starts nonnegative.
        facts = add(facts, ZERO, counter);
    }
    return facts;
}

class EventLimit extends Error {}

export function analyze(trace, mode, budget) {
    if (!['baseline', 'direct', 'chained'].includes(mode)) throw new Error('unknown mode: ' + mode);
    if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('invalid query budget');
    const hops = mode === 'direct' ? 1 : MAX_HOPS;
    let events = 0;
    const loops = [];

    function tick() {
        if (++events > MAX_EVENTS) throw new EventLimit();
    }

    function query(expr, facts) {
        const { check, receiver, index, at } = expr;
        check.at = at;
        check.plain = index.kind === 'local' && index.type === 'i32';
        check.reason = check.plain ? 'baseline' : 'non-local index';
        if (!check.plain || mode === 'baseline') return;
        const pos = scalar(index.id);
        const work = { steps: 0, budget, exhausted: false };
        const lower = path(facts, ZERO, pos, false, hops, work);
        const upper = lower && path(facts, pos, header(receiver), true, hops, work);
        check.work = work.steps;
        if (upper) {
            check.removed = true;
            check.proof = { lower, upper };
            check.reason = upper.length === 1 ? 'direct upper' : 'chained upper';
        } else {
            check.reason = work.exhausted ? 'budget' : lower ? 'no strict upper' : 'no nonnegative lower';
        }
    }

    function visit(expr, facts) {
        tick();
        if (expr.kind === 'not' || (expr.kind === 'binary' && (expr.op === '&&' || expr.op === '||'))) {
            return join(...condition(expr, facts));
        }
        for (const child of children(expr)) facts = visit(child, facts);
        if (expr.kind === 'read') query(expr, facts);
        return expr.barrier ? [] : facts;
    }

    function condition(expr, facts) {
        tick();
        if (expr.kind === 'not') {
            const [yes, no] = condition(expr.value, facts);
            return [no, yes];
        }
        if (expr.kind === 'binary' && expr.op === '&&') {
            const [yes, no] = condition(expr.left, facts);
            const [rightYes, rightNo] = condition(expr.right, yes);
            return [rightYes, join(no, rightNo)];
        }
        if (expr.kind === 'binary' && expr.op === '||') {
            const [yes, no] = condition(expr.left, facts);
            const [rightYes, rightNo] = condition(expr.right, no);
            return [join(yes, rightYes), rightNo];
        }
        return atom(expr, visit(expr, facts));
    }

    function assignment(statement, facts) {
        const { target, type, value } = statement;
        const to = scalar(target);
        facts = discard(visit(value, facts), [target]);
        if (type !== 'i32') return facts;
        if (value.kind === 'integer') return add(facts, ZERO, to, value.value > 0);
        const from = term(value);
        if (from !== null && from !== to) {
            const knownLower = facts.find(edge => edge.from === ZERO && edge.to === from);
            if (knownLower) facts = add(facts, ZERO, to, knownLower.strict);
            return add(add(facts, from, to), to, from);
        }
        if (value.kind === 'binary' && value.op === 'min') {
            const a = term(value.left);
            const b = term(value.right);
            if (a !== null && b !== null && a !== to && b !== to) return add(add(facts, to, a), to, b);
        }
        return facts;
    }

    function block(statements, facts) {
        for (const statement of statements) {
            tick();
            if (facts === null) break;
            switch (statement.kind) {
            case 'return':
                visit(statement.value, facts);
                return null;
            case 'expr':
                facts = visit(statement.value, facts);
                break;
            case 'assign':
                facts = assignment(statement, facts);
                break;
            case 'if': {
                const [yes, no] = condition(statement.condition, facts);
                facts = join(block(statement.body, yes), no);
                break;
            }
            case 'while': {
                const guardAtoms = conjuncts(statement.condition, tick).map(signedStrict).filter(Boolean);
                loops.push({
                    at: statement.at,
                    direct: guardAtoms.some(([a, b]) => a?.startsWith('i') && b?.startsWith('l')),
                    localUpper: guardAtoms.some(([a, b]) => a?.startsWith('i') && b?.startsWith('i')),
                });
                const head = loopHead(statement, facts, guardAtoms, tick);
                const [yes, no] = condition(statement.condition, head);
                block(statement.body, yes);
                facts = no;
                break;
            }
            default: throw new Error('unexpected trace statement: ' + statement.kind);
            }
        }
        return facts;
    }

    try {
        block(trace.statements, []);
    } catch (error) {
        if (!(error instanceof EventLimit || error instanceof RangeError)) throw error;
        for (const check of trace.checks) {
            delete check.removed;
            delete check.proof;
            check.reason = 'analysis limit';
        }
    }
    return { checks: trace.checks, loops, events };
}
