// Frames in WorldState: one per task and async function it reaches, with state, token, the saved scalars and,
// for a function awaited from two places, its caller; and the asyncLayout the backends publish.
function allocate(program) {
    const tasks = new Map();
    const frames = [];
    for (const fn of program.functions.values()) {
        if (!program.tasks.has(fn)) continue;
        const reachable = new Set([fn]);
        for (const current of reachable)
            for (const wait of current.waits) if (wait.callee) reachable.add(wait.callee);
        const task = {fn, frames: new Map()};
        for (const current of program.functions.values()) {
            if (!reachable.has(current)) continue;
            const id = frames.length + 1;
            const base = program.prefix + id + "_" + fn.name + "_" + current.name + "_";
            const frame = {fn: current, id, base, task, parents: [], fields: [], slots: new Map()};
            task.frames.set(current, frame);
            frames.push(frame);
        }
        for (const frame of task.frames.values()) {
            for (const wait of frame.fn.waits) {
                if (!wait.callee) continue;
                const child = task.frames.get(wait.callee);
                child.parents.push({frame, wait, id: child.parents.length + 1});
            }
        }
        task.root = task.frames.get(fn);
        tasks.set(fn, task);
    }
    for (const frame of frames) {
        frame.fields.push({name: frame.base + "state", type: "i32"}, {name: frame.base + "token", type: "i32"});
        for (const binding of frame.fn.saved) {
            const name = frame.base + "v" + binding.index + "_" + binding.name;
            frame.slots.set(binding, name);
            // A frame can refer to a scalar type declared after WorldState.
            // Its external layout uses only the two ABI storage types.
            frame.fields.push({name, type: binding.type === "bool" ? "bool" : "i32"});
        }
        if (frame.parents.length > 1) frame.fields.push({name: frame.base + "caller", type: "i32"});
    }
    const fields = frames.flatMap(frame => frame.fields);
    const layout = {declaredFields: program.stateFields, totalFields: program.stateFields + fields.length,
        tasks: Object.fromEntries([...tasks.values()].map(task => [task.fn.name, [...task.frames.values()].map(frame => ({
            function: frame.fn.name,
            fields: frame.fields.map(field => field.name),
            waits: frame.fn.waits.map(wait => ({
                id: wait.id, line: Number(location(program.source, wait.at).split(":")[0]),
                callee: wait.name, saved: wait.saved.map(binding => binding.name),
            })),
        }))]))};
    return {tasks, frames, fields, layout};
}
