// The repository root and repository-relative paths, for every bench script.
// Bench scripts name repository files by their repository-relative path ("compiler/typed/typed-wasm.js"),
// so that a directory move is one textual rewrite of that prefix across the tree.
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const repoPath = (...parts) => join(root, ...parts);
