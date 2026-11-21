<trace_row>:
     576:	7139                	addi	sp,sp,-64
     578:	de06                	sw	ra,60(sp)
     57a:	dc22                	sw	s0,56(sp)
     57c:	da26                	sw	s1,52(sp)
     57e:	d84a                	sw	s2,48(sp)
     580:	d64e                	sw	s3,44(sp)
     582:	d452                	sw	s4,40(sp)
     584:	d256                	sw	s5,36(sp)
     586:	d05a                	sw	s6,32(sp)
     588:	ce5e                	sw	s7,28(sp)
     58a:	cc62                	sw	s8,24(sp)
     58c:	ca66                	sw	s9,20(sp)
     58e:	c86a                	sw	s10,16(sp)
     590:	c66e                	sw	s11,12(sp)
     592:	8ab6                	mv	s5,a3
     594:	8932                	mv	s2,a2
     596:	89ae                	mv	s3,a1
     598:	8c2a                	mv	s8,a0
     59a:	7ff50513          	addi	a0,a0,2047
     59e:	16350a13          	addi	s4,a0,355
     5a2:	14000613          	li	a2,320
     5a6:	8552                	mv	a0,s4
     5a8:	4581                	li	a1,0
     5aa:	00000097          	auipc	ra,0x0
			5aa: R_RISCV_CALL_PLT	memset
			5aa: R_RISCV_RELAX	*ABS*
     5ae:	000080e7          	jalr	ra # 5aa <trace_row+0x34>
     5b2:	054c2503          	lw	a0,84(s8)
     5b6:	c101                	beqz	a0,5b6 <trace_row+0x40>
			5b6: R_RISCV_RVC_BRANCH	.LBB6_12
     5b8:	4401                	li	s0,0
     5ba:	4d01                	li	s10,0
     5bc:	420c0b13          	addi	s6,s8,1056
     5c0:	140c0c93          	addi	s9,s8,320
     5c4:	140a0493          	addi	s1,s4,320
     5c8:	06000d93          	li	s11,96
     5cc:	4871                	li	a6,28
     5ce:	4885                	li	a7,1
     5d0:	a001                	j	5d0 <trace_row+0x5a>
			5d0: R_RISCV_RVC_JUMP	.LBB6_3

000005d2 <.LBB6_2>:
     5d2:	054c2503          	lw	a0,84(s8)
     5d6:	0d05                	addi	s10,s10,1
     5d8:	140d8d93          	addi	s11,s11,320
     5dc:	00ad7063          	bgeu	s10,a0,5dc <.LBB6_2+0xa>
			5dc: R_RISCV_BRANCH	.LBB6_13

000005e0 <.LBB6_3>:
     5e0:	030d0bb3          	mul	s7,s10,a6
     5e4:	9be2                	add	s7,s7,s8
     5e6:	004ba503          	lw	a0,4(s7)
     5ea:	00cba583          	lw	a1,12(s7)
     5ee:	40a98533          	sub	a0,s3,a0
     5f2:	00a58633          	add	a2,a1,a0
     5f6:	8d89                	sub	a1,a1,a0
     5f8:	02b60533          	mul	a0,a2,a1
     5fc:	00a11523          	sh	a0,10(sp)
     600:	85e2                	mv	a1,s8
     602:	01191063          	bne	s2,a7,602 <.LBB6_3+0x22>
			602: R_RISCV_BRANCH	.LBB6_5
     606:	14000513          	li	a0,320
     60a:	02ad0533          	mul	a0,s10,a0
     60e:	9562                	add	a0,a0,s8
     610:	06050513          	addi	a0,a0,96
     614:	00a10593          	addi	a1,sp,10
     618:	46d1                	li	a3,20
     61a:	865a                	mv	a2,s6
     61c:	00000097          	auipc	ra,0x0
			61c: R_RISCV_CALL_PLT	raytrace_demo_pie_row
			61c: R_RISCV_RELAX	*ABS*
     620:	000080e7          	jalr	ra # 61c <.LBB6_3+0x3c>
     624:	4885                	li	a7,1
     626:	4871                	li	a6,28
     628:	a001                	j	628 <.LBB6_3+0x48>
			628: R_RISCV_RVC_JUMP	.LBB6_6

0000062a <.LBB6_5>:
     62a:	01b58633          	add	a2,a1,s11
     62e:	00061603          	lh	a2,0(a2)
     632:	40c50633          	sub	a2,a0,a2
     636:	42c59023          	sh	a2,1056(a1)
     63a:	0589                	addi	a1,a1,2
     63c:	01959063          	bne	a1,s9,63c <.LBB6_5+0x12>
			63c: R_RISCV_BRANCH	.LBB6_5

00000640 <.LBB6_6>:
     640:	008b8513          	addi	a0,s7,8
     644:	85a6                	mv	a1,s1
     646:	8652                	mv	a2,s4
     648:	a001                	j	648 <.LBB6_6+0x8>
			648: R_RISCV_RVC_JUMP	.LBB6_9

0000064a <.LBB6_7>:
     64a:	00d61023          	sh	a3,0(a2)
     64e:	01a58023          	sb	s10,0(a1)

00000652 <.LBB6_8>:
     652:	0609                	addi	a2,a2,2
     654:	0585                	addi	a1,a1,1
     656:	00960063          	beq	a2,s1,656 <.LBB6_8+0x4>
			656: R_RISCV_BRANCH	.LBB6_2

0000065a <.LBB6_9>:
     65a:	abe61683          	lh	a3,-1346(a2)
     65e:	0006c063          	bltz	a3,65e <.LBB6_9+0x4>
			65e: R_RISCV_BRANCH	.LBB6_8
     662:	06c2                	slli	a3,a3,0x10
     664:	82c1                	srli	a3,a3,0x10
     666:	411c                	lw	a5,0(a0)
     668:	96e2                	add	a3,a3,s8
     66a:	5606c683          	lbu	a3,1376(a3)
     66e:	00061703          	lh	a4,0(a2)
     672:	9456                	add	s0,s0,s5
     674:	40d786b3          	sub	a3,a5,a3
     678:	c301                	beqz	a4,678 <.LBB6_9+0x1e>
			678: R_RISCV_RVC_BRANCH	.LBB6_7
     67a:	01069793          	slli	a5,a3,0x10
     67e:	87c1                	srai	a5,a5,0x10
     680:	00e7c063          	blt	a5,a4,680 <.LBB6_9+0x26>
			680: R_RISCV_BRANCH	.LBB6_7
     684:	a001                	j	684 <.LBB6_9+0x2a>
			684: R_RISCV_RVC_JUMP	.LBB6_8

00000686 <.LBB6_12>:
     686:	4401                	li	s0,0

00000688 <.LBB6_13>:
     688:	8522                	mv	a0,s0
     68a:	50f2                	lw	ra,60(sp)
     68c:	5462                	lw	s0,56(sp)
     68e:	54d2                	lw	s1,52(sp)
     690:	5942                	lw	s2,48(sp)
     692:	59b2                	lw	s3,44(sp)
     694:	5a22                	lw	s4,40(sp)
     696:	5a92                	lw	s5,36(sp)
     698:	5b02                	lw	s6,32(sp)
     69a:	4bf2                	lw	s7,28(sp)
     69c:	4c62                	lw	s8,24(sp)
     69e:	4cd2                	lw	s9,20(sp)
     6a0:	4d42                	lw	s10,16(sp)
     6a2:	4db2                	lw	s11,12(sp)
     6a4:	6121                	addi	sp,sp,64
     6a6:	8082                	ret
