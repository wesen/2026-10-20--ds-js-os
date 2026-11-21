/* Linux RV32 user ABI only for the host harness. The tested function is the
   same freestanding RV32 object; no Linux runtime executes inside it. */
.section .text
.global _start
_start:
    la s0, request
    li s1, 4104
1:  li a0, 0
    mv a1, s0
    mv a2, s1
    li a7, 63
    ecall
    blez a0, error
    add s0, s0, a0
    sub s1, s1, a0
    bnez s1, 1b
    la a0, request
    lw a1, 0(a0)
    addi a0, a0, 4
    call row
    li t0, 1
    bne a0, t0, error
    la s0, request
    addi s0, s0, 4
    li s1, 4100
2:  li a0, 1
    mv a1, s0
    mv a2, s1
    li a7, 64
    ecall
    blez a0, error
    add s0, s0, a0
    sub s1, s1, a0
    bnez s1, 2b
    li a0, 0
    j exit
error:
    li a0, 1
exit:
    li a7, 93
    ecall
.section .bss
.balign 16
request: .space 4104
