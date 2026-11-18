/* CJI-4 (chapter 30): the module the board's elf_loader takes (included by rv32_obj.c).
 *
 *   slas-rv32 -c NAME.so --module NAME.slir
 *
 * An ELF32 shared object for RISC-V, as picocalc-os builds its native worlds (-fPIC -shared
 * -e app_main -z max-page-size=16): three loadable segments with file offset = address, so there is
 * no padding between them:
 *
 *   R    the ELF header, the program headers, .dynsym, .dynstr, .hash, .rela.dyn
 *   R X  .text: the world's code, then the three entries (app_main, init, event)
 *   RW   .dynamic; .data: the table (one word per outside address), the strings, shapes and
 *        static closures, the snapshot, the world block's header; .bss: the rest of the block
 *
 * Nothing in the code is relocated: a function reaches the table relative to itself (chapter 29),
 * and the table is now in the writable segment. A word that points into the module is
 * R_RISCV_RELATIVE with the target's address as addend; a word that names something outside is
 * R_RISCV_32 against an undefined .dynsym symbol with addend 0. The module never names its own
 * symbols in a relocation: elf_loader 2.0 sends a named relocation to the firmware's resolver.
 *
 * The entries are thunks: each puts the world block's address in the glue's cji_elf_world and jumps
 * to cji_elf_entry, cji_elf_init or cji_elf_event (runtime/cji_elf.c, in the firmware) with its
 * arguments as they came. runtime/cji_elf.h has the block's layout. */
#include "cji_elf.h"
#define R_RISCV_RELATIVE_ 3

static const char *const module_names[] = { "cji_elf_world", "cji_elf_entry", "cji_elf_init", "cji_elf_event" };
static int module_sym[4];
static void rv32_module_syms(void)
{
	for (int i = 0; i < 4; i++)
		module_sym[i] = aot_sym(SYM_EXT, module_names[i]);
}

/* one relocation of the module: at `where` (an address), RELATIVE to `addend` or by `name` */
typedef struct { uint32_t where; const char *name; uint32_t addend; } MRel;
typedef struct { MRel *r; int n, cap; } MRels;
static void mrel(MRels *m, uint32_t where, const char *name, uint32_t addend)
{
	m->r = grow(m->r, &m->cap, m->n, sizeof *m->r);
	m->r[m->n].where = where;
	m->r[m->n].name = name;
	m->r[m->n++].addend = addend;
}
/* the name an AOT symbol has outside the module (a runtime function or global, a helper, a shared
   unit's symbol, the glue's), or NULL when the module defines it */
