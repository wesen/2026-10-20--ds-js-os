// Private prototype. Every committed backend-version/ABI identity is supplied by the harness.
globalThis.fragmentSession = function(prior) {
    let descriptor, reusable, priorRoot, reused = 0, rebuilt = 0;
    const next = Object.create(null);
    function init(imports, functions, records, enums, distinct, lowered) {
        descriptor = JSON.stringify([
            imports.map(f => [f.name,f.params,f.result,Boolean(f.awaitable)]),
            functions.map(f => [f.name,f.params,f.paramNames,f.result]),
            [...records].map(([name,fields]) => [name,[...fields]]),
            [...enums].map(([name,fields]) => [name,[...fields]]), [...distinct],
            lowered ? [lowered.prefix,[...lowered.startFields]] : null
        ]);
        priorRoot = prior && prior.descriptor === descriptor ? prior.items : null;
    }
    function lookup(lex, fn, edges) {
        const old = priorRoot && Object.hasOwn(priorRoot,fn.name) && priorRoot[fn.name];
        reusable = null;
        if (old && Array.isArray(old.words) && Array.isArray(old.calls) && lex.source.startsWith(old.body,fn.bodyAt)) {
            for (const edge of old.edges) edges.push(edge);
            reusable = next[fn.name] = old;
            reused++;
            return true;
        }
        lex.offset = fn.bodyAt;
        lex.next();
        const end = lex.skipBody();
        if (end !== undefined) next[fn.name] = {body:lex.source.slice(fn.bodyAt,end), edges};
        rebuilt++;
        return false;
    }
    function lower(fn, targets, build) {
        if (reusable) {
            if (reusable !== next[fn.name]) throw Error("fragment emission order differs");
            const old = reusable;
            return {words:old.words.slice(), calls:old.calls.map(([from,index,offset,rd]) =>
                ({from, target:index < 0 ? {at:offset} : targets[index], rd}))};
        }
        const built = build();
        const saved = next[fn.name];
        if (saved) {
            saved.words = built.words.slice();
            saved.calls = built.calls.map(({from,target,rd}) => {
                const index = targets.indexOf(target);
                return [from,index,index < 0 ? target.at : 0,rd];
            });
        }
        return built;
    }
    return {init,lookup,lower,commit:() => ({descriptor,items:next}),stats:() => ({reused,rebuilt})};
};
