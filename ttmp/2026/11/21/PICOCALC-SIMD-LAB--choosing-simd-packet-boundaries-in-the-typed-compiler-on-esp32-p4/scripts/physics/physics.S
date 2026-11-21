/* ESP32-P4 fixed-point physics microbenchmarks.
 * Particles: int16 Q8.8, x = sat16(x + v), v unchanged.
 *   void particle_{aos,soa}_{scalar,pie}(int16_t *data, unsigned n)
 * Contacts: u16 pairs (A,B); d = (B - A) >> 1 in i32; A' = A + d, B' = B - d.
 *   void contact_{scalar,pie}(int16_t *velocity, uint16_t *pairs, unsigned pairCount)
 *   contact_scalar is sequential; contact_pie requires no repeated body.
 * Uses only q0-q2 and caller-saved a0-a7/t0-t6; scalar loops are spill-free.
 * PIE paths do groups of 8; tails (count & 7) run the scalar core.
 * Stack lanes are explicitly rounded to 16 bytes inside a 16-multiple frame.
 */

    .section .text.p4physics_particle,"ax",@progbits
    .option push
    .option norvc

/* AoS scalar = shared AoS core: a0 pair ptr, a1 count (may be 0).
 * Overflow fixup out of line: (sum >> 31) ^ 0x7fff -> 0x7fff / 0xffff8000. */
    .balign 4
    .global particle_aos_scalar
    .type particle_aos_scalar, @function
particle_aos_scalar:
.Laos_core:
    beqz a1, .Laos_done
    slli a3, a1, 2
    add a3, a3, a0
    li a2, 32767
.Laos_loop:
    lh t0, 0(a0)
    lh t1, 2(a0)
    addi a0, a0, 4
    add t0, t0, t1
    slli t2, t0, 16
    srai t2, t2, 16
    bne t2, t0, .Laos_sat
.Laos_store:
    sh t2, -4(a0)
    bne a0, a3, .Laos_loop
.Laos_done:
    ret
.Laos_sat:
    srai t0, t0, 31
    xor t2, t0, a2
    j .Laos_store
    .size particle_aos_scalar, .-particle_aos_scalar

/* AoS PIE: gather x -> lane X, v -> lane V; q2 = sat(q0+q1); scatter x. */
    .balign 4
    .global particle_aos_pie
    .type particle_aos_pie, @function
particle_aos_pie:
    srli a5, a1, 3
    beqz a5, .Laos_core
    andi a7, a1, 7
    addi sp, sp, -48
    addi a6, sp, 15
    andi a6, a6, -16
.Laos_pie_loop:
    lh t0, 0(a0)
    lh t1, 2(a0)
    lh t2, 4(a0)
    lh t3, 6(a0)
    lh t4, 8(a0)
    lh t5, 10(a0)
    lh a2, 12(a0)
    lh a3, 14(a0)
    sh t0, 0(a6)
    sh t1, 16(a6)
    sh t2, 2(a6)
    sh t3, 18(a6)
    sh t4, 4(a6)
    sh t5, 20(a6)
    sh a2, 6(a6)
    sh a3, 22(a6)
    lh t0, 16(a0)
    lh t1, 18(a0)
    lh t2, 20(a0)
    lh t3, 22(a0)
    lh t4, 24(a0)
    lh t5, 26(a0)
    lh a2, 28(a0)
    lh a3, 30(a0)
    sh t0, 8(a6)
    sh t1, 24(a6)
    sh t2, 10(a6)
    sh t3, 26(a6)
    sh t4, 12(a6)
    sh t5, 28(a6)
    sh a2, 14(a6)
    sh a3, 30(a6)
    mv a4, a6
    esp.vld.128.ip q0, a4, 16
    esp.vld.128.ip q1, a4, 0
    esp.vadd.s16 q2, q0, q1
    mv a4, a6
    esp.vst.128.ip q2, a4, 0
    lh t0, 0(a6)
    lh t1, 2(a6)
    lh t2, 4(a6)
    lh t3, 6(a6)
    lh t4, 8(a6)
    lh t5, 10(a6)
    lh a2, 12(a6)
    lh a3, 14(a6)
    sh t0, 0(a0)
    sh t1, 4(a0)
    sh t2, 8(a0)
    sh t3, 12(a0)
    sh t4, 16(a0)
    sh t5, 20(a0)
    sh a2, 24(a0)
    sh a3, 28(a0)
    addi a0, a0, 32
    addi a5, a5, -1
    bnez a5, .Laos_pie_loop
    addi sp, sp, 48
    mv a1, a7
    j .Laos_core
    .size particle_aos_pie, .-particle_aos_pie

