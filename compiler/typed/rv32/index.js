// The core bundle's entry (typed-rv32.js): publishes globalThis.typedRv32. The pass groups are separate
// bundles (passes/registry.js, GROUPS) that install their passes when they load.
import {compile} from "./compile.js";
import {linkSlot} from "./link.js";
import {POLICIES} from "./policy.js";
import {GROUPS, PASSES} from "./passes/registry.js";

globalThis.typedRv32 = {compile, linkSlot, policies: POLICIES,
    passes: PASSES.map(({name, group, kind, needs}) => ({name, group, kind, needs: needs ?? [], file: GROUPS[group]}))};
