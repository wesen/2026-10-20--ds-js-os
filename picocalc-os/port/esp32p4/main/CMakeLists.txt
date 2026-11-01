# The device build: the nucleus and QuickJS from the picocalc-os tree, the ESP32-P4 port, and the js/ tree
# compiled into a table (js_bundle.c) so the device reads the same files the host does.
set(OS ${CMAKE_CURRENT_LIST_DIR}/../../..)
set(QJS ${OS}/third_party/quickjs)
# WebAssembly worlds (nucleus/native_wasm.c): WAMR's fast interpreter from third_party/wamr, with the ESP-IDF platform
# layer and RISC-V calls into native functions; configured as for the host (see the Makefile), for RV32 with floats.
set(WAMR ${OS}/third_party/wamr/core)
set(WAMR_SRCS
    ${WAMR}/shared/platform/esp-idf/espidf_clock.c ${WAMR}/shared/platform/esp-idf/espidf_file.c
    ${WAMR}/shared/platform/esp-idf/espidf_malloc.c ${WAMR}/shared/platform/esp-idf/espidf_memmap.c
    ${WAMR}/shared/platform/esp-idf/espidf_platform.c ${WAMR}/shared/platform/esp-idf/espidf_socket.c
    ${WAMR}/shared/platform/esp-idf/espidf_thread.c ${WAMR}/shared/platform/common/libc-util/libc_errno.c
    ${WAMR}/shared/mem-alloc/mem_alloc.c ${WAMR}/shared/mem-alloc/ems/ems_alloc.c ${WAMR}/shared/mem-alloc/ems/ems_gc.c
    ${WAMR}/shared/mem-alloc/ems/ems_hmu.c ${WAMR}/shared/mem-alloc/ems/ems_kfc.c
    ${WAMR}/shared/utils/bh_assert.c ${WAMR}/shared/utils/bh_bitmap.c ${WAMR}/shared/utils/bh_common.c
    ${WAMR}/shared/utils/bh_hashmap.c ${WAMR}/shared/utils/bh_leb128.c ${WAMR}/shared/utils/bh_list.c
    ${WAMR}/shared/utils/bh_log.c ${WAMR}/shared/utils/bh_queue.c ${WAMR}/shared/utils/bh_vector.c
    ${WAMR}/shared/utils/runtime_timer.c
    ${WAMR}/iwasm/common/wasm_application.c ${WAMR}/iwasm/common/wasm_blocking_op.c ${WAMR}/iwasm/common/wasm_c_api.c
    ${WAMR}/iwasm/common/wasm_exec_env.c ${WAMR}/iwasm/common/wasm_loader_common.c ${WAMR}/iwasm/common/wasm_memory.c
    ${WAMR}/iwasm/common/wasm_native.c ${WAMR}/iwasm/common/wasm_runtime_common.c ${WAMR}/iwasm/common/wasm_shared_memory.c
    ${WAMR}/iwasm/interpreter/wasm_interp_fast.c ${WAMR}/iwasm/interpreter/wasm_loader.c ${WAMR}/iwasm/interpreter/wasm_runtime.c
    ${WAMR}/iwasm/common/arch/invokeNative_riscv.S)
set(WAMR_DEFS BH_PLATFORM_ESP_IDF BUILD_TARGET_RISCV32_ILP32F BH_MALLOC=wasm_runtime_malloc BH_FREE=wasm_runtime_free
    WASM_ENABLE_INTERP=1 WASM_ENABLE_FAST_INTERP=1 WASM_ENABLE_MINI_LOADER=0 WASM_ENABLE_BULK_MEMORY=1
    WASM_ENABLE_REF_TYPES=1 WASM_ENABLE_INSTRUCTION_METERING=1 WASM_ENABLE_SHRUNK_MEMORY=1 WASM_ENABLE_MULTI_MODULE=0
    WASM_ENABLE_SHARED_MEMORY=0 WASM_ENABLE_EXTENDED_CONST_EXPR=0 WASM_ENABLE_AOT_INTRINSICS=0 WASM_ENABLE_QUICK_AOT_ENTRY=0
    WASM_DISABLE_HW_BOUND_CHECK=1 WASM_DISABLE_STACK_HW_BOUND_CHECK=1 WASM_DISABLE_WAKEUP_BLOCKING_OP=1 NDEBUG)
set(WAMR_INCS ${WAMR}/iwasm/include ${WAMR}/iwasm/common ${WAMR}/iwasm/interpreter ${WAMR}/shared/utils
    ${WAMR}/shared/mem-alloc ${WAMR}/shared/platform/include ${WAMR}/shared/platform/esp-idf
    ${WAMR}/shared/platform/common/libc-util)
# IDF expands component requirements in an early CMake process that does not see arbitrary
# project cache options. Declare SDK requirements unconditionally; unused code is discarded.
# Only the separate optional/agent_wifi component downloads ESP-Hosted / Wi-Fi Remote.
set(AGENT_REQUIRES nvs_flash esp_http_client esp_netif esp_event esp_wifi mbedtls)

idf_component_register(
    SRCS
        "main_p4.c" "port_p4.c" "bus_p4.c" "agent_p4.c" "store_p4.c" "fs_p4.c" "perf_p4.c"
        "${OS}/nucleus/kernel.c" "${OS}/nucleus/vm.c" "${OS}/nucleus/hw.c" "${OS}/nucleus/gfx.c" "${OS}/nucleus/util.c" "${OS}/nucleus/fs.c" "${OS}/nucleus/native.c"
        "${OS}/nucleus/native_wasm.c"
        "${QJS}/quickjs.c" "${QJS}/libregexp.c" "${QJS}/libunicode.c" "${QJS}/cutils.c" "${QJS}/dtoa.c"
        ${WAMR_SRCS}
    INCLUDE_DIRS "." "${OS}/nucleus" "${QJS}"
    PRIV_INCLUDE_DIRS "${WAMR}/iwasm/include"
    PRIV_REQUIRES driver esp_driver_gpio esp_driver_i2c esp_driver_spi esp_driver_uart esp_psram esp_timer heap fatfs wear_levelling vfs lwip pthread ${AGENT_REQUIRES}
)
set_source_files_properties(${OS}/nucleus/native_wasm.c PROPERTIES COMPILE_DEFINITIONS "NUCLEUS_WASM=1")
set_source_files_properties(${WAMR_SRCS} PROPERTIES
    COMPILE_DEFINITIONS "${WAMR_DEFS}" INCLUDE_DIRECTORIES "${WAMR_INCS}" COMPILE_OPTIONS "-w")
if(PICOCALC_AGENT_WIFI)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_AGENT_WIFI=1)
endif()
# Machine-code native worlds (optional/native_elf): the modules its manifest names, built from natives/ with
# sdk/nw_elf.c as position-independent shared objects, then bundled with js/ under the names the manifest uses.
set(BUNDLE_EXTRA "")
set(BUNDLE_EXTRA_DEPS "")
if(PICOCALC_NATIVE_ELF)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_NATIVE_ELF=1)
    set(ELF_DIR ${OS}/port/esp32p4/optional/native_elf)
    set(ELF_FLAGS -march=rv32imafc_zicsr_zifencei -mabi=ilp32f -Os -fPIC -shared -nostartfiles -nostdlib -e app_main
        -ffunction-sections -fdata-sections -Wl,--gc-sections -fvisibility=hidden -Wl,--strip-all
        -Wl,-z,max-page-size=16 -Wno-attributes -I${OS}/sdk)   # 16: no 4 KB of padding between code and data, which the loader would allocate
    string(REPLACE "-elf-gcc" "-elf-strip" ELF_STRIP ${CMAKE_C_COMPILER})
    list(APPEND BUNDLE_EXTRA "system.elf.json=${ELF_DIR}/system.elf.json")
    list(APPEND BUNDLE_EXTRA_DEPS ${ELF_DIR}/system.elf.json)
    foreach(m echo bench wimport)   # wimport links to a function no module is given (-Wno-attributes: its WebAssembly import attribute)
        set(out ${CMAKE_CURRENT_BINARY_DIR}/natives/${m}.elf)
        add_custom_command(
            OUTPUT ${out}
            COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_CURRENT_BINARY_DIR}/natives
            COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} -o ${out} ${OS}/natives/${m}.c ${OS}/sdk/nw_elf.c
            COMMAND ${ELF_STRIP} --strip-unneeded --remove-section=.comment --remove-section=.riscv.attributes ${out}
            DEPENDS ${OS}/natives/${m}.c ${OS}/sdk/nw_elf.c ${OS}/sdk/nw_elf.h ${OS}/sdk/nw.h ${OS}/sdk/nw_calls.inc ${OS}/sdk/nw_json.h
            VERBATIM)
        list(APPEND BUNDLE_EXTRA "natives/${m}.elf=${out}")
        list(APPEND BUNDLE_EXTRA_DEPS ${out})
    endforeach()
endif()

file(READ ${QJS}/VERSION QJS_VERSION)
string(STRIP "${QJS_VERSION}" QJS_VERSION)
target_compile_definitions(${COMPONENT_LIB} PRIVATE CONFIG_VERSION="${QJS_VERSION}")
target_compile_options(${COMPONENT_LIB} PRIVATE -Wno-unused-parameter -Wno-format-truncation
    "$<$<COMPILE_LANGUAGE:C>:-include;${CMAKE_CURRENT_LIST_DIR}/p4_compat.h>")   # C only: WAMR's RISC-V assembly is preprocessed too
set_source_files_properties(
    ${QJS}/quickjs.c ${QJS}/libregexp.c ${QJS}/libunicode.c ${QJS}/cutils.c ${QJS}/dtoa.c
    # -Wno-error=incompatible-pointer-types: upstream mixes int and int32_t (long on RISC-V newlib).
    # -fwrapv: upstream's own Makefile sets it. -fno-strict-aliasing: at -O2, GCC 14 for RISC-V miscompiles
    # QuickJS's 32-bit NaN-boxed values without it (a JS string pointer read back as 0x9017be00, the
    # compositor's first paint crashed every boot); -Og and -O2 -fno-strict-aliasing both run clean.
    PROPERTIES COMPILE_OPTIONS "-w;-Wno-error=incompatible-pointer-types;-fwrapv;-fno-strict-aliasing")

file(GLOB_RECURSE JS_FILES CONFIGURE_DEPENDS ${OS}/js/*.js ${OS}/js/*.json ${OS}/js/*.wasm)
set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)
add_custom_command(
    OUTPUT ${BUNDLE}
    COMMAND ${CMAKE_COMMAND} -DJS_ROOT=${OS}/js "-DEXTRA=${BUNDLE_EXTRA}" -DOUT=${BUNDLE} -P ${CMAKE_CURRENT_LIST_DIR}/bundle_js.cmake
    DEPENDS ${JS_FILES} ${BUNDLE_EXTRA_DEPS} ${CMAKE_CURRENT_LIST_DIR}/bundle_js.cmake
    VERBATIM)
target_sources(${COMPONENT_LIB} PRIVATE ${BUNDLE})