/* SoA scalar: compute v plane, fall into core (a0 x, a1 v, a2 count). */
    .balign 4
    .global particle_soa_scalar
    .type particle_soa_scalar, @function
particle_soa_scalar:
    mv a2, a1
    slli a1, a1, 1
    add a1, a1, a0
.Lsoa_core:
    beqz a2, .Lsoa_done
    slli a3, a2, 1
    add a3, a3, a0
    li a4, 32767
.Lsoa_loop:
    lh t0, 0(a0)
    lh t1, 0(a1)
    addi a0, a0, 2
    addi a1, a1, 2
    add t0, t0, t1
    slli t2, t0, 16
    srai t2, t2, 16
    bne t2, t0, .Lsoa_sat
.Lsoa_store:
    sh t2, -2(a0)
    bne a0, a3, .Lsoa_loop
.Lsoa_done:
    ret
.Lsoa_sat:
    srai t0, t0, 31
    xor t2, t0, a4
    j .Lsoa_store
    .size particle_soa_scalar, .-particle_soa_scalar

/* SoA PIE: guard = both planes 16-byte aligned -> direct vectors,
 * otherwise per-group bounce through aligned stack lanes. */
    .balign 4
    .global particle_soa_pie
    .type particle_soa_pie, @function
particle_soa_pie:
    srli a5, a1, 3
    andi a7, a1, 7
    slli a3, a1, 1
    add a3, a3, a0
    mv a2, a0
    beqz a5, .Lsoa_pie_tail
    or t0, a2, a3
    andi t0, t0, 15
    bnez t0, .Lsoa_bounce
.Lsoa_pie_loop:
    esp.vld.128.ip q0, a2, 0
    esp.vld.128.ip q1, a3, 16
    esp.vadd.s16 q2, q0, q1
    esp.vst.128.ip q2, a2, 16
    addi a5, a5, -1
    bnez a5, .Lsoa_pie_loop
.Lsoa_pie_tail:
    mv a0, a2
    mv a1, a3
    mv a2, a7
    j .Lsoa_core
.Lsoa_bounce:
    addi sp, sp, -48
    addi a6, sp, 15
    andi a6, a6, -16
.Lsoa_bounce_loop:
    lh t0, 0(a2)
    lh t1, 2(a2)
    lh t2, 4(a2)
    lh t3, 6(a2)
    lh t4, 8(a2)
    lh t5, 10(a2)
    lh a0, 12(a2)
    lh a1, 14(a2)
    sh t0, 0(a6)
    sh t1, 2(a6)
    sh t2, 4(a6)
    sh t3, 6(a6)
    sh t4, 8(a6)
    sh t5, 10(a6)
    sh a0, 12(a6)
    sh a1, 14(a6)
    lh t0, 0(a3)
    lh t1, 2(a3)
    lh t2, 4(a3)
    lh t3, 6(a3)
    lh t4, 8(a3)
    lh t5, 10(a3)
    lh a0, 12(a3)
    lh a1, 14(a3)
    sh t0, 16(a6)
    sh t1, 18(a6)
    sh t2, 20(a6)
    sh t3, 22(a6)
    sh t4, 24(a6)
    sh t5, 26(a6)
    sh a0, 28(a6)
    sh a1, 30(a6)
    mv a4, a6
    esp.vld.128.ip q0, a4, 16
    esp.vld.128.ip q1, a4, 0
    esp.vadd.s16 q2, q0, q1
    mv a4, a6
    esp.vst.128.ip q2, a4, 0
    lh t0, 0(a6)
    lh t1, 2(a6)
    lh t2, 4(a6)
    lh t3, 6(a6)
    lh t4, 8(a6)
    lh t5, 10(a6)
    lh a0, 12(a6)
    lh a1, 14(a6)
    sh t0, 0(a2)
    sh t1, 2(a2)
    sh t2, 4(a2)
    sh t3, 6(a2)
    sh t4, 8(a2)
    sh t5, 10(a2)
    sh a0, 12(a2)
    sh a1, 14(a2)
    addi a2, a2, 16
    addi a3, a3, 16
    addi a5, a5, -1
    bnez a5, .Lsoa_bounce_loop
    addi sp, sp, 48
    j .Lsoa_pie_tail
    .size particle_soa_pie, .-particle_soa_pie

    .option pop

    .section .text.p4physics_contact,"ax",@progbits
    .option push
    .option norvc

