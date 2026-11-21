// Write a research-only backend. The generated file runs in the existing bare
// QuickJS compiler realm and keeps exactly the ordinary typedRv32.compile ABI.
import {readFileSync, writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

const stock = `        case 0x41: {
            const out = this.resultRegister();
            this.constant(out, this.cell());
            this.push(out);
            break;
        }`;
const candidate = `        case 0x41: {
            const divisor = this.cell();
            const op = this.program.code[this.at];
            if (divisor > 0 && (op === 0x6d || op === 0x6f)) {
                // Positive literals cannot divide by zero or form INT_MIN/-1.
                // The dividend is already evaluated. T6 is never an operand-stack home.
                this.at++;
                const dividend = this.pop(T5);
                const out = this.resultRegister();
                if (divisor === 1) {
                    this.move(out, op === 0x6d ? dividend : ZERO);
                } else {
                    this.constant(T6, divisor);
                    this.emit(instruction.r(0x33, out, op === 0x6d ? 4 : 6, dividend, T6, 1));
                }
                this.push(out);
            } else {
                const out = this.resultRegister();
                this.constant(out, divisor);
                this.push(out);
            }
            break;
        }`;

export function positiveDivisorCompiler(source) {
    if (source.split(stock).length !== 2) throw Error("expected one stock local-constant emitter");
    return source.replace(stock,candidate);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [input,output]=process.argv.slice(2);
    if (!input || !output) throw Error("usage: node positive-divisors.mjs STOCK.js CANDIDATE.js");
    writeFileSync(output,positiveDivisorCompiler(readFileSync(input,"utf8")));
}
