
test:     file format elf32-littleriscv


Disassembly of section .text:

000100b0 <kernel>:
   100b0:	1101                	c.addi	sp,-32
   100b2:	ce22                	c.swsp	s0,28(sp)
   100b4:	cc26                	c.swsp	s1,24(sp)
   100b6:	ca4a                	c.swsp	s2,20(sp)
   100b8:	c84e                	c.swsp	s3,16(sp)
   100ba:	c652                	c.swsp	s4,12(sp)
   100bc:	00052e83          	lw	t4,0(a0)
   100c0:	46c5                	c.li	a3,17
   100c2:	15d6f263          	bgeu	a3,t4,10206 <kernel+0x156>
   100c6:	46c9                	c.li	a3,18
   100c8:	12de8f63          	beq	t4,a3,10206 <kernel+0x156>
   100cc:	46cd                	c.li	a3,19
   100ce:	13d6fc63          	bgeu	a3,t4,10206 <kernel+0x156>
   100d2:	02455e03          	lhu	t3,36(a0)
   100d6:	120e0063          	beq	t3,zero,101f6 <kernel+0x146>
   100da:	02655803          	lhu	a6,38(a0)
   100de:	02855883          	lhu	a7,40(a0)
   100e2:	4701                	c.li	a4,0
   100e4:	1801                	c.addi	a6,-32
   100e6:	1881                	c.addi	a7,-32
   100e8:	02a55283          	lhu	t0,42(a0)
   100ec:	00559313          	slli	t1,a1,0x5
   100f0:	6385                	c.lui	t2,0x1
   100f2:	931e                	c.add	t1,t2
   100f4:	00561693          	slli	a3,a2,0x5
   100f8:	93b6                	c.add	t2,a3
   100fa:	4f85                	c.li	t6,1
   100fc:	00450913          	addi	s2,a0,4
   10100:	09c00f13          	addi	t5,zero,156
   10104:	a031                	c.j	10110 <kernel+0x60>
   10106:	0705                	c.addi	a4,1
   10108:	01c73fb3          	sltu	t6,a4,t3
   1010c:	0fc70263          	beq	a4,t3,101f0 <kernel+0x140>
   10110:	00271793          	slli	a5,a4,0x2
   10114:	01578413          	addi	s0,a5,21
   10118:	0fd47763          	bgeu	s0,t4,10206 <kernel+0x156>
   1011c:	01778693          	addi	a3,a5,23
   10120:	0fd6f363          	bgeu	a3,t4,10206 <kernel+0x156>
   10124:	0406                	c.slli	s0,0x1
   10126:	944a                	c.add	s0,s2
   10128:	00045403          	lhu	s0,0(s0)
   1012c:	40830433          	sub	s0,t1,s0
   10130:	0686                	c.slli	a3,0x1
   10132:	96ca                	c.add	a3,s2
   10134:	0006d683          	lhu	a3,0(a3)
   10138:	41f45493          	srai	s1,s0,0x1f
   1013c:	8c25                	c.xor	s0,s1
   1013e:	8c05                	c.sub	s0,s1
   10140:	fc86e3e3          	bltu	a3,s0,10106 <kernel+0x56>
   10144:	01878693          	addi	a3,a5,24
   10148:	0bd6ff63          	bgeu	a3,t4,10206 <kernel+0x156>
   1014c:	00179413          	slli	s0,a5,0x1
   10150:	944a                	c.add	s0,s2
   10152:	02c45403          	lhu	s0,44(s0)
   10156:	40838433          	sub	s0,t2,s0
   1015a:	0686                	c.slli	a3,0x1
   1015c:	96ca                	c.add	a3,s2
   1015e:	0006d683          	lhu	a3,0(a3)
   10162:	41f45493          	srai	s1,s0,0x1f
   10166:	8c25                	c.xor	s0,s1
   10168:	8c05                	c.sub	s0,s1
   1016a:	f886eee3          	bltu	a3,s0,10106 <kernel+0x56>
   1016e:	97ba                	c.add	a5,a4
   10170:	00178413          	addi	s0,a5,1
   10174:	09d47963          	bgeu	s0,t4,10206 <kernel+0x156>
   10178:	00278493          	addi	s1,a5,2
   1017c:	09d4f563          	bgeu	s1,t4,10206 <kernel+0x156>
   10180:	00378693          	addi	a3,a5,3
   10184:	09d6f163          	bgeu	a3,t4,10206 <kernel+0x156>
   10188:	0791                	c.addi	a5,4
   1018a:	07d7fe63          	bgeu	a5,t4,10206 <kernel+0x156>
   1018e:	0406                	c.slli	s0,0x1
   10190:	942a                	c.add	s0,a0
   10192:	00445983          	lhu	s3,4(s0)
   10196:	0486                	c.slli	s1,0x1
   10198:	94aa                	c.add	s1,a0
   1019a:	0044da03          	lhu	s4,4(s1)
   1019e:	0686                	c.slli	a3,0x1
   101a0:	96aa                	c.add	a3,a0
   101a2:	0046d403          	lhu	s0,4(a3)
   101a6:	40b984b3          	sub	s1,s3,a1
   101aa:	40ca0a33          	sub	s4,s4,a2
   101ae:	408f09b3          	sub	s3,t5,s0
   101b2:	03048433          	mul	s0,s1,a6
   101b6:	031a06b3          	mul	a3,s4,a7
   101ba:	96a2                	c.add	a3,s0
   101bc:	00599413          	slli	s0,s3,0x5
   101c0:	9436                	c.add	s0,a3
   101c2:	f48052e3          	bge	zero,s0,10106 <kernel+0x56>
   101c6:	0786                	c.slli	a5,0x1
   101c8:	97aa                	c.add	a5,a0
   101ca:	0047d683          	lhu	a3,4(a5)
   101ce:	029487b3          	mul	a5,s1,s1
   101d2:	034a04b3          	mul	s1,s4,s4
   101d6:	97a6                	c.add	a5,s1
   101d8:	033984b3          	mul	s1,s3,s3
   101dc:	02d686b3          	mul	a3,a3,a3
   101e0:	8c95                	c.sub	s1,a3
   101e2:	97a6                	c.add	a5,s1
   101e4:	025786b3          	mul	a3,a5,t0
   101e8:	028407b3          	mul	a5,s0,s0
   101ec:	f0d7cde3          	blt	a5,a3,10106 <kernel+0x56>
   101f0:	001ff513          	andi	a0,t6,1
   101f4:	a011                	c.j	101f8 <kernel+0x148>
   101f6:	4501                	c.li	a0,0
   101f8:	4472                	c.lwsp	s0,28(sp)
   101fa:	44e2                	c.lwsp	s1,24(sp)
   101fc:	4952                	c.lwsp	s2,20(sp)
   101fe:	49c2                	c.lwsp	s3,16(sp)
   10200:	4a32                	c.lwsp	s4,12(sp)
   10202:	6105                	c.addi16sp	sp,32
   10204:	8082                	c.jr	ra
   10206:	0000                	c.unimp
