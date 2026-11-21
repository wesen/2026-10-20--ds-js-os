	.text
	.attribute	4, 16
	.attribute	5, "rv32i2p1"
	.file	"kernel.c"
	.option	push
	.option	arch, +a, +c, +f, +m, +zicsr
	.globl	kernel                          # -- Begin function kernel
	.p2align	1
	.type	kernel,@function
kernel:                                 # @kernel
# %bb.0:                                # %entry
	addi	sp, sp, -32
	sw	s0, 28(sp)                      # 4-byte Folded Spill
	sw	s1, 24(sp)                      # 4-byte Folded Spill
	sw	s2, 20(sp)                      # 4-byte Folded Spill
	sw	s3, 16(sp)                      # 4-byte Folded Spill
	sw	s4, 12(sp)                      # 4-byte Folded Spill
	sw	s5, 8(sp)                       # 4-byte Folded Spill
	sw	s6, 4(sp)                       # 4-byte Folded Spill
	sw	s7, 0(sp)                       # 4-byte Folded Spill
	lw	t5, 0(a0)
	li	a3, 17
	bgeu	a3, t5, .LBB0_20
# %bb.1:                                # %checked_read.exit
	li	a3, 18
	beq	t5, a3, .LBB0_20
# %bb.2:                                # %checked_read.exit37
	li	a3, 19
	bgeu	a3, t5, .LBB0_20
# %bb.3:                                # %checked_read.exit47
	lhu	t1, 36(a0)
	beqz	t1, .LBB0_18
# %bb.4:                                # %for.body.lr.ph
	lhu	a6, 38(a0)
	lhu	a7, 40(a0)
	li	a5, 0
	addi	a6, a6, -32
	addi	a7, a7, -32
	lhu	t0, 42(a0)
	slli	t3, a1, 5
	lui	t2, 1
	add	t3, t3, t2
	slli	a3, a2, 5
	add	t2, t2, a3
	slli	t4, t1, 2
	add	t4, t4, t1
	addi	t6, a0, 12
	addi	a0, a0, 52
	li	s7, 1
	li	a4, 21
	li	s2, 156
	li	s6, 1
	j	.LBB0_6
.LBB0_5:                                # %for.inc
                                        #   in Loop: Header=BB0_6 Depth=1
	sltu	s6, s7, t1
	addi	a5, a5, 5
	addi	s7, s7, 1
	addi	a4, a4, 4
	addi	t6, t6, 10
	addi	a0, a0, 8
	beq	t4, a5, .LBB0_17
.LBB0_6:                                # %for.body
                                        # =>This Inner Loop Header: Depth=1
	bgeu	a4, t5, .LBB0_20
# %bb.7:                                # %checked_read.exit52
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	s1, a4, 2
	bgeu	s1, t5, .LBB0_20
# %bb.8:                                # %checked_read.exit57
                                        #   in Loop: Header=BB0_6 Depth=1
	lhu	s1, -6(a0)
	sub	a3, t3, s1
	lhu	s0, -2(a0)
	srai	s1, a3, 31
	xor	a3, a3, s1
	sub	a3, a3, s1
	blt	s0, a3, .LBB0_5
# %bb.9:                                # %checked_read.exit62
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a3, a4, 3
	bgeu	a3, t5, .LBB0_20
# %bb.10:                               # %checked_read.exit67
                                        #   in Loop: Header=BB0_6 Depth=1
	lhu	a3, -4(a0)
	sub	a3, t2, a3
	lhu	s0, 0(a0)
	srai	s1, a3, 31
	xor	a3, a3, s1
	sub	a3, a3, s1
	blt	s0, a3, .LBB0_5
# %bb.11:                               # %if.end
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a3, a5, 1
	bgeu	a3, t5, .LBB0_20
# %bb.12:                               # %checked_read.exit72
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a3, a5, 2
	bgeu	a3, t5, .LBB0_20
# %bb.13:                               # %checked_read.exit77
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a3, a5, 3
	bgeu	a3, t5, .LBB0_20
# %bb.14:                               # %checked_read.exit82
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a3, a5, 4
	bgeu	a3, t5, .LBB0_20
# %bb.15:                               # %checked_read.exit87
                                        #   in Loop: Header=BB0_6 Depth=1
	lhu	s1, -6(t6)
	lhu	a3, -4(t6)
	lhu	s0, -2(t6)
	sub	s1, s1, a1
	sub	s5, a3, a2
	sub	s4, s2, s0
	mul	a3, s1, a6
	mul	s0, s5, a7
	add	a3, a3, s0
	slli	s3, s4, 5
	add	s3, s3, a3
	blez	s3, .LBB0_5
# %bb.16:                               # %land.lhs.true
                                        #   in Loop: Header=BB0_6 Depth=1
	lhu	a3, 0(t6)
	mul	s0, s1, s1
	mul	s1, s5, s5
	add	s0, s0, s1
	mul	s1, s4, s4
	mul	a3, a3, a3
	sub	s1, s1, a3
	add	s0, s0, s1
	mul	a3, s0, t0
	mul	s0, s3, s3
	blt	s0, a3, .LBB0_5
.LBB0_17:                               # %cleanup56.loopexit
	andi	a0, s6, 1
	j	.LBB0_19
.LBB0_18:
	li	a0, 0
.LBB0_19:                               # %cleanup56
	lw	s0, 28(sp)                      # 4-byte Folded Reload
	lw	s1, 24(sp)                      # 4-byte Folded Reload
	lw	s2, 20(sp)                      # 4-byte Folded Reload
	lw	s3, 16(sp)                      # 4-byte Folded Reload
	lw	s4, 12(sp)                      # 4-byte Folded Reload
	lw	s5, 8(sp)                       # 4-byte Folded Reload
	lw	s6, 4(sp)                       # 4-byte Folded Reload
	lw	s7, 0(sp)                       # 4-byte Folded Reload
	addi	sp, sp, 32
	ret
.LBB0_20:                               # %if.then.i
	unimp
.Lfunc_end0:
	.size	kernel, .Lfunc_end0-kernel
                                        # -- End function
	.option	pop
	.ident	"Ubuntu clang version 18.1.3 (1ubuntu1)"
	.section	".note.GNU-stack","",@progbits
