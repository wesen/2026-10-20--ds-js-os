import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/system/agent.js', import.meta.url), 'utf8');
const copy = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const message = text => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] });
const call = (name, args, id = 'call_1') => ({ type: 'function_call', status: 'completed', call_id: id, name, arguments: JSON.stringify(args) });
const completed = (...output) => ({ status: 200, body: JSON.stringify({ id: 'resp_test', status: 'completed', output }) });

function harness(saved = null) {
  const def = { handlers: {} }, sent = [], requests = [], cancelled = [], pending = new Map();
  let clock = 0, serial = 0, session = copy(saved), storageStatus = { pending: false, error: '' };
  const builder = { state(s) { def.initial = s; return this; }, onStart(fn) { def.start = fn; return this; },
    on(name, fn) { def.handlers[name] = fn; return this; }, every(ms, fn) { def.tick = fn; return this; } };
  const ctx = vm.createContext({ service: () => builder,
    send: (to, type, payload) => sent.push({ to, type, payload: copy(payload) }), now: () => clock,
    store: { get: () => copy(session), set: (key, value) => { session = copy(value); }, status: () => copy(storageStatus) },
    sys: { worlds: () => [{ name: 'agent', state: 'idle', mem_kb: 300 }], stats: () => ({ crashes: 0 }) },
    agentNet: { status: () => ({ configured: true, mode: 'fixture' }),
      start: body => { const id = ++serial; requests.push({ id, body, parsed: JSON.parse(body) }); pending.set(id, null); return id; },
      poll: id => { const result = pending.get(id); if (result) pending.delete(id); return result || null; },
      cancel: id => { cancelled.push(id); pending.delete(id); } },
  });
  vm.runInContext(source, ctx);
  const state = def.initial;
  def.start(state);
  function send(type, payload = {}, from = 'chat') { return def.handlers['agent.' + type](state, payload, { from }); }
  function tick(n = 1) { for (let i = 0; i < n; i++) { clock += 100; def.tick(state); } }
  function result(value, id = state.ticket) { pending.set(id, value); tick(); }
  return { state, requests, sent, cancelled, ctx, send, tick, result, session: () => copy(session),
    storage: value => { storageStatus = value; }, jump: ms => { clock += ms; def.tick(state); },
    elapse: ms => { clock += ms; },
    // VM state disappears on supervised restart; the native ticket counter does not.
    restart: () => { pending.clear(); for (const key of Object.keys(state)) delete state[key]; def.start(state); } };
}

test('real request contract, complete answer, history and reboot restoration', () => {
  const h = harness();
  assert.equal(h.send('submit', { text: 'Explain a group.' }), undefined);
  const req = h.requests[0].parsed;
  assert.equal(req.model, 'gpt-6-luna'); assert.equal(req.stream, false); assert.equal(req.store, false);
  assert.equal(req.parallel_tool_calls, false); assert.equal(req.reasoning.effort, 'low');
  assert.ok(req.tools.every(t => t.strict && t.parameters.additionalProperties === false));
  assert.equal(h.state.phase, 'requesting');
  h.result(completed(message('A set with an associative operation, identity and inverses.')));
  assert.equal(h.state.phase, 'done'); assert.equal(h.state.history.length, 2);
  h.send('submit', { text: 'An example?' });
  assert.equal(h.requests[1].parsed.input[0].content, 'Explain a group.');
  h.result(completed(message('Integers under addition.')));
  const re = harness(h.session());
  assert.equal(re.state.history.length, 4); assert.equal(re.requests.length, 0);
});

test('calculator is bounded arithmetic, with precedence and no JavaScript evaluation', () => {
  const h = harness();
  const calc = text => vm.runInContext('calculate(' + JSON.stringify(text) + ')', h.ctx);
  assert.equal(calc('2+3*4'), 14); assert.equal(calc('2^3^2'), 512); assert.equal(calc('-2^2'), -4);
  assert.equal(calc('sqrt(81) + pow(2,3)'), 17); assert.equal(calc('2^-2'), .25);
  assert.throws(() => calc('globalThis.x=7')); assert.throws(() => calc('constructor(1)'));
  assert.throws(() => calc('1/0')); assert.throws(() => calc('sqrt(-1)'));
  assert.throws(() => calc('('.repeat(25) + '1' + ')'.repeat(25)));
});

