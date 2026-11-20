// A host-only model for authenticated, validate-before-publish frame retention.
function makeScreenRetention(generationOf, report) {
    const frames = new Map();
    return Object.freeze({
        submit({sender, generation}, wire, variant) {
            if (generationOf(sender) !== generation || generation === undefined) {
                report(sender, 'sender-generation');
                return false;
            }
            let root;
            try {
                if (variant === 'B') root = createBinaryView(wire, sender).root;
                else if (variant === 'G') root = admitJSON(wire, sender);
                else throw Error('wire-variant');
            } catch (e) {
                report(sender, e.message);
                return false;
            }
            frames.set(sender, {generation, root});
            return true;
        },
        replay(sender) {
            const entry = frames.get(sender);
            if (entry?.generation === generationOf(sender)) return entry?.root;
        },
        revoke(sender) { frames.delete(sender); }
    });
}
