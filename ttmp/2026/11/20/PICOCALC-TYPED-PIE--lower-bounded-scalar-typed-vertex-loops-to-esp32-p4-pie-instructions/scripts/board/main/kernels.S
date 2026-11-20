.section .text
.macro load_kernel name, binary
    .balign 4
    .global \name
    .type \name, @function
\name:
    .incbin "\binary"
    .size \name, . - \name
.endm
load_kernel stock_project, stock.bin
load_kernel portable_project, portable.bin
load_kernel pie_project, pie.bin
