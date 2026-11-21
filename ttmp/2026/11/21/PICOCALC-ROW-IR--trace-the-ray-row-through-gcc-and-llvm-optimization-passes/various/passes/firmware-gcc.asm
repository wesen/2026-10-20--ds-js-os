<trace_row>:
   0:	6785                	lui	a5,0x1
   2:	711d                	addi	sp,sp,-96
   4:	96278793          	addi	a5,a5,-1694 # 962 <.LLST161+0x45>
   8:	d86a                	sw	s10,48(sp)
   a:	00f50d33          	add	s10,a0,a5
   e:	cca2                	sw	s0,88(sp)
  10:	caa6                	sw	s1,84(sp)
  12:	c4d2                	sw	s4,72(sp)
  14:	842e                	mv	s0,a1
  16:	8a2a                	mv	s4,a0
  18:	84b2                	mv	s1,a2
  1a:	856a                	mv	a0,s10

0000001c <.LVL58>:
  1c:	14000613          	li	a2,320

00000020 <.LVL59>:
  20:	4581                	li	a1,0

00000022 <.LVL60>:
  22:	c6ce                	sw	s3,76(sp)
  24:	c0da                	sw	s6,64(sp)
  26:	ce86                	sw	ra,92(sp)
  28:	8b36                	mv	s6,a3
  2a:	00000097          	auipc	ra,0x0
			2a: R_RISCV_CALL_PLT	memset
			2a: R_RISCV_RELAX	*ABS*
  2e:	000080e7          	jalr	ra # 2a <.LVL60+0x8>

00000032 <.LBB67>:
  32:	054a2983          	lw	s3,84(s4)
  36:	0c098663          	beqz	s3,102 <.L53>
			36: R_RISCV_BRANCH	.L53
  3a:	d66e                	sw	s11,44(sp)

0000003c <.LBB68>:
  3c:	420a0793          	addi	a5,s4,1056
  40:	6d85                	lui	s11,0x1
  42:	c8ca                	sw	s2,80(sp)
  44:	c2d6                	sw	s5,68(sp)
  46:	de5e                	sw	s7,60(sp)
  48:	dc62                	sw	s8,56(sp)
  4a:	da66                	sw	s9,52(sp)
  4c:	aa2d8d93          	addi	s11,s11,-1374 # aa2 <.LLST169+0x23>
  50:	004a0a93          	addi	s5,s4,4
  54:	1a0a0b93          	addi	s7,s4,416

00000058 <.LBE68>:
  58:	4c01                	li	s8,0
  5a:	4c81                	li	s9,0

0000005c <.LBE67>:
  5c:	4981                	li	s3,0

0000005e <.LBB72>:
  5e:	4905                	li	s2,1
  60:	c63e                	sw	a5,12(sp)

00000062 <.L62>:
  62:	000aa703          	lw	a4,0(s5)
  66:	008ad783          	lhu	a5,8(s5)
  6a:	ec0b8513          	addi	a0,s7,-320
  6e:	40e40733          	sub	a4,s0,a4

00000072 <.LVL63>:
  72:	0742                	slli	a4,a4,0x10

00000074 <.LVL64>:
  74:	8341                	srli	a4,a4,0x10
  76:	02f787b3          	mul	a5,a5,a5
  7a:	02e70733          	mul	a4,a4,a4
  7e:	40e786b3          	sub	a3,a5,a4
  82:	06c2                	slli	a3,a3,0x10
  84:	82c1                	srli	a3,a3,0x10
  86:	00d11f23          	sh	a3,30(sp)
  8a:	09248663          	beq	s1,s2,116 <.L74>
			8a: R_RISCV_BRANCH	.L74

0000008e <.L57>:
  8e:	00055783          	lhu	a5,0(a0)
  92:	01850733          	add	a4,a0,s8
  96:	0509                	addi	a0,a0,2
  98:	40f687b3          	sub	a5,a3,a5
  9c:	3cf71023          	sh	a5,960(a4)
  a0:	ff7517e3          	bne	a0,s7,8e <.L57>
			a0: R_RISCV_BRANCH	.L57

