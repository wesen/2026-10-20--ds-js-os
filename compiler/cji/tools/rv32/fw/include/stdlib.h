#pragma once
#include <stddef.h>
void *malloc(size_t n);
void *calloc(size_t n, size_t size);
void *realloc(void *p, size_t n);
void free(void *p);
_Noreturn void exit(int status);
_Noreturn void abort(void);
double strtod(const char *s, char **end);
long strtol(const char *s, char **end, int base);
int atoi(const char *s);
long atol(const char *s);
long long strtoll(const char *s, char **end, int base);
unsigned long long strtoull(const char *s, char **end, int base);
unsigned long strtoul(const char *s, char **end, int base);
void *bsearch(const void *key, const void *base, size_t n, size_t size, int (*cmp)(const void *, const void *));
void qsort(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *));
int abs(int v);
char *getenv(const char *name);   /* (CJI-4: the firmware's fw_environ, if its main sets one) */
