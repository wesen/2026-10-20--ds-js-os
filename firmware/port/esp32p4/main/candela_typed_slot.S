// The Typed Candela kernel's slot (PICOCALC-CANDELA-TYPED): four linkSlot entry trampolines, in the order of
// apps/typed/candela-gallery/link.js (cdlLayout, cdlInit, cdlSky, cdlRenderSpan), followed by the closed generated
// RV32 program. The kernel with the gallery's 18 scenes is about 400 KB of RV32 under the kernel policy.
    .section .text.candela_typed,"ax",@progbits
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
    entry candela_typed_layout
    entry candela_typed_init
    entry candela_typed_sky
    entry candela_typed_span
    .space 786432-(.-.Lstart)
.Lend:
