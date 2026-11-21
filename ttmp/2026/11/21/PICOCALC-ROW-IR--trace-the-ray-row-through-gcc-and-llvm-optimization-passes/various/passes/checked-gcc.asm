<row>:
   0:	6785                	lui	a5,0x1
   2:	1101                	addi	sp,sp,-32
   4:	c1678793          	addi	a5,a5,-1002 # c16 <.L20+0xae6>
   8:	c652                	sw	s4,12(sp)
   a:	97aa                	add	a5,a5,a0
   c:	8a2e                	mv	s4,a1
   e:	60900e13          	li	t3,1545
  12:	6a900613          	li	a2,1705

00000016 <.L4>:
  16:	4118                	lw	a4,0(a0)
  18:	10ee7c63          	bgeu	t3,a4,130 <.L20>
			18: R_RISCV_BRANCH	.L20
  1c:	00079023          	sh	zero,0(a5)
  20:	4114                	lw	a3,0(a0)
  22:	0a0e0713          	addi	a4,t3,160
  26:	10d77563          	bgeu	a4,a3,130 <.L20>
			26: R_RISCV_BRANCH	.L20
  2a:	14079023          	sh	zero,320(a5)
  2e:	0e05                	addi	t3,t3,1
  30:	0789                	addi	a5,a5,2
  32:	fece12e3          	bne	t3,a2,16 <.L4>
			32: R_RISCV_BRANCH	.L4
  36:	4110                	lw	a2,0(a0)
  38:	47c1                	li	a5,16
  3a:	0ec7fb63          	bgeu	a5,a2,130 <.L20>
			3a: R_RISCV_BRANCH	.L20
  3e:	c456                	sw	s5,8(sp)
  40:	02455a83          	lhu	s5,36(a0)
  44:	0e0a8163          	beqz	s5,126 <.L5>
			44: R_RISCV_BRANCH	.L5
  48:	ca4a                	sw	s2,20(sp)
  4a:	c84e                	sw	s3,16(sp)
  4c:	797d                	lui	s2,0xfffff
  4e:	6985                	lui	s3,0x1
  50:	ce22                	sw	s0,28(sp)
  52:	cc26                	sw	s1,24(sp)
  54:	c25a                	sw	s6,4(sp)
  56:	c1698993          	addi	s3,s3,-1002 # c16 <.L20+0xae6>
  5a:	43e90913          	addi	s2,s2,1086 # fffff43e <.L20+0xfffff30e>
  5e:	00450f13          	addi	t5,a0,4
  62:	00850293          	addi	t0,a0,8
  66:	4481                	li	s1,0
  68:	4401                	li	s0,0
  6a:	4389                	li	t2,2
  6c:	4f85                	li	t6,1
  6e:	74900313          	li	t1,1865

00000072 <.L10>:
  72:	0002d783          	lhu	a5,0(t0)
  76:	00138713          	addi	a4,t2,1
  7a:	40fa07b3          	sub	a5,s4,a5
  7e:	08c77e63          	bgeu	a4,a2,11a <.L3>
			7e: R_RISCV_BRANCH	.L3
  82:	00238713          	addi	a4,t2,2
  86:	0022de83          	lhu	t4,2(t0)
  8a:	08c77863          	bgeu	a4,a2,11a <.L3>
			8a: R_RISCV_BRANCH	.L3
  8e:	0042d583          	lhu	a1,4(t0)
  92:	02f787b3          	mul	a5,a5,a5
  96:	013506b3          	add	a3,a0,s3
  9a:	8772                	mv	a4,t3
  9c:	97f48893          	addi	a7,s1,-1665
  a0:	01240833          	add	a6,s0,s2
  a4:	02b585b3          	mul	a1,a1,a1
  a8:	8d9d                	sub	a1,a1,a5
  aa:	a011                	j	ae <.L9>
			aa: R_RISCV_RVC_JUMP	.L9

000000ac <.L23>:
  ac:	4110                	lw	a2,0(a0)

000000ae <.L9>:
  ae:	00e887b3          	add	a5,a7,a4
  b2:	06c7f463          	bgeu	a5,a2,11a <.L3>
			b2: R_RISCV_BRANCH	.L3
  b6:	010687b3          	add	a5,a3,a6
  ba:	0007d783          	lhu	a5,0(a5)
  be:	40f587b3          	sub	a5,a1,a5
  c2:	0207cc63          	bltz	a5,fa <.L6>
			c2: R_RISCV_BRANCH	.L6
  c6:	20878793          	addi	a5,a5,520
  ca:	04c7f863          	bgeu	a5,a2,11a <.L3>
			ca: R_RISCV_BRANCH	.L3
  ce:	0786                	slli	a5,a5,0x1
  d0:	97fa                	add	a5,a5,t5
  d2:	f6070b13          	addi	s6,a4,-160
  d6:	0007d783          	lhu	a5,0(a5)
  da:	04cb7063          	bgeu	s6,a2,11a <.L3>
			da: R_RISCV_BRANCH	.L3
  de:	0006d603          	lhu	a2,0(a3)
  e2:	40fe87b3          	sub	a5,t4,a5
  e6:	c219                	beqz	a2,ec <.L7>
			e6: R_RISCV_RVC_BRANCH	.L7
  e8:	00c7d963          	bge	a5,a2,fa <.L6>
			e8: R_RISCV_BRANCH	.L6

000000ec <.L7>:
  ec:	00f69023          	sh	a5,0(a3)
  f0:	411c                	lw	a5,0(a0)
  f2:	02f77463          	bgeu	a4,a5,11a <.L3>
			f2: R_RISCV_BRANCH	.L3
  f6:	15f69023          	sh	t6,320(a3)

000000fa <.L6>:
  fa:	0705                	addi	a4,a4,1
  fc:	0689                	addi	a3,a3,2
  fe:	fa6717e3          	bne	a4,t1,ac <.L23>
			fe: R_RISCV_BRANCH	.L23
 102:	0395                	addi	t2,t2,5
 104:	14040413          	addi	s0,s0,320
 108:	0a048493          	addi	s1,s1,160
 10c:	02a9                	addi	t0,t0,10
 10e:	015f8763          	beq	t6,s5,11c <.L21>
			10e: R_RISCV_BRANCH	.L21
 112:	4110                	lw	a2,0(a0)
 114:	0f85                	addi	t6,t6,1
 116:	f4c3eee3          	bltu	t2,a2,72 <.L10>
			116: R_RISCV_BRANCH	.L10

0000011a <.L3>:
 11a:	9002                	ebreak

0000011c <.L21>:
 11c:	4472                	lw	s0,28(sp)
 11e:	44e2                	lw	s1,24(sp)
 120:	4952                	lw	s2,20(sp)
 122:	49c2                	lw	s3,16(sp)
 124:	4b12                	lw	s6,4(sp)

00000126 <.L5>:
 126:	4aa2                	lw	s5,8(sp)
 128:	4a32                	lw	s4,12(sp)
 12a:	4505                	li	a0,1
 12c:	6105                	addi	sp,sp,32
 12e:	8082                	ret

00000130 <.L20>:
 130:	ce22                	sw	s0,28(sp)
 132:	cc26                	sw	s1,24(sp)
 134:	ca4a                	sw	s2,20(sp)
 136:	c84e                	sw	s3,16(sp)
 138:	c456                	sw	s5,8(sp)
 13a:	c25a                	sw	s6,4(sp)
 13c:	9002                	ebreak
