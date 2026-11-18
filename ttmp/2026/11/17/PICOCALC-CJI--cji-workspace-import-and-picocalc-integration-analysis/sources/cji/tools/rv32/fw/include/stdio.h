/* Chapter 29: the C library of the rv32 test firmware (tools/rv32): only what runtime.c uses. */
#pragma once
#include <stddef.h>
#include <stdarg.h>
/* (CJI-4: a descriptor of the machine's, or a buffer: libc.c) */
typedef struct FILE { int fd; unsigned flags; char *buf; size_t len, cap, pos; char **sptr; size_t *ssize; char name[96]; } FILE;
extern FILE *stdin, *stdout, *stderr;
#define EOF (-1)
#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2
int printf(const char *f, ...);
int fprintf(FILE *o, const char *f, ...);
int sprintf(char *b, const char *f, ...);
int sscanf(const char *s, const char *f, ...);
int snprintf(char *b, size_t n, const char *f, ...);
int vsnprintf(char *b, size_t n, const char *f, va_list ap);
int vfprintf(FILE *o, const char *f, va_list ap);
int puts(const char *s);
int fputs(const char *s, FILE *o);
int fputc(int c, FILE *o);
int putc(int c, FILE *o);
int putchar(int c);
size_t fwrite(const void *p, size_t size, size_t n, FILE *o);
int fflush(FILE *o);
/* CJI-4: files in memory (libc.c): the firmware's named buffers, the machine's storage, memory streams */
FILE *fopen(const char *name, const char *mode);
FILE *fmemopen(void *buf, size_t size, const char *mode);
FILE *open_memstream(char **ptr, size_t *sizeloc);
FILE *tmpfile(void);
int fclose(FILE *f);
int fseek(FILE *f, long off, int whence);
long ftell(FILE *f);
void rewind(FILE *f);
int fileno(FILE *f);
size_t fread(void *p, size_t size, size_t n, FILE *f);
int fgetc(FILE *f);
int getc(FILE *f);
char *fgets(char *s, int n, FILE *f);
int feof(FILE *f);
int ferror(FILE *f);
void perror(const char *s);
int fw_file_put(const char *name, const void *buf, size_t len);   /* the firmware's named buffers */
const char *fw_file_get(const char *name, size_t *len);
int fw_file_drop(const char *name);
