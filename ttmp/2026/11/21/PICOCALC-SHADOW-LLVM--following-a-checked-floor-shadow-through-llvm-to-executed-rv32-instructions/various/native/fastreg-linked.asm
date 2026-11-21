
test:     file format elf32-littleriscv


Disassembly of section .text:

000100b0 <kernel>:
   100b0:	7119                	c.addi16sp	sp,-128
   100b2:	d8b2                	c.swsp	a2,112(sp)
   100b4:	daae                	c.swsp	a1,116(sp)
   100b6:	dcaa                	c.swsp	a0,120(sp)
   100b8:	410c                	c.lw	a1,0(a0)
   100ba:	deae                	c.swsp	a1,124(sp)
   100bc:	4545                	c.li	a0,17
   100be:	1ab57d63          	bgeu	a0,a1,10278 <kernel+0x1c8>
   100c2:	5576                	c.lwsp	a0,124(sp)
   100c4:	45c9                	c.li	a1,18
   100c6:	1ab50963          	beq	a0,a1,10278 <kernel+0x1c8>
   100ca:	55f6                	c.lwsp	a1,124(sp)
   100cc:	454d                	c.li	a0,19
   100ce:	1ab57563          	bgeu	a0,a1,10278 <kernel+0x1c8>
   100d2:	5566                	c.lwsp	a0,120(sp)
   100d4:	02455503          	lhu	a0,36(a0)
   100d8:	d6aa                	c.swsp	a0,108(sp)
   100da:	18050b63          	beq	a0,zero,10270 <kernel+0x1c0>
   100de:	5566                	c.lwsp	a0,120(sp)
   100e0:	5636                	c.lwsp	a2,108(sp)
   100e2:	55c6                	c.lwsp	a1,112(sp)
   100e4:	56d6                	c.lwsp	a3,116(sp)
   100e6:	02655703          	lhu	a4,38(a0)
   100ea:	1701                	c.addi	a4,-32
   100ec:	da3a                	c.swsp	a4,52(sp)
   100ee:	02855703          	lhu	a4,40(a0)
   100f2:	1701                	c.addi	a4,-32
   100f4:	dc3a                	c.swsp	a4,56(sp)
   100f6:	02a55703          	lhu	a4,42(a0)
   100fa:	de3a                	c.swsp	a4,60(sp)
   100fc:	00569713          	slli	a4,a3,0x5
   10100:	6685                	c.lui	a3,0x1
   10102:	9736                	c.add	a4,a3
   10104:	c0ba                	c.swsp	a4,64(sp)
   10106:	0596                	c.slli	a1,0x5
   10108:	95b6                	c.add	a1,a3
   1010a:	c2ae                	c.swsp	a1,68(sp)
   1010c:	00261593          	slli	a1,a2,0x2
   10110:	95b2                	c.add	a1,a2
   10112:	c4ae                	c.swsp	a1,72(sp)
   10114:	00c50713          	addi	a4,a0,12
   10118:	03450793          	addi	a5,a0,52
   1011c:	4605                	c.li	a2,1
   1011e:	8532                	c.mv	a0,a2
   10120:	4581                	c.li	a1,0
   10122:	46d5                	c.li	a3,21
   10124:	09c00813          	addi	a6,zero,156
   10128:	c6c2                	c.swsp	a6,76(sp)
   1012a:	c8be                	c.swsp	a5,80(sp)
   1012c:	caba                	c.swsp	a4,84(sp)
   1012e:	ccb6                	c.swsp	a3,88(sp)
   10130:	ceb2                	c.swsp	a2,92(sp)
   10132:	d0ae                	c.swsp	a1,96(sp)
   10134:	d2aa                	c.swsp	a0,100(sp)
   10136:	a815                	c.j	1016a <kernel+0xba>
   10138:	4526                	c.lwsp	a0,72(sp)
   1013a:	5842                	c.lwsp	a6,48(sp)
   1013c:	57b2                	c.lwsp	a5,44(sp)
   1013e:	5722                	c.lwsp	a4,40(sp)
   10140:	5692                	c.lwsp	a3,36(sp)
   10142:	5582                	c.lwsp	a1,32(sp)
   10144:	5636                	c.lwsp	a2,108(sp)
   10146:	00c6b633          	sltu	a2,a3,a2
   1014a:	0595                	c.addi	a1,5
   1014c:	0685                	c.addi	a3,1 # 1001 <_start-0xf09f>
   1014e:	0711                	c.addi	a4,4
   10150:	07a9                	c.addi	a5,10
   10152:	0821                	c.addi	a6,8
   10154:	c8c2                	c.swsp	a6,80(sp)
   10156:	cabe                	c.swsp	a5,84(sp)
   10158:	ccba                	c.swsp	a4,88(sp)
   1015a:	ceb6                	c.swsp	a3,92(sp)
   1015c:	86ae                	c.mv	a3,a1
   1015e:	d0b6                	c.swsp	a3,96(sp)
   10160:	86b2                	c.mv	a3,a2
   10162:	d2b6                	c.swsp	a3,100(sp)
   10164:	c432                	c.swsp	a2,8(sp)
   10166:	10b50363          	beq	a0,a1,1026c <kernel+0x1bc>
   1016a:	55f6                	c.lwsp	a1,124(sp)
   1016c:	4646                	c.lwsp	a2,80(sp)
   1016e:	46d6                	c.lwsp	a3,84(sp)
   10170:	4566                	c.lwsp	a0,88(sp)
   10172:	4776                	c.lwsp	a4,92(sp)
   10174:	5786                	c.lwsp	a5,96(sp)
   10176:	5816                	c.lwsp	a6,100(sp)
   10178:	ce42                	c.swsp	a6,28(sp)
   1017a:	d03e                	c.swsp	a5,32(sp)
   1017c:	d23a                	c.swsp	a4,36(sp)
   1017e:	d42a                	c.swsp	a0,40(sp)
   10180:	d636                	c.swsp	a3,44(sp)
   10182:	d832                	c.swsp	a2,48(sp)
   10184:	0eb57a63          	bgeu	a0,a1,10278 <kernel+0x1c8>
   10188:	55f6                	c.lwsp	a1,124(sp)
   1018a:	5522                	c.lwsp	a0,40(sp)
   1018c:	0509                	c.addi	a0,2
   1018e:	0eb57563          	bgeu	a0,a1,10278 <kernel+0x1c8>
   10192:	5542                	c.lwsp	a0,48(sp)
   10194:	4586                	c.lwsp	a1,64(sp)
   10196:	ffa55603          	lhu	a2,-6(a0)
   1019a:	8d91                	c.sub	a1,a2
   1019c:	41f5d613          	srai	a2,a1,0x1f
   101a0:	8db1                	c.xor	a1,a2
   101a2:	8d91                	c.sub	a1,a2
   101a4:	ffe55503          	lhu	a0,-2(a0)
   101a8:	f8b568e3          	bltu	a0,a1,10138 <kernel+0x88>
   101ac:	55f6                	c.lwsp	a1,124(sp)
   101ae:	5522                	c.lwsp	a0,40(sp)
   101b0:	050d                	c.addi	a0,3
   101b2:	0cb57363          	bgeu	a0,a1,10278 <kernel+0x1c8>
   101b6:	5542                	c.lwsp	a0,48(sp)
   101b8:	4596                	c.lwsp	a1,68(sp)
   101ba:	ffc55603          	lhu	a2,-4(a0)
   101be:	8d91                	c.sub	a1,a2
   101c0:	41f5d613          	srai	a2,a1,0x1f
   101c4:	8db1                	c.xor	a1,a2
   101c6:	8d91                	c.sub	a1,a2
   101c8:	00055503          	lhu	a0,0(a0)
   101cc:	f6b566e3          	bltu	a0,a1,10138 <kernel+0x88>
   101d0:	55f6                	c.lwsp	a1,124(sp)
   101d2:	5502                	c.lwsp	a0,32(sp)
   101d4:	0505                	c.addi	a0,1
   101d6:	0ab57163          	bgeu	a0,a1,10278 <kernel+0x1c8>
   101da:	55f6                	c.lwsp	a1,124(sp)
   101dc:	5502                	c.lwsp	a0,32(sp)
   101de:	0509                	c.addi	a0,2
   101e0:	08b57c63          	bgeu	a0,a1,10278 <kernel+0x1c8>
   101e4:	55f6                	c.lwsp	a1,124(sp)
   101e6:	5502                	c.lwsp	a0,32(sp)
   101e8:	050d                	c.addi	a0,3
   101ea:	08b57763          	bgeu	a0,a1,10278 <kernel+0x1c8>
   101ee:	55f6                	c.lwsp	a1,124(sp)
   101f0:	5502                	c.lwsp	a0,32(sp)
   101f2:	0511                	c.addi	a0,4
   101f4:	08b57263          	bgeu	a0,a1,10278 <kernel+0x1c8>
   101f8:	56e2                	c.lwsp	a3,56(sp)
   101fa:	5752                	c.lwsp	a4,52(sp)
   101fc:	45b6                	c.lwsp	a1,76(sp)
   101fe:	57b2                	c.lwsp	a5,44(sp)
   10200:	5846                	c.lwsp	a6,112(sp)
   10202:	5656                	c.lwsp	a2,116(sp)
   10204:	ffa7d503          	lhu	a0,-6(a5)
   10208:	40c50633          	sub	a2,a0,a2
   1020c:	c632                	c.swsp	a2,12(sp)
   1020e:	ffc7d503          	lhu	a0,-4(a5)
   10212:	41050533          	sub	a0,a0,a6
   10216:	c82a                	c.swsp	a0,16(sp)
   10218:	ffe7d783          	lhu	a5,-2(a5)
   1021c:	8d9d                	c.sub	a1,a5
   1021e:	ca2e                	c.swsp	a1,20(sp)
   10220:	02e60633          	mul	a2,a2,a4
   10224:	02d50533          	mul	a0,a0,a3
   10228:	9532                	c.add	a0,a2
   1022a:	0596                	c.slli	a1,0x5
   1022c:	95aa                	c.add	a1,a0
   1022e:	cc2e                	c.swsp	a1,24(sp)
   10230:	4501                	c.li	a0,0
   10232:	f0b053e3          	bge	zero,a1,10138 <kernel+0x88>
   10236:	4672                	c.lwsp	a2,28(sp)
   10238:	4562                	c.lwsp	a0,24(sp)
   1023a:	56f2                	c.lwsp	a3,60(sp)
   1023c:	4752                	c.lwsp	a4,20(sp)
   1023e:	45c2                	c.lwsp	a1,16(sp)
   10240:	4832                	c.lwsp	a6,12(sp)
   10242:	57b2                	c.lwsp	a5,44(sp)
   10244:	0007d783          	lhu	a5,0(a5)
   10248:	03080833          	mul	a6,a6,a6
   1024c:	02b585b3          	mul	a1,a1,a1
   10250:	95c2                	c.add	a1,a6
   10252:	02e70733          	mul	a4,a4,a4
   10256:	02f787b3          	mul	a5,a5,a5
   1025a:	8f1d                	c.sub	a4,a5
   1025c:	95ba                	c.add	a1,a4
   1025e:	02d585b3          	mul	a1,a1,a3
   10262:	02a50533          	mul	a0,a0,a0
   10266:	c432                	c.swsp	a2,8(sp)
   10268:	ecb548e3          	blt	a0,a1,10138 <kernel+0x88>
   1026c:	4522                	c.lwsp	a0,8(sp)
   1026e:	8905                	c.andi	a0,1
   10270:	d4aa                	c.swsp	a0,104(sp)
   10272:	5526                	c.lwsp	a0,104(sp)
   10274:	6109                	c.addi16sp	sp,128
   10276:	8082                	c.jr	ra
   10278:	0000                	c.unimp
