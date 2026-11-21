<row>:
   0:	1141                	addi	sp,sp,-16
   2:	c622                	sw	s0,12(sp)
   4:	c426                	sw	s1,8(sp)
   6:	00450e13          	addi	t3,a0,4
   a:	7ff50613          	addi	a2,a0,2047
   e:	55760613          	addi	a2,a2,1367
  12:	60900693          	li	a3,1545
  16:	6a900713          	li	a4,1705

0000001a <.LBB0_1>:
  1a:	411c                	lw	a5,0(a0)
  1c:	00f6f063          	bgeu	a3,a5,1c <.LBB0_1+0x2>
			1c: R_RISCV_BRANCH	.LBB0_22
  20:	ec061023          	sh	zero,-320(a2)
  24:	411c                	lw	a5,0(a0)
  26:	0a068493          	addi	s1,a3,160
  2a:	00f4f063          	bgeu	s1,a5,2a <.LBB0_1+0x10>
			2a: R_RISCV_BRANCH	.LBB0_22
  2e:	00061023          	sh	zero,0(a2)
  32:	0685                	addi	a3,a3,1
  34:	0609                	addi	a2,a2,2
  36:	00e69063          	bne	a3,a4,36 <.LBB0_1+0x1c>
			36: R_RISCV_BRANCH	.LBB0_1
  3a:	4110                	lw	a2,0(a0)
  3c:	46c1                	li	a3,16
  3e:	00c6f063          	bgeu	a3,a2,3e <.LBB0_1+0x24>
			3e: R_RISCV_BRANCH	.LBB0_22
  42:	02455803          	lhu	a6,36(a0)
  46:	00080063          	beqz	a6,46 <.LBB0_1+0x2c>
			46: R_RISCV_BRANCH	.LBB0_21
  4a:	4301                	li	t1,0
  4c:	05400293          	li	t0,84
  50:	02800f13          	li	t5,40
  54:	6605                	lui	a2,0x1
  56:	c1660893          	addi	a7,a2,-1002 # c16 <.LBB0_22+0xaf0>
  5a:	0a000393          	li	t2,160
  5e:	a001                	j	5e <.LBB0_1+0x44>
			5e: R_RISCV_RVC_JUMP	.LBB0_8

00000060 <.LBB0_7>:
  60:	14028293          	addi	t0,t0,320
  64:	0a0f0f13          	addi	t5,t5,160
  68:	01030063          	beq	t1,a6,68 <.LBB0_7+0x8>
			68: R_RISCV_BRANCH	.LBB0_21

0000006c <.LBB0_8>:
  6c:	411c                	lw	a5,0(a0)
  6e:	00231693          	slli	a3,t1,0x2
  72:	969a                	add	a3,a3,t1
  74:	00268713          	addi	a4,a3,2
  78:	00f77063          	bgeu	a4,a5,78 <.LBB0_8+0xc>
			78: R_RISCV_BRANCH	.LBB0_22
  7c:	00368613          	addi	a2,a3,3
  80:	00f67063          	bgeu	a2,a5,80 <.LBB0_8+0x14>
			80: R_RISCV_BRANCH	.LBB0_22
  84:	0691                	addi	a3,a3,4
  86:	00f6f063          	bgeu	a3,a5,86 <.LBB0_8+0x1a>
			86: R_RISCV_BRANCH	.LBB0_22
  8a:	0706                	slli	a4,a4,0x1
  8c:	9772                	add	a4,a4,t3
  8e:	00075783          	lhu	a5,0(a4)
  92:	4701                	li	a4,0
  94:	40f587b3          	sub	a5,a1,a5
  98:	0686                	slli	a3,a3,0x1
  9a:	96f2                	add	a3,a3,t3
  9c:	0006d683          	lhu	a3,0(a3)
  a0:	0606                	slli	a2,a2,0x1
  a2:	9672                	add	a2,a2,t3
  a4:	00065e83          	lhu	t4,0(a2)
  a8:	00d78633          	add	a2,a5,a3
  ac:	8e9d                	sub	a3,a3,a5
  ae:	02d60fb3          	mul	t6,a2,a3
  b2:	0305                	addi	t1,t1,1
  b4:	8796                	mv	a5,t0
  b6:	86c6                	mv	a3,a7
  b8:	a001                	j	b8 <.LBB0_8+0x4c>
			b8: R_RISCV_RVC_JUMP	.LBB0_13

000000ba <.LBB0_12>:
  ba:	0705                	addi	a4,a4,1
  bc:	0689                	addi	a3,a3,2
  be:	0789                	addi	a5,a5,2
  c0:	00770063          	beq	a4,t2,c0 <.LBB0_12+0x6>
			c0: R_RISCV_BRANCH	.LBB0_7

000000c4 <.LBB0_13>:
  c4:	4110                	lw	a2,0(a0)
  c6:	00ef0433          	add	s0,t5,a4
  ca:	00c47063          	bgeu	s0,a2,ca <.LBB0_13+0x6>
			ca: R_RISCV_BRANCH	.LBB0_22
  ce:	00f50433          	add	s0,a0,a5
  d2:	00045403          	lhu	s0,0(s0)
  d6:	408f8433          	sub	s0,t6,s0
  da:	00044063          	bltz	s0,da <.LBB0_13+0x16>
			da: R_RISCV_BRANCH	.LBB0_12
  de:	20840413          	addi	s0,s0,520
  e2:	00c47063          	bgeu	s0,a2,e2 <.LBB0_13+0x1e>
			e2: R_RISCV_BRANCH	.LBB0_22
  e6:	60970493          	addi	s1,a4,1545
  ea:	00c4f063          	bgeu	s1,a2,ea <.LBB0_13+0x26>
			ea: R_RISCV_BRANCH	.LBB0_22
  ee:	0406                	slli	s0,s0,0x1
  f0:	9472                	add	s0,s0,t3
  f2:	00045403          	lhu	s0,0(s0)
  f6:	00d50633          	add	a2,a0,a3
  fa:	00065483          	lhu	s1,0(a2)
  fe:	408e8433          	sub	s0,t4,s0
 102:	c081                	beqz	s1,102 <.LBB0_13+0x3e>
			102: R_RISCV_RVC_BRANCH	.LBB0_19
 104:	00945063          	bge	s0,s1,104 <.LBB0_13+0x40>
			104: R_RISCV_BRANCH	.LBB0_12

00000108 <.LBB0_19>:
 108:	00861023          	sh	s0,0(a2)
 10c:	4100                	lw	s0,0(a0)
 10e:	6a970493          	addi	s1,a4,1705
 112:	0084f063          	bgeu	s1,s0,112 <.LBB0_19+0xa>
			112: R_RISCV_BRANCH	.LBB0_22
 116:	14661023          	sh	t1,320(a2)
 11a:	a001                	j	11a <.LBB0_19+0x12>
			11a: R_RISCV_RVC_JUMP	.LBB0_12

0000011c <.LBB0_21>:
 11c:	4505                	li	a0,1
 11e:	4432                	lw	s0,12(sp)
 120:	44a2                	lw	s1,8(sp)
 122:	0141                	addi	sp,sp,16
 124:	8082                	ret

00000126 <.LBB0_22>:
	...
