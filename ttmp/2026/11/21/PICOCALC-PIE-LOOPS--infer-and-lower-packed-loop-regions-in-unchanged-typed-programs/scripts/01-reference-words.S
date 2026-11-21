.text
.option norvc
esp.vldbc.16.ip q0,t5,0
esp.vld.128.ip q1,a5,16
esp.vsub.s16 q2,q0,q1
esp.vst.128.ip q2,t5,16
