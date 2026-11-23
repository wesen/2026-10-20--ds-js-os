/* rv32emu: loading the firmware (an executable), a module (a relocatable object) and a shared module. */
#include "machine.h"

/* ---- loading: the firmware (an executable) and a module (a relocatable object) ---- */
sym *fw_syms;
int nfw_syms;
uint32_t fw_sym(const char *name)
{
	for (int i = 0; i < nfw_syms; i++)
		if (!strcmp(fw_syms[i].name, name)) return fw_syms[i].value;
	return 0;
}
static uint8_t *slurp(const char *path, size_t *n)
{
	FILE *f = fopen(path, "rb");
	uint8_t *d;
	if (!f) die("cannot open %s", path);
	fseek(f, 0, SEEK_END);
	*n = (size_t)ftell(f);
	rewind(f);
	if (!(d = malloc(*n)) || fread(d, 1, *n, f) != *n) die("cannot read %s", path);
	fclose(f);
	return d;
}
uint32_t load_firmware(const char *path, uint32_t *end)
{
	size_t n;
	uint8_t *d = slurp(path, &n);
	Elf32_Ehdr *h = (Elf32_Ehdr *)d;
	Elf32_Shdr *sh;
	if (n < sizeof *h || memcmp(h->e_ident, ELFMAG, 4) || h->e_machine != EM_RISCV || h->e_type != ET_EXEC) die("%s: not an rv32 executable", path);
	*end = 0;
	for (int k = 0; k < h->e_phnum; k++) {
		Elf32_Phdr *p = (Elf32_Phdr *)(d + h->e_phoff + (size_t)k * h->e_phentsize);
		if (p->p_type != PT_LOAD) continue;
		check(p->p_vaddr, p->p_memsz);
		memcpy(mem + p->p_vaddr, d + p->p_offset, p->p_filesz);
		if (p->p_vaddr + p->p_memsz > *end) *end = p->p_vaddr + p->p_memsz;
	}
	sh = (Elf32_Shdr *)(d + h->e_shoff);
	for (int k = 0; k < h->e_shnum; k++)
		if (sh[k].sh_type == SHT_SYMTAB) {
			Elf32_Sym *s = (Elf32_Sym *)(d + sh[k].sh_offset);
			const char *names = (const char *)d + sh[sh[k].sh_link].sh_offset;
			int count = (int)(sh[k].sh_size / sizeof *s);
			fw_syms = calloc((size_t)count, sizeof *fw_syms);
			for (int j = 0; j < count; j++)
				if (s[j].st_shndx != SHN_UNDEF && ELF32_ST_BIND(s[j].st_info) != STB_LOCAL)
					fw_syms[nfw_syms++] = (sym){ strdup(names + s[j].st_name), s[j].st_value };
				else if (s[j].st_shndx != SHN_UNDEF && ELF32_ST_TYPE(s[j].st_info) == STT_FUNC)
					add_func(names + s[j].st_name, s[j].st_value);
			for (int j = 0; j < nfw_syms; j++)
				add_func(fw_syms[j].name, fw_syms[j].value);
		}
	return h->e_entry;
}

/* a module: its allocated sections one after another from `at`, its relocations applied, its
   undefined symbols the firmware's; returns the address of each global symbol through `module_sym` */
static sym *mod_syms;
static int nmod_syms;
uint32_t module_sym(const char *name)
{
	for (int i = 0; i < nmod_syms; i++)
		if (!strcmp(mod_syms[i].name, name)) return mod_syms[i].value;
	return 0;
}
uint32_t load_module(const char *path, uint32_t at)
{
	size_t n;
	uint8_t *d = slurp(path, &n);
	Elf32_Ehdr *h = (Elf32_Ehdr *)d;
	Elf32_Shdr *sh;
	uint32_t *base;
	Elf32_Sym *syms = NULL;
	const char *names = NULL;
	int nsyms = 0;
	if (n < sizeof *h || memcmp(h->e_ident, ELFMAG, 4) || h->e_machine != EM_RISCV || h->e_type != ET_REL) die("%s: not an rv32 relocatable object", path);
	sh = (Elf32_Shdr *)(d + h->e_shoff);
	base = calloc(h->e_shnum, sizeof *base);
	for (int k = 0; k < h->e_shnum; k++)
		if (sh[k].sh_flags & SHF_ALLOC) {
			uint32_t al = sh[k].sh_addralign ? sh[k].sh_addralign : 1;
			at = (at + al - 1) / al * al;
			base[k] = at;
			check(at, sh[k].sh_size ? sh[k].sh_size : 1);
			if (sh[k].sh_type != SHT_NOBITS) memcpy(mem + at, d + sh[k].sh_offset, sh[k].sh_size);
			at += sh[k].sh_size;
		} else if (sh[k].sh_type == SHT_SYMTAB) {
			syms = (Elf32_Sym *)(d + sh[k].sh_offset);
			nsyms = (int)(sh[k].sh_size / sizeof *syms);
			names = (const char *)d + sh[sh[k].sh_link].sh_offset;
		}
	uint32_t *value = calloc((size_t)nsyms + 1, sizeof *value);
	mod_syms = calloc((size_t)nsyms + 1, sizeof *mod_syms);
	for (int j = 0; j < nsyms; j++) {
		const char *nm = names + syms[j].st_name;
		if (syms[j].st_shndx == SHN_UNDEF) {
			if (j && !(value[j] = fw_sym(nm)) && ELF32_ST_BIND(syms[j].st_info) != STB_WEAK) die("%s: the firmware has no %s", path, nm);
		} else if (syms[j].st_shndx < h->e_shnum)
			value[j] = base[syms[j].st_shndx] + syms[j].st_value;
		if (syms[j].st_shndx != SHN_UNDEF && ELF32_ST_BIND(syms[j].st_info) != STB_LOCAL)
			mod_syms[nmod_syms++] = (sym){ strdup(nm), value[j] };
		if (syms[j].st_shndx != SHN_UNDEF && ELF32_ST_TYPE(syms[j].st_info) == STT_FUNC)
			add_func(nm, value[j]);
	}
	for (int k = 0; k < h->e_shnum; k++)
		if (sh[k].sh_type == SHT_RELA && (sh[sh[k].sh_info].sh_flags & SHF_ALLOC)) {
			Elf32_Rela *r = (Elf32_Rela *)(d + sh[k].sh_offset);
			for (size_t j = 0; j < sh[k].sh_size / sizeof *r; j++) {
				uint32_t where = base[sh[k].sh_info] + r[j].r_offset, s = value[ELF32_R_SYM(r[j].r_info)];
				switch (ELF32_R_TYPE(r[j].r_info)) {
				case R_RISCV_32: st32(where, s + (uint32_t)r[j].r_addend); break;
				case R_RISCV_CALL: case R_RISCV_CALL_PLT: {   /* auipc + jalr (objects from a C compiler, for tests) */
					uint32_t v = s + (uint32_t)r[j].r_addend - where, hi = (v + 0x800) & 0xfffff000u;
					st32(where, (ld32(where) & 0xfff) | hi);
					st32(where + 4, (ld32(where + 4) & 0xfffff) | ((v - hi) << 20));
					break;
				}
				default: die("%s: relocation type %u", path, ELF32_R_TYPE(r[j].r_info));
				}
			}
		}
	return at;
}


/* ---- CJI-4 (chapter 30): a module as the board loads it --------------------------------------
 * An ELF32 shared object, loaded as Espressif's elf_loader 2.0 loads one for picocalc-os's
 * native_elf_p4.c (ttmp/CJI-4-worlds-on-the-board/design-doc/01-design.md, section 1.1, lists what
 * is assumed of it and where each assumption comes from): the header is checked as native_elf_p4.c
 * checks it (A1); the PT_LOAD segments go into one zeroed block, from the first one's address to
 * the end of the last one's memsz (A2), whose size is what the world is charged (A3); the
 * relocations of every SHT_RELA section are applied through its symbol table (A4), and only
 * R_RISCV_32, R_RISCV_RELATIVE and R_RISCV_JUMP_SLOT (A5, A6, A7), each at a 4-byte-aligned place
 * inside the block (A9); a name is looked up only in the firmware's table fw_resolve, and a name it
 * does not have stops the load with native_elf_p4.c's message (A10); a named relocation is always
 * resolved by name, even when the module defines the name (A8); the entry is e_entry, in file-backed
 * code (A11). Anything else is refused. */
