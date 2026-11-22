/* compiler.js — the Typed compiler at a git revision or from the working tree.
 * The host injects one bridge object, __compiler, and deletes it after this script runs.
 * Public global: compiler. compiler.at(rev) returns one revision's modules:
 *   {revision, files, missing, typedWasm, typedAsync, typedWorld, typedRv32, typedPieLoops,
 *    interp, rayBench, globals} plus read(path), world(name), typedSources(), ray, native and where(line).
 * Two revisions in one session share nothing: each was evaluated in its own scope.
 */
(function (root, bridge) {
  'use strict';
  const MODULES = bridge.modules();
  const RAY = 'picocalc-os/worlds/raytrace/raytrace.typed';
  const BENCH = 'picocalc-os/tools/typed-ray-bench.js';
  // Worlds without a source.list, assembled as the P4 firmware reads them:
  // files_p4.c compiles files/files.typed alone; agenda_p4.c (read_source) appends
  // a newline and agenda/entry.typed to the reminder source.
  const WORLD_LAYOUTS = Object.freeze({ files: ['files.typed'], agenda: ['reminder.typed', 'entry.typed'] });
  // The native interpreter, when the session has one (installed before this script).
  const RV32 = root.rv32 || null;
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
    let nativeTools;
    const native = () => {
      if (nativeTools) return nativeTools;
      if (!RV32) throw new Error('[compiler] this session has no rv32 global, so there is no native interpreter');
      let rayBench = null;
      const loaded = raw.files.find(f => f.path === BENCH);
      if (loaded) {
        const bench = read(BENCH);
        // "worktree" is re-read here; refuse a bench file that changed since compiler.at loaded it.
        if (bench.sha256 !== loaded.sha256)
          throw new Error('[compiler] ' + BENCH + ' changed since compiler.at("' + requested + '") loaded it; call compiler.at again');
        const shadow = Object.create(null);
        new Function('globalThis', 'typedRv32Interp', bench.text)(shadow, RV32);
        rayBench = shadow.typedRayBench ?? null;
      }
      nativeTools = Object.freeze({ interp: RV32, rayBench });
      return nativeTools;
    };
    Object.defineProperties(b, {
      read: { value: read },
      // A world assembled the way the firmware build does: the files named in
      // picocalc-os/worlds/NAME/source.list, joined with newlines.
      // A world assembled the way the firmware build does: the files named in
      // picocalc-os/worlds/NAME/source.list, joined with newlines, or for a world
      // without one, the files of its built-in layout (WORLD_LAYOUTS).
      world: {
        value: name => {
          const dir = 'picocalc-os/worlds/' + String(name) + '/';
          let names, layout;
          try {
            names = read(dir + 'source.list').text.split('\n').map(s => s.trim()).filter(Boolean);
            layout = 'source.list';
          } catch (err) {
            if (!String(err && err.message).includes('does not exist')) throw err;
            if (!Object.prototype.hasOwnProperty.call(WORLD_LAYOUTS, name))
              throw new Error('[compiler] ' + dir + 'source.list does not exist at ' + rev.slice(0, 12) + ', and ' + String(name) +
                ' has no built-in layout (' + Object.keys(WORLD_LAYOUTS).join(', ') + '); assemble it with .read(path)');
            names = WORLD_LAYOUTS[name];
            layout = 'builtin';
          }
          const parts = names.map(p => read(dir + p));
          return { name: String(name), layout, text: parts.map(p => p.text).join('\n'), files: parts.map(p => ({ path: p.path, sha256: p.sha256 })) };
        },
      },
      typedSources: { value: () => bridge.typedSources(rev) },
      // The same revision's tools on the native interpreter: interp is rv32, and rayBench is this
      // revision's tools/typed-ray-bench.js evaluated with typedRv32Interp bound to rv32, so the
      // memory layout, arguments and checks stay the revision's and only the interpreter changes.
      native: { get: () => native() },
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
    '  work.native.interp (=== rv32)   work.native.rayBench   the same bench on the native interpreter',
    '  work.globals.compileTypedWorldRv32   every name the files published',
    '  work.ray   work.world("chess")   work.read(path)   work.typedSources()   sources at the same revision',
    '  work.world(name) → {name, layout, text, files}: worlds/NAME/source.list, or the built-in layout of "files" and "agenda"',
    '  work.files [{path, sha256, bytes, line}]   work.missing (optional files absent at that revision)',
    '  work.where(line) maps a "compiler@REV:LINE" stack position to {path, line}',
    'A commit is evaluated once per session and the same object is returned; "worktree" re-reads the files on every call.',
    'compiler.loaded() lists every set of files this session loaded (results.save records it).',
    'Files: ' + MODULES.map(m => m.path + (m.required ? '' : ' (optional)')).join(', '),
  ].join('\n');

  // Every distinct set of files this session loaded, in load order, for provenance:
  // a "worktree" load is identified by the digest over its files' digests.
  const history = [];
  const remember = b => {
    if (!history.some(h => h.revision === b.revision && h.key === b.key))
      history.push({ requested: b.requested, revision: b.revision, key: b.key, files: b.files.map(f => ({ path: f.path, sha256: f.sha256 })) });
    return b;
  };

  root.compiler = Object.freeze({
    at(rev) {
      if (typeof rev !== 'string' || rev === '') throw new Error('[compiler] at(rev) needs a revision name or "worktree"');
      if (rev === 'worktree') return remember(decorate(bridge.load(rev), rev));
      const commit = bridge.resolve(rev);
      if (!loaded.has(commit)) loaded.set(commit, remember(decorate(bridge.load(commit), rev)));
      return loaded.get(commit);
    },
    // [{requested, revision, key, files: [{path, sha256}]}]: what results.save records.
    loaded: () => history.map(h => Object.assign({}, h, { files: h.files.map(f => Object.assign({}, f)) })),
    modules: () => MODULES.map(m => Object.assign({}, m)),
    help: () => HELP,
    toJSON: () => ({ compiler: 'compiler.at(rev)', loaded: [...loaded.keys()], use: 'compiler.help()' }),
  });
})(globalThis, __compiler);
