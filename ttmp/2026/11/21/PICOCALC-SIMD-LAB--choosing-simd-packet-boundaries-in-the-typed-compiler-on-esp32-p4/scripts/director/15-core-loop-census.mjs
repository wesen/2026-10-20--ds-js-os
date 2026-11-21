// Count executed scalar instructions with a direct SP-based address. Vector loads
// and scalar loads through a pointer derived from SP are distinct operations.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const observations = [];
for (const capture of ["ray","candidates"]) {
    const path = new URL("../../various/evidence/"+capture+".json", import.meta.url);
    const study = JSON.parse(readFileSync(path, "utf8"));
    for (const trace of study.traces.filter(row => row.id.endsWith("-opening"))) {
        const image = study.images.find(row => row.sha256===trace.imageSHA);
        const bytes = Buffer.from(image.code, "base64");
        assert.equal(createHash("sha256").update(bytes).digest("hex"), trace.imageSHA);
        const decision = study.decisions.find(row => row.id===trace.id.replace("-opening","-row"));
        const roles = new Map();
        let loads=0,stores=0,steps=0;
        for (const {pc,executions} of trace.counts) {
            const word=bytes.readUInt32LE(pc);
            steps+=executions;
            if (((word>>>15)&31)===2) {
                if ((word&127)===0x03) loads+=executions;
                if ((word&127)===0x23) stores+=executions;
            }
            for (const role of ["packed-subtraction","scalar-lane-load"]) {
                if (decision.ranges.some(r=>r.role===role && r.start<=pc && pc<r.end)) {
                    roles.set(role,(roles.get(role)??0)+executions);
                }
            }
        }
        observations.push({trace:trace.id,image:trace.imageSHA,steps,directStackLoads:loads,
                           directStackStores:stores,directStackTotal:loads+stores,roles:Object.fromEntries(roles)});
    }
}
console.log(JSON.stringify(observations,null,2));
