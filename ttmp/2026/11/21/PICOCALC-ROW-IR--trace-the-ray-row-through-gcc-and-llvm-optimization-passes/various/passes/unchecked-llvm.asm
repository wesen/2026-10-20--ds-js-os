<row>:
   0:	1141                	addi	sp,sp,-16
   2:	c622                	sw	s0,12(sp)
   4:	c426                	sw	s1,8(sp)
   6:	c24a                	sw	s2,4(sp)
   8:	c04e                	sw	s3,0(sp)
   a:	7ff50613          	addi	a2,a0,2047
   e:	41760813          	addi	a6,a2,1047
  12:	55760613          	addi	a2,a2,1367
  16:	86c2                	mv	a3,a6

00000018 <.LBB0_1>:
  18:	00069023          	sh	zero,0(a3)
  1c:	14069023          	sh	zero,320(a3)
  20:	0689                	addi	a3,a3,2
  22:	00c69063          	bne	a3,a2,22 <.LBB0_1+0xa>
			22: R_RISCV_BRANCH	.LBB0_1
  26:	02455883          	lhu	a7,36(a0)
  2a:	00088063          	beqz	a7,2a <.LBB0_1+0x12>
			2a: R_RISCV_BRANCH	.LBB0_11
  2e:	4f81                	li	t6,0
  30:	00850293          	addi	t0,a0,8
  34:	00a50313          	addi	t1,a0,10
  38:	00c50e93          	addi	t4,a0,12
  3c:	05450f13          	addi	t5,a0,84
  40:	41450913          	addi	s2,a0,1044
  44:	14000393          	li	t2,320
  48:	4e29                	li	t3,10
  4a:	a001                	j	4a <.LBB0_1+0x32>
			4a: R_RISCV_RVC_JUMP	.LBB0_5

0000004c <.LBB0_4>:
  4c:	140f0f13          	addi	t5,t5,320
  50:	011f8063          	beq	t6,a7,50 <.LBB0_4+0x4>
			50: R_RISCV_BRANCH	.LBB0_11

00000054 <.LBB0_5>:
  54:	027f8633          	mul	a2,t6,t2
  58:	962a                	add	a2,a2,a0
  5a:	03cf8733          	mul	a4,t6,t3
  5e:	00e286b3          	add	a3,t0,a4
  62:	0006d783          	lhu	a5,0(a3)
  66:	19460693          	addi	a3,a2,404
  6a:	00ee8633          	add	a2,t4,a4
  6e:	00065603          	lhu	a2,0(a2)
  72:	40f587b3          	sub	a5,a1,a5
  76:	971a                	add	a4,a4,t1
  78:	00075983          	lhu	s3,0(a4)
  7c:	00c78733          	add	a4,a5,a2
  80:	8e1d                	sub	a2,a2,a5
  82:	02c70733          	mul	a4,a4,a2
  86:	0f85                	addi	t6,t6,1
  88:	8442                	mv	s0,a6
  8a:	84fa                	mv	s1,t5
  8c:	a001                	j	8c <.LBB0_5+0x38>
			8c: R_RISCV_RVC_JUMP	.LBB0_8

0000008e <.LBB0_6>:
  8e:	00c41023          	sh	a2,0(s0)
  92:	15f41023          	sh	t6,320(s0)

00000096 <.LBB0_7>:
  96:	0489                	addi	s1,s1,2
  98:	0409                	addi	s0,s0,2
  9a:	00d48063          	beq	s1,a3,9a <.LBB0_7+0x4>
			9a: R_RISCV_BRANCH	.LBB0_4

0000009e <.LBB0_8>:
  9e:	0004d603          	lhu	a2,0(s1)
  a2:	40c70633          	sub	a2,a4,a2
  a6:	00064063          	bltz	a2,a6 <.LBB0_8+0x8>
			a6: R_RISCV_BRANCH	.LBB0_7
  aa:	0606                	slli	a2,a2,0x1
  ac:	964a                	add	a2,a2,s2
  ae:	00065603          	lhu	a2,0(a2)
  b2:	00045783          	lhu	a5,0(s0)
  b6:	40c98633          	sub	a2,s3,a2
  ba:	c381                	beqz	a5,ba <.LBB0_8+0x1c>
			ba: R_RISCV_RVC_BRANCH	.LBB0_6
  bc:	00f65063          	bge	a2,a5,bc <.LBB0_8+0x1e>
			bc: R_RISCV_BRANCH	.LBB0_7
  c0:	a001                	j	c0 <.LBB0_8+0x22>
			c0: R_RISCV_RVC_JUMP	.LBB0_6

000000c2 <.LBB0_11>:
  c2:	4505                	li	a0,1
  c4:	4432                	lw	s0,12(sp)
  c6:	44a2                	lw	s1,8(sp)
  c8:	4912                	lw	s2,4(sp)
  ca:	4982                	lw	s3,0(sp)
  cc:	0141                	addi	sp,sp,16
  ce:	8082                	ret