test('tool loop preserves all response output including opaque reasoning', () => {
  const h = harness(); h.send('submit', { text: 'What is 6*7?' });
  const reasoning = { type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque', summary: [] };
  h.result(completed(reasoning, call('calculate', { expression: '6*7' })));
  assert.equal(h.state.phase, 'tools'); h.tick(2);
  assert.equal(h.requests.length, 2);
  const items = h.requests[1].parsed.input;
  assert.deepEqual(items[1], reasoning);
  assert.equal(items[2].call_id, 'call_1');
  assert.deepEqual(JSON.parse(items[3].output), { ok: true, value: 42 });
  h.result(completed(message('42.'))); assert.equal(h.state.phase, 'done');
});

test('note write waits for authenticated matching approval and persistence acknowledgement', () => {
  const h = harness(); h.send('submit', { text: 'Remember apples' });
  h.result(completed(call('save_note', { name: 'shopping', text: 'apples' }))); h.tick();
  assert.equal(h.state.phase, 'approval'); assert.equal(h.session().notes.length, 0);
  const id = h.state.approval.id;
  h.send('approve', { id, allow: true }, 'flaky');
  h.send('approve', { id: 'stale', allow: true });
  assert.equal(h.state.notes.length, 0);
  h.storage({ pending: true, error: '' }); h.send('approve', { id, allow: true });
  assert.equal(h.state.notes[0].text, 'apples');
  h.tick(2); assert.equal(h.requests.length, 1);
  h.storage({ pending: false, error: '' }); h.tick();
  assert.equal(h.requests.length, 2);
  const output = h.requests[1].parsed.input.at(-1);
  assert.deepEqual(JSON.parse(output.output), { ok: true, saved: true });
});

test('denied writes return a tool error and never modify notes', () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'text' }))); h.tick();
  h.send('approve', { id: h.state.approval.id, allow: false }); h.tick();
  assert.equal(h.state.notes.length, 0);
  assert.match(h.requests[1].parsed.input.at(-1).output, /denied/);
});

test('approval escapes Unicode, controls and literal backslashes without changing the saved note', () => {
  const h = harness();
  const original = 'literal \\u{201c}\n\u201cquote\u201d\tNUL:\u0000 emoji:\ud83e\uddee';
  h.send('submit', { text: 'Save unicode' });
  h.result(completed(call('save_note', { name: 'Unicode', text: original }))); h.tick();
  const summary = h.state.approval.summary;
  assert.match(summary, /Escaped text:/);
  assert.ok(summary.includes('literal \\\\u{201c}'));
  assert.ok(summary.includes('\\u{201c}quote\\u{201d}\\u{9}NUL:\\u{0} emoji:\\u{1f9ee}'));
  assert.equal(/[^\x20-\x7e\n]/.test(summary), false);
  h.send('approve', { id: h.state.approval.id, allow: true }); h.tick();
  assert.equal(h.state.notes[0].text, original);
  const plain = vm.runInContext('approvalSummaryText("plain text\\nnext line")', h.ctx);
  assert.equal(plain, 'plain text\nnext line');
});

test('an approval delivered after expiry cannot write before the next timer tick', () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'expired' }))); h.tick();
  const id = h.state.approval.id;
  h.elapse(120001); // Advance the clock without allowing tick() to invalidate the approval first.
  h.send('approve', { id, allow: true });
  assert.equal(h.state.notes.length, 0); assert.equal(h.session().notes.length, 0);
  assert.equal(h.state.approval, null); h.tick();
  assert.match(h.requests[1].parsed.input.at(-1).output, /approval expired/);
});

