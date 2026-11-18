"use strict";

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { parse, version } = require("acorn");

const root = resolve(process.argv[2] || "picocalc-os/js");
const manifest = JSON.parse(readFileSync(resolve(root, "system.json"), "utf8"));
const binaryBit = new Set(["<<", ">>", ">>>", "&", "|", "^"]);
const arithmetic = new Set(["+", "-", "*", "/", "%", "**"]);
const ops = ["record", "recordSpread", "computed", "keyedMutations", "objectLib", "numbers", "math", "arithmetic",
  "bitwise", "bitwiseOrZero", "mapSet", "functions", "capturingFunctions", "strictEq", "looseEq", "nullishEq",
  "logicalDefaults", "nullishOps", "null", "undefined", "json", "events", "try", "throw", "async", "await",
  "promiseUse", "moduleSyntax", "classes", "eval", "regexp", "date"];

function children(node, visit) {
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      for (const child of value) if (child?.type) visit(child, key);
    } else if (value?.type) {
      visit(value, key);
    }
  }
}

function bindings(pattern, found) {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier": found(pattern); break;
    case "RestElement": bindings(pattern.argument, found); break;
    case "AssignmentPattern": bindings(pattern.left, found); break;
    case "ArrayPattern": pattern.elements.forEach((p) => bindings(p, found)); break;
    case "ObjectPattern":
      pattern.properties.forEach((p) => bindings(p.type === "RestElement" ? p : p.value, found));
      break;
  }
}

