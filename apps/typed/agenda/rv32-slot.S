    .section .text.agenda_program,"ax",@progbits
    .balign 4
.Lprogram:
    // The linker reads the capacity and number of entry jumps from this header.
    .word 0x4147454e, 0x44415256, 0x3332534c
    .word .Lprogram_end-.Lprogram, 6
    .global parseTask
    .hidden parseTask
    .type parseTask,@function
parseTask:
    .word 0x00100073
    .size parseTask,.-parseTask
    .global normalizeEntry
    .hidden normalizeEntry
    .type normalizeEntry,@function
normalizeEntry:
    .word 0x00100073
    .size normalizeEntry,.-normalizeEntry
    .macro entry name
    .global \name
    .hidden \name
    .type \name,@function
\name:
    .word 0x00100073
    .size \name,.-\name
    .endm
    entry agendaDateKey
    entry entryAddDays
    entry entryWeekday
    entry agendaMark
    .space 49152 - (.-.Lprogram)
.Lprogram_end:
