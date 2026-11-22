/* CJI-4: slas built for the board (rv32, in the firmware): the code SLJIT generates goes into a module the firmware's
   loader copies elsewhere, so the buffer is ordinary memory and is never run where it is written. */
#include <stddef.h>
void *rv32_low_exec(unsigned long size);
#define SLJIT_MALLOC_EXEC(size, data) rv32_low_exec(size)
#define SLJIT_FREE_EXEC(ptr, data) ((void)(ptr))
#define SLJIT_CACHE_FLUSH(from, to) ((void)(from), (void)(to))