function count(file) {
  const src = readFileSync(resolve(root, file), "utf8");
  const lines = src.split("\n");
  const ast = parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });
  const positions = Object.fromEntries(ops.map((op) => [op, []]));
  const add = (op, node) => positions[op].push(
    [node.loc.start.line, node.loc.start.column + 1, lines[node.loc.start.line - 1].trim()]
  );

  const declarations = new Set();
  const scopes = new Map();
  function bind(scope, pattern) {
    bindings(pattern, (name) => {
      declarations.add(name);
      scope.names.add(name.name);
    });
  }
  function scopeFor(node, outer, fn = outer?.fn ?? null) {
    const scope = { outer, fn, names: new Set() };
    scopes.set(node, scope);
    return scope;
  }
  function identify(node, scope) {
    const isFunction = /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(node.type);
    if (isFunction) {
      add("functions", node);
      if (node.async) add("async", node);
      if (node.type === "FunctionDeclaration") bind(scope, node.id);
      scope = scopeFor(node, scope, node);
      bind(scope, node.id);
      node.params.forEach((p) => bind(scope, p));
    } else if (node.type === "Program" || /^(BlockStatement|CatchClause|ForStatement|ForInStatement|ForOfStatement|SwitchStatement)$/.test(node.type)) {
      scope = scopeFor(node, scope);
      if (node.type === "CatchClause") bind(scope, node.param);
    }
    if (node.type === "VariableDeclaration") {
      let declScope = scope;
      if (node.kind === "var") {
        while (declScope.outer && declScope.outer.fn === declScope.fn) declScope = declScope.outer;
      }
      node.declarations.forEach((d) => bind(declScope, d.id));
    } else if (node.type === "ClassDeclaration") {
      bind(scope, node.id);
    } else if (node.type === "ImportDeclaration") {
      node.specifiers.forEach((s) => bind(scope, s.local));
    }
    children(node, (child) => identify(child, scope));
  }
  identify(ast, null);

  const captured = new Set();
  function scan(node, scope, parent, key) {
    scope = scopes.get(node) || scope;
    if (node.type === "Identifier") {
      const staticName = key === "key" && !parent.computed
        || key === "property" && parent.type === "MemberExpression" && !parent.computed
        || /^(LabeledStatement|ContinueStatement|BreakStatement)$/.test(parent.type) && key === "label";
      if (!declarations.has(node) && !staticName) {
        let bound = scope;
        while (bound && !bound.names.has(node.name)) bound = bound.outer;
        if (scope.fn && bound?.fn && scope.fn !== bound.fn) captured.add(scope.fn);
        if (!bound && node.name === "undefined") add("undefined", node);
      }
    }

    switch (node.type) {
      case "ObjectExpression": add("record", node); break;
      case "SpreadElement":
        if (parent.type === "ObjectExpression") add("recordSpread", node);
        break;
      case "MemberExpression":
        if (node.computed) add("computed", node);
        if (node.optional) add("nullishOps", node);
        break;
      case "AssignmentExpression":
      case "UpdateExpression":
      case "UnaryExpression": {
        const target = node.left || node.argument;
        if (target.type === "MemberExpression" && target.computed
            && (node.type !== "UnaryExpression" || node.operator === "delete")) add("keyedMutations", node);
        if (binaryBit.has(node.operator.slice(0, -1)) || node.operator === "~") add("bitwise", node);
        if (arithmetic.has(node.operator) || arithmetic.has(node.operator.slice(0, -1)) || node.type === "UpdateExpression") add("arithmetic", node);
        if (["||=", "&&="].includes(node.operator)) add("logicalDefaults", node);
        if (node.operator === "??=") add("nullishOps", node);
        break;
      }
      case "Literal":
        if (typeof node.value === "number") add("numbers", node);
        if (node.value === null) add("null", node);
        if (node.regex) add("regexp", node);
        break;
      case "BinaryExpression":
        if (binaryBit.has(node.operator)) {
          add("bitwise", node);
          if (node.operator === "|" && node.right.value === 0) add("bitwiseOrZero", node);
        }
        if (arithmetic.has(node.operator)) add("arithmetic", node);
        if (["===", "!=="].includes(node.operator)) add("strictEq", node);
        if (["==", "!="].includes(node.operator)) {
          add("looseEq", node);
          if (node.left.value === null || node.right.value === null) add("nullishEq", node);
        }
        break;
      case "LogicalExpression":
        add(node.operator === "??" ? "nullishOps" : "logicalDefaults", node);
        break;
      case "TryStatement": add("try", node); break;
      case "ThrowStatement": add("throw", node); break;
      case "AwaitExpression": add("await", node); break;
      case "ImportDeclaration":
      case "ImportExpression":
      case "ExportNamedDeclaration":
      case "ExportDefaultDeclaration":
      case "ExportAllDeclaration": add("moduleSyntax", node); break;
      case "ClassDeclaration":
      case "ClassExpression": add("classes", node); break;
      case "CallExpression":
      case "NewExpression": {
        const callee = node.callee;
        const direct = callee.name;
        const method = callee.property?.name;
        const receiver = callee.object?.name;
        if (node.optional) add("nullishOps", node);
        if (["Object", "Reflect"].includes(receiver)) add("objectLib", node);
        if (["Map", "Set", "WeakMap", "WeakSet"].includes(direct)) add("mapSet", node);
        if (receiver === "Math") add("math", node);
        if (receiver === "Date" || direct === "Date") add("date", node);
        if (receiver === "JSON") add("json", node);
        if (["send", "publish", "ask"].includes(direct) || ["on", "every", "onStart"].includes(method)) add("events", node);
        if (direct === "Promise" || receiver === "Promise" || ["then", "catch", "finally"].includes(method)) add("promiseUse", node);
        if (direct === "eval" || callee.type === "SequenceExpression" && callee.expressions.at(-1).name === "eval") add("eval", node);
        break;
      }
    }
    children(node, (child, role) => scan(child, scope, node, role));
  }
  scan(ast, null, null, null);
  for (const fn of captured) add("capturingFunctions", fn);
  for (const occurrences of Object.values(positions)) occurrences.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { file, counts: Object.fromEntries(ops.map((op) => [op, positions[op].length])), positions };
}

const worlds = Object.fromEntries(manifest.worlds.map(({ name, file }) => [name, count(file)]));
const prelude = count("prelude.js");
const totals = Object.fromEntries(ops.map((op) => [op, Object.values(worlds).reduce((n, item) => n + item.counts[op], 0)]));
const worldCounts = Object.fromEntries(ops.map((op) => [op, Object.values(worlds).filter((item) => item.counts[op] > 0).length]));
if (process.argv[3] === "--positions") {
  console.log(JSON.stringify({ acorn: version, worldCounts, totals, worlds, prelude }, null, 2));
} else {
  console.log(["population", ...ops].join("\t"));
  for (const [name, value] of Object.entries(worlds)) console.log([name, ...Object.values(value.counts)].join("\t"));
  for (const [name, values] of Object.entries({ "all-worlds": totals, "worlds-with-use": worldCounts, prelude: prelude.counts })) {
    console.log([name, ...Object.values(values)].join("\t"));
  }
}
