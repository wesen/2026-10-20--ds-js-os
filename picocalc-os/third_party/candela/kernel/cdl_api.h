/* cdl_api.h: the C interface of a generated Candela kernel instance (PICOCALC-CANDELA-CPU-KERNEL).
 *
 * A kernel instance lives in its own C++ namespace NS (one per measurement arm, or an RGB and a spectral
 * instance in firmware) and exports these functions with C linkage, named NS_<function>:
 *
 *   int      NS_bind(const cdl_buffers *b, const void *sections, void *sky);
 *              Bind the packed buffers and the scene's section table (NS_sections_<ID>, or NULL for a
 *              single-translation-unit instance). sky: NS_sky_bytes() bytes of workspace for the sky
 *              table (any alignment of 4), or NULL when the instance has no table. Returns 1, or 2 when the
 *              sky table was rebuilt (uniform rows 6 and 11-16 changed since the workspace was last built).
 *   unsigned NS_sky_bytes(void);
 *   void     NS_render_pixel(int x, int y, unsigned frame, cdl_pixout *out);   one camera sample
 *   void     NS_render_span(int y, int x0, int x1, unsigned frame, cdl_pixout *out);   pixels x0..x1-1 of row y
 *   void     NS_post_bind(const float *src, const float *alb, const float *nrm, const float *D);
 *   void     NS_display_px(int x, int y, float out[4]);   display pass: exposure, tone map, sRGB
 *   void     NS_denoise_px(int x, int y, float out[3]);   one a-trous iteration (step and sigma in D row 4)
 *
 * Buffers are rows of four floats, as Candela's pack() writes them (U, O, LI, BV, SD). The kernel keeps
 * per-core state (the random generator and the sample's time and wavelength) in globals: one core at a
 * time renders with one instance. */
#ifndef CDL_API_H
#define CDL_API_H
#ifdef __cplusplus
extern "C" {
#endif
typedef struct { const float *U, *O, *LI, *BV, *SD; unsigned nU, nO, nLI, nBV, nSD; } cdl_buffers;
typedef struct { float c[4], alb[4], nrm[4]; } cdl_pixout;
#define CDL_DECLARE_INSTANCE(ns) CDL_DECLARE_INSTANCE_(ns)   /* expands ns first (it may be the macro CDL_NS) */
#define CDL_DECLARE_INSTANCE_(ns) \
  int ns##_bind(const cdl_buffers *b, const void *sections, void *sky); \
  unsigned ns##_sky_bytes(void); \
  void ns##_render_pixel(int x, int y, unsigned frame, cdl_pixout *out); \
  void ns##_render_span(int y, int x0, int x1, unsigned frame, cdl_pixout *out); \
  void ns##_post_bind(const float *src, const float *alb, const float *nrm, const float *D); \
  void ns##_display_px(int x, int y, float *out4); \
  void ns##_denoise_px(int x, int y, float *out3);
#ifdef __cplusplus
}
#endif
#endif
