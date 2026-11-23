/* compiler.js — the Typed compiler at a git revision or from the working tree.
 * The host injects one bridge object, __compiler, and deletes it after this script runs.
 * Public global: compiler. compiler.at(rev) returns one revision's modules:
 *   {revision, files, missing, typedTape, typedWasm, typedAsync, typedWorld, typedRv32, typedPieLoops,
 *    interp, rayBench, globals} plus read(path), world(name), typedSources(), ray, native and where(line).
 * Two revisions in one session share nothing: each was evaluated in its own scope.
 */
(function (root, bridge) {
  'use strict';
  const MODULES = bridge.modules();
  // Paths move between revisions (PICOCALC-REPO-LAYOUT): the Typed worlds live under raw.worlds, and the bench
  // tools are found among the files the revision loaded.
  const RAY = 'raytrace/raytrace.typed';
  const BENCH = 'typed-ray-bench.js';
  // Worlds without an app.json or a source.list (before PICOCALC-TYPED-APP-MANIFEST), assembled as the P4
  // firmware read them then: files/files.typed alone; the reminder source, a newline and agenda/entry.typed.
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
    const b = { revision: rev, requested, files: raw.files, missing: raw.missing, key: raw.key, worlds: raw.worlds, globals: raw.globals };
    for (const m of MODULES) b[m.alias] = raw.globals[m.binding] === undefined ? null : raw.globals[m.binding];
    const read = path => file(bridge.read(rev, String(path)));
    let nativeTools;
    const native = () => {
      if (nativeTools) return nativeTools;
      if (!RV32) throw new Error('[compiler] this session has no rv32 global, so there is no native interpreter');
      let rayBench = null;
      const loaded = raw.files.find(f => f.path.endsWith('/' + BENCH));
      if (loaded) {
        const bench = read(loaded.path);
        // "worktree" is re-read here; refuse a bench file that changed since compiler.at loaded it.
        if (bench.sha256 !== loaded.sha256)
          throw new Error('[compiler] ' + loaded.path + ' changed since compiler.at("' + requested + '") loaded it; call compiler.at again');
        const shadow = Object.create(null);
        new Function('globalThis', 'typedRv32Interp', bench.text)(shadow, RV32);
        rayBench = shadow.typedRayBench ?? null;
      }
      nativeTools = Object.freeze({ interp: RV32, rayBench });
      return nativeTools;
    };
    Object.defineProperties(b, {
      read: { value: read },
      // A world assembled the way the firmware build does. From PICOCALC-TYPED-APP-MANIFEST on, the sources
      // that apps/typed/NAME/app.json names, each followed by a newline (as typed_apps.py assembles them; Chess
      // without its embedded painter). Earlier revisions: the files of apps/typed/NAME/source.list joined with
      // newlines, or for a world without one, its built-in layout (WORLD_LAYOUTS).
      world: {
        value: name => {
          const dir = raw.worlds + '/' + String(name) + '/';
          const missing = err => String(err && err.message).includes('does not exist');
          const assemble = (names, layout, join) => {
            const parts = names.map(p => read(dir + p));
            const text = join ? parts.map(p => p.text).join('\n') : parts.map(p => p.text + '\n').join('');
            return { name: String(name), layout, text, files: parts.map(p => ({ path: p.path, sha256: p.sha256 })) };
          };
          try {
            const manifest = read(dir + 'app.json').json();
            if (Array.isArray(manifest.sources)) return assemble(manifest.sources, 'app.json', false);
            throw new Error('[compiler] ' + dir + 'app.json has no sources (an app with variants); assemble it with .read(path)');
          } catch (err) {
            if (!missing(err)) throw err;
          }
          try {
            return assemble(read(dir + 'source.list').text.split('\n').map(s => s.trim()).filter(Boolean), 'source.list', true);
          } catch (err) {
            if (!missing(err)) throw err;
            if (!Object.prototype.hasOwnProperty.call(WORLD_LAYOUTS, name))
              throw new Error('[compiler] ' + dir + 'app.json and source.list do not exist at ' + rev.slice(0, 12) + ', and ' +
                String(name) + ' has no built-in layout (' + Object.keys(WORLD_LAYOUTS).join(', ') + '); assemble it with .read(path)');
            return assemble(WORLD_LAYOUTS[name], 'builtin', true);
          }
        },
      },
      typedSources: { value: () => bridge.typedSources(rev) },
      // The same revision's tools on the native interpreter: interp is rv32, and rayBench is this
      // revision's tools/typed-ray-bench.js evaluated with typedRv32Interp bound to rv32, so the
      // memory layout, arguments and checks stay the revision's and only the interpreter changes.
      native: { get: () => native() },
      ray: { get: () => read(raw.worlds + '/' + RAY).text },
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
    '  work.world(name) → {name, layout, text, files}: the sources of apps/typed/NAME/app.json (earlier: source.list or a built-in layout)',
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
