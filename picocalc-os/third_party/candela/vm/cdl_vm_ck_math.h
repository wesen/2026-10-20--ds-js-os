/* cdl_vm_ck_math.h: compile cdl_vm.c with -include cdl_vm_ck_math.h to evaluate the sections' floor (and so fract,
 * fmodp, the checker and stripes super-instructions), sin, cos and exp with a PICOCALC-CANDELA-CPU-KERNEL kernel
 * instance's own definitions (cpu/cdl_math.h under its CDL_FAST_FLOOR, CDL_FAST_TRIG and CDL_FAST_EXP switches).
 * cdl_vm_sections.cpp defines the four functions. The other built-ins are libm or single instructions in both. */
#ifndef CDL_VM_CK_MATH_H
#define CDL_VM_CK_MATH_H
#ifdef __cplusplus
extern "C" {
#endif
float cdl_vm_k_floorf(float x);
float cdl_vm_k_sinf(float x);
float cdl_vm_k_cosf(float x);
float cdl_vm_k_expf(float x);
#ifdef __cplusplus
}
#endif
#define CDL_VM_FLOORF cdl_vm_k_floorf
#define CDL_VM_SINF cdl_vm_k_sinf
#define CDL_VM_COSF cdl_vm_k_cosf
#define CDL_VM_EXPF cdl_vm_k_expf
#endif
