/* Guarded target intrinsic for typedRayComputeRow(buffer, y). No external calls.
   The production body's first machine instruction immediately follows fallback.
   Stack bytes 0..15 hold one aligned packet, 16 holds the broadcast row. */
    .section .text
    .option norvc
    .option norelax
    .balign 4
row_kernel:
    lw t0,0(a0)
    li t1,1865
    bltu t0,t1,fallback
    li t0,159
    bltu t0,a1,fallback
    lhu a2,36(a0)           /* work[16], count */
    li t0,3
    bltu t0,a2,fallback
    addi t1,a0,6
    mv t2,a2
check_object:
    beqz t2,qualified
    lhu t3,2(t1)
    li t4,159
    bltu t4,t3,fallback
    lhu t3,6(t1)
    li t4,32
    bltu t4,t3,fallback
    addi t1,t1,10
    addi t2,t2,-1
    j check_object
qualified:
    addi sp,sp,-32
    li a3,3094
    add a3,a3,a0            /* work[1545] */
    mv t0,a3
    li t1,160
clear:
    sh zero,0(t0)
    sh zero,320(t0)
    addi t0,t0,2
    addi t1,t1,-1
    bnez t1,clear
    addi a4,a0,6            /* start of current object */
    addi a5,a0,84           /* start of its horizontal square table */
    li a6,1                 /* one-based material ID */
sphere:
    bltu a2,a6,complete
    lhu t0,2(a4)
    sub t0,a1,t0
    mul t0,t0,t0
    lhu a7,6(a4)
    mul a7,a7,a7
    sub a7,a7,t0            /* row = r*r - dy*dy */
    bltz a7,next_sphere
    lhu t6,4(a4)            /* cz */
    mv t0,a5                /* horizontal square cursor */
    mv t1,a3                /* depth cursor */
    li t2,320               /* bytes remaining */
#ifndef MATCHED_SCALAR
    sh a7,16(sp)
    addi t3,sp,16
    esp.vldbc.16.ip q0,t3,0
#endif
group:
    beqz t2,next_sphere
    andi t3,t0,15
    bnez t3,single
    li t3,16
    bltu t2,t3,single
    mv t3,sp                /* stack alignment specified by the RV32 ABI */
#ifdef MATCHED_SCALAR
    .rept 8
    lhu t4,0(t0)
    sub t4,a7,t4
    sh t4,0(t3)
    addi t0,t0,2
    addi t3,t3,2
    .endr
#else
    mv t4,t0
    esp.vld.128.ip q1,t4,16
    mv t0,t4
    esp.vsub.s16 q2,q0,q1
    esp.vst.128.ip q2,t3,16
#endif
    mv t3,sp
    li t4,8
    j lane
single:
    lhu t5,0(t0)
    sub t5,a7,t5
    sh t5,0(sp)
    addi t0,t0,2
    mv t3,sp
    li t4,1
lane:
    lhu t5,0(t3)
    /* For row 0..1024, invalid signed subtractions (including saturating
       differences against u16 values above 32767) decode above row. */
    bltu a7,t5,advance
    slli t5,t5,1
    add t5,t5,a0
    lhu t5,1044(t5)         /* square-root lookup after a successful hit */
    sub t5,t6,t5
    lhu t2,0(t1)            /* remaining count restored from pointer below */
    beqz t2,replace
    bge t5,t2,advance
replace:
    sh t5,0(t1)
    sh a6,320(t1)
advance:
    addi t3,t3,2
    addi t1,t1,2
    addi t4,t4,-1
    bnez t4,lane
    sub t2,t1,a3
    li t3,320
    sub t2,t3,t2
    j group
next_sphere:
    addi a4,a4,10
    addi a5,a5,320
    addi a6,a6,1
    j sphere
complete:
    addi sp,sp,32
    li a0,1
    ret
fallback:
