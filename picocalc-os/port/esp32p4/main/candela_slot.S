// Four linkSlot entry trampolines followed by the closed generated RV32 program.
    .section .text.candela,"ax",@progbits
    .balign 4
.Lstart:
    .word 0x4147454e,0x44415256,0x3332534c
    .word .Lend-.Lstart,4
    .macro entry name
    .global \name
    .hidden \name
    .type \name,@function
\name:
    .word 0x00100073
    .endm
    entry candela_slot_build
    entry candela_slot_color
    entry candela_slot_row
    entry candela_slot_set
    .space 65536-(.-.Lstart)
.Lend:
