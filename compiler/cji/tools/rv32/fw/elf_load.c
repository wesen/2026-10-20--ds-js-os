/* CJI-4, part 2: the firmware's loader for a module in memory, as picocalc-os's native_elf_p4.c loads one with
 * elf_loader's esp_elf_relocate(elf, buf, len): what bench/emu/elf.c's load_shared does for the emulator, done by
 * the firmware itself, so that a world compiled on the board (slas writes its module into memory) is loaded the way
 * every native world is. The same rules (design-doc/01-design.md, section 1.1): the header as native_elf_p4.c checks
 * it, the PT_LOAD span into one zeroed block, only R_RISCV_32, R_RISCV_RELATIVE and R_RISCV_JUMP_SLOT at aligned
 * places inside it, names only from the firmware's table (fw_resolve), the entry in file-backed code. */
#include <elf.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern const struct { const char *name; void *addr; } fw_resolve[];
extern const int fw_nresolve;

static uint32_t resolve(const char *name)
{
	for (int i = 0; i < fw_nresolve; i++)
		if (!strcmp(fw_resolve[i].name, name))
			return (uint32_t)(uintptr_t)fw_resolve[i].addr;
	return 0;
}

static int inside(size_t n, uint32_t off, uint32_t len) { return off <= n && len <= n - off; }

/* 0, the block (malloc'd), its size and the entry; or -1 and why. (On the board, elf_loader also makes the block
   executable and its instruction cache coherent; the emulator has no cache to keep.) */
int fw_elf_load(const uint8_t *d, size_t n, uint8_t **block, uint32_t *size, uint32_t *entry, char *why, size_t why_n)
{
	const Elf32_Ehdr *h = (const Elf32_Ehdr *)(const void *)d;
	const Elf32_Shdr *sh;
	uint32_t vs = 0, ve = 0;
	uint8_t *base;
	int first = 1, entry_ok = 0;
	if (n < sizeof *h || memcmp(h->e_ident, ELFMAG, 4))
		return snprintf(why, why_n, "not an ELF module"), -1;
	if (h->e_ident[EI_CLASS] != ELFCLASS32 || h->e_machine != EM_RISCV || (h->e_flags & 0x6) != 0x2)
		return snprintf(why, why_n, "not built for this board (32-bit RISC-V, ilp32f)"), -1;
	if (h->e_type != ET_DYN || h->e_phoff + (size_t)h->e_phnum * sizeof(Elf32_Phdr) > n
		|| h->e_shoff + (size_t)h->e_shnum * sizeof(Elf32_Shdr) > n)
		return snprintf(why, why_n, "not a shared object, or its headers are past its end"), -1;
	for (int k = 0; k < h->e_phnum; k++) {
		const Elf32_Phdr *p = (const Elf32_Phdr *)(const void *)(d + h->e_phoff + (size_t)k * sizeof *p);
		if (p->p_type != PT_LOAD)
			continue;
		if (p->p_memsz < p->p_filesz || (size_t)p->p_offset + p->p_filesz > n)
			return snprintf(why, why_n, "a bad segment"), -1;
		if (first)
			vs = p->p_vaddr, first = 0;
		if (p->p_vaddr < vs)
			return snprintf(why, why_n, "segments out of order"), -1;
		if (p->p_vaddr + p->p_memsz > ve)
			ve = p->p_vaddr + p->p_memsz;
	}
	if (first)
		return snprintf(why, why_n, "no PT_LOAD segment"), -1;
	*size = ve - vs;
	if (!(base = malloc(*size)))
		return snprintf(why, why_n, "out of memory"), -1;
	memset(base, 0, *size);
	for (int k = 0; k < h->e_phnum; k++) {
		const Elf32_Phdr *p = (const Elf32_Phdr *)(const void *)(d + h->e_phoff + (size_t)k * sizeof *p);
		if (p->p_type != PT_LOAD)
			continue;
		memcpy(base + (p->p_vaddr - vs), d + p->p_offset, p->p_filesz);
		if ((p->p_flags & PF_X) && h->e_entry >= p->p_vaddr && h->e_entry < p->p_vaddr + p->p_filesz)
			entry_ok = 1;
	}
	if (!entry_ok) {
		free(base);
		return snprintf(why, why_n, "its entry is not in file-backed code"), -1;
	}
	sh = (const Elf32_Shdr *)(const void *)(d + h->e_shoff);
	for (int k = 0; k < h->e_shnum; k++) {
		const Elf32_Shdr *ss, *strs;
		const Elf32_Sym *syms;
		const Elf32_Rela *r;
		if (sh[k].sh_type == SHT_REL) {
			free(base);
			return snprintf(why, why_n, "SHT_REL relocations (elf_loader takes RELA)"), -1;
		}
		if (sh[k].sh_type != SHT_RELA)
			continue;
		if (sh[k].sh_link >= h->e_shnum || (sh[sh[k].sh_link].sh_type != SHT_DYNSYM && sh[sh[k].sh_link].sh_type != SHT_SYMTAB)
			|| sh[sh[k].sh_link].sh_link >= h->e_shnum || !inside(n, sh[k].sh_offset, sh[k].sh_size)
			|| !inside(n, sh[sh[k].sh_link].sh_offset, sh[sh[k].sh_link].sh_size)
			|| !inside(n, sh[sh[sh[k].sh_link].sh_link].sh_offset, sh[sh[sh[k].sh_link].sh_link].sh_size)) {
			free(base);
			return snprintf(why, why_n, "relocations without a symbol table, or tables past its end"), -1;
		}
		ss = &sh[sh[k].sh_link];
		strs = &sh[ss->sh_link];
		syms = (const Elf32_Sym *)(const void *)(d + ss->sh_offset);
		r = (const Elf32_Rela *)(const void *)(d + sh[k].sh_offset);
		for (size_t j = 0; j < sh[k].sh_size / sizeof *r; j++) {
			uint32_t type = ELF32_R_TYPE(r[j].r_info), si = ELF32_R_SYM(r[j].r_info), v, word;
			const char *name;
			uint8_t *where;
			if (si >= ss->sh_size / sizeof *syms || syms[si].st_name >= strs->sh_size) {
				free(base);
				return snprintf(why, why_n, "a relocation's symbol %lu is past its table", (unsigned long)si), -1;
			}
			name = (const char *)d + strs->sh_offset + syms[si].st_name;
			if (r[j].r_offset < vs || r[j].r_offset + 4 > ve || (r[j].r_offset & 3)) {
				free(base);
				return snprintf(why, why_n, "a relocation at %#lx, outside the module or not aligned", (unsigned long)r[j].r_offset), -1;
			}
			where = base + (r[j].r_offset - vs);
			if (type == R_RISCV_32 || type == R_RISCV_JUMP_SLOT) {
				if (!si || !name[0] || !(v = resolve(name))) {
					free(base);
					return snprintf(why, why_n, "it links to %s, which picocalc-os does not give a module", name), -1;
				}
				word = type == R_RISCV_32 ? v + (uint32_t)r[j].r_addend : v;
			} else if (type == R_RISCV_RELATIVE)
				word = (uint32_t)(uintptr_t)base - vs + (uint32_t)r[j].r_addend;
			else {
				free(base);
				return snprintf(why, why_n, "relocation type %lu", (unsigned long)type), -1;
			}
			memcpy(where, &word, 4);
		}
	}
	*block = base;
	*entry = (uint32_t)(uintptr_t)base + (h->e_entry - vs);
	return 0;
}
