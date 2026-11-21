import assert from 'node:assert/strict';

// Operands come from vendor objdump, never from the candidate's encoding helpers.
export function packedMachine(memory,x) {
    const q = Array.from({length:8},() => new Int16Array(8).fill(-12345));
    const count = {ops:0, stores:0};
    function step({op,args}) {
        const [dst, first, second] = args;
        assert.match(dst,/^q[0-7]$/);
        assert(!args.includes('q3'),'q3 absent from target FreeRTOS save list');
        const target = q[Number(dst.slice(1))];
        count.ops++;
        if (op === 'esp.vld.128.ip' || op === 'esp.vst.128.ip' || op === 'esp.vldbc.16.ip') {
            assert.match(first,/^x\d+$/);
            const gpr = Number(first.slice(1)), addr = x[gpr];
            assert.equal(addr % (op === 'esp.vldbc.16.ip' ? 2 : 16),0,'PIE address alignment');
            if (op === 'esp.vldbc.16.ip') target.fill(memory.getInt16(addr,true));
            else {
                for (let i = 0; i < 8; i++) {
                    if (op === 'esp.vld.128.ip') target[i]=memory.getInt16(addr+2*i,true);
                    else memory.setInt16(addr+2*i,target[i],true);
                }
                if (op === 'esp.vst.128.ip') count.stores++;
            }
            x[gpr] += Number(second);
            return;
        }
        if (['esp.min.u16.a','esp.max.u16.a','esp.movi.16.a'].includes(op)) {
            assert.match(first,/^x\d+$/);
            const gpr = Number(first.slice(1));
            const unsigned = n => n & 65535;
            if (op === 'esp.movi.16.a') {
                const lane = Number(second);
                assert(Number.isInteger(lane) && lane >= 0 && lane < 8);
                x[gpr] = unsigned(target[lane]);
            } else {
                const combine = op === 'esp.min.u16.a' ? Math.min : Math.max;
                x[gpr] = target.reduce((a,b) => combine(a,unsigned(b)),unsigned(target[0]));
            }
            return;
        }
        assert.match(first,/^q[0-7]$/);
        assert.match(second,/^q[0-7]$/);
        const left = q[Number(first.slice(1))], right = q[Number(second.slice(1))];
        for (let i = 0; i < 8; i++) {
            let value;
            switch (op) {
            case 'esp.andq': value = left[i] & right[i]; break;
            case 'esp.vadd.s16': value = Math.min(32767,Math.max(-32768,left[i]+right[i])); break;
            case 'esp.vsub.s16': value = Math.min(32767,Math.max(-32768,left[i]-right[i])); break;
            default: assert.fail('unimplemented packed instruction '+op);
            }
            target[i] = value;
        }
    }
    return {count, step};
}
