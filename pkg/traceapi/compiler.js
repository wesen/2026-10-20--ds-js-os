/* compiler.js — the Typed compiler at a git revision or from the working tree.
 * The host injects one bridge object, __compiler, and deletes it after this script runs.
 * Public global: compiler. compiler.at(rev) returns one revision's modules:
 *   {revision, files, missing, typedWasm, typedAsync, typedWorld, typedRv32, typedPieLoops,
 *    interp, rayBench, globals} plus read(path), world(name), typedSources(), ray and where(line).
 * Two revisions in one session share nothing: each was evaluated in its own scope.
 */
(function (root, bridge) {
  'use strict';
  const MODULES = bridge.modules();
  const RAY = 'picocalc-os/worlds/raytrace/raytrace.typed';
  function file(o) {
    Object.defineProperty(o, 'json', { value: function () { return JSON.parse(this.text); } });
    return o;
  }
  // Commits are immutable, so each session evaluates a commit's files once.
  const loaded = new Map();

  function decorate(raw, requested) {
    const rev = raw.revision;
    const b = { revision: rev, requested, files: raw.files, missing: raw.missing, key: raw.key, globals: raw.globals };
    for (const m of MODULES) b[m.alias] = raw.globals[m.binding] === undefined ? null : raw.globals[m.binding];
    const read = path => file(bridge.read(rev, String(path)));
    Object.defineProperties(b, {
      read: { value: read },
      // A world assembled the way the firmware build does: the files named in
      // picocalc-os/worlds/NAME/source.list, joined with newlines.
      world: {
        value: name => {
          const dir = 'picocalc-os/worlds/' + String(name) + '/';
          let list;
          try { list = read(dir + 'source.list'); }
          catch (err) {
            throw new Error('[compiler] ' + dir + 'source.list does not exist at ' + rev.slice(0, 12) +
              '; assemble that world from its files with .read(path)');
          }
          const parts = list.text.split('\n').map(s => s.trim()).filter(Boolean).map(p => read(dir + p));
          return { name: String(name), text: parts.map(p => p.text).join('\n'), files: parts.map(p => ({ path: p.path, sha256: p.sha256 })) };
        },
      },
      typedSources: { value: () => bridge.typedSources(rev) },
      ray: { get: () => read(RAY).text },
      where: {
        value: line => {
          const n = Number(line);
          for (let i = raw.files.length - 1; i >= 0; i--)
            if (n >= raw.files[i].line) return { path: raw.files[i].path, line: n - raw.files[i].line + 1 };
          return null;
        },
      },
      toJSON: { value: () => ({ revision: rev, requested, files: raw.files, missing: raw.missing }) },
    });
    return b;
  }

  const HELP = [
    'compiler — the Typed compiler and its host tools, at a git revision or from the working tree.',
    '  const base = compiler.at("eaf0872"), work = compiler.at("worktree")',
    '  work.typedRv32.compile(source, imports, 96 * 1024, options)   work.typedWorld.imports',
    '  work.interp (tools/rv32-interp.js)   work.rayBench.frameProfile(program) (tools/typed-ray-bench.js)',
    '  work.globals.compileTypedWorldRv32   every name the files published',
    '  work.ray   work.world("chess")   work.read(path)   work.typedSources()   sources at the same revision',
    '  work.files [{path, sha256, bytes, line}]   work.missing (optional files absent at that revision)',
    '  work.where(line) maps a "compiler@REV:LINE" stack position to {path, line}',
    'A commit is evaluated once per session and the same object is returned; "worktree" re-reads the files on every call.',
    'Files: ' + MODULES.map(m => m.path + (m.required ? '' : ' (optional)')).join(', '),
  ].join('\n');

  root.compiler = Object.freeze({
    at(rev) {
      if (typeof rev !== 'string' || rev === '') throw new Error('[compiler] at(rev) needs a revision name or "worktree"');
      if (rev === 'worktree') return decorate(bridge.load(rev), rev);
      const commit = bridge.resolve(rev);
      if (!loaded.has(commit)) loaded.set(commit, decorate(bridge.load(commit), rev));
      return loaded.get(commit);
    },
    modules: () => MODULES.map(m => Object.assign({}, m)),
    help: () => HELP,
    toJSON: () => ({ compiler: 'compiler.at(rev)', loaded: [...loaded.keys()], use: 'compiler.help()' }),
  });
})(globalThis, __compiler);
