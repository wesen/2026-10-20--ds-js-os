/* Chapter 29: the object slas-rv32 writes (included by slas.c after the x86 object writer, whose
   helpers it shares). See runtime/rv32.c. CJI-4 (chapter 30): the same program, laid out once
   (rv32_layout), is written either as that relocatable object or as the module the board's loader
   takes (rv32_mod.c). */
/* ---- the object: ELF32 for RISC-V ---------------------------------------------------------- */
#define R_RISCV_32_ 1
typedef struct { size_t offset; int sym; int64_t addend; } RReloc;   /* sym: -1 .text, -2 .data, >= 0 an AOT symbol */

/* the program assembled, and its .data laid out: what either writer needs */
typedef struct {
	unsigned char *code;
	sljit_uw ncode;
	int ntable;                /* the table's words: one per AOT symbol named while assembling */
	Out data;                  /* strings, shapes, static closures, then the snapshot */
	RReloc *drelocs;
	int ndrelocs, drelocs_cap;
	int64_t *data_at;          /* each symbol's object in .data */
	int error_shape_sym;
	size_t snap_at;            /* cji_snapshot in .data */
} RvProg;
static int rv32_module;        /* CJI-4: -c NAME.so --module: the board's module (rv32_mod.c) */
static long rv32_rootstack = 4096;   /* CJI-4: --rootstack BYTES: the world's root stack, in its block (task 9: 4 KB,
                                        about ten times what the test worlds use; every push is checked) */
static void rv32_module_syms(void);
static int rv32_write_module(const RvProg *P, const char *out_path);

