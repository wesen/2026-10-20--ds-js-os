    .section .text.files_program,"ax",@progbits
    .balign 4
.Lprogram:
    // Shared typed-RV32 template format: magic, capacity, entry count.
    .word 0x4147454e, 0x44415256, 0x3332534c
    .word .Lend-.Lprogram, 4
    .macro entry name
    .global \name
    .hidden \name
    .type \name,@function
\name:
    .word 0x00100073
    .size \name,.-\name
    .endm
    entry filesName
    entry filesCompare
    entry filesSelect
    entry filesAction
    .space 12288 - (.-.Lprogram)
.Lend:
