import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/system/agent.js', import.meta.url), 'utf8');
const copy = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const message = text => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] });
const call = (name, args, id = 'call_1') => ({ type: 'function_call', status: 'completed', call_id: id, name, arguments: JSON.stringify(args) });
const completed = (...output) => ({ status: 200, body: JSON.stringify({ id: 'resp_test', status: 'completed', output }) });

// Settle every promise that is ready: file operations resolve in a later segment, here a later macrotask.
const settle = () => new Promise(resolve => setImmediate(resolve));

// The notes folder: a Map from name to text behind the handle the agent gets from hw.fs('fs:/notes'). While held,
// operations queue until release(), as a slow flash write would; fail makes writes throw.
function notesDir(files = new Map()) {
  const d = { files, held: null, fail: '' };
  const op = fn => new Promise((resolve, reject) => {
    const run = () => { try { resolve(fn()); } catch (e) { reject(e); } };
    if (d.held) d.held.push(run); else run();
  });
  const need = name => { if (!files.has(name)) throw new Error('no file notes/' + name); return files.get(name); };
  d.handle = {
    list: () => op(() => [...files.keys()].sort().map(name => ({ name, dir: false, size: Buffer.byteLength(files.get(name)) }))),
    stat: name => op(() => ({ dir: false, size: Buffer.byteLength(need(name)) })),
    read: name => op(() => need(name)),
    write: (name, text) => op(() => { if (d.fail) throw new Error(d.fail); files.set(name, text); return { bytes: Buffer.byteLength(text) }; }),
  };
  d.hold = () => { d.held = []; };
  d.release = () => { const q = d.held || []; d.held = null; q.forEach(run => run()); };
  return d;
}

function harness(saved = null, status = { configured: true, mode: 'fixture' }, notes = new Map()) {
  const def = { handlers: {} }, sent = [], requests = [], cancelled = [], pending = new Map(), dir = notesDir(notes);
  let clock = 0, serial = 0, session = copy(saved), storageStatus = { pending: false, error: '' };
  const builder = { state(s) { def.initial = s; return this; }, onStart(fn) { def.start = fn; return this; },
    on(name, fn) { def.handlers[name] = fn; return this; }, every(ms, fn) { def.tick = fn; return this; } };
  const ctx = vm.createContext({ service: () => builder,
    send: (to, type, payload) => sent.push({ to, type, payload: copy(payload) }), now: () => clock,
    store: { get: () => copy(session), set: (key, value) => { session = copy(value); }, status: () => copy(storageStatus) },
    sys: { worlds: () => [{ name: 'agent', state: 'idle', mem_kb: 300 }], stats: () => ({ crashes: 0 }) },
    hw: { fs: claim => { if (claim !== 'fs:/notes') throw new Error('agent has no claim on ' + claim); return dir.handle; } },
    agentNet: { status: () => copy(status),
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
  return { state, requests, sent, cancelled, ctx, send, tick, result, session: () => copy(session), settle, dir, notes,
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

test('note write waits for authenticated matching approval and for the file write', async () => {
  const h = harness(); h.send('submit', { text: 'Remember apples' });
  h.result(completed(call('save_note', { name: 'shopping', text: 'apples' }))); h.tick(); await h.settle();
  assert.equal(h.state.phase, 'approval'); assert.match(h.state.approval.summary, /^Save note 'shopping':\napples$/);
  assert.equal(h.notes.size, 0);
  const id = h.state.approval.id;
  h.send('approve', { id, allow: true }, 'flaky');
  h.send('approve', { id: 'stale', allow: true });
  assert.equal(h.state.phase, 'approval');
  h.dir.hold(); h.send('approve', { id, allow: true }); await h.settle();
  assert.equal(h.notes.size, 0);
  h.tick(2); assert.equal(h.requests.length, 1);   // the run waits for the write
  h.dir.release(); await h.settle();
  assert.equal(h.notes.get('shopping'), 'apples');
  h.tick(); assert.equal(h.requests.length, 2);
  const output = h.requests[1].parsed.input.at(-1);
  assert.deepEqual(JSON.parse(output.output), { ok: true, saved: true });
  assert.equal(h.session().notes.length, 0);   // notes are files, not part of the session record
});

test('save_note over an existing file asks to replace it', async () => {
  const h = harness(null, undefined, new Map([['n', 'old']])); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'new' }))); h.tick(); await h.settle();
  assert.match(h.state.approval.summary, /^Replace note 'n'/);
  h.send('approve', { id: h.state.approval.id, allow: true }); await h.settle();
  assert.equal(h.notes.get('n'), 'new');
});

test('denied writes return a tool error and never modify notes', async () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'text' }))); h.tick(); await h.settle();
  h.send('approve', { id: h.state.approval.id, allow: false }); h.tick();
  assert.equal(h.notes.size, 0);
  assert.match(h.requests[1].parsed.input.at(-1).output, /denied/);
});