static int rv32_layout(const char *text, size_t len, RvProg *P)
{
	FILE *f;
	int64_t *data_at;
	Out data = { 0 };
	RReloc *drelocs = NULL;
	int ndrelocs = 0, drelocs_cap = 0;
	memset(P, 0, sizeof *P);
	if (getenv("CJI_RV32_ROOTCHECK") && !strcmp(getenv("CJI_RV32_ROOTCHECK"), "0"))
		rootstack_check = 0;   /* (CJI-4: only to measure what the check costs) */
	aot = 1;   /* (static_string, static_shape and static_closure only name symbols) */
	{
		char es[] = "[\"message\",\"name\"], error";
		static_shape(es);
		P->error_shape_sym = aot_sym(SYM_SHAPE, "[\"message\",\"name\"], error");
	}
	if (snap_words > 0)   /* CJI-4: a snapshot the host's slas took: only the functions it reaches (chapter 27) */
		text = prune_text(text, &len, 1);
	else if (next_keys)
		text = prune_text(text, &len, 0);   /* (chapter 28: without the shared unit's functions) */
	if (!(f = fmemopen((void *)text, len, "r")))
		die("fmemopen failed");
	nfns = 0;
	if (slas_load(f, 0, NULL))
		return 2;
	fclose(f);
	if (rv32_module)
		rv32_module_syms();   /* (the names the module's thunks reach through the table) */
	P->code = code;
	P->ncode = code_size;
	P->ntable = naot_syms;
	/* CJI-4: the snapshot's names become symbols (a shape's names are parsed as the code's are), as in
	   slas_aot; they are data only, so they come after the table's words */
	for (int r = 0; r < nsnap_refs; r++) {
		SnapRef *x = &snap_refs[r];
		if (x->kind == SYM_SHAPE) {
			char *t = malloc(strlen(x->text) + 1);
			if (!t)
				die("out of memory");
			strcpy(t, x->text);
			static_shape(t);
			free(t);
		}
		if (x->kind >= 0)
			x->sym = aot_sym(x->kind, x->text);
	}
	/* (CJI-3: a static closure of a shared function made here points at the shared unit's symbol) */
	for (int i = 0, n0 = naot_syms; i < n0; i++)
		if (aot_syms[i].kind == SYM_CLOSURE && !aot_syms[i].ext && ext_arity(aot_syms[i].text) >= 0)
			aot_sym(SYM_FUNC, aot_syms[i].text);
	/* .data: strings, then shapes (whose names point to strings), then static closures, as for x86 */
	data_at = calloc((size_t)naot_syms + 1, sizeof *data_at);
	if (!data_at)
		die("out of memory");
	for (int pass = 0; pass < 3; pass++)
		for (int i = 0; i < naot_syms; i++) {
			AotSym *y = &aot_syms[i];
			if (y->ext)
				continue;
			if (pass == 0 && y->kind == SYM_STRING) {
				uint16_t *u = malloc((strlen(y->text) + 1) * sizeof *u);
				int64_t sn, *obj, words;
				char *t = malloc(strlen(y->text) + 1);
				if (!u || !t)
					die("out of memory");
				strcpy(t, y->text);
				json_string(t, u, &sn);
				obj = (int64_t *)rt_static_string(u, sn);
				words = obj[0] >> 3;
				out_align(&data, 8);
				data_at[i] = (int64_t)data.n;
				out_put(&data, obj, (size_t)(words + 1) * 8);
				free(u); free(t); free(obj);
			} else if (pass == 1 && y->kind == SYM_SHAPE) {
				int64_t w = y->nnames, zero = 0;
				out_align(&data, 8);
				data_at[i] = (int64_t)data.n;
				out_put(&data, &w, 8);
				for (int k = 0; k < y->nnames; k++) {
					drelocs = grow(drelocs, &drelocs_cap, ndrelocs, sizeof *drelocs);
					drelocs[ndrelocs].offset = data.n;
					if (aot_syms[y->names[k]].ext) {
						drelocs[ndrelocs].sym = y->names[k];
						drelocs[ndrelocs++].addend = 0;
					} else {
						drelocs[ndrelocs].sym = -2;
						drelocs[ndrelocs++].addend = data_at[y->names[k]];
					}
					out_put(&data, &zero, 8);
				}
				w = y->error == 1;
				out_put(&data, &w, 8);
			} else if (pass == 2 && y->kind == SYM_CLOSURE) {
				int k = 0;
				int64_t head, zero = 0;
				while (k < nfns && strcmp(fns[k].name, y->text))
					k++;
				if (k == nfns && ext_arity(y->text) >= 0) {
					/* (CJI-3: the shared unit has the function but makes no static closure of it, so
					   this world makes its own, the only one it holds, pointing at the unit's code) */
					head = 1 * 8 + 2 * 2 + 1 + ((int64_t)(ext_arity(y->text) - 1) << 46);
					out_align(&data, 8);
					data_at[i] = (int64_t)data.n;
					out_put(&data, &head, 8);
					drelocs = grow(drelocs, &drelocs_cap, ndrelocs, sizeof *drelocs);
					drelocs[ndrelocs].offset = data.n;
					drelocs[ndrelocs].sym = aot_sym(SYM_FUNC, y->text);
					drelocs[ndrelocs++].addend = 0;
					out_put(&data, &zero, 8);
					continue;
				}
				if (k == nfns)
					die(is_extern('f', y->text) ? "closure of the shared function %s: the shared unit must make it"
						: "closure of undefined function %s", y->text);
				head = 1 * 8 + 2 * 2 + 1 + ((int64_t)(fns[k].nparams - 1) << 46);
				out_align(&data, 8);
				data_at[i] = (int64_t)data.n;
				out_put(&data, &head, 8);
				drelocs = grow(drelocs, &drelocs_cap, ndrelocs, sizeof *drelocs);
				drelocs[ndrelocs].offset = data.n;
				drelocs[ndrelocs].sym = -1;
				drelocs[ndrelocs++].addend = (int64_t)(fns[k].addr - (sljit_uw)code);
				out_put(&data, &zero, 8);
			}
		}
	/* chapter 27's export, cji_snapshot: [words, entry 0, entry 1, the block, its map], or [0, 0, 0].
	   CJI-4: the block the host's slas took (--snapshot); its names become relocations, as in slas_aot. */
	out_align(&data, 8);
	P->snap_at = data.n;
	{
		int64_t head[3] = { snap_words > 0 ? snap_words : 0, snap_entries[0], snap_entries[1] }, base;
		out_put(&data, head, sizeof head);
		if (snap_words > 0) {
			base = (int64_t)data.n;
			for (int r = 0; r < nsnap_refs; r++) {
				SnapRef *x = &snap_refs[r];
				drelocs = grow(drelocs, &drelocs_cap, ndrelocs, sizeof *drelocs);
				drelocs[ndrelocs].offset = (size_t)(base + x->at * 8);
				if (x->kind == -1 && is_extern('f', x->text)) {   /* (chapter 28: the shared unit's code) */
					drelocs[ndrelocs].sym = aot_sym(SYM_FUNC, x->text);
					drelocs[ndrelocs++].addend = 0;
				} else if (x->kind == -1) {
					int k = 0;
					while (k < nfns && strcmp(fns[k].name, x->text))
						k++;
					if (k == nfns)
						die("snapshot: no function %s", x->text);
					drelocs[ndrelocs].sym = -1;   /* .text */
					drelocs[ndrelocs++].addend = (int64_t)(fns[k].addr - (sljit_uw)code);
				} else if (aot_syms[x->sym].ext) {
					drelocs[ndrelocs].sym = x->sym;
					drelocs[ndrelocs++].addend = 0;
				} else {
					drelocs[ndrelocs].sym = -2;   /* .data */
					drelocs[ndrelocs++].addend = data_at[x->sym];
				}
				snap_image[x->at] = 0;
			}
			out_put(&data, snap_image, (size_t)snap_words * 8);
			out_put(&data, snap_map, (size_t)((snap_words + 63) / 64 + 1) * 8);
		}
	}
	P->data = data;
	P->drelocs = drelocs;
	P->ndrelocs = ndrelocs;
	P->drelocs_cap = drelocs_cap;
	P->data_at = data_at;
	return 0;
}