static const char *outside_name(int i)
{
	static char **names;   /* (grown as needed: slas on the board has no room for a fixed table) */
	static int names_cap;
	char buf[96];
	AotSym *y = &aot_syms[i];
	if (y->kind != SYM_EXT && !by_symbol(y))
		return NULL;
	if (y->kind == SYM_EXT)
		return y->text;
	while (i >= names_cap) {
		int was = names_cap;
		names = grow(names, &names_cap, names_cap, sizeof *names);
		memset(names + was, 0, (size_t)(names_cap - was) * sizeof *names);
	}
	if (!names[i]) {
		sym_name(buf, sizeof buf, y);
		if (!(names[i] = malloc(strlen(buf) + 1)))
			die("out of memory");
		strcpy(names[i], buf);
	}
	return names[i];
}
static int fn_index(const char *prefix)   /* a function named prefix or prefix.HASH */
{
	size_t n = strlen(prefix);
	for (int k = 0; k < nfns; k++)
		if (!strncmp(fns[k].name, prefix, n) && (fns[k].name[n] == '\0' || fns[k].name[n] == '.'))
			return k;
	return -1;
}
static const char *ext_fn_name(const char *prefix)   /* the same, among the shared unit's functions */
{
	static char buf[96];
	size_t n = strlen(prefix);
	for (int k = 0; k < next_fns; k++)
		if (!strncmp(ext_fns[k].name, prefix, n) && (ext_fns[k].name[n] == '\0' || ext_fns[k].name[n] == '.')) {
			snprintf(buf, sizeof buf, "cji_f_%s", ext_fns[k].name);
			return buf;
		}
	/* (CJI-4: or in the unit's list, when the text has only the world's own functions, as on the board,
	   where the unit's text is not at hand) */
	for (int k = 0; k < next_keys; k++)
		if (!strncmp(ext_keys[k], "f ", 2) && !strncmp(ext_keys[k] + 2, prefix, n)
			&& (ext_keys[k][2 + n] == '\0' || ext_keys[k][2 + n] == '.')) {
			snprintf(buf, sizeof buf, "cji_f_%s", ext_keys[k] + 2);
			return buf;
		}
	return NULL;
}
static uint32_t elf_hash(const char *s)
{
	uint32_t h = 0, g;
	while (*s) {
		h = (h << 4) + (unsigned char)*s++;
		if ((g = h & 0xf0000000u))
			h ^= g >> 24;
		h &= ~g;
	}
	return h;
}
static uint32_t rv_auipc(int rd, int32_t off) { return 0x17u | (uint32_t)rd << 7 | ((uint32_t)(off + 0x800) & 0xfffff000u); }
static int32_t rv_lo(int32_t off) { return off - (int32_t)((uint32_t)(off + 0x800) & 0xfffff000u); }
static uint32_t rv_itype(uint32_t op, uint32_t f3, int rd, int rs1, int32_t imm)
{
	return op | (uint32_t)rd << 7 | f3 << 12 | (uint32_t)rs1 << 15 | ((uint32_t)imm & 0xfff) << 20;
}

