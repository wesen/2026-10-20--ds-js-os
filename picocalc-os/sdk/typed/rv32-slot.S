    .section .text.typed_world_program,"ax",@progbits
    .balign 4
.Lprogram:
    // Entry count in the low 16 bits and runtime imports in the high 16 bits.
    .word 0x4147454e, 0x44415256, 0x3332534c
    .word .Lend-.Lprogram, 0xd0002
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
    j typedSdkBuffer
    j typedSdkView
    j typedSdkEventText
    j typedSdkEventHandle
    j typedSdkFileRead
    j typedSdkRelease
    j typedSdkReply
    j typedSdkYield
    j typedSdkFileWrite
    j typedSdkMove
    j typedSdkEventInt
    j typedSdkSend
    .option pop
    .space 98304 - (.-.Lprogram)
.Lend:
