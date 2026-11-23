#ifndef TYPED_WORLD_NATIVE_SLOT_BYTES
#define TYPED_WORLD_NATIVE_SLOT_BYTES 229376
#endif

    .section .text.typed_world_program,"ax",@progbits
    .balign 4
.Lprogram:
    // Entry count in the low 16 bits and runtime imports in the high 16 bits.
    .word 0x4147454e, 0x44415256, 0x3332534c
    .word .Lend-.Lprogram, 0x260002
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
    j typedSdkCapture
    j typedSdkMove
    j typedSdkEventInt
    j typedSdkSend
    j typedSdkWriteSnapshot
    j typedSdkRestore
    j typedSdkMatches
    j typedSdkError
    j typedSdkStoreLoad
    j typedSdkStoreSave
    j typedSdkTimestamp
    j typedSdkUpper
    j typedSdkSeek
    j typedSdkLastIndex
    j typedSdkCountUnit
    j typedSdkNthIndex
    j typedSdkCopySpan
    j typedSdkCodePoints
    j typedSdkPointIndex
    j typedSdkPainterSource
    j typedSdkPainterFrame
    j typedSdkFsOpen
    j typedSdkFsAt
    j typedSdkFsOp
    j typedSdkAskFile
    j typedSdkRevoke
    j typedSdkClock
    j typedSdkClockOffset
    j typedSdkClockZone
    .option pop
    .space TYPED_WORLD_NATIVE_SLOT_BYTES - (.-.Lprogram)
.Lend:
