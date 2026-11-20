globalThis.incrementalEdits = function(app, source) {
    function change(text, from, to, count=1) {
        if(text.split(from).length!==count+1) throw Error("unexpected source anchor: "+from);
        return text.split(from).join(to);
    }
    if(app==="editor") {
        const body=change(source,"return (row % 36) * 100;","return (row % 36) * 99 + 1;");
        const bad=change(body,"editorPreviewSlot(row: i32)","editorPreviewSlot(row: i32, stride: i32)");
        let signature=change(bad,"* 99 + 1;","* stride + 1;");
        signature=change(signature,"editorPreviewSlot(state.previewRows)","editorPreviewSlot(state.previewRows, 99)",2);
        signature=change(signature,"editorPreviewSlot(row)","editorPreviewSlot(row, 99)");
        const layout=change(signature,"    file: i32;\n    opening: bool;","    opening: bool;\n    file: i32;");
        return {base:source,body,bad,signature,layout};
    }
    const body=change(source,"return chessSquare((move / 64) % 64);","return chessSquare((move / 64) % 64) + 1;");
    const bad=change(body,"function chessFrom(move: i32)","function chessFrom(move: i32, bias: i32)");
    let signature=change(bad,"return chessSquare((move / 64) % 64) + 1;","return chessSquare((move / 64) % 64) + bias;");
    signature=change(signature,"chessFrom(move)","chessFrom(move, 1)",7);
    signature=change(signature,"chessFrom(state.lastMove)","chessFrom(state.lastMove, 1)",3);
    const layout=change(signature,"    cursor: i32;\n    selected: i32;","    selected: i32;\n    cursor: i32;");
    return {base:source,body,bad,signature,layout};
};
