// The backend emits uncompressed 32-bit words. Keep unknown experimental
// instructions visible, including their original encoding and address.
const registers = "zero ra sp gp tp t0 t1 t2 s0 s1 a0 a1 a2 a3 a4 a5 a6 a7 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 t3 t4 t5 t6".split(" ");
const sext = (n, bits) => (n << (32-bits)) >> (32-bits);
export const hex = n => "0x" + n.toString(16);
export function decode(word, pc, relocation) {
    const opcode=word&127, rd=(word>>>7)&31, f=(word>>>12)&7, rs=(word>>>15)&31;
    const rt=(word>>>20)&31, top=word>>>25, imm=word>>20;
    const [d,a,b]=[rd,rs,rt].map(i=>registers[i]);
    const fmt=(mnemonic,...args)=>mnemonic+" "+args.join(", ");
    if (relocation !== undefined) return {text:"call import["+relocation+"]"};
    if (word===0x00100073) return {text:"ebreak"};
    if (opcode===3 || opcode===35) {
        const load=opcode===3;
        const offset=load?imm:sext((top<<5)|rd,12);
        const op=(load?["lb","lh","lw",null,"lbu","lhu"]:["sb","sh","sw"])[f];
        if (op) return {text:fmt(op,load?d:b,offset+"("+a+")"),memory:load?"load":"store",
            base:a,offset,reg:load?d:b};
    }
    let text;
    if (opcode===0x37) text=fmt("lui",d,hex(word>>>12));
    if (opcode===0x13) {
        const op=["addi","slli","slti","sltiu","xori",top===32?"srai":"srli","ori","andi"][f];
        text=fmt(op,d,a,f===1 || f===5?rt:imm);
    }
    if (opcode===0x33) {
        const op=top===1?["mul","mulh","mulhsu","mulhu","div","divu","rem","remu"][f]:
            [top===32?"sub":"add","sll","slt","sltu","xor",top===32?"sra":"srl","or","and"][f];
        text=fmt(op,d,a,b);
    }
    if (opcode===0x63) {
        const delta=sext(((word>>>31)<<12)|(((word>>>7)&1)<<11)|(((word>>>25)&63)<<5)|(((word>>>8)&15)<<1),13);
        const name=["beq","bne",null,null,"blt","bge","bltu","bgeu"][f];
        if (name) text=fmt(name,a,b,hex(pc+delta));
    }
    if (opcode===0x6f) {
        const delta=sext(((word>>>31)<<20)|(word&0xff000)|(((word>>>20)&1)<<11)|(((word>>>21)&1023)<<1),21);
        text=fmt("jal",d,hex(pc+delta));
    }
    if (opcode===0x67) text=fmt("jalr",d,imm+"("+a+")");
    return {text:text??(".word "+hex(word))};
}
