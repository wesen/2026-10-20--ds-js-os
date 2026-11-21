
test:     file format elf32-littleriscv


Disassembly of section .text:

000100b0 <kernel>:
   100b0:	1101                	c.addi	sp,-32
   100b2:	ce22                	c.swsp	s0,28(sp)
   100b4:	cc26                	c.swsp	s1,24(sp)
   100b6:	ca4a                	c.swsp	s2,20(sp)
   100b8:	c84e                	c.swsp	s3,16(sp)
   100ba:	c652                	c.swsp	s4,12(sp)
   100bc:	c456                	c.swsp	s5,8(sp)
   100be:	c25a                	c.swsp	s6,4(sp)
   100c0:	c05e                	c.swsp	s7,0(sp)
   100c2:	00052f03          	lw	t5,0(a0)
   100c6:	46c5                	c.li	a3,17
   100c8:	13e6fa63          	bgeu	a3,t5,101fc <kernel+0x14c>
   100cc:	46c9                	c.li	a3,18
   100ce:	12df0763          	beq	t5,a3,101fc <kernel+0x14c>
   100d2:	46cd                	c.li	a3,19
   100d4:	13e6f463          	bgeu	a3,t5,101fc <kernel+0x14c>
   100d8:	02455303          	lhu	t1,36(a0)
   100dc:	10030563          	beq	t1,zero,101e6 <kernel+0x136>
   100e0:	02655803          	lhu	a6,38(a0)
   100e4:	02855883          	lhu	a7,40(a0)
   100e8:	4781                	c.li	a5,0
   100ea:	1801                	c.addi	a6,-32
   100ec:	1881                	c.addi	a7,-32
   100ee:	02a55283          	lhu	t0,42(a0)
   100f2:	00559e13          	slli	t3,a1,0x5
   100f6:	6385                	c.lui	t2,0x1
   100f8:	9e1e                	c.add	t3,t2
   100fa:	00561693          	slli	a3,a2,0x5
   100fe:	93b6                	c.add	t2,a3
   10100:	00231e93          	slli	t4,t1,0x2
   10104:	9e9a                	c.add	t4,t1
   10106:	00c50f93          	addi	t6,a0,12
   1010a:	03450513          	addi	a0,a0,52
   1010e:	4b85                	c.li	s7,1
   10110:	4755                	c.li	a4,21
   10112:	09c00913          	addi	s2,zero,156
   10116:	4b05                	c.li	s6,1
   10118:	a811                	c.j	1012c <kernel+0x7c>
   1011a:	006bbb33          	sltu	s6,s7,t1
   1011e:	0795                	c.addi	a5,5
   10120:	0b85                	c.addi	s7,1
   10122:	0711                	c.addi	a4,4
   10124:	0fa9                	c.addi	t6,10
   10126:	0521                	c.addi	a0,8
   10128:	0afe8c63          	beq	t4,a5,101e0 <kernel+0x130>
   1012c:	0de77863          	bgeu	a4,t5,101fc <kernel+0x14c>
   10130:	00270493          	addi	s1,a4,2
   10134:	0de4f463          	bgeu	s1,t5,101fc <kernel+0x14c>
   10138:	ffa55483          	lhu	s1,-6(a0)
   1013c:	409e06b3          	sub	a3,t3,s1
   10140:	ffe55403          	lhu	s0,-2(a0)
   10144:	41f6d493          	srai	s1,a3,0x1f
   10148:	8ea5                	c.xor	a3,s1
   1014a:	8e85                	c.sub	a3,s1
   1014c:	fcd467e3          	bltu	s0,a3,1011a <kernel+0x6a>
   10150:	00370693          	addi	a3,a4,3
   10154:	0be6f463          	bgeu	a3,t5,101fc <kernel+0x14c>
   10158:	ffc55683          	lhu	a3,-4(a0)
   1015c:	40d386b3          	sub	a3,t2,a3
   10160:	00055403          	lhu	s0,0(a0)
   10164:	41f6d493          	srai	s1,a3,0x1f
   10168:	8ea5                	c.xor	a3,s1
   1016a:	8e85                	c.sub	a3,s1
   1016c:	fad467e3          	bltu	s0,a3,1011a <kernel+0x6a>
   10170:	00178693          	addi	a3,a5,1
   10174:	09e6f463          	bgeu	a3,t5,101fc <kernel+0x14c>
   10178:	00278693          	addi	a3,a5,2
   1017c:	09e6f063          	bgeu	a3,t5,101fc <kernel+0x14c>
   10180:	00378693          	addi	a3,a5,3
   10184:	07e6fc63          	bgeu	a3,t5,101fc <kernel+0x14c>
   10188:	00478693          	addi	a3,a5,4
   1018c:	07e6f863          	bgeu	a3,t5,101fc <kernel+0x14c>
   10190:	ffafd483          	lhu	s1,-6(t6)
   10194:	ffcfd683          	lhu	a3,-4(t6)
   10198:	ffefd403          	lhu	s0,-2(t6)
   1019c:	8c8d                	c.sub	s1,a1
   1019e:	40c68ab3          	sub	s5,a3,a2
   101a2:	40890a33          	sub	s4,s2,s0
   101a6:	030486b3          	mul	a3,s1,a6
   101aa:	031a8433          	mul	s0,s5,a7
   101ae:	96a2                	c.add	a3,s0
   101b0:	005a1993          	slli	s3,s4,0x5
   101b4:	99b6                	c.add	s3,a3
   101b6:	f73052e3          	bge	zero,s3,1011a <kernel+0x6a>
   101ba:	000fd683          	lhu	a3,0(t6)
   101be:	02948433          	mul	s0,s1,s1
   101c2:	035a84b3          	mul	s1,s5,s5
   101c6:	9426                	c.add	s0,s1
   101c8:	034a04b3          	mul	s1,s4,s4
   101cc:	02d686b3          	mul	a3,a3,a3
   101d0:	8c95                	c.sub	s1,a3
   101d2:	9426                	c.add	s0,s1
   101d4:	025406b3          	mul	a3,s0,t0
   101d8:	03398433          	mul	s0,s3,s3
   101dc:	f2d44fe3          	blt	s0,a3,1011a <kernel+0x6a>
   101e0:	001b7513          	andi	a0,s6,1
   101e4:	a011                	c.j	101e8 <kernel+0x138>
   101e6:	4501                	c.li	a0,0
   101e8:	4472                	c.lwsp	s0,28(sp)
   101ea:	44e2                	c.lwsp	s1,24(sp)
   101ec:	4952                	c.lwsp	s2,20(sp)
   101ee:	49c2                	c.lwsp	s3,16(sp)
   101f0:	4a32                	c.lwsp	s4,12(sp)
   101f2:	4aa2                	c.lwsp	s5,8(sp)
   101f4:	4b12                	c.lwsp	s6,4(sp)
   101f6:	4b82                	c.lwsp	s7,0(sp)
   101f8:	6105                	c.addi16sp	sp,32
   101fa:	8082                	c.jr	ra
   101fc:	0000                	c.unimp
