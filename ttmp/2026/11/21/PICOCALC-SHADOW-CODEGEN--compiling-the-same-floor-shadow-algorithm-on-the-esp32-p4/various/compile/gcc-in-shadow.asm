00000000 <in_shadow>:
   0:	05452303          	lw	t1,84(a0)
   4:	10030063          	beqz	t1,104 <.L50>
			4: R_RISCV_BRANCH	.L50

00000008 <.LBB55>:
   8:	00561e13          	slli	t3,a2,0x5
   c:	00569e93          	slli	t4,a3,0x5
  10:	01058713          	addi	a4,a1,16

00000014 <.LBE55>:
  14:	4881                	li	a7,0

00000016 <.LBB56>:
  16:	09c00f13          	li	t5,156

0000001a <.L43>:
  1a:	431c                	lw	a5,0(a4)
  1c:	01872f83          	lw	t6,24(a4)

00000020 <.LBE57>:
  20:	0885                	addi	a7,a7,1

00000022 <.LBB58>:
  22:	40fe07b3          	sub	a5,t3,a5
  26:	41f7d813          	srai	a6,a5,0x1f
  2a:	00f847b3          	xor	a5,a6,a5
  2e:	410787b3          	sub	a5,a5,a6
  32:	0cffc563          	blt	t6,a5,fc <.L44>
			32: R_RISCV_BRANCH	.L44
  36:	475c                	lw	a5,12(a4)
  38:	02472f83          	lw	t6,36(a4)
  3c:	40fe87b3          	sub	a5,t4,a5
  40:	41f7d813          	srai	a6,a5,0x1f
  44:	00f847b3          	xor	a5,a6,a5
  48:	410787b3          	sub	a5,a5,a6
  4c:	0affc863          	blt	t6,a5,fc <.L44>
			4c: R_RISCV_BRANCH	.L44

00000050 <.LBE54>:
  50:	1141                	addi	sp,sp,-16
  52:	c622                	sw	s0,12(sp)

00000054 <.L46>:
  54:	411c                	lw	a5,0(a0)
  56:	00452283          	lw	t0,4(a0)
  5a:	0005a803          	lw	a6,0(a1)
  5e:	0045a383          	lw	t2,4(a1)
  62:	8f91                	sub	a5,a5,a2

00000064 <.LVL40>:
  64:	40d282b3          	sub	t0,t0,a3

00000068 <.LVL41>:
  68:	03078833          	mul	a6,a5,a6
  6c:	00852f83          	lw	t6,8(a0)
  70:	41ff0fb3          	sub	t6,t5,t6

00000074 <.LVL42>:
  74:	005f9413          	slli	s0,t6,0x5
  78:	027283b3          	mul	t2,t0,t2
  7c:	981e                	add	a6,a6,t2
  7e:	9822                	add	a6,a6,s0

00000080 <.LVL43>:
  80:	03005763          	blez	a6,ae <.L37>
			80: R_RISCV_BRANCH	.L37
  84:	00c52383          	lw	t2,12(a0)
  88:	02f787b3          	mul	a5,a5,a5

0000008c <.LVL44>:
  8c:	4580                	lw	s0,8(a1)
  8e:	025282b3          	mul	t0,t0,t0

00000092 <.LVL45>:
  92:	03ff8fb3          	mul	t6,t6,t6

00000096 <.LVL46>:
  96:	9796                	add	a5,a5,t0

00000098 <.LVL47>:
  98:	027383b3          	mul	t2,t2,t2
  9c:	97fe                	add	a5,a5,t6
  9e:	407787b3          	sub	a5,a5,t2
  a2:	03080833          	mul	a6,a6,a6

000000a6 <.LVL48>:
  a6:	028787b3          	mul	a5,a5,s0
  aa:	04f85f63          	bge	a6,a5,108 <.L40>
			aa: R_RISCV_BRANCH	.L40

000000ae <.L37>:
  ae:	0711                	addi	a4,a4,4
  b0:	0571                	addi	a0,a0,28
  b2:	04688163          	beq	a7,t1,f4 <.L52>
			b2: R_RISCV_BRANCH	.L52

000000b6 <.L38>:
  b6:	431c                	lw	a5,0(a4)
  b8:	01872f83          	lw	t6,24(a4)

000000bc <.LBE61>:
  bc:	0885                	addi	a7,a7,1

000000be <.LBB62>:
  be:	40fe07b3          	sub	a5,t3,a5
  c2:	41f7d813          	srai	a6,a5,0x1f
  c6:	00f847b3          	xor	a5,a6,a5
  ca:	410787b3          	sub	a5,a5,a6
  ce:	feffc0e3          	blt	t6,a5,ae <.L37>
			ce: R_RISCV_BRANCH	.L37
  d2:	475c                	lw	a5,12(a4)
  d4:	02472f83          	lw	t6,36(a4)
  d8:	40fe87b3          	sub	a5,t4,a5
  dc:	41f7d813          	srai	a6,a5,0x1f
  e0:	00f847b3          	xor	a5,a6,a5
  e4:	410787b3          	sub	a5,a5,a6
  e8:	f6ffd6e3          	bge	t6,a5,54 <.L46>
			e8: R_RISCV_BRANCH	.L46

000000ec <.LBE62>:
  ec:	0711                	addi	a4,a4,4
  ee:	0571                	addi	a0,a0,28
  f0:	fc6893e3          	bne	a7,t1,b6 <.L38>
			f0: R_RISCV_BRANCH	.L38

000000f4 <.L52>:
  f4:	4432                	lw	s0,12(sp)
  f6:	4501                	li	a0,0
  f8:	0141                	addi	sp,sp,16
  fa:	8082                	ret

000000fc <.L44>:
  fc:	0711                	addi	a4,a4,4
  fe:	0571                	addi	a0,a0,28
 100:	f0689de3          	bne	a7,t1,1a <.L43>
			100: R_RISCV_BRANCH	.L43

00000104 <.L50>:
 104:	4501                	li	a0,0
 106:	8082                	ret

00000108 <.L40>:
 108:	4432                	lw	s0,12(sp)

0000010a <.LBB63>:
 10a:	4505                	li	a0,1

0000010c <.LBE63>:
 10c:	0141                	addi	sp,sp,16
 10e:	8082                	ret
