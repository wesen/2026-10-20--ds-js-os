/* The three Candela fragments of PICOCALC-CANDELA-P4 scripts/09-numeric-bench.c, arm F32, unchanged except that
 * each is an external function (05-fragments.mjs counts one call at a time) and norm3 and lambda keep their bodies. */
typedef float f;
#define SQ(x) __builtin_sqrtf(x)
#define C(x) x##f
/* NAME(x) names the functions (the board app compiles this file twice, with and without contraction). */
#ifndef NAME
#define NAME(x) x
#endif
f NAME(sphere)(const f *o, const f *d, f r) {
	f a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
	f disc = b * b - a * c; if (disc < 0) return C(1e30);
	f s = SQ(disc), t = (-b - s) / a; if (t < C(0.0002)) t = (-b + s) / a; if (t < C(0.0002)) return C(1e30); return t;
}
static f NAME(lambda)(const f *w, f al) { f t = al * al * (w[0] * w[0] + w[1] * w[1]) / (w[2] * w[2]); return (C(-1.0) + SQ(C(1.0) + t)) * C(0.5); }
f NAME(ggx)(const f *wo, const f *wi, f al) {
	f h[3] = {wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]}; f l = SQ(h[0] * h[0] + h[1] * h[1] + h[2] * h[2]);
	h[0] /= l; h[1] /= l; h[2] /= l;
	f x = h[0] / al, y = h[1] / al, k = x * x + y * y + h[2] * h[2];
	f D = C(1.0) / (C(3.14159265) * al * al * k * k);
	f G = C(1.0) / (C(1.0) + NAME(lambda)(wo, al) + NAME(lambda)(wi, al));
	return D * G / (C(4.0) * wo[2]);
}
f NAME(norm3)(const f *v) { f l = SQ(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); f k = l > C(1e-20) ? C(1.0) / l : C(0.0); return v[0] * k + C(2.0) * v[1] * k + C(4.0) * v[2] * k; }
