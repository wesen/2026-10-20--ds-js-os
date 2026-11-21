// Exhaust the application-independent u16 payload domain under the guarded
// row bound, including payloads that no prepared sphere could have produced.
import {writeFileSync} from 'node:fs';
let pairs=0,hits=0,saturations=0;
for(let row=0;row<=1024;row++){
    for(let cell=0;cell<=65535;cell++){
        const reference=row-cell;
        const interpreted=(cell<<16)>>16;
        const wide=row-interpreted;
        const saturated=Math.max(-32768,Math.min(32767,wide));
        if(wide!==saturated) saturations++;
        const candidate=saturated&65535;
        if((reference>=0)!==(candidate<=row) || (reference>=0 && reference!==candidate))
            throw Error('differential failure at '+row+','+cell);
        pairs++;if(reference>=0)hits++;
    }
}
const out={rows:1025,values:65536,pairs,hits,saturations,mismatches:0};
writeFileSync(process.argv[2],JSON.stringify(out,null,2)+'\n');
console.log(out);
