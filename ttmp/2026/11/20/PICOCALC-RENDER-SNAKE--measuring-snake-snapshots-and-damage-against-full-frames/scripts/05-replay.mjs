// Run from the repository root. The single inspection hook is inserted in a private prelude copy.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export const prelude = readFileSync('picocalc-os/js/prelude.js', 'utf8');
export const appSource = readFileSync('picocalc-os/js/apps/snake.js', 'utf8');

export function runGame(seed) {
  const math = Object.create(Math);
  const host = {__k(name) {
    if (name === 'self') return 'snake';
    if (name === 'seed') return seed;
    throw Error('Unexpected host call ' + name);
  }};
  const anchor = 'let S = {};';
  assert.equal(prelude.split(anchor).length, 2);
  const instrumented = prelude.replace(anchor, anchor + ' g.inspect = () => S; g.screenOf = (s) => ({tree: def.screen(s), hints: def.hints(s)});');
  new Function('globalThis', 'Math', instrumented)(host, math);
  new Function('app', 'ui', 'Math', appSource)(host.app, host.ui, math);
  assert.deepEqual(host.__init().every, [110]);
  return host;
}

export function capture() {
  const game = runGame(5172), frames = [], actions = [];
  function action(id, kind, type, payload = null, group = 'manual') {
    game.__dispatch(kind, type, JSON.stringify(payload), 'compositor', false);
    const state = structuredClone(game.inspect());
    const frame = game.__render();
    assert.equal(frame, JSON.stringify(game.screenOf(state)));
    frames.push({id, group, state, frame});
    actions.push({id, kind, type, payload});
  }
  const key = (id, k) => action(id, 0, 'key', {key:k, ch:k.length===1?k:'', state:'down'});
  const tick = (id, group) => action(id, 1, 0, null, group);
  action('start', 2, '');
  assert.deepEqual(game.inspect().food, [7,8]);
  action('focus', 0, 'focus');
  tick('eat');
  assert.equal(game.inspect().score, 10);
  key('reject-reverse','left');
  assert.deepEqual(game.inspect().next, [1,0]);
  key('turn-down','down');
  tick('move-down');
  action('blur',0,'blur');
  tick('paused-timer');
  assert.equal(game.inspect().ticks, 2);
  action('refocus',0,'focus');
  key('turn-left','left');
  tick('move-left');
  key('turn-up','up');
  tick('self-collision');
  assert.equal(game.inspect().alive,false);
  assert.equal(game.inspect().best,10);
  tick('dead-timer');
  key('restart','enter');
  assert.deepEqual(game.inspect().body, [[6,8],[5,8],[4,8],[3,8]]);
  tick('right-again');
  key('loop-down','s'); tick('loop-leg-1');
  key('loop-left','a'); tick('loop-leg-2');
  const tail = [...game.inspect().body.at(-1)];
  key('loop-up','w'); tick('enter-vacated-tail');
  assert.deepEqual(game.inspect().body[0], tail);
  assert.equal(game.inspect().alive,true);
  for(let i=1;i<=9;i++) tick('wall-run-'+i);
  assert.equal(game.inspect().alive,false);
  key('restart-after-wall','enter');
  key('enable-autopilot','p');
  for(let i=1;i<=200;i++) tick('auto-'+i,'autopilot');
  assert(game.inspect().score>10 && game.inspect().alive);
  key('manual-takes-over','right');
  assert.equal(game.inspect().auto,false);

  // Constructed valid states, never mixed into the real-input statistics.
  const path = Array.from({length:396}, (_,i) => {
    const y=Math.floor(i/22), off=i%22; return [y%2?21-off:off, y];
  });
  for(const length of [300,395]) {
    const state={...structuredClone(game.inspect()), body:path.slice(0,length), score:(length-4)*10,
      best:0, food:path[length], alive:true, auto:false};
    frames.push({id:'fixture-'+length,group:'constructed',state,frame:JSON.stringify(game.screenOf(state))});
  }
  return {frames, actions, game};
}
