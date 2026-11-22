// cdl_switches.h: the CPU substitutions of the generated Candela kernel. Every switch is 0 or 1 and
// defaults to 0, which is Candela's WGSL semantics as written for a GPU. See the design doc, Section 5.
//
//   CDL_LAZY_SELECT   select(f, t, c) evaluates only the chosen argument
//   CDL_NO_ZERO_INIT  structs and arrays declared without a value are not zeroed
//   CDL_POISON_INIT   (test only) such declarations are filled with 0xA5 bytes instead
//   CDL_FAST_FLOOR    floor and fract through float-to-int conversion
//   CDL_FAST_TRIG     polynomial sin and cos
//   CDL_FAST_EXP      polynomial exp
//   CDL_INT_HASH      integer hashes (pcg3d) instead of fract(sin(x) * 43758.5453)
//   CDL_SKY_TABLE     the Preetham sky as a bilinear table lookup (CDL_SKY_N x CDL_SKY_N texels)
//   CDL_POW32         pow(x, 32) as five squarings in the denoiser
//   CDL_SPECTRAL      the kernel instance renders spectrally (SPECTRAL_ON); T0 scenes are RGB
//   CDL_MONO          the scene's sections are compiled into the kernel's translation unit
#pragma once
#define CDL_SWITCHES(X) X(CDL_LAZY_SELECT) X(CDL_NO_ZERO_INIT) X(CDL_POISON_INIT) X(CDL_FAST_FLOOR) X(CDL_FAST_TRIG) \
  X(CDL_FAST_EXP) X(CDL_INT_HASH) X(CDL_SKY_TABLE) X(CDL_POW32) X(CDL_SPECTRAL) X(CDL_MONO)
#ifndef CDL_LAZY_SELECT
#define CDL_LAZY_SELECT 0
#endif
#ifndef CDL_NO_ZERO_INIT
#define CDL_NO_ZERO_INIT 0
#endif
#ifndef CDL_POISON_INIT
#define CDL_POISON_INIT 0
#endif
#ifndef CDL_FAST_FLOOR
#define CDL_FAST_FLOOR 0
#endif
#ifndef CDL_FAST_TRIG
#define CDL_FAST_TRIG 0
#endif
#ifndef CDL_FAST_EXP
#define CDL_FAST_EXP 0
#endif
#ifndef CDL_INT_HASH
#define CDL_INT_HASH 0
#endif
#ifndef CDL_SKY_TABLE
#define CDL_SKY_TABLE 0
#endif
#ifndef CDL_SKY_N
#define CDL_SKY_N 64
#endif
#ifndef CDL_POW32
#define CDL_POW32 0
#endif
#ifndef CDL_SPECTRAL
#define CDL_SPECTRAL 0
#endif
#ifndef CDL_MONO
#define CDL_MONO 0
#endif
#ifndef CDL_NS
#error "define CDL_NS, the namespace (and C prefix) of this kernel instance"
#endif

#if CDL_LAZY_SELECT
#define CDL_SEL(f, t, c) ((c) ? (t) : (f))
#else
#define CDL_SEL(f, t, c) select((f), (t), (c))
#endif
// `T x CDL_ZI; CDL_POISON(x);`: value-initialised (zeroed) as WGSL requires, left uninitialised, or (test)
// filled with 0xA5. `T x{}` rather than memset, so GCC can drop the zeroing of fields that are written later.
#if CDL_POISON_INIT
#define CDL_ZI
#define CDL_POISON(x) memset(&(x), 0xA5, sizeof(x))
#elif CDL_NO_ZERO_INIT
#define CDL_ZI
#define CDL_POISON(x) ((void)0)
#else
#define CDL_ZI {}
#define CDL_POISON(x) ((void)0)
#endif
#define CDL_CAT2(a, b) a##_##b
#define CDL_CAT(a, b) CDL_CAT2(a, b)
#define CDL_C(name) CDL_CAT(CDL_NS, name)