test('a delayed approval also checks the enclosing run deadline at receipt', () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'late' }))); h.tick();
  const id = h.state.approval.id;
  h.elapse(180001); h.send('approve', { id, allow: true });
  assert.equal(h.state.phase, 'error'); assert.match(h.state.error, /deadline/);
  assert.equal(h.state.notes.length, 0); assert.equal(h.session().notes.length, 0);
  h.tick(); assert.equal(h.requests.length, 1);
});

test('reusing a provider call ID after cancellation cannot reuse the old approval', () => {
  const h = harness(); h.send('submit', { text: 'First note' });
  h.result(completed(call('save_note', { name: 'n', text: 'first' }, 'same_call'))); h.tick();
  const old = h.state.approval.id;
  h.send('cancel'); h.send('submit', { text: 'Second note' });
  h.result(completed(call('save_note', { name: 'n', text: 'second' }, 'same_call'))); h.tick();
  const current = h.state.approval.id;
  assert.notEqual(current, old);
  h.send('approve', { id: old, allow: true });
  assert.equal(h.state.phase, 'approval'); assert.equal(h.state.notes.length, 0);
  h.send('approve', { id: current, allow: true }); h.tick();
  assert.equal(h.state.notes[0].text, 'second');
});

test('native request tickets distinguish approvals when a supervised restart resets run numbers', () => {
  const h = harness(); h.send('submit', { text: 'First note' });
  h.result(completed(call('save_note', { name: 'n', text: 'first' }, 'same_call'))); h.tick();
  const old = h.state.approval.id, oldRun = h.state.run;
  h.restart();
  assert.equal(h.state.phase, 'cancelled'); assert.equal(h.state.approval, null);
  h.send('submit', { text: 'Second note' });
  h.result(completed(call('save_note', { name: 'n', text: 'second' }, 'same_call'))); h.tick();
  assert.equal(h.state.run, oldRun); // The JS counter alone would collide here.
  const current = h.state.approval.id;
  assert.notEqual(current, old);
  h.send('approve', { id: old, allow: true }); assert.equal(h.state.notes.length, 0);
  assert.equal(h.state.approval.id, current);
  h.send('approve', { id: current, allow: true }); h.tick();
  assert.equal(h.state.notes[0].text, 'second');
});

test('F3 retries the exact failed continuation without repeating an approved write', () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'one' }))); h.tick();
  h.send('approve', { id: h.state.approval.id, allow: true }); h.tick();
  const continuation = h.requests[1].body;
  h.result({ status: 502, body: '{"error":{"code":"upstream_error"}}' });
  assert.equal(h.state.phase, 'error');
  h.send('retry'); assert.equal(h.requests[2].body, continuation);
  assert.equal(h.state.notes.length, 1); assert.equal(h.state.approval, null);
  h.result(completed(message('Saved.'))); assert.equal(h.state.phase, 'done');
});

test('cancellation and a new run ignore stale HTTP results and old approvals', () => {
  const h = harness(); h.send('submit', { text: 'One' }); const old = h.state.ticket;
  h.send('cancel'); assert.equal(h.state.phase, 'cancelled'); assert.ok(h.cancelled.includes(old));
  h.send('submit', { text: 'Two' });
  h.result(completed(call('save_note', { name: 'old', text: 'bad' })), old);
  assert.equal(h.state.phase, 'requesting'); assert.equal(h.state.approval, null);
  h.result(completed(message('New answer'))); assert.equal(h.state.phase, 'done');
  assert.equal(h.state.notes.length, 0);
});

test('cancel while a write acknowledgement is pending never restarts the agent loop', () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'text' }))); h.tick();
  h.storage({ pending: true, error: '' }); h.send('approve', { id: h.state.approval.id, allow: true });
  h.send('cancel'); h.storage({ pending: false, error: '' }); h.tick(3);
  assert.equal(h.state.phase, 'cancelled'); assert.equal(h.requests.length, 1);
});

