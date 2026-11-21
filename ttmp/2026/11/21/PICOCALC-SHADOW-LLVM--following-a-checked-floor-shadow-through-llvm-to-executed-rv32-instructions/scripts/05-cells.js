// %% Set up the two names LLVM uses for the same function across GlobalOpt.
const run = a.variant("checked");
const early = run.function("checked_shadow"), late = run.function("kernel");
const E = early.timeline("middle"), M = late.timeline("middle"), B = late.timeline("backend");
const metric = (op, state) => q.run(q.ir.instructions().opcode(op).count().at(state));
const headers = q.ir.instructions().opcode("load").resultType("i32").pointer(late.argument(0)).count();
const value = r => { if (r.status !== "ok" && typeof r.value !== "number" && typeof r.value !== "boolean") throw Error(JSON.stringify(r)); return r.value; };
"ready";
// %% Show which pass first removed the local stack objects.
[5,6].map(i => ({ordinal:i, stackObjects:value(metric("alloca",E.at(i).after)),
    phi:value(metric("phi",E.at(i).after))}));
// %% Count reads of the capacity word at the base pointer, including the adjacent predecessor.
[73,77,78,80,171].map(i => ({ordinal:i,capacityLoads:value(q.run(headers.at(M.at(i).after))),
    conditionalAndUnconditionalBranches:value(metric("br",M.at(i).after))}));
// %% Find the physical register rewrite in the machine-function snapshots.
[69,70,73,74].map(i => ({ordinal:i,noVirtualRegisters:q.run(q.machine.property("NoVRegs").at(B.at(i).after)).value}));
// %% Return the original pass references for the stages cited in the manuscript.
q.run(run.events("middle").where(e=>[5,6,17,73,77,78,79,80,171].includes(e.ordinal))
    .select("ordinal","pass","ref")).rows;
// %% Compare emitted work on the verified sequence of real opening floor pixels.
Object.entries(census).map(([arm,r])=>({arm,bytes:r.kernelBytes,calls:r.calls,
    instructions:r.totals.instructions,stack:r.totals.stackLW+r.totals.stackSW,
    capacityLoads:r.totals.dataLW,elementReads:r.totals.dataLHU}));
// %% Ask the board what each alternative costs on one route.
const labels=["gcc","llvm","nolsr","fastreg","wrap","typed"];
const med = a => {const b=a.slice().sort((u,v)=>u-v);if(!b.length)throw Error("empty");return (b[(b.length-1)>>1]+b[b.length>>1])/2;};
function paired(pose, path, from, to) {
    function sample(arm) { const rows=board.filter(r=>r.pose===pose && r.path===path && r.arm===labels.indexOf(arm));
        const m=new Map(rows.map(r=>[r.block,r.cycles/r.calls])); if(rows.length!==6||m.size!==6)throw Error("requires six distinct blocks");return m; }
    const lhs=sample(from), rhs=sample(to);
    const delta=Array.from(lhs,([i,x])=>100*(rhs.get(i)-x)/x);
    return {from,to,baseline:med([...lhs.values()]),candidate:med([...rhs.values()]),
        pairedChangePct:med(delta),fasterBlocks:delta.filter(v=>v<0).length};
}
labels.map(arm=>paired("default",-1,"llvm",arm));
// %% Show how the conclusion changes across rejection paths and scenes.
({paths:[-1,0,1,2,3].map(path=>({path,...paired("default",path,"llvm","typed")})),
  scenes:[...new Set(board.map(r=>r.pose))].map(pose=>({pose,...paired(pose,-1,"llvm","nolsr")}))});
// %% Partition the instruction gap into disjoint memory-access classes.
const costs = arm => census[arm].totals;
const stackOps = c => c.stackLW+c.stackSW;
const instructionGap = costs("typed").instructions-costs("llvm").instructions;
const excessStack = stackOps(costs("typed"))-stackOps(costs("llvm"));
const excessHeader = costs("typed").dataLW-costs("llvm").dataLW;
({instructionGap,excessStack,excessHeader,samePayloadReads:costs("typed").dataLHU===costs("llvm").dataLHU,
  explainedInstructionSharePct:100*(excessStack+excessHeader)/instructionGap,
  remainingInstructions:instructionGap-excessStack-excessHeader});
// %% Did this target rely on the C signed-overflow contract to produce different instructions?
({sameKernelBytes:census.wrap.sha256===census.llvm.sha256,sha256:census.llvm.sha256,
  cycles:paired("default",-1,"llvm","wrap")});
