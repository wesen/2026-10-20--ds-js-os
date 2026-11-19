    .section .text.typed_world_program,"ax",@progbits
    .balign 4
.Lprogram:
    // Entry count in the low 16 bits and runtime imports in the high 16 bits.
    .word 0x4147454e, 0x44415256, 0x3332534c
    .word .Lend-.Lprogram, 0x10002
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
    .option push
    .option norvc
    .option norelax
    j typedSdkScreen
    .option pop
    .space 24576 - (.-.Lprogram)
.Lend:
