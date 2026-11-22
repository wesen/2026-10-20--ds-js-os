#ifndef MOBILE_PAINTER_NATIVE_SLOT_BYTES
#define MOBILE_PAINTER_NATIVE_SLOT_BYTES 16384
#endif

    .section .text.painter,"ax",@progbits
    .balign 4
.Lslot:
    // typedRv32.linkSlot header: magic, bytes reserved, one entry, zero imports.
    .word 0x4147454e, 0x44415256, 0x3332534c
    .word .Lend-.Lslot, 1
    .global mobile_painter_generated
    .hidden mobile_painter_generated
    .type mobile_painter_generated,@function
mobile_painter_generated:
    .word 0x00100073
    .space MOBILE_PAINTER_NATIVE_SLOT_BYTES - (.-.Lslot)
.Lend:
    .size mobile_painter_generated, .Lend-mobile_painter_generated
