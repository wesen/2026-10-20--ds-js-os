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
	addi	sp, sp, -128
	sw	a2, 112(sp)                     # 4-byte Folded Spill
	sw	a1, 116(sp)                     # 4-byte Folded Spill
	sw	a0, 120(sp)                     # 4-byte Folded Spill
	lw	a1, 0(a0)
	sw	a1, 124(sp)                     # 4-byte Folded Spill
	li	a0, 17
	bgeu	a0, a1, .LBB0_19
# %bb.1:                                # %checked_read.exit
	lw	a0, 124(sp)                     # 4-byte Folded Reload
	li	a1, 18
	beq	a0, a1, .LBB0_19
# %bb.2:                                # %checked_read.exit37
	lw	a1, 124(sp)                     # 4-byte Folded Reload
	li	a0, 19
	bgeu	a0, a1, .LBB0_19
# %bb.3:                                # %checked_read.exit47
	lw	a0, 120(sp)                     # 4-byte Folded Reload
	lhu	a0, 36(a0)
	sw	a0, 108(sp)                     # 4-byte Folded Spill
	beqz	a0, .LBB0_18
# %bb.4:                                # %for.body.lr.ph
	lw	a0, 120(sp)                     # 4-byte Folded Reload
	lw	a2, 108(sp)                     # 4-byte Folded Reload
	lw	a1, 112(sp)                     # 4-byte Folded Reload
	lw	a3, 116(sp)                     # 4-byte Folded Reload
	lhu	a4, 38(a0)
	addi	a4, a4, -32
	sw	a4, 52(sp)                      # 4-byte Folded Spill
	lhu	a4, 40(a0)
	addi	a4, a4, -32
	sw	a4, 56(sp)                      # 4-byte Folded Spill
	lhu	a4, 42(a0)
	sw	a4, 60(sp)                      # 4-byte Folded Spill
	slli	a4, a3, 5
	lui	a3, 1
	add	a4, a4, a3
	sw	a4, 64(sp)                      # 4-byte Folded Spill
	slli	a1, a1, 5
	add	a1, a1, a3
	sw	a1, 68(sp)                      # 4-byte Folded Spill
	slli	a1, a2, 2
	add	a1, a1, a2
	sw	a1, 72(sp)                      # 4-byte Folded Spill
	addi	a4, a0, 12
	addi	a5, a0, 52
	li	a2, 1
	mv	a0, a2
	li	a1, 0
	li	a3, 21
	li	a6, 156
	sw	a6, 76(sp)                      # 4-byte Folded Spill
	sw	a5, 80(sp)                      # 4-byte Folded Spill
	sw	a4, 84(sp)                      # 4-byte Folded Spill
	sw	a3, 88(sp)                      # 4-byte Folded Spill
	sw	a2, 92(sp)                      # 4-byte Folded Spill
	sw	a1, 96(sp)                      # 4-byte Folded Spill
	sw	a0, 100(sp)                     # 4-byte Folded Spill
	j	.LBB0_6
.LBB0_5:                                # %for.inc
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a0, 72(sp)                      # 4-byte Folded Reload
	lw	a6, 48(sp)                      # 4-byte Folded Reload
	lw	a5, 44(sp)                      # 4-byte Folded Reload
	lw	a4, 40(sp)                      # 4-byte Folded Reload
	lw	a3, 36(sp)                      # 4-byte Folded Reload
	lw	a1, 32(sp)                      # 4-byte Folded Reload
	lw	a2, 108(sp)                     # 4-byte Folded Reload
	sltu	a2, a3, a2
	addi	a1, a1, 5
	addi	a3, a3, 1
	addi	a4, a4, 4
	addi	a5, a5, 10
	addi	a6, a6, 8
	sw	a6, 80(sp)                      # 4-byte Folded Spill
	sw	a5, 84(sp)                      # 4-byte Folded Spill
	sw	a4, 88(sp)                      # 4-byte Folded Spill
	sw	a3, 92(sp)                      # 4-byte Folded Spill
	mv	a3, a1
	sw	a3, 96(sp)                      # 4-byte Folded Spill
	mv	a3, a2
	sw	a3, 100(sp)                     # 4-byte Folded Spill
	sw	a2, 8(sp)                       # 4-byte Folded Spill
	beq	a0, a1, .LBB0_17
.LBB0_6:                                # %for.body
                                        # =>This Inner Loop Header: Depth=1
	lw	a1, 124(sp)                     # 4-byte Folded Reload
	lw	a2, 80(sp)                      # 4-byte Folded Reload
	lw	a3, 84(sp)                      # 4-byte Folded Reload
	lw	a0, 88(sp)                      # 4-byte Folded Reload
	lw	a4, 92(sp)                      # 4-byte Folded Reload
	lw	a5, 96(sp)                      # 4-byte Folded Reload
	lw	a6, 100(sp)                     # 4-byte Folded Reload
	sw	a6, 28(sp)                      # 4-byte Folded Spill
	sw	a5, 32(sp)                      # 4-byte Folded Spill
	sw	a4, 36(sp)                      # 4-byte Folded Spill
	sw	a0, 40(sp)                      # 4-byte Folded Spill
	sw	a3, 44(sp)                      # 4-byte Folded Spill
	sw	a2, 48(sp)                      # 4-byte Folded Spill
	bgeu	a0, a1, .LBB0_19
