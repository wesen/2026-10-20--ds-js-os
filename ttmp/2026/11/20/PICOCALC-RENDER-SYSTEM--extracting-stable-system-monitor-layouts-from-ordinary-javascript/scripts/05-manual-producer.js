// The builder prepends the real sampler, row window, number formatters and graph quantizer.
function worldValues(s) {
  const window = tableWindow(s.worlds, s.sel, 8);
  const rows = window.items.map(w => [w.name, w.state, short(w.turns), share(w.pct),
    short(w.cpu_ms), kb(w.mem_kb), w.restarts ? String(w.restarts) : '·']);
  const w = s.worlds[s.sel] || {};
  const graph = lineGraph(s.lane, Math.max(0.1, ...s.lane), 26, {
    label: `lane busy · peak ${pct(Math.max(0, ...s.lane))}`, right: pct(s.lane[s.lane.length-1]), color:'accent'
  });
  return [graph, rows, window.sel,
    w.pct == null ? `${(w.cpu_ms||0).toFixed(1)} ms since boot` : `${share(w.pct)}% now, ${(w.cpu_ms||0).toFixed(1)} ms since boot`,
    `${w.mbox} / ${w.mbox_peak}`, `${w.budget_ms} ms, ${w.limit_kb} KB`,
    (w.claims||[]).join(' ')||'none',w.last_error||'none',!!w.last_error];
}
function handleValues(s) {
  const window = tableWindow(s.handles, Math.min(s.sel,s.handles.length-1), 14);
  const rows = window.items.map(h=>[String(h.id),h.type,h.claim,h.rights,h.holders.join(' ')||'·',
    h.kb?h.kb+' KB':h.hz?(h.hz>=1e6?h.hz/1e6+' MHz':h.hz/1e3+' kHz'):'',!!h.revoked]);
  return [rows,window.sel];
}
function busValues(s){
  const b=s.last?s.last.buses:[];
  const line=(bus,hist,note)=>[
    lineGraph(hist,1,30,{label:`${bus.name} · ${note}`,right:pct(hist[hist.length-1]),color:bus.name==='spi2'?'blue':'ink'}),
    String(bus.transfers),String(bus.bytes),bus.busy_ms.toFixed(1)+' ms',String(bus.errors),!!bus.errors];
  return b.length?[line(b[0],s.i2c,'STM32 at 0x1F, 10 kHz'),line(b[1],s.spi,'ST7365P panel, 40 MHz')]:[];
}
function manualScreen(s) {
  if(!s.focused)return [1,-1];
  const st=s.last||{t_ms:0};
  return [1,s.tab,(st.t_ms/1000).toFixed(1)+' s',s.tab===0?worldValues(s):s.tab===1?handleValues(s):busValues(s)];
}
