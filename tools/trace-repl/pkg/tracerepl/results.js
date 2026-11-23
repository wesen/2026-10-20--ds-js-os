/* results.js — named results that outlive the session.
 * The host injects one bridge object, __results, and deletes it after this script runs.
 * results.save(name, value) writes NAME.json in the service's --results directory with the
 * session, the cell or job, the script's SHA-256, the args, the repository HEAD and every
 * compiler revision the session loaded. results.load(name) returns the whole record.
 */
(function (root, bridge, compiler) {
  'use strict';
  // Captured at install time, so a cell that rebinds `compiler` cannot change provenance.
  const compilers = () => {
    try { return compiler && typeof compiler.loaded === 'function' ? compiler.loaded() : []; }
    catch (e) { return []; }
  };
  const HELP = [
    'results — named results that outlive the session, one JSON file each.',
    '  results.save(name, value)   → {name, path, sha256, bytes, saved}; replaces an earlier record of that name',
    '  results.load(name)          → {name, saved, session, unit, job, script: {sha256, bytes}, args, repo: {root, head}, compilers, value}',
    '  results.list()              → [{name, path, sha256, bytes, saved}]',
    '  results.dir()               the directory (serve --results DIR); trace-repl results lists it from the shell',
    'Names: 1-128 letters, digits, ".", "_" or "-", starting with a letter or digit.',
  ].join('\n');
  root.results = Object.freeze({
    save: (name, value) => bridge.save(String(name), value, JSON.stringify(compilers())),
    load: name => JSON.parse(bridge.load(String(name))),
    list: () => bridge.list(),
    dir: () => bridge.dir(),
    help: () => HELP,
  });
})(globalThis, __results, globalThis.compiler);
