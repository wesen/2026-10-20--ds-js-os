idf_component_register(SRCS "main.c" "frag_fma.c" "frag_off.c" "typed.S" INCLUDE_DIRS ".")
# GCC -O2 (the app optimizes for performance) with its default contraction, and without it.
set_source_files_properties(frag_fma.c PROPERTIES COMPILE_OPTIONS "-O2;-fno-math-errno")
set_source_files_properties(frag_off.c PROPERTIES COMPILE_OPTIONS "-O2;-fno-math-errno;-ffp-contract=off")