/* Scalar = shared tail core: a0 velocity, a1 pairs, a2 count.
 * Both reads precede writes, so A == B is a no-op. */
    .balign 4
    .global contact_scalar
    .type contact_scalar, @function
contact_scalar:
.Lcontact_core:
    beqz a2, .Lcontact_done
    slli a2, a2, 2
    add a2, a2, a1
.Lcontact_loop:
    lhu t0, 0(a1)
    lhu t1, 2(a1)
    addi a1, a1, 4
    slli t0, t0, 1
    slli t1, t1, 1
    add t0, t0, a0
    add t1, t1, a0
    lh t2, 0(t0)
    lh t3, 0(t1)
    sub t4, t3, t2
    srai t4, t4, 1
    add t2, t2, t4
    sub t3, t3, t4
    sh t2, 0(t0)
    sh t3, 0(t1)
    bne a1, a2, .Lcontact_loop
.Lcontact_done:
    ret
    .size contact_scalar, .-contact_scalar

    .macro CONTACT_GATHER io, jo, la, lb, ld
    lhu t0, \io(a1)
    lhu t1, \jo(a1)
    slli t0, t0, 1
    slli t1, t1, 1
    add t0, t0, a0
    add t1, t1, a0
    lh t2, 0(t0)
    lh t3, 0(t1)
    sh t2, \la(a6)
    sub t4, t3, t2
    sh t3, \lb(a6)
    srai t4, t4, 1
    sh t4, \ld(a6)
    .endm

    .macro CONTACT_SCATTER io, jo, la, lb
    lhu t0, \io(a1)
    lhu t1, \jo(a1)
    lh t2, \la(a6)
    lh t3, \lb(a6)
    slli t0, t0, 1
    slli t1, t1, 1
    add t0, t0, a0
    add t1, t1, a0
    sh t2, 0(t0)
    sh t3, 0(t1)
    .endm

/* PIE: lanes A=a6, B=a6+16, D=a6+32; q0 = A + D, q1 = B - D. */
    .balign 4
    .global contact_pie
    .type contact_pie, @function
contact_pie:
    srli a5, a2, 3
    andi a7, a2, 7
    beqz a5, .Lcontact_pie_tail
    addi sp, sp, -64
    addi a6, sp, 15
    andi a6, a6, -16
.Lcontact_pie_loop:
    CONTACT_GATHER  0,  2,  0, 16, 32
    CONTACT_GATHER  4,  6,  2, 18, 34
    CONTACT_GATHER  8, 10,  4, 20, 36
    CONTACT_GATHER 12, 14,  6, 22, 38
    CONTACT_GATHER 16, 18,  8, 24, 40
    CONTACT_GATHER 20, 22, 10, 26, 42
    CONTACT_GATHER 24, 26, 12, 28, 44
    CONTACT_GATHER 28, 30, 14, 30, 46
    mv a4, a6
    esp.vld.128.ip q0, a4, 16
    esp.vld.128.ip q1, a4, 16
    esp.vld.128.ip q2, a4, 0
    esp.vadd.s16 q0, q0, q2
    esp.vsub.s16 q1, q1, q2
    mv a4, a6
    esp.vst.128.ip q0, a4, 16
    esp.vst.128.ip q1, a4, 0
    CONTACT_SCATTER  0,  2,  0, 16
    CONTACT_SCATTER  4,  6,  2, 18
    CONTACT_SCATTER  8, 10,  4, 20
    CONTACT_SCATTER 12, 14,  6, 22
    CONTACT_SCATTER 16, 18,  8, 24
    CONTACT_SCATTER 20, 22, 10, 26
    CONTACT_SCATTER 24, 26, 12, 28
    CONTACT_SCATTER 28, 30, 14, 30
    addi a1, a1, 32
    addi a5, a5, -1
    bnez a5, .Lcontact_pie_loop
    addi sp, sp, 64
.Lcontact_pie_tail:
    mv a2, a7
    j .Lcontact_core
    .size contact_pie, .-contact_pie

    .option pop
