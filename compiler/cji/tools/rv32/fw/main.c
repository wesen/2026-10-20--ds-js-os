/* Chapter 29: runtime/aot_main.c for the rv32 test firmware. The program is a module the machine
   loads (bench/emu/elf.c): it sets fw_cji_main and fw_cji_error_shape to the module's symbols. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include "runtime.h"
#include "cji_elf.h"

int64_t (*fw_cji_main)(void);
int64_t *fw_cji_error_shape;
int64_t error_shape(void) { return (int64_t)(intptr_t)fw_cji_error_shape; }

int main(int argc, char **argv)
{
	long heap_bytes = argc > 1 && argv[0][0] == '-' && argv[0][1] == 'h' ? atoi(argv[1]) : 512;
	int64_t status;
	if (!fw_cji_main) {
		fputs("firmware: no program\n", stderr);
		return 2;
	}
	/* (CJI-4: the rv32 code checks every frame it pushes against rootstack_end, after zeroing its slots: they may
	   overrun the end by a frame, so the root stack has CJI_ELF_ROOTSTACK_SLACK bytes more than its end says) */
	rt_initialize((heap_bytes + 7) / 8 * 8, (1 << 16) + CJI_ELF_ROOTSTACK_SLACK);
	rootstack_end -= CJI_ELF_ROOTSTACK_SLACK / 8;
	status = fw_cji_main();
	fflush(stdout);
	return (int)status;
}