test('incomplete or malformed provider batches execute no tools', () => {
  const bads = [
    { status: 'incomplete', output: [call('save_note', { name: 'x', text: 'x' })] },
    { status: 'completed', output: [call('calculate', { expression: '1' }), call('calculate', { expression: '2' })] },
    { status: 'completed', output: [call('calculate', { expression: '1' }), { type: 'unknown' }] },
  ];
  for (const bad of bads) {
    const h = harness(); h.send('submit', { text: 'Test' });
    h.result({ status: 200, body: JSON.stringify(bad) }); h.tick(3);
    assert.equal(h.state.phase, 'error'); assert.equal(h.state.approval, null);
    assert.equal(h.requests.length, 1); assert.equal(h.state.notes.length, 0);
  }
});

test('tool schemas reject extra keys, unknown tools and non-finite arithmetic locally', () => {
  for (const tool of [call('calculate', { expression: '3', code: 'x' }), call('shell', { command: 'rm' }), call('calculate', { expression: '1/0' })]) {
    const h = harness(); h.send('submit', { text: 'Test' }); h.result(completed(tool)); h.tick(2);
    const r = JSON.parse(h.requests[1].parsed.input.at(-1).output);
    assert.equal(r.ok, false); assert.equal(h.state.notes.length, 0);
  }
});

test('persistent write failure is returned to the model as failure', () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'x' }))); h.tick();
  h.send('approve', { id: h.state.approval.id, allow: true });
  h.storage({ pending: false, error: 'disk full' }); h.tick();
  assert.equal(h.state.notes.length, 0);
  assert.equal(JSON.parse(h.requests[1].parsed.input.at(-1).output).ok, false);
});

test('untrusted senders cannot start, cancel or clear a session', () => {
  const h = harness(); h.send('submit', { text: 'bad' }, 'sandbox'); assert.equal(h.requests.length, 0);
  h.send('submit', { text: 'good' }); h.send('cancel', {}, 'flaky'); h.send('new', {}, 'flaky');
  assert.equal(h.state.phase, 'requesting'); assert.equal(h.requests.length, 1);
});

test('time and iteration limits stop work without automatic paid retries', () => {
  const h = harness(); h.send('submit', { text: 'slow' }); h.jump(51000);
  assert.equal(h.state.phase, 'error'); assert.equal(h.requests.length, 1);
  const loop = harness(); loop.send('submit', { text: 'loop' });
  for (let i = 0; i < 6; i++) { loop.result(completed(call('calculate', { expression: '1' }, 'c_' + i))); loop.tick(2); }
  assert.equal(loop.requests.length, 6); assert.equal(loop.state.phase, 'error');
  assert.match(loop.state.error, /6 model/);
});

test('reboot restores text and notes but does not replay an interrupted action', () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'text' }))); h.tick();
  const re = harness(h.session());
  assert.equal(re.requests.length, 0); assert.equal(re.state.phase, 'cancelled'); assert.equal(re.state.approval, null);
  assert.equal(re.state.notes.length, 0);
});

test('model and effort are configurable without putting credentials in JS state', () => {
  const h = harness(); h.send('submit', { text: '/model custom-model' });
  h.send('submit', { text: '/effort omit' }); h.send('submit', { text: 'Hello' });
  assert.equal(h.requests[0].parsed.model, 'custom-model'); assert.equal(h.requests[0].parsed.reasoning, undefined);
  assert.equal(h.requests[0].body.includes('Authorization'), false);
});

test('UTF-8 bounds and local record quotas include multibyte text', () => {
  const h = harness(); h.send('submit', { text: '\u754c'.repeat(2000) }); assert.equal(h.requests.length, 0);
  assert.match(h.state.error, /4096/);
  for (let i = 0; i < 5; i++) {
    h.send('submit', { text: 'q'.repeat(2048) }); h.result(completed(message('a'.repeat(6000))));
  }
  assert.ok(Buffer.byteLength(JSON.stringify({ session: h.session() })) <= 16384);
  assert.ok(h.state.entries.length <= 40);
});
