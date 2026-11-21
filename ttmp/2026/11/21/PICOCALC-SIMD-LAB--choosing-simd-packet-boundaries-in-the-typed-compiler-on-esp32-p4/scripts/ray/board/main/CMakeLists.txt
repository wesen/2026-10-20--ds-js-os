file(GLOB src_files "*.c" "*.S")
idf_component_register(SRCS ${src_files} INCLUDE_DIRS ".")
target_compile_options(${COMPONENT_LIB} PRIVATE -O3)
