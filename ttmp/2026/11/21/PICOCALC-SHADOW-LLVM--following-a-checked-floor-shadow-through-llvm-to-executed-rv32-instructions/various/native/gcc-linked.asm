
test:     file format elf32-littleriscv


Disassembly of section .text:

000100b0 <kernel>:
   100b0:	00052883          	lw	a7,0(a0)
   100b4:	47c5                	c.li	a5,17
   100b6:	1517f463          	bgeu	a5,a7,101fe <kernel+0x14e>
   100ba:	02655283          	lhu	t0,38(a0)
   100be:	47c9                	c.li	a5,18
   100c0:	1281                	c.addi	t0,-32
   100c2:	12f88e63          	beq	a7,a5,101fe <kernel+0x14e>
   100c6:	02855383          	lhu	t2,40(a0)
   100ca:	47cd                	c.li	a5,19
   100cc:	1381                	c.addi	t2,-32
   100ce:	12f88863          	beq	a7,a5,101fe <kernel+0x14e>
   100d2:	02455783          	lhu	a5,36(a0)
   100d6:	1101                	c.addi	sp,-32
   100d8:	cc26                	c.swsp	s1,24(sp)
   100da:	02a55483          	lhu	s1,42(a0)
   100de:	10078e63          	beq	a5,zero,101fa <kernel+0x14a>
   100e2:	fee88e13          	addi	t3,a7,-18
   100e6:	00279f13          	slli	t5,a5,0x2
   100ea:	ffce7e13          	andi	t3,t3,-4
   100ee:	9f3e                	c.add	t5,a5
   100f0:	08058e93          	addi	t4,a1,128
   100f4:	08060f93          	addi	t6,a2,128
   100f8:	ce22                	c.swsp	s0,28(sp)
   100fa:	00650313          	addi	t1,a0,6
   100fe:	ca4a                	c.swsp	s2,20(sp)
   10100:	c84e                	c.swsp	s3,16(sp)
   10102:	c652                	c.swsp	s4,12(sp)
   10104:	c456                	c.swsp	s5,8(sp)
   10106:	0e61                	c.addi	t3,24
   10108:	0f11                	c.addi	t5,4
   1010a:	0e96                	c.slli	t4,0x5
   1010c:	0f96                	c.slli	t6,0x5
   1010e:	02e50513          	addi	a0,a0,46
   10112:	4761                	c.li	a4,24
   10114:	4691                	c.li	a3,4
   10116:	09c00413          	addi	s0,zero,156
   1011a:	0eee0363          	beq	t3,a4,10200 <kernel+0x150>
   1011e:	00055783          	lhu	a5,0(a0)
   10122:	fff70813          	addi	a6,a4,-1
   10126:	40fe87b3          	sub	a5,t4,a5
   1012a:	41f7d913          	srai	s2,a5,0x1f
   1012e:	00f947b3          	xor	a5,s2,a5
   10132:	412787b3          	sub	a5,a5,s2
   10136:	0d187563          	bgeu	a6,a7,10200 <kernel+0x150>
   1013a:	00455803          	lhu	a6,4(a0)
   1013e:	08f84d63          	blt	a6,a5,101d8 <kernel+0x128>
   10142:	ffe70793          	addi	a5,a4,-2
   10146:	0b17fd63          	bgeu	a5,a7,10200 <kernel+0x150>
   1014a:	00255783          	lhu	a5,2(a0)
   1014e:	40ff87b3          	sub	a5,t6,a5
   10152:	41f7d813          	srai	a6,a5,0x1f
   10156:	00f847b3          	xor	a5,a6,a5
   1015a:	410787b3          	sub	a5,a5,a6
   1015e:	0b177163          	bgeu	a4,a7,10200 <kernel+0x150>
   10162:	00655803          	lhu	a6,6(a0)
   10166:	06f84963          	blt	a6,a5,101d8 <kernel+0x128>
   1016a:	ffd68793          	addi	a5,a3,-3
   1016e:	0917f963          	bgeu	a5,a7,10200 <kernel+0x150>
   10172:	00035783          	lhu	a5,0(t1)
   10176:	ffe68813          	addi	a6,a3,-2
   1017a:	8f8d                	c.sub	a5,a1
   1017c:	09187263          	bgeu	a6,a7,10200 <kernel+0x150>
   10180:	00235983          	lhu	s3,2(t1)
   10184:	fff68813          	addi	a6,a3,-1
   10188:	40c989b3          	sub	s3,s3,a2
   1018c:	07187a63          	bgeu	a6,a7,10200 <kernel+0x150>
   10190:	00435903          	lhu	s2,4(t1)
   10194:	41240933          	sub	s2,s0,s2
   10198:	0716f463          	bgeu	a3,a7,10200 <kernel+0x150>
   1019c:	02f28833          	mul	a6,t0,a5
   101a0:	00591a13          	slli	s4,s2,0x5
   101a4:	03338ab3          	mul	s5,t2,s3
   101a8:	9856                	c.add	a6,s5
   101aa:	9852                	c.add	a6,s4
   101ac:	03005663          	bge	zero,a6,101d8 <kernel+0x128>
   101b0:	00635a03          	lhu	s4,6(t1)
   101b4:	02f787b3          	mul	a5,a5,a5
   101b8:	033989b3          	mul	s3,s3,s3
   101bc:	03290933          	mul	s2,s2,s2
   101c0:	97ce                	c.add	a5,s3
   101c2:	034a0a33          	mul	s4,s4,s4
   101c6:	97ca                	c.add	a5,s2
   101c8:	414787b3          	sub	a5,a5,s4
   101cc:	03080833          	mul	a6,a6,a6
   101d0:	029787b3          	mul	a5,a5,s1
   101d4:	02f85163          	bge	a6,a5,101f6 <kernel+0x146>
   101d8:	0695                	c.addi	a3,5
   101da:	0329                	c.addi	t1,10
   101dc:	0521                	c.addi	a0,8
   101de:	0711                	c.addi	a4,4
   101e0:	f2df1de3          	bne	t5,a3,1011a <kernel+0x6a>
   101e4:	4501                	c.li	a0,0
   101e6:	4472                	c.lwsp	s0,28(sp)
   101e8:	4952                	c.lwsp	s2,20(sp)
   101ea:	49c2                	c.lwsp	s3,16(sp)
   101ec:	4a32                	c.lwsp	s4,12(sp)
   101ee:	4aa2                	c.lwsp	s5,8(sp)
   101f0:	44e2                	c.lwsp	s1,24(sp)
   101f2:	6105                	c.addi16sp	sp,32
   101f4:	8082                	c.jr	ra
   101f6:	4505                	c.li	a0,1
   101f8:	b7fd                	c.j	101e6 <kernel+0x136>
   101fa:	4501                	c.li	a0,0
   101fc:	bfd5                	c.j	101f0 <kernel+0x140>
   101fe:	9002                	c.ebreak
   10200:	9002                	c.ebreak
