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
	lw	t4, 0(a0)
	li	a3, 17
	bgeu	a3, t4, .LBB0_20
# %bb.1:                                # %checked_read.exit
	li	a3, 18
	beq	t4, a3, .LBB0_20
# %bb.2:                                # %checked_read.exit37
	li	a3, 19
	bgeu	a3, t4, .LBB0_20
# %bb.3:                                # %checked_read.exit47
	lhu	t3, 36(a0)
	beqz	t3, .LBB0_18
# %bb.4:                                # %for.body.lr.ph
	lhu	a6, 38(a0)
	lhu	a7, 40(a0)
	li	a4, 0
	addi	a6, a6, -32
	addi	a7, a7, -32
	lhu	t0, 42(a0)
	slli	t1, a1, 5
	lui	t2, 1
	add	t1, t1, t2
	slli	a3, a2, 5
	add	t2, t2, a3
	li	t6, 1
	addi	s2, a0, 4
	li	t5, 156
	j	.LBB0_6
.LBB0_5:                                # %for.inc
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a4, a4, 1
	sltu	t6, a4, t3
	beq	a4, t3, .LBB0_17
.LBB0_6:                                # %for.body
                                        # =>This Inner Loop Header: Depth=1
	slli	a5, a4, 2
	addi	s0, a5, 21
	bgeu	s0, t4, .LBB0_20
# %bb.7:                                # %checked_read.exit52
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a3, a5, 23
	bgeu	a3, t4, .LBB0_20
# %bb.8:                                # %checked_read.exit57
                                        #   in Loop: Header=BB0_6 Depth=1
	slli	s0, s0, 1
	add	s0, s0, s2
	lhu	s0, 0(s0)
	sub	s0, t1, s0
	slli	a3, a3, 1
	add	a3, a3, s2
	lhu	a3, 0(a3)
	srai	s1, s0, 31
	xor	s0, s0, s1
	sub	s0, s0, s1
	bltu	a3, s0, .LBB0_5
# %bb.9:                                # %checked_read.exit62
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a3, a5, 24
	bgeu	a3, t4, .LBB0_20
# %bb.10:                               # %checked_read.exit67
                                        #   in Loop: Header=BB0_6 Depth=1
	slli	s0, a5, 1
	add	s0, s0, s2
	lhu	s0, 44(s0)
	sub	s0, t2, s0
	slli	a3, a3, 1
	add	a3, a3, s2
	lhu	a3, 0(a3)
	srai	s1, s0, 31
	xor	s0, s0, s1
	sub	s0, s0, s1
	bltu	a3, s0, .LBB0_5
# %bb.11:                               # %if.end
                                        #   in Loop: Header=BB0_6 Depth=1
	add	a5, a5, a4
	addi	s0, a5, 1
	bgeu	s0, t4, .LBB0_20
# %bb.12:                               # %checked_read.exit72
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	s1, a5, 2
	bgeu	s1, t4, .LBB0_20
# %bb.13:                               # %checked_read.exit77
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a3, a5, 3
	bgeu	a3, t4, .LBB0_20
# %bb.14:                               # %checked_read.exit82
                                        #   in Loop: Header=BB0_6 Depth=1
	addi	a5, a5, 4
	bgeu	a5, t4, .LBB0_20
# %bb.15:                               # %checked_read.exit87
                                        #   in Loop: Header=BB0_6 Depth=1
	slli	s0, s0, 1
	add	s0, s0, a0
	lhu	s3, 4(s0)
	slli	s1, s1, 1
	add	s1, s1, a0
	lhu	s4, 4(s1)
	slli	a3, a3, 1
	add	a3, a3, a0
	lhu	s0, 4(a3)
	sub	s1, s3, a1
	sub	s4, s4, a2
	sub	s3, t5, s0
	mul	s0, s1, a6
	mul	a3, s4, a7
	add	a3, a3, s0
	slli	s0, s3, 5
	add	s0, s0, a3
	blez	s0, .LBB0_5
# %bb.16:                               # %land.lhs.true
                                        #   in Loop: Header=BB0_6 Depth=1
	slli	a5, a5, 1
	add	a5, a5, a0
	lhu	a3, 4(a5)
	mul	a5, s1, s1
	mul	s1, s4, s4
	add	a5, a5, s1
	mul	s1, s3, s3
	mul	a3, a3, a3
	sub	s1, s1, a3
	add	a5, a5, s1
	mul	a3, a5, t0
	mul	a5, s0, s0
	blt	a5, a3, .LBB0_5
.LBB0_17:                               # %cleanup56.loopexit
	andi	a0, t6, 1
	j	.LBB0_19
.LBB0_18:
	li	a0, 0
.LBB0_19:                               # %cleanup56
	lw	s0, 28(sp)                      # 4-byte Folded Reload
	lw	s1, 24(sp)                      # 4-byte Folded Reload
	lw	s2, 20(sp)                      # 4-byte Folded Reload
	lw	s3, 16(sp)                      # 4-byte Folded Reload
	lw	s4, 12(sp)                      # 4-byte Folded Reload
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
