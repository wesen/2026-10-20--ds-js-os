const CAP = 41;
const offsets = [76, 204, 332, 460, 588, 716]; // payloads start at multiples of 16
const edges = [0, 1, 127, 128, 255, 256, 257, 32767, 32768, 32769, 65280, 65534, 65535];

function scenario(name, n, changes = {}) {
    const ptrs = [...offsets];
    const capacities = Array(6).fill(CAP);
    if (changes.alias) {
        const [a, b, delta] = changes.alias;
        ptrs[a] = ptrs[b] + delta;
    }
    if (changes.misalign) ptrs[changes.misalign[0]] += changes.misalign[1];
    if (changes.short) capacities[changes.short[0]] = changes.short[1];
    const bytes = new Uint8Array(896);
    const view = new DataView(bytes.buffer);
    const seed = changes.seed ?? 1;
    let rng = seed;
    for (let i = 0; i < bytes.length; i++) {
        rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
        bytes[i] = rng >>> 24;
    }
    for (let p = 0; p < 3; p++) {
        for (let i = 0; i < CAP; i++) {
            if (i < edges.length || seed === 1) {
                view.setUint16(ptrs[p] + 4 + 2*i, edges[(i + 4*p) % edges.length], true);
            }
        }
    }
    // Write the capacities last so overlapping views begin with the specified headers.
    for (let p = 0; p < 6; p++) view.setUint32(ptrs[p], capacities[p], true);
    return {name, n, args: [...ptrs, n], bytes, ...changes};
}

export function cases() {
    const result = [];
    for (const n of [-2147483648,-1,0,1,7,8,9,15,16,17,23,24,25,31,32,33,40,41])
        result.push(scenario('count-'+n,n,{vector: n >= 8}));
    for (let p = 0; p < 6; p++) {
        for (const shift of [4,8,12])
            result.push(scenario('misalign-'+p+'-'+shift,25,{misalign:[p,shift],vector:false}));
        for (const cap of [0,1,7,8,9,15,16])
            result.push(scenario('short-'+p+'-'+cap,17,{short:[p,cap],vector:false}));
    }
    for (let a = 0; a < 6; a++) {
        for (let b = 0; b < a; b++) {
            for (const delta of [-16,0,16]) {
                // Conservative read/read rejection and exact in-place vectorization can both be sound.
                result.push(scenario('alias-'+a+'-'+b+'-'+delta,25,{alias:[a,b,delta]}));
            }
        }
    }
    for (let seed = 2; seed <= 20; seed++)
        result.push(scenario('seed-'+seed,41,{seed,vector:true}));
    // No scalar iteration may inspect these out-of-arena buffer references.
    for (const n of [-1,0]) {
        const c = scenario('no-deref-'+n,n,{vector:false});
        c.args.fill(-4,0,6);
        result.push(c);
    }
    result.push(scenario('huge-count',2147483647,{short:[0,17],vector:false}));
    return result;
}

export function reference(c) {
    const bytes = c.bytes.slice();
    const view = new DataView(bytes.buffer);
    const [px, py, pz, ox, oy, od, n] = c.args;
    let trap = false;
    const bounds = Symbol();
    const address = (p,i) => {
        if ((i >>> 0) >= view.getUint32(p,true)) throw bounds;
        return p + 4 + i*2;
    };
    const read = (p,i) => view.getUint16(address(p,i),true);
    const write = (p,i,x) => view.setUint16(address(p,i),x,true);
    try {
        for (let i = 0; i < n; i++) {
            const x = read(px,i) % 256;
            const y = read(py,i) % 256;
            const z = read(pz,i) % 256;
            write(ox,i,384+x-z);
            write(oy,i,640+x+z-2*y);
            write(od,i,x+z+y);
        }
    } catch (e) {
        if (e !== bounds) throw e;
        trap = true;
    }
    return {trap, result: trap ? undefined : (n+19)|0, bytes};
}