test('approval escapes Unicode, controls and literal backslashes without changing the saved note', async () => {
  const h = harness();
  const original = 'literal \\u{201c}\n\u201cquote\u201d\tNUL:\u0000 emoji:\ud83e\uddee';
  h.send('submit', { text: 'Save unicode' });
  h.result(completed(call('save_note', { name: 'Unicode', text: original }))); h.tick(); await h.settle();
  const summary = h.state.approval.summary;
  assert.match(summary, /Escaped text:/);
  assert.ok(summary.includes('literal \\\\u{201c}'));
  assert.ok(summary.includes('\\u{201c}quote\\u{201d}\\u{9}NUL:\\u{0} emoji:\\u{1f9ee}'));
  assert.equal(/[^\x20-\x7e\n]/.test(summary), false);
  h.send('approve', { id: h.state.approval.id, allow: true }); await h.settle();
  assert.equal(h.notes.get('Unicode'), original);
  const plain = vm.runInContext('approvalSummaryText("plain text\\nnext line")', h.ctx);
  assert.equal(plain, 'plain text\nnext line');
});

test('a note too long to review is refused before approval', async () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: '\u00e9'.repeat(4000) }))); h.tick(2);
  assert.equal(h.state.approval, null);
  assert.match(h.requests[1].parsed.input.at(-1).output, /too long to show for approval/);
});

test('an approval delivered after expiry cannot write before the next timer tick', async () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'expired' }))); h.tick(); await h.settle();
  const id = h.state.approval.id;
  h.elapse(120001); // Advance the clock without allowing tick() to invalidate the approval first.
  h.send('approve', { id, allow: true }); await h.settle();
  assert.equal(h.notes.size, 0);
  assert.equal(h.state.approval, null); h.tick();
  assert.match(h.requests[1].parsed.input.at(-1).output, /approval expired/);
});

test('a delayed approval also checks the enclosing run deadline at receipt', async () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'late' }))); h.tick(); await h.settle();
  const id = h.state.approval.id;
  h.elapse(180001); h.send('approve', { id, allow: true }); await h.settle();
  assert.equal(h.state.phase, 'error'); assert.match(h.state.error, /deadline/);
  assert.equal(h.notes.size, 0);
  h.tick(); assert.equal(h.requests.length, 1);
});

test('reusing a provider call ID after cancellation cannot reuse the old approval', async () => {
  const h = harness(); h.send('submit', { text: 'First note' });
  h.result(completed(call('save_note', { name: 'n', text: 'first' }, 'same_call'))); h.tick(); await h.settle();
  const old = h.state.approval.id;
  h.send('cancel'); h.send('submit', { text: 'Second note' });
  h.result(completed(call('save_note', { name: 'n', text: 'second' }, 'same_call'))); h.tick(); await h.settle();
  const current = h.state.approval.id;
  assert.notEqual(current, old);
  h.send('approve', { id: old, allow: true }); await h.settle();
  assert.equal(h.state.phase, 'approval'); assert.equal(h.notes.size, 0);
  h.send('approve', { id: current, allow: true }); await h.settle();
  assert.equal(h.notes.get('n'), 'second');
});

test('native request tickets distinguish approvals when a supervised restart resets run numbers', async () => {
  const h = harness(); h.send('submit', { text: 'First note' });
  h.result(completed(call('save_note', { name: 'n', text: 'first' }, 'same_call'))); h.tick(); await h.settle();
  const old = h.state.approval.id, oldRun = h.state.run;
  h.restart();
  assert.equal(h.state.phase, 'cancelled'); assert.equal(h.state.approval, null);
  h.send('submit', { text: 'Second note' });
  h.result(completed(call('save_note', { name: 'n', text: 'second' }, 'same_call'))); h.tick(); await h.settle();
  assert.equal(h.state.run, oldRun); // The JS counter alone would collide here.
  const current = h.state.approval.id;
  assert.notEqual(current, old);
  h.send('approve', { id: old, allow: true }); await h.settle(); assert.equal(h.notes.size, 0);
  assert.equal(h.state.approval.id, current);
  h.send('approve', { id: current, allow: true }); await h.settle();
  assert.equal(h.notes.get('n'), 'second');
});