000000a4 <.L58>:
  a4:	01ba0833          	add	a6,s4,s11
  a8:	85c2                	mv	a1,a6
  aa:	87ea                	mv	a5,s10

000000ac <.L56>:
  ac:	abe79703          	lh	a4,-1346(a5)

000000b0 <.LVL68>:
  b0:	00ea06b3          	add	a3,s4,a4
  b4:	02074363          	bltz	a4,da <.L59>
			b4: R_RISCV_BRANCH	.L59
  b8:	5606c683          	lbu	a3,1376(a3)
  bc:	004aa703          	lw	a4,4(s5)

000000c0 <.LVL69>:
  c0:	00079603          	lh	a2,0(a5)
  c4:	99da                	add	s3,s3,s6

000000c6 <.LVL70>:
  c6:	8f15                	sub	a4,a4,a3
  c8:	0742                	slli	a4,a4,0x10
  ca:	8741                	srai	a4,a4,0x10

000000cc <.LVL71>:
  cc:	c219                	beqz	a2,d2 <.L60>
			cc: R_RISCV_RVC_BRANCH	.L60
  ce:	00c75663          	bge	a4,a2,da <.L59>
			ce: R_RISCV_BRANCH	.L59

000000d2 <.L60>:
  d2:	00e79023          	sh	a4,0(a5)
  d6:	01980023          	sb	s9,0(a6)

000000da <.L59>:
  da:	0789                	addi	a5,a5,2
  dc:	0805                	addi	a6,a6,1

000000de <.LVL73>:
  de:	fcb797e3          	bne	a5,a1,ac <.L56>
			de: R_RISCV_BRANCH	.L56

000000e2 <.LBE70>:
  e2:	054a2783          	lw	a5,84(s4)
  e6:	0c85                	addi	s9,s9,1

000000e8 <.LVL74>:
  e8:	0af1                	addi	s5,s5,28
  ea:	ec0c0c13          	addi	s8,s8,-320
  ee:	140b8b93          	addi	s7,s7,320
  f2:	f6fce8e3          	bltu	s9,a5,62 <.L62>
			f2: R_RISCV_BRANCH	.L62
  f6:	4946                	lw	s2,80(sp)
  f8:	4a96                	lw	s5,68(sp)
  fa:	5bf2                	lw	s7,60(sp)
  fc:	5c62                	lw	s8,56(sp)
  fe:	5cd2                	lw	s9,52(sp)

00000100 <.LVL75>:
 100:	5db2                	lw	s11,44(sp)

00000102 <.L53>:
 102:	40f6                	lw	ra,92(sp)
 104:	4466                	lw	s0,88(sp)

00000106 <.LVL77>:
 106:	44d6                	lw	s1,84(sp)

00000108 <.LVL78>:
 108:	4a26                	lw	s4,72(sp)

0000010a <.LVL79>:
 10a:	4b06                	lw	s6,64(sp)

0000010c <.LVL80>:
 10c:	5d42                	lw	s10,48(sp)

0000010e <.LVL81>:
 10e:	854e                	mv	a0,s3
 110:	49b6                	lw	s3,76(sp)
 112:	6125                	addi	sp,sp,96
 114:	8082                	ret

00000116 <.L74>:
 116:	4632                	lw	a2,12(sp)
 118:	46d1                	li	a3,20
 11a:	01e10593          	addi	a1,sp,30
 11e:	00000097          	auipc	ra,0x0
			11e: R_RISCV_CALL_PLT	raytrace_demo_pie_row
			11e: R_RISCV_RELAX	*ABS*
 122:	000080e7          	jalr	ra # 11e <.L74+0x8>

00000126 <.LVL83>:
 126:	bfbd                	j	a4 <.L58>
			126: R_RISCV_RVC_JUMP	.L58