# %bb.7:                                # %checked_read.exit52
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a1, 124(sp)                     # 4-byte Folded Reload
	lw	a0, 40(sp)                      # 4-byte Folded Reload
	addi	a0, a0, 2
	bgeu	a0, a1, .LBB0_19
# %bb.8:                                # %checked_read.exit57
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a0, 48(sp)                      # 4-byte Folded Reload
	lw	a1, 64(sp)                      # 4-byte Folded Reload
	lhu	a2, -6(a0)
	sub	a1, a1, a2
	srai	a2, a1, 31
	xor	a1, a1, a2
	sub	a1, a1, a2
	lhu	a0, -2(a0)
	bltu	a0, a1, .LBB0_5
# %bb.9:                                # %checked_read.exit62
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a1, 124(sp)                     # 4-byte Folded Reload
	lw	a0, 40(sp)                      # 4-byte Folded Reload
	addi	a0, a0, 3
	bgeu	a0, a1, .LBB0_19
# %bb.10:                               # %checked_read.exit67
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a0, 48(sp)                      # 4-byte Folded Reload
	lw	a1, 68(sp)                      # 4-byte Folded Reload
	lhu	a2, -4(a0)
	sub	a1, a1, a2
	srai	a2, a1, 31
	xor	a1, a1, a2
	sub	a1, a1, a2
	lhu	a0, 0(a0)
	bltu	a0, a1, .LBB0_5
# %bb.11:                               # %if.end
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a1, 124(sp)                     # 4-byte Folded Reload
	lw	a0, 32(sp)                      # 4-byte Folded Reload
	addi	a0, a0, 1
	bgeu	a0, a1, .LBB0_19
# %bb.12:                               # %checked_read.exit72
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a1, 124(sp)                     # 4-byte Folded Reload
	lw	a0, 32(sp)                      # 4-byte Folded Reload
	addi	a0, a0, 2
	bgeu	a0, a1, .LBB0_19
# %bb.13:                               # %checked_read.exit77
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a1, 124(sp)                     # 4-byte Folded Reload
	lw	a0, 32(sp)                      # 4-byte Folded Reload
	addi	a0, a0, 3
	bgeu	a0, a1, .LBB0_19
# %bb.14:                               # %checked_read.exit82
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a1, 124(sp)                     # 4-byte Folded Reload
	lw	a0, 32(sp)                      # 4-byte Folded Reload
	addi	a0, a0, 4
	bgeu	a0, a1, .LBB0_19
# %bb.15:                               # %checked_read.exit87
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a3, 56(sp)                      # 4-byte Folded Reload
	lw	a4, 52(sp)                      # 4-byte Folded Reload
	lw	a1, 76(sp)                      # 4-byte Folded Reload
	lw	a5, 44(sp)                      # 4-byte Folded Reload
	lw	a6, 112(sp)                     # 4-byte Folded Reload
	lw	a2, 116(sp)                     # 4-byte Folded Reload
	lhu	a0, -6(a5)
	sub	a2, a0, a2
	sw	a2, 12(sp)                      # 4-byte Folded Spill
	lhu	a0, -4(a5)
	sub	a0, a0, a6
	sw	a0, 16(sp)                      # 4-byte Folded Spill
	lhu	a5, -2(a5)
	sub	a1, a1, a5
	sw	a1, 20(sp)                      # 4-byte Folded Spill
	mul	a2, a2, a4
	mul	a0, a0, a3
	add	a0, a0, a2
	slli	a1, a1, 5
	add	a1, a1, a0
	sw	a1, 24(sp)                      # 4-byte Folded Spill
	li	a0, 0
	blez	a1, .LBB0_5
# %bb.16:                               # %land.lhs.true
                                        #   in Loop: Header=BB0_6 Depth=1
	lw	a2, 28(sp)                      # 4-byte Folded Reload
	lw	a0, 24(sp)                      # 4-byte Folded Reload
	lw	a3, 60(sp)                      # 4-byte Folded Reload
	lw	a4, 20(sp)                      # 4-byte Folded Reload
	lw	a1, 16(sp)                      # 4-byte Folded Reload
	lw	a6, 12(sp)                      # 4-byte Folded Reload
	lw	a5, 44(sp)                      # 4-byte Folded Reload
	lhu	a5, 0(a5)
	mul	a6, a6, a6
	mul	a1, a1, a1
	add	a1, a1, a6
	mul	a4, a4, a4
	mul	a5, a5, a5
	sub	a4, a4, a5
	add	a1, a1, a4
	mul	a1, a1, a3
	mul	a0, a0, a0
	sw	a2, 8(sp)                       # 4-byte Folded Spill
	blt	a0, a1, .LBB0_5
.LBB0_17:                               # %cleanup56.loopexit
	lw	a0, 8(sp)                       # 4-byte Folded Reload
	andi	a0, a0, 1
.LBB0_18:                               # %cleanup56
	sw	a0, 104(sp)                     # 4-byte Folded Spill
	lw	a0, 104(sp)                     # 4-byte Folded Reload
	addi	sp, sp, 128
	ret
.LBB0_19:                               # %if.then.i
	unimp
.Lfunc_end0:
	.size	kernel, .Lfunc_end0-kernel
                                        # -- End function
	.option	pop
	.ident	"Ubuntu clang version 18.1.3 (1ubuntu1)"
	.section	".note.GNU-stack","",@progbits