static uint32_t fw_resolve_name(const char *name)
{
	uint32_t t = fw_sym("fw_resolve"), n = fw_sym("fw_nresolve");
	if (!t || !n) die("the firmware has no resolve table (fw_resolve, fw_nresolve)");
	n = ld32(n);
	for (uint32_t i = 0; i < n; i++)
		if (!strcmp(str(ld32(t + 8 * i)), name)) return ld32(t + 8 * i + 4);
	return 0;
}
uint32_t load_shared(const char *path, uint32_t at, uint32_t *entry, uint32_t *size)
{
	size_t n;
	uint8_t *d = slurp(path, &n);
	Elf32_Ehdr *h = (Elf32_Ehdr *)d;
	Elf32_Shdr *sh;
	uint32_t vs = 0, ve = 0, base;
	int first = 1, entry_ok = 0;
	if (n < sizeof *h || memcmp(h->e_ident, ELFMAG, 4)) die("%s is not an ELF module", path);
	if (h->e_ident[EI_CLASS] != ELFCLASS32 || h->e_machine != EM_RISCV || (h->e_flags & 0x6) != 0x2)
		die("%s is not built for this board (32-bit RISC-V, ilp32f)", path);
	if (h->e_type != ET_DYN) die("%s: not a shared object", path);
	if (h->e_phoff + (size_t)h->e_phnum * sizeof(Elf32_Phdr) > n || h->e_shoff + (size_t)h->e_shnum * sizeof(Elf32_Shdr) > n)
		die("%s: headers past the end of the file", path);
	for (int k = 0; k < h->e_phnum; k++) {
		Elf32_Phdr *p = (Elf32_Phdr *)(d + h->e_phoff + (size_t)k * sizeof *p);
		if (p->p_type != PT_LOAD) continue;
		if (p->p_memsz < p->p_filesz || (size_t)p->p_offset + p->p_filesz > n) die("%s: a bad segment", path);
		if (first) vs = p->p_vaddr, first = 0;
		if (p->p_vaddr < vs) die("%s: segments out of order", path);
		if (p->p_vaddr + p->p_memsz > ve) ve = p->p_vaddr + p->p_memsz;
	}
	if (first) die("%s: no PT_LOAD segment", path);
	base = (at + 15) & ~15u;
	*size = ve - vs;
	check(base, *size);
	memset(mem + base, 0, *size);
	for (int k = 0; k < h->e_phnum; k++) {
		Elf32_Phdr *p = (Elf32_Phdr *)(d + h->e_phoff + (size_t)k * sizeof *p);
		if (p->p_type != PT_LOAD) continue;
		memcpy(mem + base + (p->p_vaddr - vs), d + p->p_offset, p->p_filesz);
		if ((p->p_flags & PF_X) && h->e_entry >= p->p_vaddr && h->e_entry < p->p_vaddr + p->p_filesz) entry_ok = 1;
	}
	if (!entry_ok) die("%s: the entry %#x is not in file-backed code", path, h->e_entry);
	*entry = base + (h->e_entry - vs);
	sh = (Elf32_Shdr *)(d + h->e_shoff);
	for (int k = 0; k < h->e_shnum; k++) {
		Elf32_Shdr *ss, *strs;
		Elf32_Sym *syms;
		Elf32_Rela *r;
		if (sh[k].sh_type == SHT_REL) die("%s: SHT_REL relocations (elf_loader takes RELA)", path);
		if (sh[k].sh_type != SHT_RELA) continue;
		if (sh[k].sh_link >= h->e_shnum || (sh[sh[k].sh_link].sh_type != SHT_DYNSYM && sh[sh[k].sh_link].sh_type != SHT_SYMTAB))
			die("%s: relocations without a symbol table", path);
		ss = &sh[sh[k].sh_link];
		strs = &sh[ss->sh_link];
		syms = (Elf32_Sym *)(d + ss->sh_offset);
		r = (Elf32_Rela *)(d + sh[k].sh_offset);
		for (size_t j = 0; j < sh[k].sh_size / sizeof *r; j++) {
			uint32_t type = ELF32_R_TYPE(r[j].r_info), si = ELF32_R_SYM(r[j].r_info), where, v = 0;
			const char *name;
			if (si >= ss->sh_size / sizeof *syms) die("%s: a relocation's symbol %u is past its table", path, si);
			name = (const char *)d + strs->sh_offset + syms[si].st_name;
			if (r[j].r_offset < vs || r[j].r_offset + 4 > ve) die("%s: a relocation at %#x, outside the module", path, r[j].r_offset);
			where = base + (r[j].r_offset - vs);
			if (where & 3) die("%s: a relocation at %#x, not 4-byte aligned", path, r[j].r_offset);
			if (type == R_RISCV_32 || type == R_RISCV_JUMP_SLOT) {
				if (!si || !name[0]) die("%s: an unnamed relocation of type %u at %#x", path, type, r[j].r_offset);
				if (!(v = fw_resolve_name(name))) die("it links to %s, which picocalc-os does not give a module", name);
				st32(where, type == R_RISCV_32 ? v + (uint32_t)r[j].r_addend : v);
			} else if (type == R_RISCV_RELATIVE)
				st32(where, base - vs + (uint32_t)r[j].r_addend);
			else
				die("%s: relocation type %u (elf_loader applies only R_RISCV_32, R_RISCV_RELATIVE and R_RISCV_JUMP_SLOT)", path, type);
		}
	}
	for (int k = 0; k < h->e_shnum; k++)   /* (a .symtab, not loaded: names for the trace and the profile) */
		if (sh[k].sh_type == SHT_SYMTAB) {
			Elf32_Sym *s = (Elf32_Sym *)(d + sh[k].sh_offset);
			const char *names = (const char *)d + sh[sh[k].sh_link].sh_offset;
			for (size_t j = 0; j < sh[k].sh_size / sizeof *s; j++)
				if (ELF32_ST_TYPE(s[j].st_info) == STT_FUNC && s[j].st_shndx != SHN_UNDEF)
					add_func(names + s[j].st_name, base + (s[j].st_value - vs));
		}
	free(d);
	return base + *size;
}
