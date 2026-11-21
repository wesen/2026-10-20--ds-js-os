
test:     file format elf32-littleriscv


Disassembly of section .text:

000100b0 <kernel>:
   100b0:	f8010113          	addi	sp,sp,-128
   100b4:	06112e23          	sw	ra,124(sp)
   100b8:	00a12023          	sw	a0,0(sp)
   100bc:	00b12223          	sw	a1,4(sp)
   100c0:	00c12423          	sw	a2,8(sp)
   100c4:	01100293          	addi	t0,zero,17
   100c8:	00512623          	sw	t0,12(sp)
   100cc:	00c12f03          	lw	t5,12(sp)
   100d0:	00012f83          	lw	t6,0(sp)
   100d4:	000fa503          	lw	a0,0(t6)
   100d8:	00af6463          	bltu	t5,a0,100e0 <kernel+0x30>
   100dc:	00100073          	ebreak
   100e0:	001f1293          	slli	t0,t5,0x1
   100e4:	005f82b3          	add	t0,t6,t0
   100e8:	0042d283          	lhu	t0,4(t0)
   100ec:	02000313          	addi	t1,zero,32
   100f0:	406282b3          	sub	t0,t0,t1
   100f4:	00512823          	sw	t0,16(sp)
   100f8:	01200293          	addi	t0,zero,18
   100fc:	00512a23          	sw	t0,20(sp)
   10100:	01412f03          	lw	t5,20(sp)
   10104:	00012f83          	lw	t6,0(sp)
   10108:	000fa503          	lw	a0,0(t6)
   1010c:	00af6463          	bltu	t5,a0,10114 <kernel+0x64>
   10110:	00100073          	ebreak
   10114:	001f1293          	slli	t0,t5,0x1
   10118:	005f82b3          	add	t0,t6,t0
   1011c:	0042d283          	lhu	t0,4(t0)
   10120:	02000313          	addi	t1,zero,32
   10124:	406282b3          	sub	t0,t0,t1
   10128:	00512c23          	sw	t0,24(sp)
   1012c:	01300293          	addi	t0,zero,19
   10130:	00512e23          	sw	t0,28(sp)
   10134:	01c12f03          	lw	t5,28(sp)
   10138:	00012f83          	lw	t6,0(sp)
   1013c:	000fa503          	lw	a0,0(t6)
   10140:	00af6463          	bltu	t5,a0,10148 <kernel+0x98>
   10144:	00100073          	ebreak
   10148:	001f1293          	slli	t0,t5,0x1
   1014c:	005f82b3          	add	t0,t6,t0
   10150:	0042d283          	lhu	t0,4(t0)
   10154:	02512023          	sw	t0,32(sp)
   10158:	01000293          	addi	t0,zero,16
   1015c:	02512223          	sw	t0,36(sp)
   10160:	02412f03          	lw	t5,36(sp)
   10164:	00012f83          	lw	t6,0(sp)
   10168:	000fa503          	lw	a0,0(t6)
   1016c:	00af6463          	bltu	t5,a0,10174 <kernel+0xc4>
   10170:	00100073          	ebreak
   10174:	001f1293          	slli	t0,t5,0x1
   10178:	005f82b3          	add	t0,t6,t0
   1017c:	0042d283          	lhu	t0,4(t0)
   10180:	02512423          	sw	t0,40(sp)
   10184:	000012b7          	lui	t0,0x1
   10188:	00028293          	addi	t0,t0,0 # 1000 <_start-0xf0a0>
   1018c:	02000313          	addi	t1,zero,32
   10190:	00412383          	lw	t2,4(sp)
   10194:	02730333          	mul	t1,t1,t2
   10198:	006282b3          	add	t0,t0,t1
   1019c:	02512623          	sw	t0,44(sp)
   101a0:	000012b7          	lui	t0,0x1
   101a4:	00028293          	addi	t0,t0,0 # 1000 <_start-0xf0a0>
   101a8:	02000313          	addi	t1,zero,32
   101ac:	00812383          	lw	t2,8(sp)
   101b0:	02730333          	mul	t1,t1,t2
   101b4:	006282b3          	add	t0,t0,t1
   101b8:	02512823          	sw	t0,48(sp)
   101bc:	00000293          	addi	t0,zero,0
   101c0:	02512a23          	sw	t0,52(sp)
   101c4:	03412283          	lw	t0,52(sp)
   101c8:	02812303          	lw	t1,40(sp)
   101cc:	0062a2b3          	slt	t0,t0,t1
   101d0:	0012b293          	sltiu	t0,t0,1
   101d4:	00028463          	beq	t0,zero,101dc <kernel+0x12c>
   101d8:	2e80006f          	jal	zero,104c0 <kernel+0x410>
   101dc:	01500293          	addi	t0,zero,21
   101e0:	00400313          	addi	t1,zero,4
   101e4:	03412383          	lw	t2,52(sp)
   101e8:	02730333          	mul	t1,t1,t2
   101ec:	006282b3          	add	t0,t0,t1
   101f0:	02512c23          	sw	t0,56(sp)
   101f4:	02c12283          	lw	t0,44(sp)
   101f8:	03812303          	lw	t1,56(sp)
   101fc:	02612e23          	sw	t1,60(sp)
   10200:	03c12f03          	lw	t5,60(sp)
   10204:	00012f83          	lw	t6,0(sp)
   10208:	000fa503          	lw	a0,0(t6)
   1020c:	00af6463          	bltu	t5,a0,10214 <kernel+0x164>
   10210:	00100073          	ebreak
   10214:	001f1313          	slli	t1,t5,0x1
   10218:	006f8333          	add	t1,t6,t1
   1021c:	00435303          	lhu	t1,4(t1)
   10220:	406282b3          	sub	t0,t0,t1
   10224:	0002d463          	bge	t0,zero,1022c <kernel+0x17c>
   10228:	405002b3          	sub	t0,zero,t0
   1022c:	03812303          	lw	t1,56(sp)
   10230:	00200393          	addi	t2,zero,2
   10234:	00730333          	add	t1,t1,t2
   10238:	04612023          	sw	t1,64(sp)
   1023c:	04012f03          	lw	t5,64(sp)
   10240:	00012f83          	lw	t6,0(sp)
   10244:	000fa503          	lw	a0,0(t6)
   10248:	00af6463          	bltu	t5,a0,10250 <kernel+0x1a0>
   1024c:	00100073          	ebreak
   10250:	001f1313          	slli	t1,t5,0x1
   10254:	006f8333          	add	t1,t6,t1
   10258:	00435303          	lhu	t1,4(t1)
   1025c:	005322b3          	slt	t0,t1,t0
   10260:	0012c293          	xori	t0,t0,1
   10264:	00029463          	bne	t0,zero,1026c <kernel+0x1bc>
   10268:	0800006f          	jal	zero,102e8 <kernel+0x238>
   1026c:	03012283          	lw	t0,48(sp)
   10270:	03812303          	lw	t1,56(sp)
   10274:	00100393          	addi	t2,zero,1
   10278:	00730333          	add	t1,t1,t2
   1027c:	04612223          	sw	t1,68(sp)
   10280:	04412f03          	lw	t5,68(sp)
   10284:	00012f83          	lw	t6,0(sp)
   10288:	000fa503          	lw	a0,0(t6)
   1028c:	00af6463          	bltu	t5,a0,10294 <kernel+0x1e4>
   10290:	00100073          	ebreak
   10294:	001f1313          	slli	t1,t5,0x1
   10298:	006f8333          	add	t1,t6,t1
   1029c:	00435303          	lhu	t1,4(t1)
   102a0:	406282b3          	sub	t0,t0,t1
   102a4:	0002d463          	bge	t0,zero,102ac <kernel+0x1fc>
   102a8:	405002b3          	sub	t0,zero,t0
   102ac:	03812303          	lw	t1,56(sp)
   102b0:	00300393          	addi	t2,zero,3
   102b4:	00730333          	add	t1,t1,t2
   102b8:	04612423          	sw	t1,72(sp)
   102bc:	04812f03          	lw	t5,72(sp)
   102c0:	00012f83          	lw	t6,0(sp)
   102c4:	000fa503          	lw	a0,0(t6)
   102c8:	00af6463          	bltu	t5,a0,102d0 <kernel+0x220>
   102cc:	00100073          	ebreak
   102d0:	001f1313          	slli	t1,t5,0x1
   102d4:	006f8333          	add	t1,t6,t1
   102d8:	00435303          	lhu	t1,4(t1)
   102dc:	005322b3          	slt	t0,t1,t0
   102e0:	0012c293          	xori	t0,t0,1
   102e4:	0080006f          	jal	zero,102ec <kernel+0x23c>
   102e8:	00000293          	addi	t0,zero,0
   102ec:	00029463          	bne	t0,zero,102f4 <kernel+0x244>
   102f0:	1bc0006f          	jal	zero,104ac <kernel+0x3fc>
   102f4:	00100293          	addi	t0,zero,1
   102f8:	00500313          	addi	t1,zero,5
   102fc:	03412383          	lw	t2,52(sp)
   10300:	02730333          	mul	t1,t1,t2
   10304:	006282b3          	add	t0,t0,t1
   10308:	04512623          	sw	t0,76(sp)
   1030c:	04c12283          	lw	t0,76(sp)
   10310:	04512823          	sw	t0,80(sp)
   10314:	05012f03          	lw	t5,80(sp)
   10318:	00012f83          	lw	t6,0(sp)
   1031c:	000fa503          	lw	a0,0(t6)
   10320:	00af6463          	bltu	t5,a0,10328 <kernel+0x278>
   10324:	00100073          	ebreak
   10328:	001f1293          	slli	t0,t5,0x1
   1032c:	005f82b3          	add	t0,t6,t0
   10330:	0042d283          	lhu	t0,4(t0)
   10334:	00412303          	lw	t1,4(sp)
   10338:	406282b3          	sub	t0,t0,t1
   1033c:	04512a23          	sw	t0,84(sp)
   10340:	04c12283          	lw	t0,76(sp)
   10344:	00100313          	addi	t1,zero,1
   10348:	006282b3          	add	t0,t0,t1
   1034c:	04512c23          	sw	t0,88(sp)
   10350:	05812f03          	lw	t5,88(sp)
   10354:	00012f83          	lw	t6,0(sp)
   10358:	000fa503          	lw	a0,0(t6)
   1035c:	00af6463          	bltu	t5,a0,10364 <kernel+0x2b4>
   10360:	00100073          	ebreak
   10364:	001f1293          	slli	t0,t5,0x1
   10368:	005f82b3          	add	t0,t6,t0
   1036c:	0042d283          	lhu	t0,4(t0)
   10370:	00812303          	lw	t1,8(sp)
   10374:	406282b3          	sub	t0,t0,t1
   10378:	04512e23          	sw	t0,92(sp)
   1037c:	09c00293          	addi	t0,zero,156
   10380:	04c12303          	lw	t1,76(sp)
   10384:	00200393          	addi	t2,zero,2
   10388:	00730333          	add	t1,t1,t2
   1038c:	06612023          	sw	t1,96(sp)
   10390:	06012f03          	lw	t5,96(sp)
   10394:	00012f83          	lw	t6,0(sp)
   10398:	000fa503          	lw	a0,0(t6)
   1039c:	00af6463          	bltu	t5,a0,103a4 <kernel+0x2f4>
   103a0:	00100073          	ebreak
   103a4:	001f1313          	slli	t1,t5,0x1
   103a8:	006f8333          	add	t1,t6,t1
   103ac:	00435303          	lhu	t1,4(t1)
   103b0:	406282b3          	sub	t0,t0,t1
   103b4:	06512223          	sw	t0,100(sp)
   103b8:	04c12283          	lw	t0,76(sp)
   103bc:	00300313          	addi	t1,zero,3
   103c0:	006282b3          	add	t0,t0,t1
   103c4:	06512423          	sw	t0,104(sp)
   103c8:	06812f03          	lw	t5,104(sp)
   103cc:	00012f83          	lw	t6,0(sp)
   103d0:	000fa503          	lw	a0,0(t6)
   103d4:	00af6463          	bltu	t5,a0,103dc <kernel+0x32c>
   103d8:	00100073          	ebreak
   103dc:	001f1293          	slli	t0,t5,0x1
   103e0:	005f82b3          	add	t0,t6,t0
   103e4:	0042d283          	lhu	t0,4(t0)
   103e8:	06512623          	sw	t0,108(sp)
   103ec:	05412283          	lw	t0,84(sp)
   103f0:	01012303          	lw	t1,16(sp)
   103f4:	026282b3          	mul	t0,t0,t1
   103f8:	05c12303          	lw	t1,92(sp)
   103fc:	01812383          	lw	t2,24(sp)
   10400:	02730333          	mul	t1,t1,t2
   10404:	006282b3          	add	t0,t0,t1
   10408:	02000313          	addi	t1,zero,32
   1040c:	06412383          	lw	t2,100(sp)
   10410:	02730333          	mul	t1,t1,t2
   10414:	006282b3          	add	t0,t0,t1
   10418:	06512823          	sw	t0,112(sp)
   1041c:	05412283          	lw	t0,84(sp)
   10420:	05412303          	lw	t1,84(sp)
   10424:	026282b3          	mul	t0,t0,t1
   10428:	05c12303          	lw	t1,92(sp)
   1042c:	05c12383          	lw	t2,92(sp)
   10430:	02730333          	mul	t1,t1,t2
   10434:	006282b3          	add	t0,t0,t1
   10438:	06412303          	lw	t1,100(sp)
   1043c:	06412383          	lw	t2,100(sp)
   10440:	02730333          	mul	t1,t1,t2
   10444:	006282b3          	add	t0,t0,t1
   10448:	06c12303          	lw	t1,108(sp)
   1044c:	06c12383          	lw	t2,108(sp)
   10450:	02730333          	mul	t1,t1,t2
   10454:	406282b3          	sub	t0,t0,t1
   10458:	06512a23          	sw	t0,116(sp)
   1045c:	07012283          	lw	t0,112(sp)
   10460:	00000313          	addi	t1,zero,0
   10464:	005322b3          	slt	t0,t1,t0
   10468:	00029463          	bne	t0,zero,10470 <kernel+0x3c0>
   1046c:	0280006f          	jal	zero,10494 <kernel+0x3e4>
   10470:	07412283          	lw	t0,116(sp)
   10474:	02012303          	lw	t1,32(sp)
   10478:	026282b3          	mul	t0,t0,t1
   1047c:	07012303          	lw	t1,112(sp)
   10480:	07012383          	lw	t2,112(sp)
   10484:	02730333          	mul	t1,t1,t2
   10488:	005322b3          	slt	t0,t1,t0
   1048c:	0012c293          	xori	t0,t0,1
   10490:	0080006f          	jal	zero,10498 <kernel+0x3e8>
   10494:	00000293          	addi	t0,zero,0
   10498:	00029463          	bne	t0,zero,104a0 <kernel+0x3f0>
   1049c:	0100006f          	jal	zero,104ac <kernel+0x3fc>
   104a0:	00100293          	addi	t0,zero,1
   104a4:	00028513          	addi	a0,t0,0
   104a8:	0200006f          	jal	zero,104c8 <kernel+0x418>
   104ac:	03412283          	lw	t0,52(sp)
   104b0:	00100313          	addi	t1,zero,1
   104b4:	006282b3          	add	t0,t0,t1
   104b8:	02512a23          	sw	t0,52(sp)
   104bc:	d09ff06f          	jal	zero,101c4 <kernel+0x114>
   104c0:	00000293          	addi	t0,zero,0
   104c4:	00028513          	addi	a0,t0,0
   104c8:	07c12083          	lw	ra,124(sp)
   104cc:	08010113          	addi	sp,sp,128
   104d0:	00008067          	jalr	zero,0(ra)
