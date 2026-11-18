"use strict";

// Stage examples of schema-driven source migration. This does not implement a compiler or runtime.
const { cpSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { parse } = require("acorn");

const [sourceDir, targetDir] = process.argv.slice(2);
cpSync(sourceDir, targetDir, { recursive: true });
const manifest = JSON.parse(readFileSync(join(sourceDir, "system.json"), "utf8"));
const table = `
class CatalogStringTable {
  constructor(entries = []) {
    this.items = Object.create(null);
    for (const [key, value] of entries instanceof CatalogStringTable ? Object.entries(entries.items) : entries)
      this.set(key, value);
  }
  has(key) { return Object.hasOwn(this.items, key); }
  get(key) { return this.items[key]; }
  set(key, value) {
    if (typeof key !== "string") throw new Error("expected string key");
    this.items[key] = value;
  }
}
class CatalogStringSet {
  constructor(keys = []) {
    this.items = new CatalogStringTable();
    this.size = 0;
    for (const key of keys) this.add(key);
  }
  has(key) { return this.items.has(key); }
  add(key) {
    if (!this.has(key)) {
      this.items.set(key, true);
      this.size++;
    }
  }
}
`;

let missing = 0, maps = 0, sets = 0, explicitSorts = 0, sortedUnique = 0;
for (const file of ["prelude.js", ...manifest.worlds.map((w) => w.file)]) {
  let source = readFileSync(join(sourceDir, file), "utf8");
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const edits = [];
  const add = (node, text) => edits.push({ start: node.start, end: node.end, text });
  function walk(node) {
    if (node.type === "BinaryExpression" && ["==", "!="].includes(node.operator)) {
      const operand = node.left.value === null ? node.right : node.right.value === null ? node.left : null;
      if (!operand) throw new Error(file + " gained a general loose comparison");
      add(node, (node.operator === "!=" ? "!" : "") + "catalogMissing(" + source.slice(operand.start, operand.end) + ")");
      missing++;
    }
    if (node.type === "NewExpression" && file !== "prelude.js") {
      if (node.callee.name === "Map") { add(node.callee, "CatalogStringTable"); maps++; }
      if (node.callee.name === "Set" && file !== "apps/agenda.js") { add(node.callee, "CatalogStringSet"); sets++; }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) { if (child?.type) walk(child); }
      else if (value?.type) walk(value);
    }
  }
  walk(ast);
  let previous = source.length;
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) {
    if (end > previous) throw new Error(file + " has overlapping changes");
    source = source.slice(0, start) + text + source.slice(end);
    previous = start;
  }
  if (edits.length && /catalogMissing\(/.test(source)) {
    const directive = ast.body[0]?.directive ? ast.body[0].end : 0;
    source = source.slice(0, directive) + "\nfunction catalogMissing(v) { return v === null || v === undefined; }\n" + source.slice(directive);
  }
  if (source.includes("new CatalogString")) source = table + source;
  if (file === "apps/agenda.js") {
    const before = "[...new Set(dated.map((t) => t.date))].filter((d) => !iso || d >= iso).sort()";
    const after = "dated.map((t) => t.date).filter((d) => !iso || d >= iso).sort().filter((d, i, ds) => i === 0 || d !== ds[i - 1])";
    if (!source.includes(before)) throw new Error("Agenda input changed");
    source = source.replace(before, after);
    sortedUnique++;
  }
  if (file === "apps/files.js") {
    const before = "(b.dir - a.dir) || (a.name < b.name ? -1 : 1)";
    const after = "a.dir === b.dir ? (a.name < b.name ? -1 : 1) : (b.dir ? 1 : -1)";
    if (!source.includes(before)) throw new Error("Files input changed");
    source = source.replace(before, after);
    explicitSorts++;
  }
  writeFileSync(join(targetDir, file), source);
}
console.log(JSON.stringify({ missing, maps, sets, explicitSorts, sortedUnique }));