test('F3 retries the exact failed continuation without repeating an approved write', async () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'one' }))); h.tick(); await h.settle();
  h.send('approve', { id: h.state.approval.id, allow: true }); await h.settle(); h.tick();
  const continuation = h.requests[1].body;
  h.notes.set('n', 'edited by the user since');
  h.result({ status: 502, body: '{"error":{"code":"upstream_error"}}' });
  assert.equal(h.state.phase, 'error');
  h.send('retry'); assert.equal(h.requests[2].body, continuation);
  await h.settle();
  assert.equal(h.notes.get('n'), 'edited by the user since'); assert.equal(h.state.approval, null);
  h.result(completed(message('Saved.'))); assert.equal(h.state.phase, 'done');
});

test('cancellation and a new run ignore stale HTTP results and old approvals', async () => {
  const h = harness(); h.send('submit', { text: 'One' }); const old = h.state.ticket;
  h.send('cancel'); assert.equal(h.state.phase, 'cancelled'); assert.ok(h.cancelled.includes(old));
  h.send('submit', { text: 'Two' });
  h.result(completed(call('save_note', { name: 'old', text: 'bad' })), old); await h.settle();
  assert.equal(h.state.phase, 'requesting'); assert.equal(h.state.approval, null);
  h.result(completed(message('New answer'))); assert.equal(h.state.phase, 'done');
  assert.equal(h.notes.size, 0);
});

test('cancel while a write is in flight never restarts the agent loop; the write itself completes', async () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'text' }))); h.tick(); await h.settle();
  h.dir.hold(); h.send('approve', { id: h.state.approval.id, allow: true }); await h.settle();
  h.send('cancel'); h.dir.release(); await h.settle(); h.tick(3);
  assert.equal(h.state.phase, 'cancelled'); assert.equal(h.requests.length, 1);
  assert.equal(h.notes.get('n'), 'text');
  assert.ok(!h.state.entries.some(e => e.text === 'save_note: saved'));   // the cancelled run reports nothing late
});

test('incomplete or malformed provider batches execute no tools', async () => {
  const bads = [
    { status: 'incomplete', output: [call('save_note', { name: 'x', text: 'x' })] },
    { status: 'completed', output: [call('calculate', { expression: '1' }), call('calculate', { expression: '2' })] },
    { status: 'completed', output: [call('calculate', { expression: '1' }), { type: 'unknown' }] },
  ];
  for (const bad of bads) {
    const h = harness(); h.send('submit', { text: 'Test' });
    h.result({ status: 200, body: JSON.stringify(bad) }); h.tick(3); await h.settle();
    assert.equal(h.state.phase, 'error'); assert.equal(h.state.approval, null);
    assert.equal(h.requests.length, 1); assert.equal(h.notes.size, 0);
  }
});

test('tool schemas reject extra keys, unknown tools, bad note names and non-finite arithmetic locally', async () => {
  for (const tool of [call('calculate', { expression: '3', code: 'x' }), call('shell', { command: 'rm' }), call('calculate', { expression: '1/0' }),
    call('save_note', { name: 'dot.', text: 'x' }), call('save_note', { name: 'x'.repeat(65), text: 'x' }), call('read_note', { name: '../secrets' })]) {
    const h = harness(); h.send('submit', { text: 'Test' }); h.result(completed(tool)); h.tick(2); await h.settle();
    const r = JSON.parse(h.requests[1].parsed.input.at(-1).output);
    assert.equal(r.ok, false); assert.equal(h.notes.size, 0);
  }
});

test('a failed file write is returned to the model as failure', async () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'x' }))); h.tick(); await h.settle();
  h.dir.fail = 'cannot write notes/n (No space left on device)';
  h.send('approve', { id: h.state.approval.id, allow: true }); await h.settle(); h.tick();
  assert.equal(h.notes.size, 0);
  const r = JSON.parse(h.requests[1].parsed.input.at(-1).output);
  assert.equal(r.ok, false); assert.match(r.error, /No space left/);
  assert.ok(h.state.entries.some(e => e.text === 'save_note: failed'));
});

