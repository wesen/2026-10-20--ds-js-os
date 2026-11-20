    .section .text.encoder,"ax",@progbits
    .balign 4
.Lslot:
    .word 0x4147454e, 0x44415256, 0x3332534c
    .word .Lend-.Lslot, 1
    .global generated_encode
    .hidden generated_encode
    .type generated_encode,@function
generated_encode:
    .word 0x00100073
    .space 32768 - (.-.Lslot)
.Lend:
