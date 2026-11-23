# The Typed apps a profile lists (PICOCALC_APPS), compiled to RV32 on the handheld: the compiler's sources, and for
# each app (apps/typed/NAME/app.json) its assembled sources, linker, reactor ELF and C host, through one path in
# typed_p4.c. typed_apps.py reads the manifests at configure time and writes typed-apps.cmake (included below),
# typed_apps.c (the table typed_p4.c compiles from) and system.typed.json (the boot manifest) into the build
# directory. Needs ELF_FLAGS from native-elf.cmake and typed_manifest (the manifest the apps change).

# The compiler the firmware runs, bundled under the names typed_p4.c evaluates.
set(TYPED_COMPILER
    # tape.js defines the tape that typed-wasm.js writes and typed-rv32.js reads; typed_p4.c evaluates it first.
    "typed/tape.js=${REPO}/compiler/typed/tape.js"
    "typed/wasm.js=${REPO}/compiler/typed/typed-wasm.js"
    "typed/rv32.js=${REPO}/compiler/typed/typed-rv32.js"
    # The RV32 pass groups: typed_p4.c's typedRv32Load evaluates one when a compile's policy needs it.
    "typed/rv32-inline.js=${REPO}/compiler/typed/typed-rv32-inline.js"
    "typed/rv32-loops.js=${REPO}/compiler/typed/typed-rv32-loops.js")

# A reactor or slot ELF: built from the manifest's sources with the native-world flags, then bundled.
function(typed_reactor published)
    cmake_parse_arguments(R "" "" "DEFINES;SOURCES" ${ARGN})
    string(REPLACE "/" "-" stem "${published}")
    set(output "${CMAKE_CURRENT_BINARY_DIR}/typed-apps/${stem}")
    set(flags)
    foreach(d IN LISTS R_DEFINES)
        list(APPEND flags "-D${d}")
    endforeach()
    file(GLOB headers CONFIGURE_DEPENDS ${OS}/sdk/*.h ${OS}/sdk/*.inc ${OS}/sdk/typed/*.h)
    set(dirs)
    foreach(s IN LISTS R_SOURCES)
        get_filename_component(d "${s}" DIRECTORY)
        list(APPEND dirs "${d}")
    endforeach()
    list(REMOVE_DUPLICATES dirs)
    foreach(d IN LISTS dirs)
        file(GLOB local CONFIGURE_DEPENDS ${d}/*.h)
        list(APPEND headers ${local})
    endforeach()
    add_custom_command(OUTPUT "${output}"
        COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/typed-apps"
        COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} ${flags} -o "${output}" ${R_SOURCES}
        DEPENDS ${R_SOURCES} ${headers} ${QJS}/cutils.h ${QJS}/libunicode.h ${QJS}/libunicode-table.h
        VERBATIM)
    set(BUNDLE_EXTRA ${BUNDLE_EXTRA} "${published}=${output}" PARENT_SCOPE)
    set(BUNDLE_EXTRA_DEPS ${BUNDLE_EXTRA_DEPS} "${output}" PARENT_SCOPE)
endfunction()

set(typed_out "${CMAKE_CURRENT_BINARY_DIR}/typed-apps")
set(typed_base "${typed_out}/system.base.json")
file(CONFIGURE OUTPUT "${typed_base}" CONTENT "${typed_manifest}" @ONLY)
set(typed_append)
if(PICOCALC_CANDELA_WORLD)
    list(APPEND typed_append --append ${REPO}/apps/js/worlds/candela-world/manifest.json)
endif()
if(PICOCALC_CANDELA_GALLERY)
    list(APPEND typed_append --append ${REPO}/apps/js/worlds/candela-gallery/manifest.json)
endif()
execute_process(
    COMMAND ${PYTHON} ${CMAKE_CURRENT_LIST_DIR}/../typed_apps.py ${REPO} ${typed_out}
            --apps "${PICOCALC_APPS}" --manifest ${typed_base} ${typed_append}
    COMMAND_ERROR_IS_FATAL ANY)
include(${typed_out}/typed-apps.cmake)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${TYPED_APPS_INPUTS})

target_sources(${COMPONENT_LIB} PRIVATE typed_p4.c typed_lex_index.c typed_cache.c typed_cache_p4.c
               ${typed_out}/typed_apps.c ${TYPED_APPS_HOST_SOURCES})
# The compiled-module cache's key covers the compiler's C side too (PICOCALC-COMPILE-CACHE): the native tokenizer, the
# code that calls the compiler, and the engine it runs on. Their digest is taken at configure time, and each file is a
# configure dependency, so an edit to one of them reconfigures and changes the key.
set(typed_native_files ${MAIN}/typed_lex_index.c ${MAIN}/typed_lex_index.h ${MAIN}/typed_p4.c
    ${QJS}/quickjs.c ${QJS}/quickjs.h ${QJS}/dtoa.c ${QJS}/libregexp.c ${QJS}/libunicode.c ${QJS}/cutils.c)
set(typed_native "")
set(normalized)
foreach(f IN LISTS typed_native_files)
    get_filename_component(f "${f}" ABSOLUTE)   # ../ collapsed, as Ninja names them
    list(APPEND normalized "${f}")
endforeach()
set(typed_native_files ${normalized})
foreach(f IN LISTS typed_native_files)
    file(SHA256 "${f}" digest)
    string(APPEND typed_native "${digest}\n")
endforeach()
string(SHA256 typed_native "${typed_native}")
string(SUBSTRING "${typed_native}" 0 16 typed_native)
list(REMOVE_ITEM typed_native_files ${TYPED_APPS_INPUTS})   # a reactor's source already is one (Ninja: one rule each)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${typed_native_files})
set_source_files_properties(typed_cache_p4.c PROPERTIES COMPILE_DEFINITIONS "TYPED_NATIVE_SHA=\"${typed_native}\"")
target_include_directories(${COMPONENT_LIB} PRIVATE ${TYPED_APPS_HOST_INCLUDES})
target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_TYPED_APPS=1 ${TYPED_APPS_HOST_DEFINES})
target_link_libraries(${COMPONENT_LIB} PRIVATE idf::espressif__elf_loader)
list(APPEND BUNDLE_EXTRA ${TYPED_COMPILER} ${TYPED_APPS_BUNDLE} "system.typed.json=${typed_out}/system.typed.json")
foreach(entry IN LISTS TYPED_COMPILER TYPED_APPS_BUNDLE)
    string(REGEX REPLACE "^[^=]*=" "" path "${entry}")
    list(APPEND BUNDLE_EXTRA_DEPS "${path}")
endforeach()
list(APPEND BUNDLE_EXTRA_DEPS "${typed_out}/system.typed.json")
