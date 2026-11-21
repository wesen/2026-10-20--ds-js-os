<row>:
   0:	6f85                	lui	t6,0x1
   2:	6785                	lui	a5,0x1
   4:	c16f8f93          	addi	t6,t6,-1002 # c16 <.L3+0xb70>
   8:	d5678713          	addi	a4,a5,-682 # d56 <.L3+0xcb0>
   c:	1141                	addi	sp,sp,-16
   e:	9faa                	add	t6,t6,a0
  10:	83ae                	mv	t2,a1
  12:	c622                	sw	s0,12(sp)
  14:	88aa                	mv	a7,a0
  16:	87fe                	mv	a5,t6
  18:	00e505b3          	add	a1,a0,a4

0000001c <.L2>:
  1c:	00079023          	sh	zero,0(a5)
  20:	14079023          	sh	zero,320(a5)
  24:	0789                	addi	a5,a5,2
  26:	fef59be3          	bne	a1,a5,1c <.L2>
			26: R_RISCV_BRANCH	.L2
  2a:	0248d403          	lhu	s0,36(a7)
  2e:	cc25                	beqz	s0,a6 <.L3>
			2e: R_RISCV_RVC_BRANCH	.L3
  30:	72fd                	lui	t0,0xfffff
  32:	43e28293          	addi	t0,t0,1086 # fffff43e <.L3+0xfffff398>
  36:	00888e93          	addi	t4,a7,8
  3a:	4f01                	li	t5,0
  3c:	4e05                	li	t3,1

0000003e <.L7>:
  3e:	000ed783          	lhu	a5,0(t4)
  42:	004ed503          	lhu	a0,4(t4)
  46:	002ed303          	lhu	t1,2(t4)
  4a:	40f387b3          	sub	a5,t2,a5
  4e:	02f78733          	mul	a4,a5,a5
  52:	005f0833          	add	a6,t5,t0
  56:	87fe                	mv	a5,t6
  58:	02a50533          	mul	a0,a0,a0
  5c:	8d19                	sub	a0,a0,a4

0000005e <.L6>:
  5e:	01078733          	add	a4,a5,a6
  62:	00075703          	lhu	a4,0(a4)
  66:	40e50733          	sub	a4,a0,a4
  6a:	00171693          	slli	a3,a4,0x1
  6e:	96c6                	add	a3,a3,a7
  70:	00074f63          	bltz	a4,8e <.L4>
			70: R_RISCV_BRANCH	.L4
  74:	4146d703          	lhu	a4,1044(a3)
  78:	0007d603          	lhu	a2,0(a5)
  7c:	40e30733          	sub	a4,t1,a4
  80:	c219                	beqz	a2,86 <.L5>
			80: R_RISCV_RVC_BRANCH	.L5
  82:	00c75663          	bge	a4,a2,8e <.L4>
			82: R_RISCV_BRANCH	.L4

00000086 <.L5>:
  86:	00e79023          	sh	a4,0(a5)
  8a:	15c79023          	sh	t3,320(a5)

0000008e <.L4>:
  8e:	0789                	addi	a5,a5,2
  90:	fcf597e3          	bne	a1,a5,5e <.L6>
			90: R_RISCV_BRANCH	.L6
  94:	0ea9                	addi	t4,t4,10
  96:	140f0f13          	addi	t5,t5,320
  9a:	001e0793          	addi	a5,t3,1
  9e:	01c40463          	beq	s0,t3,a6 <.L3>
			9e: R_RISCV_BRANCH	.L3
  a2:	8e3e                	mv	t3,a5
  a4:	bf69                	j	3e <.L7>
			a4: R_RISCV_RVC_JUMP	.L7

000000a6 <.L3>:
  a6:	4432                	lw	s0,12(sp)
  a8:	4505                	li	a0,1
  aa:	0141                	addi	sp,sp,16
  ac:	8082                	ret
