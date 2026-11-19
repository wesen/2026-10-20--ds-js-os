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

const signatures = [
    ["parseTask", "bool", "string,buffer,Task"],
    ["normalizeEntry", "i32", "string,i32,buffer,EntryError"],
    ["agendaDateKey", "i32", "i32,bool"],
    ["entryAddDays", "i32", "i32,i32"],
    ["entryWeekday", "i32", "i32"],
    ["agendaMark", "i32", "bool,bool"],
];
const entries = signatures.map(([name]) => name);

function validateAgenda(records, functions) {
    for (const [name, result, params] of signatures) {
        const entry = functions.find(fn => fn.name === name);
        if (!entry || entry.result !== result || entry.params.join(",") !== params)
            throw new SyntaxError("Agenda requires " + name + "(" + params + "): " + result);
    }
    for (const [record, layout] of [["Task", taskFields], ["EntryError", [["start", "i32"], ["end", "i32"]]]]) {
        const fields = records[record];
        if (!fields || Object.keys(fields).length !== layout.length ||
            layout.some(([name, type], i) => fields[name]?.type !== type || fields[name].offset !== i * 4))
            throw new SyntaxError(record + " fields do not match the Agenda runtime layout");
    }
}

globalThis.compileAgenda = function compileAgenda(source, reactor) {
    const {bytes, records, signatures} = typedWasm.linkWorld(source, reactor, entries);
    validateAgenda(records, signatures);
    return bytes;
};

globalThis.compileAgendaRv32 = function compileAgendaRv32(source, reactor) {
    const program = typedRv32.compile(source);
    validateAgenda(program.records, program.signatures);
    return typedRv32.linkSlot(program, reactor, entries);
};
})();
