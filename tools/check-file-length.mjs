#!/usr/bin/env node
// Fails when a tracked source file is longer than the limit and tools/file-length-exceptions.txt does not list it
// (PICOCALC-SPLIT-FILES). Run by `make test-generated`.
//
//   node tools/check-file-length.mjs            check; exit 1 with the offenders
//   node tools/check-file-length.mjs --list     print every source file over the limit, longest first
//
// Source files: C, C++, assembly, JavaScript, Go, Python, Typed, shell, Makefiles and CMakeLists.txt, outside ttmp/.
// An exception is a path, or a directory ending in "/**", followed by "--" and its reason: generated, vendored,
// cji (the book's compiler), a table, or the name of the ticket that is splitting or replacing the file. A listed
// path that no longer exists or is no longer over the limit is an error too, so an entry comes off when its ticket
// lands.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIMIT = 500;
const SOURCE = /\.(c|h|cc|cpp|hpp|S|s|js|mjs|cjs|go|py|typed|sh)$|(^|\/)(Makefile|CMakeLists\.txt)$/;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exceptionsFile = join(root, "tools/file-length-exceptions.txt");

const lines = (path) => {
  const text = readFileSync(join(root, path), "utf8");
  return text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
};

const exact = new Map(), trees = [], errors = [];
readFileSync(exceptionsFile, "utf8").split("\n").forEach((line, i) => {
  if (!line.trim() || line.startsWith("#")) return;
  const m = /^(\S+)\s+--\s+(\S.*)$/.exec(line);
  if (!m) { errors.push(`file-length-exceptions.txt:${i + 1}: expected "PATH -- REASON": ${line}`); return; }
  if (m[1].endsWith("/**")) trees.push(m[1].slice(0, -2));
  else if (exact.has(m[1])) errors.push(`file-length-exceptions.txt:${i + 1}: ${m[1]} is listed twice`);
  else exact.set(m[1], m[2]);
});

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).split("\0")
  .filter((p) => p && !p.startsWith("ttmp/") && SOURCE.test(p));
const long = [];
for (const path of tracked) {
  let n;
  try { n = lines(path); } catch { continue; }   // deleted in the working tree, not yet staged
  if (n > LIMIT) long.push([n, path]);
}
long.sort((a, b) => b[0] - a[0]);

if (process.argv.includes("--list")) {
  for (const [n, path] of long) {
    const why = exact.get(path) ?? (trees.find((t) => path.startsWith(t)) ? "(tree)" : "NOT LISTED");
    console.log(`${String(n).padStart(6)}  ${path}  ${why}`);
  }
  process.exit(0);
}

const over = new Set(long.map(([, p]) => p));
for (const [n, path] of long)
  if (!exact.has(path) && !trees.some((t) => path.startsWith(t)))
    errors.push(`${path}: ${n} lines, over ${LIMIT}; split it, or list it in tools/file-length-exceptions.txt with a reason`);
for (const path of exact.keys())
  if (!over.has(path)) errors.push(`${path}: listed in tools/file-length-exceptions.txt but not a tracked source file over ${LIMIT} lines; remove the entry`);

if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log(`file length: ${tracked.length} source files, ${long.length} over ${LIMIT} lines, all listed (${exact.size} files, ${trees.length} trees)`);
