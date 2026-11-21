/* Four matched ahead-of-time candidates for the pinned particle source.
 * ABI matches the stock Typed functions. Use the generic checked fallback
 * whenever a valid-buffer admission proof cannot cover both arrays.
 */
.section .text.physics_checked,"ax",@progbits
.option push
.option norvc
.option norelax
.macro guarded label,native,fallback
.balign 4
.global \label
.type \label,@function
\label:
    blez a1,.Lgeneric\@
    lw t0,0(a0)
    bltz t0,.Lgeneric\@
    srli t0,t0,1
    bltu t0,a1,.Lgeneric\@
    addi sp,sp,-16
    sw ra,12(sp)
    sw a1,8(sp)
    addi a0,a0,4
    call \native
    lw a0,8(sp)
    lw ra,12(sp)
    addi sp,sp,16
    ret
.Lgeneric\@:
    tail \fallback
.size \label,.-\label
.endm
guarded guarded_aos_scalar,particle_aos_scalar,physics_typed_particleAoS
guarded guarded_aos_pie,particle_aos_pie,physics_typed_particleAoS
guarded guarded_soa_scalar,particle_soa_scalar,physics_typed_particleSoA
guarded guarded_soa_pie,particle_soa_pie,physics_typed_particleSoA
.option pop
