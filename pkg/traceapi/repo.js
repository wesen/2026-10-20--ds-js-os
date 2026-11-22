/* repo.js — read-only repository files and startup mounts for a trace-REPL session.
 * The host injects one bridge object, __repo, and deletes it after this script runs.
 * Public globals: repo, mounts. Every file object is {path, revision, sha256, bytes, gzip, text}
 * plus a non-enumerable json() that parses text. sha256 and bytes describe the stored bytes;
 * text is inflated when gzip is true.
 */
(function (root, bridge) {
  'use strict';
  function file(o) {
    Object.defineProperty(o, 'json', {
      value: function () {
        try { return JSON.parse(this.text); }
        catch (err) { throw new Error('[repo] ' + this.path + ' is not JSON: ' + err.message); }
      },
    });
    return o;
  }
  const where = bridge.info();
  const HELP = [
    'repo — read-only files of ' + where.root + (where.head ? ' (HEAD ' + where.head.slice(0, 12) + ' at startup)' : ' (not a git work tree)'),
    '  repo.read(path)          working-tree file now: {path, revision: "worktree", sha256, bytes, gzip, text} and .json()',
    '  repo.show(rev, path)     the file at a git revision (cached per commit): revision is the full commit SHA',
    '  repo.list(path?, rev?)   [{name, type, bytes}] in the working tree, or at rev',
    '  repo.resolve(rev)        full commit SHA of a revision name',
    'Paths are relative to the repository root and may not leave it, even through a symlink. Files are capped at 32 MiB;',
    '.gz files are inflated and their sha256 names the compressed file. Files elsewhere: mounts.help().',
  ].join('\n');
  const repo = {
    root: where.root,
    head: where.head || null,
    read(path) { return file(bridge.read(String(path))); },
    show(rev, path) { return file(bridge.show(String(rev), String(path))); },
    list(path, rev) { return bridge.list(path === undefined ? '.' : String(path), rev === undefined ? '' : String(rev)); },
    resolve(rev) { return bridge.resolve(String(rev)); },
    help() { return HELP; },
    toJSON() { return { repo: where.root, head: where.head || null, use: 'repo.help()' }; },
  };

  const list = bridge.mounts();
  const mounts = {};
  for (const m of list) {
    let cached;
    Object.defineProperty(mounts, m.name, {
      enumerable: true,
      get() { return cached || (cached = file(bridge.mount(m.name))); },
    });
  }
  Object.defineProperty(mounts, 'list', { value: () => list.map(m => Object.assign({}, m)) });
  Object.defineProperty(mounts, 'toJSON', { value: () => list.map(m => Object.assign({}, m)) });
  Object.defineProperty(mounts, 'help', {
    value: () => [
      'mounts — files named on the command line with --mount NAME=PATH, read and digested at startup.',
      '  mounts.list()   [{name, path, sha256, bytes, gzip}]   currently: ' + (list.length ? list.map(m => m.name).join(', ') : 'none'),
      '  mounts.NAME     {name, path, revision: "mount", sha256, bytes, gzip, text} and .json()',
    ].join('\n'),
  });
  root.repo = Object.freeze(repo);
  root.mounts = Object.freeze(mounts);
})(globalThis, __repo);
