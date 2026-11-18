# Optional: native worlds as machine code (ELF modules) for trusted drivers, included before project() only when
# PICOCALC_NATIVE_ELF is on. The backend lives here, next to its dependency; main/CMakeLists.txt builds the modules
# this directory's system.elf.json names and bundles both with js/.
idf_component_register(SRCS "native_elf_p4.c"
                       PRIV_INCLUDE_DIRS "${CMAKE_CURRENT_LIST_DIR}/../../../../nucleus" "${CMAKE_CURRENT_LIST_DIR}/../../../../sdk"
                       REQUIRES elf_loader WHOLE_ARCHIVE)

# Build target objects first. Their defined symbols supply the relocation table.
set(runtime_dir ${CJI_ROOT}/runtime)
add_library(cji_runtime OBJECT ${runtime_dir}/runtime.c ${runtime_dir}/cji_elf.c)
target_include_directories(cji_runtime PRIVATE ${CMAKE_CURRENT_LIST_DIR}/../../../../sdk)
target_compile_options(cji_runtime PRIVATE -march=rv32imafc_zicsr_zifencei -mabi=ilp32f
    -Os -fno-strict-aliasing -fwrapv -Wno-pointer-to-int-cast -Wno-int-to-pointer-cast)
target_compile_definitions(cji_runtime PRIVATE ESP_PLATFORM)
set(table ${CMAKE_CURRENT_BINARY_DIR}/cji_symbols.c)
add_custom_command(OUTPUT ${table}
    COMMAND node ${CJI_ROOT}/tools/rv32/resolve-table.mjs --name cji_resolve
            --cji $<TARGET_OBJECTS:cji_runtime> > ${table}
    DEPENDS cji_runtime $<TARGET_OBJECTS:cji_runtime> ${CJI_ROOT}/tools/rv32/resolve-table.mjs
    COMMAND_EXPAND_LISTS VERBATIM)
target_sources(${COMPONENT_LIB} PRIVATE $<TARGET_OBJECTS:cji_runtime> ${table})