static int rv32_write_module(const RvProg *P, const char *out_path)
{
	enum { NPH = 4, T0 = 5, T1 = 6 };
	Out text = { 0 }, data = { 0 }, file = { 0 }, dynsym = { 0 }, dynstr = { 0 }, hash = { 0 }, rela = { 0 }, dyn = { 0 };
	Out symtab = { 0 }, strtab = { 0 }, shstr = { 0 };
	MRels R = { 0 };
	const char **names = NULL;
	int nnames = 0, names_cap = 0, syms = getenv("CJI_RV32_SYMS") != NULL;
	size_t thunks, obj_at, w_at;
	uint32_t text_va, dyn_va, data_va, bss_end, hdr_end, dynsym_at, dynstr_at, hash_at, rela_at, nrelative = 0;
	int k_init, k_event, k_main;
	const char *ext_init = NULL, *ext_event = NULL;
	char es_name[96];
	/* .text: the code, then the three thunks */
	out_put(&text, P->code, P->ncode);
	out_align(&text, 4);
	thunks = text.n;
	for (int i = 0; i < 3 * CJI_ELF_THUNK_BYTES; i++)
		out_put(&text, "", 1);
	/* .data: the table, the objects, the world block's header (its state is .bss) */
	for (int i = 0; i < P->ntable; i++) {
		uint32_t zero = 0;
		out_put(&data, &zero, 4);
	}
	out_align(&data, 8);
	obj_at = data.n;
	out_put(&data, P->data.d, P->data.n);
	out_align(&data, 8);
	w_at = data.n;
	{
		uint32_t hdr[CJI_ELF_W_HEADER / 4] = { 0 };
		hdr[CJI_ELF_W_ABI / 4] = CJI_ELF_ABI;
		hdr[CJI_ELF_W_SIZE / 4] = CJI_ELF_W_BYTES;
		hdr[CJI_ELF_W_ROOTSTACK / 4] = (uint32_t)rv32_rootstack;   /* (0: the firmware's 64 KB; slas-rv32 says 4 KB) */
		out_put(&data, hdr, sizeof hdr);
	}
	/* the entries the block names */
	k_main = fn_index("main");
	k_init = fn_index("$nwInit");
	k_event = fn_index("$nwEvent");
	if (k_init < 0 && !(ext_init = ext_fn_name("$nwInit")))
		die("module: the program has no $nwInit (a world's module needs the native world runtime)");
	if (ext_init && !(ext_init = strdup(ext_init)))
		die("out of memory");
	if (k_event < 0 && !(ext_event = ext_fn_name("$nwEvent")))
		die("module: the program has no $nwEvent");
	if (ext_event && !(ext_event = strdup(ext_event)))
		die("out of memory");
	if (aot_syms[P->error_shape_sym].ext)
		sym_name(es_name, sizeof es_name, &aot_syms[P->error_shape_sym]);
	/* the dynamic symbols: every outside name, in the order the relocations meet them */
#define NAME(nm) do { const char *n_ = (nm); int j_; for (j_ = 0; j_ < nnames && strcmp(names[j_], n_); j_++) {} \
	if (j_ == nnames) { names = grow(names, &names_cap, nnames, sizeof *names); names[nnames++] = n_; } } while (0)
	for (int i = 0; i < P->ntable; i++)
		if (outside_name(i))
			NAME(outside_name(i));
	for (int r = 0; r < P->ndrelocs; r++)
		if (P->drelocs[r].sym >= 0)
			NAME(outside_name(P->drelocs[r].sym));
	if (ext_init) NAME(ext_init);
	if (ext_event) NAME(ext_event);
	if (aot_syms[P->error_shape_sym].ext) NAME(es_name);
	NAME("malloc");
	NAME("realloc");
	NAME("free");
	/* the number of relocations: every table word, every .data pointer, the block's words */
	{
		int nrel = P->ntable + P->ndrelocs + 10 - (k_main < 0);   /* (the block: 10 words, main among them) */
		uint32_t nsym = (uint32_t)nnames + 2, nbucket = nsym / 2 + 1;
		/* the read-only segment's size, which fixes every later address */
		hdr_end = 52 + NPH * 32;
		dynsym_at = (hdr_end + 3) & ~3u;
		out_str(&dynstr, "");
		for (int j = 0; j < nnames; j++)
			out_str(&dynstr, names[j]);
		out_str(&dynstr, "app_main");
		dynstr_at = dynsym_at + 16 * nsym;
		hash_at = (uint32_t)((dynstr_at + dynstr.n + 3) & ~(size_t)3);
		rela_at = hash_at + 4 * (2 + nbucket + nsym);
		text_va = (uint32_t)((rela_at + 12 * (size_t)nrel + 15) & ~(size_t)15);
		dyn_va = (uint32_t)((text_va + text.n + 7) & ~(size_t)7);
		data_va = dyn_va + 8 * 10;
		bss_end = data_va + (uint32_t)data.n + (CJI_ELF_W_BYTES - CJI_ELF_W_HEADER);
		/* .hash */
		{
			uint32_t *bucket = calloc(nbucket, 4), *chain = calloc(nsym, 4), hd[2] = { nbucket, nsym };
			if (!bucket || !chain)
				die("out of memory");
			/* symbol i's name: dynstr holds "", names..., "app_main" in order */
			{
				const char *p = (const char *)dynstr.d + 1;
				for (uint32_t i = 1; i < nsym; i++) {
					uint32_t b = elf_hash(p) % nbucket;
					chain[i] = bucket[b];
					bucket[b] = i;
					p += strlen(p) + 1;
				}
			}
			out_put(&hash, hd, 8);
			out_put(&hash, bucket, 4 * nbucket);
			out_put(&hash, chain, 4 * nsym);
			free(bucket);
			free(chain);
		}
		/* .dynsym: null, the outside names (undefined), app_main */
		{
			Elf32_Sym z = { 0 };
			uint32_t at = 1;
			out_put(&dynsym, &z, sizeof z);
			for (int j = 0; j < nnames; j++) {
				Elf32_Sym e = { 0 };
				e.st_name = at;
				e.st_info = ELF32_ST_INFO(STB_GLOBAL, STT_NOTYPE);
				e.st_shndx = SHN_UNDEF;
				out_put(&dynsym, &e, sizeof e);
				at += (uint32_t)strlen(names[j]) + 1;
			}
			{
				Elf32_Sym e = { 0 };
				e.st_name = at;
				e.st_info = ELF32_ST_INFO(STB_GLOBAL, STT_FUNC);
				e.st_shndx = 5;   /* .text */
				e.st_value = text_va + (uint32_t)thunks;
				e.st_size = CJI_ELF_THUNK_BYTES;
				out_put(&dynsym, &e, sizeof e);
			}
		}
		/* the relocations: table words, .data's pointers, the block */
		for (int i = 0; i < P->ntable; i++) {
			AotSym *y = &aot_syms[i];
			uint32_t where = data_va + 4 * (uint32_t)i;
			if (outside_name(i))
				mrel(&R, where, outside_name(i), 0);
			else if (y->kind == SYM_CODE) {
				int k = 0;
				while (k < nfns && strcmp(fns[k].name, y->text))
					k++;
				if (k == nfns)
					die("funref of undefined function %s", y->text);
				mrel(&R, where, NULL, text_va + (uint32_t)(fns[k].addr - (sljit_uw)P->code));
			} else
				mrel(&R, where, NULL, data_va + (uint32_t)obj_at + (uint32_t)P->data_at[i]);
		}
		for (int r = 0; r < P->ndrelocs; r++) {
			const RReloc *d = &P->drelocs[r];
			uint32_t where = data_va + (uint32_t)(obj_at + d->offset);
			if (d->sym >= 0)
				mrel(&R, where, outside_name(d->sym), 0);
			else
				mrel(&R, where, NULL, (d->sym == -1 ? text_va : data_va + (uint32_t)obj_at) + (uint32_t)d->addend);
		}
		{
			uint32_t w = data_va + (uint32_t)w_at;
			mrel(&R, w + CJI_ELF_W_SNAPSHOT, NULL, data_va + (uint32_t)(obj_at + P->snap_at));
			if (k_main >= 0)
				mrel(&R, w + CJI_ELF_W_MAIN, NULL, text_va + (uint32_t)(fns[k_main].addr - (sljit_uw)P->code));
			if (ext_init)
				mrel(&R, w + CJI_ELF_W_INIT, ext_init, 0);
			else
				mrel(&R, w + CJI_ELF_W_INIT, NULL, text_va + (uint32_t)(fns[k_init].addr - (sljit_uw)P->code));
			if (ext_event)
				mrel(&R, w + CJI_ELF_W_EVENT, ext_event, 0);
			else
				mrel(&R, w + CJI_ELF_W_EVENT, NULL, text_va + (uint32_t)(fns[k_event].addr - (sljit_uw)P->code));
			if (aot_syms[P->error_shape_sym].ext)
				mrel(&R, w + CJI_ELF_W_ERROR_SHAPE, es_name, 0);
			else
				mrel(&R, w + CJI_ELF_W_ERROR_SHAPE, NULL, data_va + (uint32_t)(obj_at + (size_t)P->data_at[P->error_shape_sym]));
			mrel(&R, w + CJI_ELF_W_INIT_THUNK, NULL, text_va + (uint32_t)thunks + CJI_ELF_THUNK_BYTES);
			mrel(&R, w + CJI_ELF_W_EVENT_THUNK, NULL, text_va + (uint32_t)thunks + 2 * CJI_ELF_THUNK_BYTES);
			mrel(&R, w + CJI_ELF_W_MALLOC, "malloc", 0);
			mrel(&R, w + CJI_ELF_W_REALLOC, "realloc", 0);
			mrel(&R, w + CJI_ELF_W_FREE, "free", 0);
		}
		if (R.n != nrel)
			die("module: %d relocations, expected %d", R.n, nrel);
		/* .rela.dyn: the RELATIVE ones first (DT_RELACOUNT), then the named ones */
		for (int pass = 0; pass < 2; pass++)
			for (int r = 0; r < R.n; r++) {
				Elf32_Rela e;
				if ((R.r[r].name == NULL) != (pass == 0))
					continue;
				if (R.r[r].where & 3)
					die("module: a relocation at %#x, not 4-byte aligned", R.r[r].where);
				e.r_offset = R.r[r].where;
				if (!R.r[r].name) {
					e.r_info = ELF32_R_INFO(0, R_RISCV_RELATIVE_);
					e.r_addend = (Elf32_Sword)R.r[r].addend;
					nrelative++;
				} else {
					int j = 0;
					while (j < nnames && strcmp(names[j], R.r[r].name))
						j++;
					if (j == nnames)
						die("module: no symbol %s", R.r[r].name);
					e.r_info = ELF32_R_INFO(j + 1, R_RISCV_32_);
					e.r_addend = 0;
				}
				out_put(&rela, &e, sizeof e);
			}
		/* .dynamic */
		{
			Elf32_Dyn d[10] = {
				{ DT_HASH, { hash_at } }, { DT_STRTAB, { dynstr_at } }, { DT_SYMTAB, { dynsym_at } },
				{ DT_STRSZ, { (Elf32_Word)dynstr.n } }, { DT_SYMENT, { sizeof(Elf32_Sym) } }, { DT_RELA, { rela_at } },
				{ DT_RELASZ, { (Elf32_Word)rela.n } }, { DT_RELAENT, { sizeof(Elf32_Rela) } }, { DT_RELACOUNT, { nrelative } },
				{ DT_NULL, { 0 } },
			};
			out_put(&dyn, d, sizeof d);
		}
	}
	/* the code's auipc/addi pairs: the table is at data_va */
	for (int i = 0; i < ntb_sites; i++) {
		size_t at = tb_sites[i].addr - (sljit_uw)P->code;
		int32_t off = (int32_t)(data_va - (text_va + (uint32_t)at));
		uint32_t ins;
		memcpy(&ins, text.d + at, 4);
		ins = (ins & 0xfff) | ((uint32_t)(off + 0x800) & 0xfffff000u);
		memcpy(text.d + at, &ins, 4);
		memcpy(&ins, text.d + at + 4, 4);
		ins = (ins & 0xfffff) | (uint32_t)rv_lo(off) << 20;
		memcpy(text.d + at + 4, &ins, 4);
	}
	/* the thunks: t0 = the block; [cji_elf_world] = t0; jump to the glue's function */
	for (int t = 0; t < 3; t++) {
		uint32_t pc = text_va + (uint32_t)thunks + (uint32_t)t * CJI_ELF_THUNK_BYTES, ins[8];
		int32_t w = (int32_t)(data_va + (uint32_t)w_at - pc);
		int32_t cur = (int32_t)(data_va + 4 * (uint32_t)module_sym[0] - (pc + 8));
		int32_t fn = (int32_t)(data_va + 4 * (uint32_t)module_sym[1 + t] - (pc + 20));
		ins[0] = rv_auipc(T0, w);
		ins[1] = rv_itype(0x13, 0, T0, T0, rv_lo(w));                   /* addi t0, t0, lo */
		ins[2] = rv_auipc(T1, cur);
		ins[3] = rv_itype(0x03, 2, T1, T1, rv_lo(cur));                 /* lw t1, lo(t1) */
		ins[4] = 0x23u | 2u << 12 | (uint32_t)T1 << 15 | (uint32_t)T0 << 20;   /* sw t0, 0(t1) */
		ins[5] = rv_auipc(T1, fn);
		ins[6] = rv_itype(0x03, 2, T1, T1, rv_lo(fn));
		ins[7] = rv_itype(0x67, 0, 0, T1, 0);                           /* jr t1 */
		memcpy(text.d + thunks + (size_t)t * CJI_ELF_THUNK_BYTES, ins, sizeof ins);
	}
	/* CJI_RV32_SYMS: every function as a local symbol (not loaded), for traces and objdump */
	if (syms) {
		Elf32_Sym z = { 0 };
		static const char *const thunk_names[3] = { "app_main", "cji_thunk_init", "cji_thunk_event" };
		out_str(&strtab, "");
		out_put(&symtab, &z, sizeof z);
		for (int k = 0; k < nfns + 3; k++) {
			Elf32_Sym e = { 0 };
			e.st_name = out_str(&strtab, k < nfns ? fns[k].name : thunk_names[k - nfns]);
			e.st_info = ELF32_ST_INFO(STB_LOCAL, STT_FUNC);
			e.st_shndx = 5;
			e.st_value = text_va + (uint32_t)(k < nfns ? fns[k].addr - (sljit_uw)P->code : thunks + (size_t)(k - nfns) * CJI_ELF_THUNK_BYTES);
			out_put(&symtab, &e, sizeof e);
		}
	}
	/* the file */
	{
		Elf32_Ehdr h = { 0 };
		Elf32_Phdr ph[NPH] = { { 0 } };
		enum { NSEC = 12 };
		const char *secn[NSEC] = { "", ".dynsym", ".dynstr", ".hash", ".rela.dyn", ".text", ".dynamic", ".data", ".bss", ".shstrtab", ".symtab", ".strtab" };
		Elf32_Word nm[NSEC];
		Elf32_Shdr sh[NSEC] = { { 0 } };
		int nsec = syms ? 12 : 10;
		size_t shstr_at, symtab_at = 0, strtab_at = 0;
		for (int k = 0; k < nsec; k++)
			nm[k] = out_str(&shstr, secn[k]);
		out_put(&file, &h, sizeof h);
		out_put(&file, ph, sizeof ph);
#define AT(off) do { while (file.n < (off)) out_put(&file, "", 1); if (file.n != (off)) die("module: layout"); } while (0)
		AT(dynsym_at); out_put(&file, dynsym.d, dynsym.n);
		AT(dynstr_at); out_put(&file, dynstr.d, dynstr.n);
		AT(hash_at); out_put(&file, hash.d, hash.n);
		AT(rela_at); out_put(&file, rela.d ? rela.d : (unsigned char *)"", rela.n);
		AT(text_va); out_put(&file, text.d, text.n);
		AT(dyn_va); out_put(&file, dyn.d, dyn.n);
		AT(data_va); out_put(&file, data.d, data.n);
		if (syms) {
			out_align(&file, 4);
			symtab_at = file.n;
			out_put(&file, symtab.d, symtab.n);
			strtab_at = file.n;
			out_put(&file, strtab.d, strtab.n);
		}
		shstr_at = file.n;
		out_put(&file, shstr.d, shstr.n);
		out_align(&file, 4);
		h.e_shoff = (Elf32_Off)file.n;
		/* name, type, flags, addr, offset, size, link, info, addralign, entsize */
		sh[1] = (Elf32_Shdr){ nm[1], SHT_DYNSYM, SHF_ALLOC, dynsym_at, dynsym_at, (Elf32_Word)dynsym.n, 2, 1, 4, sizeof(Elf32_Sym) };
		sh[2] = (Elf32_Shdr){ nm[2], SHT_STRTAB, SHF_ALLOC, dynstr_at, dynstr_at, (Elf32_Word)dynstr.n, 0, 0, 1, 0 };
		sh[3] = (Elf32_Shdr){ nm[3], SHT_HASH, SHF_ALLOC, hash_at, hash_at, (Elf32_Word)hash.n, 1, 0, 4, 4 };
		sh[4] = (Elf32_Shdr){ nm[4], SHT_RELA, SHF_ALLOC, rela_at, rela_at, (Elf32_Word)rela.n, 1, 0, 4, sizeof(Elf32_Rela) };
		sh[5] = (Elf32_Shdr){ nm[5], SHT_PROGBITS, SHF_ALLOC | SHF_EXECINSTR, text_va, text_va, (Elf32_Word)text.n, 0, 0, 16, 0 };
		sh[6] = (Elf32_Shdr){ nm[6], SHT_DYNAMIC, SHF_ALLOC | SHF_WRITE, dyn_va, dyn_va, (Elf32_Word)dyn.n, 2, 0, 8, sizeof(Elf32_Dyn) };
		sh[7] = (Elf32_Shdr){ nm[7], SHT_PROGBITS, SHF_ALLOC | SHF_WRITE, data_va, data_va, (Elf32_Word)data.n, 0, 0, 8, 0 };
		sh[8] = (Elf32_Shdr){ nm[8], SHT_NOBITS, SHF_ALLOC | SHF_WRITE, data_va + (uint32_t)data.n, data_va + (uint32_t)data.n,
			CJI_ELF_W_BYTES - CJI_ELF_W_HEADER, 0, 0, 8, 0 };
		sh[9] = (Elf32_Shdr){ nm[9], SHT_STRTAB, 0, 0, (Elf32_Off)shstr_at, (Elf32_Word)shstr.n, 0, 0, 1, 0 };
		if (syms) {
			sh[10] = (Elf32_Shdr){ nm[10], SHT_SYMTAB, 0, 0, (Elf32_Off)symtab_at, (Elf32_Word)symtab.n, 11, (Elf32_Word)(nfns + 4), 4, sizeof(Elf32_Sym) };
			sh[11] = (Elf32_Shdr){ nm[11], SHT_STRTAB, 0, 0, (Elf32_Off)strtab_at, (Elf32_Word)strtab.n, 0, 0, 1, 0 };
		}
		out_put(&file, sh, sizeof(Elf32_Shdr) * (size_t)nsec);
		/* type, offset, vaddr, paddr, filesz, memsz, flags, align */
		ph[0] = (Elf32_Phdr){ PT_LOAD, 0, 0, 0, rela_at + (uint32_t)rela.n, rela_at + (uint32_t)rela.n, PF_R, 16 };
		ph[1] = (Elf32_Phdr){ PT_LOAD, text_va, text_va, text_va, (Elf32_Word)text.n, (Elf32_Word)text.n, PF_R | PF_X, 16 };
		ph[2] = (Elf32_Phdr){ PT_LOAD, dyn_va, dyn_va, dyn_va, data_va + (uint32_t)data.n - dyn_va, bss_end - dyn_va, PF_R | PF_W, 16 };
		ph[3] = (Elf32_Phdr){ PT_DYNAMIC, dyn_va, dyn_va, dyn_va, (Elf32_Word)dyn.n, (Elf32_Word)dyn.n, PF_R | PF_W, 4 };
		memcpy(h.e_ident, ELFMAG, SELFMAG);
		h.e_ident[EI_CLASS] = ELFCLASS32;
		h.e_ident[EI_DATA] = ELFDATA2LSB;
		h.e_ident[EI_VERSION] = EV_CURRENT;
		h.e_type = ET_DYN;
		h.e_machine = EM_RISCV;
		h.e_flags = 0x1 /* EF_RISCV_RVC */ | 0x2 /* EF_RISCV_FLOAT_ABI_SINGLE: see rv32_aot */;
		h.e_version = EV_CURRENT;
		h.e_entry = text_va + (uint32_t)thunks;   /* app_main */
		h.e_phoff = 52;
		h.e_ehsize = sizeof h;
		h.e_phentsize = sizeof(Elf32_Phdr);
		h.e_phnum = NPH;
		h.e_shentsize = sizeof(Elf32_Shdr);
		h.e_shnum = (Elf32_Half)nsec;
		h.e_shstrndx = 9;
		memcpy(file.d, &h, sizeof h);
		memcpy(file.d + 52, ph, sizeof ph);
	}
	{
		FILE *o = fopen(out_path, "wb");
		if (!o || fwrite(file.d, 1, file.n, o) != file.n) {
			perror(out_path);
			return 2;
		}
		fclose(o);
	}
	fprintf(stderr, "slas-rv32: %s: a module of %lu bytes: %lu of code, a table of %d words, %lu of data, a block of %d; "
		"%u bytes loaded; %d relocations (%u relative), %d names\n", out_path, (unsigned long)file.n, (unsigned long)P->ncode,
		P->ntable, (unsigned long)P->data.n, CJI_ELF_W_BYTES, bss_end, R.n, nrelative, nnames);
	return 0;
}
