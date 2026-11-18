    .section .text.agenda_program,"ax",@progbits
    .balign 4
    .global parseTask
    .hidden parseTask
    .type parseTask,@function
parseTask:
    // The trusted native linker replaces this signature with the entry jump.
    // Until then, the first word traps instead of entering a partial program.
    .word 0x00100073, 0x4147454e, 0x44415256, 0x3332534c
    .space 16384 - 16
    .size parseTask,.-parseTask
