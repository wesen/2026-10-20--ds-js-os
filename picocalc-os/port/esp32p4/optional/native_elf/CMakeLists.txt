# Optional: native worlds as machine code (ELF modules) for trusted drivers, included before project() only when
# PICOCALC_NATIVE_ELF is on. The backend lives here, next to its dependency; main/CMakeLists.txt builds the modules
# this directory's system.elf.json names and bundles both with js/.
idf_component_register(SRCS "native_elf_p4.c"
                       PRIV_INCLUDE_DIRS "${CMAKE_CURRENT_LIST_DIR}/../../../../nucleus" "${CMAKE_CURRENT_LIST_DIR}/../../../../sdk"
                       REQUIRES elf_loader WHOLE_ARCHIVE)
