/* The four transitions use the shipped Editor source, joined by its own CMake rule. */
(() => {
"use strict";
function change(src, from, to, count = 1) {
    if (src.split(from).length !== count + 1) throw new Error("edit anchor: " + from);
    return src.split(from).join(to);
}
function edits(source) {
    const body = change(source, "return (row % 36) * 100;", "return (row % 36) * 99;");
    const bad = change(body, "editorPreviewSlot(row: i32)", "editorPreviewSlot(row: i32, stride: i32)");
    let sig = change(bad, "return (row % 36) * 99;", "return (row % 36) * stride;");
    sig = change(sig, "editorPreviewSlot(state.previewRows)", "editorPreviewSlot(state.previewRows, 99)", 2);
    sig = change(sig, "editorPreviewSlot(row)", "editorPreviewSlot(row, 99)");
    const layout = change(sig,"    file: i32;\n    offered: i32;","    offered: i32;\n    file: i32;");
    const witness = change(layout,"    previewRows: i32;\n    previewUnits: i32;",
                                  "    previewUnits: i32;\n    previewRows: i32;");
    return {bad, sequence: [source, body, sig, layout, witness]};
}
const limits = [0, 256 * 1024, 40 * 1024];
globalThis.editorEdits = edits;
globalThis.editorCaps = limits;
globalThis.editorTrial = function(source, reactor, mode, id) {
    const all = edits(source).sequence;
    const parent = all[id];
    const changed = all[id + 1];
    if (!mode) {
        compileTypedWorldRv32(parent, reactor);
        return {changed, compile: text => compileTypedWorldRv32(text, reactor), stats: () => [0, 0, 120, 0]};
    }
    const session = createFunctionRebuild(rebuildWorld, reactor, limits[mode], 120);
    if (session.build(parent).mode !== "fragments") throw new Error("failed to seed Editor fragments");
    let built = 0, reused = 0;
    return {changed, compile(text) {
        const edit = session.build(text);
        if (edit.mode !== "fragments") throw new Error(edit.reason || JSON.stringify(edit.error));
        built = edit.built.length;
        reused = edit.reused.length;
        return edit.bytes;
    }, stats() { return [session.resident.count, session.resident.bytes, built, reused]; }};
};
})();
