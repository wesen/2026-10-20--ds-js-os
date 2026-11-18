/* CJI-4, part 2: slas on the board, in a region of its own. slas.c and SLJIT are built for the board firmware with
 * malloc, calloc, realloc, free, strdup and exit renamed to the functions below (Makefile, BOARD_SLAS): every block
 * slas takes is on a list, and what it has not given back when it returns (slas is a program's main, which leaves
 * its memory to the process's end) is freed then. Its exit (die: a malformed text) comes back here instead of
 * stopping the firmware. The module it writes is a file of libc.c's, outside the region, and stays. */
#include <setjmp.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

int slas_main(int argc, char **argv);

typedef struct blk { struct blk *prev, *next; uint32_t magic, size; } blk;   /* (16 bytes: the alignment malloc gives) */
#define MAGIC 0x534c4153u
static blk head = { &head, &head, 0, 0 };
static size_t held, held_max;
static jmp_buf escape;

static void *link_in(blk *b, size_t n)
{
	b->magic = MAGIC;
	b->size = (uint32_t)n;
	b->prev = &head;
	b->next = head.next;
	head.next->prev = b;
	head.next = b;
	held += n;
	if (held > held_max)
		held_max = held;
	return b + 1;
}
static void unlink_out(blk *b)
{
	b->prev->next = b->next;
	b->next->prev = b->prev;
	b->magic = 0;
	held -= b->size;
}
static int mine(void *p) { return p && ((blk *)p - 1)->magic == MAGIC; }

void *slas_region_malloc(size_t n)
{
	blk *b = malloc(sizeof *b + n);
	return b ? link_in(b, n) : NULL;
}
void *slas_region_calloc(size_t k, size_t n)
{
	void *p = n && k > (size_t)-1 / n ? NULL : slas_region_malloc(k * n);
	if (p)
		memset(p, 0, k * n);
	return p;
}
void slas_region_free(void *p)
{
	if (!p)
		return;
	if (!mine(p)) {   /* (a block of libc's, given to slas: a FILE's buffer) */
		free(p);
		return;
	}
	unlink_out((blk *)p - 1);
	free((blk *)p - 1);
}
void *slas_region_realloc(void *p, size_t n)
{
	void *q;
	if (p && !mine(p))
		return realloc(p, n);
	if (!(q = slas_region_malloc(n)))
		return NULL;
	if (p) {
		size_t was = ((blk *)p - 1)->size;
		memcpy(q, p, was < n ? was : n);
		slas_region_free(p);
	}
	return q;
}
char *slas_region_strdup(const char *s)
{
	size_t n = strlen(s) + 1;
	char *d = slas_region_malloc(n);
	if (d)
		memcpy(d, s, n);
	return d;
}
_Noreturn void slas_region_exit(int status) { longjmp(escape, 0x100 | (status & 0xff)); }

/* slas_main(argc, argv) in the region: its status (an exit's), the most its blocks held, and what it left */
int board_slas(int argc, char **argv, size_t *most, size_t *left)
{
	int status = setjmp(escape);
	if (!status)
		status = slas_main(argc, argv);
	else
		status &= 0xff;
	*most = held_max;
	*left = held;
	while (head.next != &head) {
		blk *b = head.next;
		unlink_out(b);
		free(b);
	}
	held_max = 0;
	return status;
}
