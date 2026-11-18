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
set(host_tools ${CJI_BUILD})
file(MAKE_DIRECTORY ${host_tools})
file(CREATE_LINK ${CJI_ROOT}/runtime ${host_tools}/runtime SYMBOLIC)
file(CREATE_LINK ${CJI_ROOT}/Makefile ${host_tools}/Makefile SYMBOLIC)
file(GLOB_RECURSE cji_assembler CONFIGURE_DEPENDS ${CJI_ROOT}/runtime/*.c ${CJI_ROOT}/runtime/*.h)
file(GLOB cji_frontend CONFIGURE_DEPENDS ${CJI_ROOT}/src/*.js)
add_custom_command(OUTPUT ${host_tools}/slas-rv32
    COMMAND make -C ${host_tools} CC=cc slas-rv32
    DEPENDS ${CJI_ROOT}/Makefile ${cji_assembler} VERBATIM)
add_custom_command(OUTPUT ${CJI_BUILD}/unit.o ${CJI_BUILD}/unit.list ${CJI_BUILD}/prelude.slir
    COMMAND node ${CJI_ROOT}/cji.js - --prelude-unit --emit > ${CJI_BUILD}/prelude.slir
    COMMAND node ${CJI_ROOT}/tools/rv32/unit.mjs slir ${CJI_BUILD}/prelude.slir > ${CJI_BUILD}/unit.slir
    COMMAND ${host_tools}/slas-rv32 -c ${CJI_BUILD}/unit.o --lib ${CJI_BUILD}/unit.list ${CJI_BUILD}/unit.slir
    DEPENDS ${host_tools}/slas-rv32 ${CJI_ROOT}/cji.js ${cji_frontend}
            ${CJI_ROOT}/tools/rv32/unit.mjs ${CJI_ROOT}/tools/link-units.mjs VERBATIM)
add_custom_target(cji_unit DEPENDS ${CJI_BUILD}/unit.o ${CJI_BUILD}/unit.list)
set(table ${CMAKE_CURRENT_BINARY_DIR}/cji_symbols.c)
add_custom_command(OUTPUT ${table}
    COMMAND node ${CJI_ROOT}/tools/rv32/resolve-table.mjs --name cji_resolve
            --cji $<TARGET_OBJECTS:cji_runtime> ${CJI_BUILD}/unit.o > ${table}
    DEPENDS cji_runtime ${CJI_BUILD}/unit.o $<TARGET_OBJECTS:cji_runtime> ${CJI_ROOT}/tools/rv32/resolve-table.mjs
    COMMAND_EXPAND_LISTS VERBATIM)
target_sources(${COMPONENT_LIB} PRIVATE $<TARGET_OBJECTS:cji_runtime> ${CJI_BUILD}/unit.o ${table})