test('list_notes and read_note see the files, clip long ones and skip names the tools cannot use', async () => {
  const files = new Map([['a', 'alpha'], ['long.md', 'x'.repeat(7000)], ['name with trailing dot.', 'z']]);
  const h = harness(null, undefined, files); h.send('submit', { text: 'Notes?' });
  h.result(completed(call('list_notes', {}, 'c1'))); h.tick(); await h.settle(); h.tick();
  assert.deepEqual(JSON.parse(h.requests[1].parsed.input.at(-1).output), { ok: true, names: ['a', 'long.md'], more: false });
  h.result(completed(call('read_note', { name: 'long.md' }, 'c2'))); h.tick(); await h.settle(); h.tick();
  const long = JSON.parse(h.requests[2].parsed.input.at(-1).output);
  assert.equal(long.clipped, true); assert.ok(Buffer.byteLength(long.text) <= 6000);
  h.result(completed(call('read_note', { name: 'gone' }, 'c3'))); h.tick(); await h.settle(); h.tick();
  assert.deepEqual(JSON.parse(h.requests[3].parsed.input.at(-1).output), { ok: false, error: 'Note not found' });
  h.result(completed(message('Done.')));
  h.send('submit', { text: '/notes' }); await h.settle();
  assert.equal(h.state.entries.at(-1).text, 'Notes: a, long.md');
});

