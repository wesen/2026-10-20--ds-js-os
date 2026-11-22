/* crt-i386.S: the minimal i386 process entry that glibc's crt1.o would provide (sysdeps/i386/start.S,
   glibc >= 2.34, where init/fini are NULL). Used only because this host lacks libc6-dev-i386; see build.sh. */
	.text
	.globl _start
	.type _start, @function
_start:
	xorl %ebp, %ebp
	popl %esi            /* argc */
	movl %esp, %ecx      /* argv */
	andl $-16, %esp
	pushl %eax           /* padding so the 7 arguments keep the stack 16-byte aligned */
	pushl %esp           /* stack_end */
	pushl %edx           /* rtld_fini from the dynamic linker */
	pushl $0             /* fini */
	pushl $0             /* init */
	pushl %ecx           /* argv */
	pushl %esi           /* argc */
	pushl $main
	call __libc_start_main
	hlt
	.section .note.GNU-stack,"",@progbits
