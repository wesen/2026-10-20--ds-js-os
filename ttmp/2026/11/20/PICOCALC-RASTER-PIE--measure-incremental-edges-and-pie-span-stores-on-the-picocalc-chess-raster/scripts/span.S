/* void raster_pie_groups(pixel_t *dst, unsigned groups, const pixel_t *color).
 * The caller supplies an aligned dst and a nonzero group count. */
.section .text.raster_pie_groups,"ax",@progbits
.balign 4
.global raster_pie_groups
.type raster_pie_groups,@function
raster_pie_groups:
    esp.vldbc.16.ip q0,a2,0
1:
    esp.vst.128.ip q0,a0,16
    addi a1,a1,-1
    bnez a1,1b
    ret
.size raster_pie_groups,.-raster_pie_groups
