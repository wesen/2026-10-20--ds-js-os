// Replaces PICOCALC-RAY-PARITY scripts/01-open-compiler-session.py and repl_client.py.
//
// One ordinary cell. It binds a control and a candidate compiler and the inputs that the
// Python driver used to push into the session in 30,000-character chunks:
//
//   sid=$(trace-repl open --addr ADDR)
//   trace-repl eval --addr ADDR --session "$sid" < 02-open-compiler-session.js
//
// Afterwards: workbench.base and workbench.work are compiler.at() revisions,
// workbench.inputs is [[name, source, imports]] in the order the old driver used
// (ray, the four worlds, then every worlds/**/*.typed), and workbench.raySource,
// workbench.worlds and workbench.sources keep the old binding names.
// Assigned on globalThis, so the cell can be evaluated again in the same session.
globalThis.workbench = (() => {
  const BASE = 'eaf0872', CANDIDATE = '3213028';
  const base = compiler.at(BASE), work = compiler.at(CANDIDATE);
  const text = path => work.read(path).text;
  const worlds = {
    chess: work.world('chess').text,
    editor: work.world('editor').text,
    // Agenda and Files have no source.list; the old driver assembled them like this.
    agenda: text('picocalc-os/worlds/agenda/reminder.typed') + '\n' + text('picocalc-os/worlds/agenda/entry.typed'),
    files: text('picocalc-os/worlds/files/files.typed'),
  };
  const sources = Object.fromEntries(work.typedSources().map(p => [p.replace(/^picocalc-os\//, ''), text(p)]));
  const inputs = [['ray', work.ray, []],
    ...Object.entries(worlds).map(([k, v]) => ['world:' + k, v, work.typedWorld.imports]),
    ...Object.entries(sources).map(([k, v]) => [k, v, []])];
  return { base, work, raySource: work.ray, worlds, sources, inputs };
})();
({
  base: workbench.base.revision, work: workbench.work.revision,
  rv32: [workbench.base, workbench.work].map(b => b.files.find(f => f.path.endsWith('typed-rv32.js')).sha256),
  inputs: workbench.inputs.length,
  bytes: workbench.inputs.reduce((n, [, src]) => n + src.length, 0),
})
