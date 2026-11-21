// A replay must use the compiler revision supporting the measured firmware.
import {execFileSync} from "node:child_process";
import {createContext, runInContext} from "node:vm";
export const compilerRevision = "9a1ff99d2e11c9f3618fc42e979b643c1023521d";
export function loadCompiler(names) {
    const vm = createContext({});
    for (const name of names) {
        const path = "picocalc-os/compiler/" + name + ".js";
        const source = execFileSync("git", ["show", compilerRevision + ":" + path], {encoding:"utf8"});
        runInContext(source, vm, {filename:path});
    }
    return vm;
}