test('notes in an old session record move into files once; a file of the same name wins', async () => {
  const old = { version: 1, model: 'gpt-6-luna', effort: 'low', history: [], pending: false, prompt: '',
    notes: [{ name: 'shopping', text: 'apples' }, { name: 'kept', text: 'from the record' }, { name: 'trailing.', text: 't' }] };
  const failing = harness(old, undefined, new Map());
  failing.dir.fail = 'cannot write'; await failing.settle();
  assert.match(failing.state.entries.at(-1).text, /could not be moved into files/);
  assert.equal(failing.session().notes.length, 3);   // the record keeps them until a move succeeds
  const h = harness(old, undefined, new Map([['kept', 'from the file']])); await h.settle();
  assert.equal(h.notes.get('shopping'), 'apples'); assert.equal(h.notes.get('kept'), 'from the file');
  assert.equal(h.notes.get('trailing'), 't');
  assert.match(h.state.entries.at(-1).text, /Moved 3 notes .*1 already had a file/);
  assert.equal(h.session().version, 2); assert.deepEqual(h.session().notes, []);
  const again = harness(h.session(), undefined, h.notes); await again.settle();
  assert.ok(!again.state.entries.some(e => /Moved/.test(e.text)));
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

test('reboot restores text but does not replay an interrupted action', async () => {
  const h = harness(); h.send('submit', { text: 'Save' });
  h.result(completed(call('save_note', { name: 'n', text: 'text' }))); h.tick(); await h.settle();
  const re = harness(h.session(), undefined, h.notes); await re.settle();
  assert.equal(re.requests.length, 0); assert.equal(re.state.phase, 'cancelled'); assert.equal(re.state.approval, null);
  assert.equal(re.notes.size, 0);
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

// Chat Completions, as gw.lunaroute.com (vLLM) answered on 2026-10-31.
const CHAT = { configured: true, mode: 'https', api: 'chat', model: 'deepseek-4.1-flash' };
const chatReply = (message, finish = message.tool_calls ? 'tool_calls' : 'stop') => ({ status: 200, body: JSON.stringify({
  id: 'chatcmpl-848e6c764801ca15', object: 'chat.completion', model: 'deepseek-4.1-flash',
  choices: [{ index: 0, finish_reason: finish, message: { role: 'assistant', content: null, reasoning: null, refusal: null, ...message } }],
  usage: { prompt_tokens: 304, completion_tokens: 40 } }) });
const chatCall = (name, args, id = 'chatcmpl-tool-ac92000da65f6a9d') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

test('chat endpoint: request is Chat Completions with the provisioned model', () => {
  const h = harness(null, CHAT);
  h.send('submit', { text: 'What is 17*23?' });
  const req = h.requests[0].parsed;
  assert.equal(req.model, 'deepseek-4.1-flash'); assert.equal(req.stream, false); assert.equal(req.max_tokens, 2048);
  assert.equal(req.reasoning_effort, 'low'); assert.equal(req.parallel_tool_calls, false);
  assert.equal(req.input, undefined); assert.equal(req.instructions, undefined); assert.equal(req.store, undefined);
  assert.equal(req.messages[0].role, 'system'); assert.match(req.messages[0].content, /PicoCalc/);
  assert.deepEqual(req.messages[1], { role: 'user', content: 'What is 17*23?' });
  assert.ok(req.tools.every(t => t.type === 'function' && t.function.name && t.function.parameters.additionalProperties === false));
});

test('chat endpoint: tool call, local result, continuation, answer', () => {
  const h = harness(null, CHAT);
  h.send('submit', { text: 'What is 17*23?' });
  h.result(chatReply({ tool_calls: [chatCall('calculate', { expression: '17*23' })] }));
  assert.equal(h.state.phase, 'tools'); h.tick(2);
  assert.equal(h.requests.length, 2);
  const m = h.requests[1].parsed.messages;
  assert.deepEqual(m[2], { role: 'assistant', content: null, tool_calls: [chatCall('calculate', { expression: '17*23' })] });
  assert.equal(m[3].role, 'tool'); assert.equal(m[3].tool_call_id, 'chatcmpl-tool-ac92000da65f6a9d');
  assert.deepEqual(JSON.parse(m[3].content), { ok: true, value: 391 });
  h.result(chatReply({ content: '17 x 23 = 391' }));
  assert.equal(h.state.phase, 'done'); assert.equal(h.state.history.at(-1).content, '17 x 23 = 391');
  h.send('submit', { text: 'And doubled?' });
  // The earlier answer reaches the model with the tools it relied on; the screen shows only the answer.
  assert.deepEqual(h.requests[2].parsed.messages.slice(1), [{ role: 'user', content: 'What is 17*23?' },
    { role: 'assistant', content: '17 x 23 = 391' },
    { role: 'user', content: '[PicoCalc: for your previous answer the device ran these tools and confirmed the results: calculate: done]\n\nAnd doubled?' }]);
  assert.ok(h.state.entries.every(e => !e.text.includes('[PicoCalc')));
  const re = harness(h.session(), CHAT);
  assert.equal(re.state.history[1].tools, 'calculate: done');
  assert.ok(re.state.entries.every(e => !e.text.includes('[PicoCalc')));
});

test('chat endpoint: text with calls is one assistant message; reasoning is not sent back', async () => {
  const h = harness(null, CHAT);
  h.send('submit', { text: 'List my notes and compute 2+2' });
  h.result(chatReply({ content: 'Checking.', reasoning: 'long private thoughts',
    tool_calls: [chatCall('list_notes', {}, 'c1'), chatCall('calculate', { expression: '2+2' }, 'c2')] }));
  h.tick(); await h.settle(); h.tick(2);
  const m = h.requests[1].parsed.messages;
  assert.equal(m[2].content, 'Checking.'); assert.deepEqual(m[2].tool_calls.map(t => t.id), ['c1', 'c2']);
  assert.deepEqual(m.slice(3).map(x => [x.role, x.tool_call_id]), [['tool', 'c1'], ['tool', 'c2']]);
  assert.ok(!JSON.stringify(m).includes('private thoughts'));
});

test('chat endpoint: a truncated or malformed reply runs no tool', () => {
  const h = harness(null, CHAT);
  h.send('submit', { text: 'Save a note' });
  h.result(chatReply({ tool_calls: [chatCall('save_note', { name: 'a', text: 'b' })] }, 'length'));
  assert.equal(h.state.phase, 'error'); assert.match(h.state.error, /Incomplete response/); assert.equal(h.state.approval, null);
  const g = harness(null, CHAT);
  g.send('submit', { text: 'Hi' });
  g.result({ status: 200, body: JSON.stringify({ choices: [] }) });
  assert.equal(g.state.phase, 'error'); assert.match(g.state.error, /invalid or failed/);
  const e = harness(null, CHAT);
  e.send('submit', { text: 'Hi' });
  e.result({ status: 200, body: JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [{ id: 'bad id!', type: 'function', function: { name: 'calculate', arguments: '{}' } }] } }] }) });
  assert.equal(e.state.phase, 'error'); assert.match(e.state.error, /Invalid or duplicate tool call/);
});

test('model precedence: chosen, then provisioned, then built-in', () => {
  const old = { version: 1, model: 'gpt-6-luna', effort: 'low', history: [], notes: [], pending: false, prompt: '' };
  assert.equal(harness(old, CHAT).state.model, 'deepseek-4.1-flash');
  assert.equal(harness({ ...old, model: 'glm-5.3', chosen: true }, CHAT).state.model, 'glm-5.3');
  assert.equal(harness(null, { configured: true, mode: 'https' }).state.model, 'gpt-6-luna');
  const h = harness(null, CHAT);
  h.send('submit', { text: '/model glm-5.3' }); assert.equal(h.state.model, 'glm-5.3'); assert.equal(h.session().chosen, true);
  h.send('submit', { text: '/model default' }); assert.equal(h.state.model, 'deepseek-4.1-flash'); assert.equal(h.session().chosen, false);
});
