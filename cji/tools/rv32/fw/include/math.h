#pragma once
#define NAN (__builtin_nan(""))
#define INFINITY (__builtin_inf())
#define HUGE_VAL (__builtin_huge_val())
#define isnan(x) __builtin_isnan(x)
#define isinf(x) __builtin_isinf(x)
#define isfinite(x) __builtin_isfinite(x)
#define signbit(x) __builtin_signbit(x)
double sin(double), cos(double), tan(double), asin(double), acos(double), atan(double);
double sinh(double), cosh(double), tanh(double), asinh(double), acosh(double), atanh(double);
double exp(double), log(double), log10(double), log2(double), floor(double), ceil(double), sqrt(double);
double trunc(double), round(double), cbrt(double), fabs(double);
double atan2(double, double), fmod(double, double), pow(double, double), hypot(double, double), nextafter(double, double);
