.section .text.literal_writers,"ax",@progbits
.macro writer name, input
    .balign 4
    .global \name
    .type \name,@function
\name:
    .incbin "\input"
    .size \name,.-\name
.endm
writer literal_stock, literal-stock.bin
writer literal_half, literal-half.bin
writer literal_word, literal-word.bin