static int rv32_aot(const char *text, size_t len, const char *out_path)
{
	unsigned char *a;
	sljit_uw na, table_at;
	Out textsec = { 0 }, data, symtab = { 0 }, strtab = { 0 }, shstr = { 0 }, file = { 0 }, rela = { 0 }, drela = { 0 };
	RReloc *relocs = NULL, *drelocs;
	int nrelocs = 0, relocs_cap = 0, ndrelocs, error_shape_sym, *elf_sym, nsyms = 3, nlocals = 3;
	int64_t *data_at;
	size_t snap_at_rv;
	RvProg P;
	int r = rv32_layout(text, len, &P);
	if (r)
		return r;
	if (rv32_module)
		return rv32_write_module(&P, out_path);
	a = P.code;
	na = P.ncode;
	data = P.data;
	drelocs = P.drelocs;
	ndrelocs = P.ndrelocs;
	data_at = P.data_at;
	error_shape_sym = P.error_shape_sym;
	snap_at_rv = P.snap_at;
	/* .text: the code, then the table (4-byte aligned), one word per symbol */
	out_put(&textsec, a, na);
	out_align(&textsec, 4);
	table_at = textsec.n;
	for (int i = 0; i < P.ntable; i++) {
		uint32_t zero = 0;
		relocs = grow(relocs, &relocs_cap, nrelocs, sizeof *relocs);
		relocs[nrelocs].offset = textsec.n;
		relocs[nrelocs].sym = i;
		relocs[nrelocs++].addend = 0;
		out_put(&textsec, &zero, 4);
	}
	/* each function's auipc/addi: the table's distance from it */
	for (int i = 0; i < ntb_sites; i++) {
		size_t at = tb_sites[i].addr - (sljit_uw)a;
		int32_t off = (int32_t)(table_at - at), hi = (off + 0x800) & ~0xfff, lo = off - hi;
		uint32_t ins;
		memcpy(&ins, textsec.d + at, 4);
		ins = (ins & 0xfff) | (uint32_t)hi;
		memcpy(textsec.d + at, &ins, 4);
		memcpy(&ins, textsec.d + at + 4, 4);
		ins = (ins & 0xfffff) | (uint32_t)lo << 20;
		memcpy(textsec.d + at + 4, &ins, 4);
	}
	/* .symtab: null, .text, .data, the exports, then the undefined symbols */
	if (!(elf_sym = calloc((size_t)naot_syms + 1, sizeof *elf_sym)))
		die("out of memory");
	out_str(&strtab, "");
	{
		Elf32_Sym z = { 0 }, sec = { 0 };
		out_put(&symtab, &z, sizeof z);
		sec.st_info = ELF32_ST_INFO(STB_LOCAL, STT_SECTION);
		sec.st_shndx = 1;
		out_put(&symtab, &sec, sizeof sec);
		sec.st_shndx = 2;
		out_put(&symtab, &sec, sizeof sec);
	}
	if (getenv("CJI_RV32_SYMS"))   /* for llvm-objdump and the emulator's traces: every function, local */
		for (int k = 0; k < nfns; k++) {
			Elf32_Sym e = { 0 };
			e.st_name = out_str(&strtab, fns[k].name);
			e.st_info = ELF32_ST_INFO(STB_LOCAL, STT_FUNC);
			e.st_shndx = 1;
			e.st_value = (Elf32_Addr)(fns[k].addr - (sljit_uw)a);
			out_put(&symtab, &e, sizeof e);
			nsyms++, nlocals++;
		}
	for (int k = 0; k < nfns; k++) {
		char name[80];
		Elf32_Sym e = { 0 };
		if (lib_mode) {
			AotSym fsym = { 0 };
			fsym.kind = SYM_FUNC;
			fsym.text = fns[k].name;
			sym_name(name, sizeof name, &fsym);
		} else if (!strcmp(fns[k].name, "main"))
			strcpy(name, "cji_main");
		else if (!strncmp(fns[k].name, "$nw", 3)) {
			snprintf(name, sizeof name, "cji_%s", fns[k].name + 1);
			name[strcspn(name, ".")] = '\0';
		} else
			continue;
		e.st_name = out_str(&strtab, name);
		e.st_info = ELF32_ST_INFO(STB_GLOBAL, STT_FUNC);
		e.st_shndx = 1;
		e.st_value = (Elf32_Addr)(fns[k].addr - (sljit_uw)a);
		out_put(&symtab, &e, sizeof e);
		nsyms++;
	}
	if (!lib_mode) {
		Elf32_Sym e = { 0 };
		e.st_name = out_str(&strtab, "cji_snapshot");
		e.st_info = ELF32_ST_INFO(STB_GLOBAL, STT_OBJECT);
		e.st_shndx = 2;
		e.st_value = (Elf32_Addr)snap_at_rv;
		out_put(&symtab, &e, sizeof e);
		nsyms++;
	}
	if (!aot_syms[error_shape_sym].ext) {
		Elf32_Sym e = { 0 };
		e.st_name = out_str(&strtab, "cji_error_shape");
		e.st_info = ELF32_ST_INFO(STB_GLOBAL, STT_OBJECT);
		e.st_shndx = 2;
		e.st_value = (Elf32_Addr)data_at[error_shape_sym];
		e.st_size = 32;
		out_put(&symtab, &e, sizeof e);
		nsyms++;
	}
	for (int i = 0; lib_mode && i < naot_syms; i++)
		if (!aot_syms[i].ext && (aot_syms[i].kind == SYM_STRING || aot_syms[i].kind == SYM_SHAPE || aot_syms[i].kind == SYM_CLOSURE)) {
			char name[80];
			Elf32_Sym e = { 0 };
			sym_name(name, sizeof name, &aot_syms[i]);
			e.st_name = out_str(&strtab, name);
			e.st_info = ELF32_ST_INFO(STB_GLOBAL, STT_OBJECT);
			e.st_shndx = 2;
			e.st_value = (Elf32_Addr)data_at[i];
			out_put(&symtab, &e, sizeof e);
			nsyms++;
		}
	for (int i = 0; i < naot_syms; i++)
		if (by_symbol(&aot_syms[i]) || aot_syms[i].kind == SYM_EXT) {
			char name[80];
			Elf32_Sym e = { 0 };
			if (aot_syms[i].kind == SYM_EXT)
				snprintf(name, sizeof name, "%s", aot_syms[i].text);
			else
				sym_name(name, sizeof name, &aot_syms[i]);
			e.st_name = out_str(&strtab, name);
			e.st_info = ELF32_ST_INFO(STB_GLOBAL, STT_NOTYPE);
			e.st_shndx = SHN_UNDEF;
			out_put(&symtab, &e, sizeof e);
			elf_sym[i] = nsyms++;
		}
	/* the relocations: the table's words, then .data's */
	for (int r = 0; r < nrelocs; r++) {
		Elf32_Rela e;
		AotSym *y = &aot_syms[relocs[r].sym];
		int i = relocs[r].sym;
		e.r_offset = (Elf32_Addr)relocs[r].offset;
		if (by_symbol(y) || y->kind == SYM_EXT)
			e.r_info = ELF32_R_INFO(elf_sym[i], R_RISCV_32_), e.r_addend = 0;
		else if (y->kind == SYM_CODE) {
			int k = 0;
			while (k < nfns && strcmp(fns[k].name, y->text))
				k++;
			if (k == nfns)
				die("funref of undefined function %s", y->text);
			e.r_info = ELF32_R_INFO(1, R_RISCV_32_), e.r_addend = (Elf32_Sword)(fns[k].addr - (sljit_uw)a);
		} else
			e.r_info = ELF32_R_INFO(2, R_RISCV_32_), e.r_addend = (Elf32_Sword)data_at[i];
		out_put(&rela, &e, sizeof e);
	}
	for (int r = 0; r < ndrelocs; r++) {
		Elf32_Rela e;
		e.r_offset = (Elf32_Addr)drelocs[r].offset;
		e.r_info = ELF32_R_INFO(drelocs[r].sym >= 0 ? elf_sym[drelocs[r].sym] : drelocs[r].sym == -1 ? 1 : 2, R_RISCV_32_);
		e.r_addend = (Elf32_Sword)drelocs[r].addend;
		out_put(&drela, &e, sizeof e);
	}
	/* the file */
	{
		Elf32_Ehdr h = { 0 };
		Elf32_Shdr sh[9] = { { 0 } };
		const char *names[] = { "", ".text", ".data", ".rela.text", ".rela.data", ".symtab", ".strtab", ".shstrtab", ".note.GNU-stack" };
		Elf32_Word nm[9];
		size_t off[9] = { 0 };
		for (int k = 0; k < 9; k++)
			nm[k] = out_str(&shstr, names[k]);
		out_put(&file, &h, sizeof h);
#define SEC(k, buf, al) do { out_align(&file, al); off[k] = file.n; out_put(&file, (buf).d ? (buf).d : (unsigned char *)"", (buf).n); } while (0)
		SEC(1, textsec, 16);
		SEC(2, data, 8);
		SEC(3, rela, 4);
		SEC(4, drela, 4);
		SEC(5, symtab, 4);
		SEC(6, strtab, 1);
		SEC(7, shstr, 1);
		out_align(&file, 4);
		h.e_shoff = (Elf32_Off)file.n;
		sh[1] = (Elf32_Shdr){ nm[1], SHT_PROGBITS, SHF_ALLOC | SHF_EXECINSTR | SHF_WRITE, 0, (Elf32_Off)off[1], (Elf32_Word)textsec.n, 0, 0, 16, 0 };
		sh[2] = (Elf32_Shdr){ nm[2], SHT_PROGBITS, SHF_ALLOC | SHF_WRITE, 0, (Elf32_Off)off[2], (Elf32_Word)data.n, 0, 0, 8, 0 };
		sh[3] = (Elf32_Shdr){ nm[3], SHT_RELA, SHF_INFO_LINK, 0, (Elf32_Off)off[3], (Elf32_Word)rela.n, 5, 1, 4, sizeof(Elf32_Rela) };
		sh[4] = (Elf32_Shdr){ nm[4], SHT_RELA, SHF_INFO_LINK, 0, (Elf32_Off)off[4], (Elf32_Word)drela.n, 5, 2, 4, sizeof(Elf32_Rela) };
		sh[5] = (Elf32_Shdr){ nm[5], SHT_SYMTAB, 0, 0, (Elf32_Off)off[5], (Elf32_Word)symtab.n, 6, (Elf32_Word)nlocals, 4, sizeof(Elf32_Sym) };
		sh[6] = (Elf32_Shdr){ nm[6], SHT_STRTAB, 0, 0, (Elf32_Off)off[6], (Elf32_Word)strtab.n, 0, 0, 1, 0 };
		sh[7] = (Elf32_Shdr){ nm[7], SHT_STRTAB, 0, 0, (Elf32_Off)off[7], (Elf32_Word)shstr.n, 0, 0, 1, 0 };
		sh[8] = (Elf32_Shdr){ nm[8], SHT_PROGBITS, 0, 0, (Elf32_Off)off[7], 0, 0, 0, 1, 0 };
		out_put(&file, sh, sizeof(Elf32_Shdr) * 9);
		memcpy(h.e_ident, ELFMAG, SELFMAG);
		h.e_ident[EI_CLASS] = ELFCLASS32;
		h.e_ident[EI_DATA] = ELFDATA2LSB;
		h.e_ident[EI_VERSION] = EV_CURRENT;
		h.e_type = ET_REL;
		h.e_machine = EM_RISCV;
		/* compressed instructions; and the board's ABI, ilp32f, which the board's loader checks for.
		   The code uses no floating-point register, and it passes no single float: a double goes in
		   integer registers under ilp32f as under ilp32, so the claim is true of this code. */
		h.e_flags = 0x1 /* EF_RISCV_RVC */ | 0x2 /* EF_RISCV_FLOAT_ABI_SINGLE */;
		h.e_version = EV_CURRENT;
		h.e_ehsize = sizeof h;
		h.e_shentsize = sizeof(Elf32_Shdr);
		h.e_shnum = 9;
		h.e_shstrndx = 7;
		memcpy(file.d, &h, sizeof h);
	}
	{
		FILE *o = fopen(out_path, "wb");
		if (!o || fwrite(file.d, 1, file.n, o) != file.n) {
			perror(out_path);
			return 2;
		}
		fclose(o);
	}
	if (lib_mode && lib_list) {   /* chapter 28: what the shared unit exports (CJI-4: as slas_aot writes it) */
		FILE *o = fopen(lib_list, "w");
		if (!o) {
			perror(lib_list);
			return 2;
		}
		for (int k = 0; k < nfns; k++)
			fprintf(o, "f %s\n", fns[k].name);
		for (int i = 0; i < naot_syms; i++)
			if (!aot_syms[i].ext && (aot_syms[i].kind == SYM_STRING || aot_syms[i].kind == SYM_SHAPE || aot_syms[i].kind == SYM_CLOSURE))
				fprintf(o, "%c %s\n", aot_syms[i].kind == SYM_STRING ? 's' : aot_syms[i].kind == SYM_SHAPE ? 'h' : 'c', aot_syms[i].text);
		fclose(o);
	}
	fprintf(stderr, "slas-rv32: %s: %lu bytes of code, a table of %d words, %lu of data, %d + %d relocations\n", out_path,
		(unsigned long)na, naot_syms, (unsigned long)data.n, nrelocs, ndrelocs);
	(void)rv32_main_fn;
	return 0;
}

#include "rv32_mod.c"   /* CJI-4 */
