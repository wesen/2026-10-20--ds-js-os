/* CJI-4 (chapter 30): a compiled world as a module the board's elf_loader takes.
 *
 * The module (slas-rv32 -c NAME.so --module) holds the world's code and data and a world block;
 * the runtime and the glue (runtime/cji_elf.c) are the firmware's. The module's three entries
 * (app_main, init, event: picocalc-os's sdk/nw_elf.h) are thunks that store the world block's
 * address in the glue's cji_elf_world and jump to cji_elf_entry, cji_elf_init and cji_elf_event
 * with their arguments untouched.
 *
 * The world block's layout, in bytes, on rv32 (4-byte pointers). slas-rv32, an x86-64 program,
 * writes the header; the glue reads it through a struct whose offsets it checks against these. */
#ifndef CJI_ELF_H
#define CJI_ELF_H

#define CJI_ELF_ABI 0x434a4901u      /* "CJI", 1 */
#define CJI_ELF_W_ABI 0              /* CJI_ELF_ABI */
#define CJI_ELF_W_SIZE 4             /* the block's bytes, header and state */
#define CJI_ELF_W_SNAPSHOT 8         /* the module's cji_snapshot: [words, entry, entry, block, map] or [0, 0, 0] */
#define CJI_ELF_W_MAIN 12            /* main, or 0 when the snapshot replaces it */
#define CJI_ELF_W_INIT 16            /* $nwInit(closure), the module's or the shared unit's */
#define CJI_ELF_W_EVENT 20           /* $nwEvent(closure) */
#define CJI_ELF_W_ERROR_SHAPE 24     /* the Error shape (error_shape()) */
#define CJI_ELF_W_INIT_THUNK 28      /* the module's init, for its table */
#define CJI_ELF_W_EVENT_THUNK 32     /* the module's event */
#define CJI_ELF_W_MALLOC 36          /* malloc, realloc, free, as the module links them: on the board */
#define CJI_ELF_W_REALLOC 40         /*   the kernel's allocator, which charges the world */
#define CJI_ELF_W_FREE 44
#define CJI_ELF_W_KERNEL 48          /* (the glue's) the kernel's table, from app_main's argv[0] */
#define CJI_ELF_W_FLAGS 52           /* (the glue's) CJI_ELF_CRASHED... */
#define CJI_ELF_W_ROOTSTACK 56       /* the root stack's bytes, chosen when the world is built (slas-rv32 --rootstack);
                                        0: 64 KB, as on the host */
#define CJI_ELF_W_HEADER 64          /* the bytes slas-rv32 writes; the rest is zero */
#define CJI_ELF_W_STATE 64           /* (the glue's) struct rt_state: the runtime's variables for this world */
#define CJI_ELF_W_BYTES 512          /* the whole block */

/* The root stack's slack: compiled code zeroes a frame's slots before it pushes the frame (src/prelude.js), and the
   rv32 backend checks the push (CJI-4, task 9), so a frame that fails the check may already have written this far
   past the root stack's checked end. The embedder allocates it past the end; the backend refuses a bigger frame.
   (The largest frame in the 287 programs and worlds of tools/slir-compare.mjs: 496 bytes, agenda's.) */
#define CJI_ELF_ROOTSTACK_SLACK 1024

#define CJI_ELF_CRASHED 1u
#define CJI_ELF_STARTED 2u

/* the thunks: eight instructions each (auipc/addi the block, auipc/lw/sw cji_elf_world, auipc/lw/jr) */
#define CJI_ELF_THUNK_BYTES 32

#endif
