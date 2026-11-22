/* ESP32-P4 PIE packed discriminants: eight signed 16-bit rays per group.
 * a0 is aligned x squared, a1 is the row's signed term, a2 is aligned output,
 * and a3 is the positive count of full groups. Keep all scratch in q0-q2.
 */
    .section .text.raytrace_demo_pie_row,"ax",@progbits
    .option push
    .option norvc
    .balign 4
    .global raytrace_demo_pie_row
    .type raytrace_demo_pie_row, @function
raytrace_demo_pie_row:
    esp.vldbc.16.ip q0,a1,0
1:
    esp.vld.128.ip q1,a0,16
    esp.vsub.s16 q2,q0,q1
    esp.vst.128.ip q2,a2,16
    addi a3,a3,-1
    bnez a3,1b
    ret
    .size raytrace_demo_pie_row, .-raytrace_demo_pie_row
    .option pop
