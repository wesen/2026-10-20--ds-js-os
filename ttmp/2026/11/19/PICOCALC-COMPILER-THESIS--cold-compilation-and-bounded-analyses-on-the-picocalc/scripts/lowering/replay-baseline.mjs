// Allow the existing replay imports to execute while selecting a historic lowerer.
import {runInThisContext} from 'node:vm';
import {lowererSource} from './compiler-source.mjs';

runInThisContext(lowererSource(process.env.PICOCALC_BASELINE_LOWERER));
const baseline = globalThis.typedRv32;
Object.defineProperty(globalThis, 'typedRv32', {
    configurable: true,
    get: () => baseline,
    set() {},
});
