.section .text.ceiling_reduce,"ax",@progbits
.option push
.option norvc
.balign 4
.global ceiling_min
.type ceiling_min,@function
ceiling_min:
  esp.vld.128.ip q1,a0,16
  esp.min.u16.a q1,a0
  ret
.global ceiling_minmax
.type ceiling_minmax,@function
ceiling_minmax:
  esp.vld.128.ip q1,a0,16
  esp.min.u16.a q1,a0
  esp.max.u16.a q1,a1
  ret
.option pop
