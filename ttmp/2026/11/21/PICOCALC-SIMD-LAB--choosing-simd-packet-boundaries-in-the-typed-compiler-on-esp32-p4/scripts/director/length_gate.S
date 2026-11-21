# Post-hoc single-entry versioning trial for a single dynamic-bound function.
# a2 is the trip count from the frozen Typed signature; signed n <= 0 also
# selects the ordinary implementation. The tail jumps share the caller's link.
.section .text.simd_gate,"ax",@progbits
.option push
.option norvc
.balign 16
.global simd_dynamic_gated
simd_dynamic_gated:
    li t0,8
    blt a2,t0,1f
    j simd_dynamic_pie
1:  j simd_dynamic_stock
.option pop
