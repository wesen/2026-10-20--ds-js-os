    .section .text.typed_world_program,"ax",@progbits
    .balign 4
.Lprogram:
    // Shared typed-RV32 template format: magic, capacity, entry count.
    .word 0x4147454e, 0x44415256, 0x3332534c
    .word .Lend-.Lprogram, 2
    .macro entry name
    .global \name
    .hidden \name
    .type \name,@function
\name:
    .word 0x00100073
    .size \name,.-\name
    .endm
    entry typedWorldMeta
    entry typedWorldEvent
    .space 24576 - (.-.Lprogram)
.Lend:
