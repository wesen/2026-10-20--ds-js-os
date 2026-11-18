// Loaded after the typed Wasm compiler in both the host and P4 compiler runtime.
(() => {
"use strict";

// The reactor passes the Task record by address. Wasm's i32 parameter type
// alone cannot tell a string reference from a record or a scalar value.
const taskFields = [
    ["done", "bool"], ["textStart", "i32"], ["dueStart", "i32"], ["dueEnd", "i32"],
    ["timeStart", "i32"], ["dateValid", "bool"], ["timeValid", "bool"],
    ["leadStart", "i32"], ["leadEnd", "i32"], ["leadMinutes", "i32"], ["titleLength", "i32"],
];

globalThis.compileAgenda = function compileAgenda(source, reactor) {
    const {bytes, records, entry} = typedWasm.linkWorld(source, reactor, "parseTask");
    if (entry.result !== "bool" || entry.params.join(",") !== "string,buffer,Task")
        throw new SyntaxError("Agenda requires parseTask(line: string, title: buffer, task: Task): bool");
    const fields = records.Task;
    if (!fields || Object.keys(fields).length !== taskFields.length ||
        taskFields.some(([name, type], i) => fields[name]?.type !== type || fields[name].offset !== i * 4))
        throw new SyntaxError("Task fields do not match the Agenda runtime layout");
    return bytes;
};
})();
