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
        "${OS}/nucleus/agent_transport.c" "${OS}/nucleus/kernel.c" "${OS}/nucleus/vm.c" "${OS}/nucleus/hw.c" "${OS}/nucleus/gfx.c" "${OS}/nucleus/util.c" "${OS}/nucleus/fs.c" "${OS}/nucleus/native.c"
        "${OS}/nucleus/native_wasm.c"
        "${QJS}/quickjs.c" "${QJS}/libregexp.c" "${QJS}/libunicode.c" "${QJS}/cutils.c" "${QJS}/dtoa.c"
        ${WAMR_SRCS}
    INCLUDE_DIRS "." "${OS}/nucleus" "${QJS}"
    PRIV_INCLUDE_DIRS "${WAMR}/iwasm/include"
    PRIV_REQUIRES driver esp_driver_gpio esp_driver_i2c esp_driver_spi esp_driver_uart esp_psram esp_timer esp_mm heap fatfs wear_levelling vfs lwip pthread ${AGENT_REQUIRES}
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
    file(GLOB cji_frontend CONFIGURE_DEPENDS ${CJI_ROOT}/src/*.js)
    set(builtin_manifest ${CMAKE_CURRENT_BINARY_DIR}/system.cji.json)
    file(READ ${OS}/js/system.json system_json)
    string(JSON count LENGTH "${system_json}" worlds)
    math(EXPR last "${count} - 1")
    if(PICOCALC_TEST_CJI_PHASE3)
        set(phase3_dir ${OS}/tests/fixtures/cji-phase3)
        target_sources(${COMPONENT_LIB} PRIVATE ${phase3_dir}/transport.c ${phase3_dir}/pixels.c)
        target_link_options(${COMPONENT_LIB} INTERFACE "-Wl,--wrap=bus_run_spi_pixels" "-Wl,--wrap=bus_p4_done")
        foreach(fn configured mode api model start poll cancel)
            target_link_options(${COMPONENT_LIB} INTERFACE "-Wl,--wrap=port_agent_${fn}")
        endforeach()
        set(cji_input_fs-probe ${phase3_dir}/files.js)
        list(APPEND BUNDLE_EXTRA "tests/chat-fixture.js=${phase3_dir}/chat.js")
        list(APPEND BUNDLE_EXTRA_DEPS ${phase3_dir}/chat.js)
    endif()
    foreach(i RANGE ${last})
        string(JSON name GET "${system_json}" worlds ${i} name)
        if(name IN_LIST CJI_WORLDS)
            string(JSON file GET "${system_json}" worlds ${i} file)
            set(cji_input_${name} ${OS}/js/${file})
            string(JSON system_json SET "${system_json}" worlds ${i} engine "\"native\"")
            string(JSON system_json SET "${system_json}" worlds ${i} file "\"natives/${name}.elf\"")
        endif()
        if(PICOCALC_TEST_CJI_PHASE3)
            if(name STREQUAL "agent")
                string(JSON system_json SET "${system_json}" worlds ${i} name "\"agent-probe\"")
            elseif(name STREQUAL "chat")
                string(JSON system_json SET "${system_json}" worlds ${i} file "\"tests/chat-fixture.js\"")
            endif()
        endif()
    endforeach()
    if(PICOCALC_TEST_CJI_PHASE3)
        string(JSON system_json SET "${system_json}" worlds ${count}
            [[{"name":"fs-probe","file":"natives/fs-probe.elf","engine":"native","claims":["fs:/notes","dma","spi2","net.agent"],"mem_kb":1536,"budget_ms":200}]])
        math(EXPR count "${count} + 1")
    endif()
    if(PICOCALC_TEST_CJI_GRANTS)
        set(test_dir ${OS}/tests/fixtures/cji-grants)
        set(cji_input_grant-peer ${test_dir}/peer.js)
        string(JSON system_json SET "${system_json}" worlds ${count}
            [[{"name":"grant-peer","engine":"native","file":"natives/grant-peer.elf","mem_kb":320}]])
        math(EXPR next "${count} + 1")
        string(JSON system_json SET "${system_json}" worlds ${next}
            [[{"name":"grant-test","file":"tests/grant-test.js","claims":["dma"],"mem_kb":320}]])
        list(APPEND BUNDLE_EXTRA "tests/grant-test.js=${test_dir}/sender.js")
        list(APPEND BUNDLE_EXTRA_DEPS ${test_dir}/sender.js)
    endif()
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${OS}/js/system.json)
    if(PICOCALC_HEADLESS)
        target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_HEADLESS=1)
        # Remove in descending order so earlier indices remain valid. Keep the ELFs in the catalog.
        foreach(i RANGE ${last} 0 -1)
            string(JSON name GET "${system_json}" worlds ${i} name)
            if(name MATCHES "^(keyboard|display|power|compositor)$")
                string(JSON system_json REMOVE "${system_json}" worlds ${i})
            endif()
        endforeach()
    endif()
    file(GENERATE OUTPUT ${builtin_manifest} CONTENT "${system_json}\n")
    list(APPEND BUNDLE_EXTRA "system.cji.json=${builtin_manifest}")
    list(APPEND BUNDLE_EXTRA_DEPS ${builtin_manifest})
    if(PICOCALC_DEVICE_COMPILER)
        set(tool_dir ${CMAKE_CURRENT_LIST_DIR}/../compiler)
        set(tool_output ${CJI_BUILD}/tool/compiler.elf)
        file(GLOB_RECURSE tool_inputs CONFIGURE_DEPENDS ${tool_dir}/*.h ${CJI_ROOT}/runtime/*.h
             ${CJI_ROOT}/runtime/*.c ${CJI_ROOT}/tools/rv32/fw/include/*.h)
        add_custom_command(OUTPUT ${tool_output}.z
            COMMAND sh ${tool_dir}/build-tool.sh ${CJI_ROOT} ${CJI_BUILD}/tool $<IF:$<BOOL:${PICOCALC_COMPILER_PROFILE}>,ON,OFF>
            COMMAND ${PYTHON} ${CMAKE_CURRENT_LIST_DIR}/pack_elf.py ${tool_output} ${tool_output}.z
            DEPENDS ${tool_inputs} ${tool_dir}/tool.c ${tool_dir}/build-tool.sh ${cji_frontend} ${CJI_ROOT}/tools/bundle.mjs
                    ${CJI_ROOT}/tools/jstok.mjs ${CJI_ROOT}/runtime/runtime.c ${CJI_ROOT}/runtime/slas.c
                    ${CJI_ROOT}/tools/rv32/fw/libc.c ${CJI_ROOT}/tools/rv32/fw/softfloat.c
                    ${CJI_ROOT}/tools/rv32/fw/hostcalls.S ${CJI_ROOT}/tools/rv32/fw/board_exec.h
                    ${CJI_ROOT}/tools/rv32/unit.mjs ${CJI_ROOT}/cji.js ${CJI_ROOT}/Makefile
            VERBATIM)
        set(compiler_payload ${tool_output}.z)
        if(PICOCALC_PROFILE_TOOL)
            if(NOT PICOCALC_COMPILER_PROFILE OR NOT PICOCALC_HEADLESS)
                message(FATAL_ERROR "A benchmark compiler payload requires a headless profiling build")
            endif()
            set(compiler_payload "${PICOCALC_PROFILE_TOOL}")
        endif()
        list(APPEND BUNDLE_EXTRA "natives/compiler.elf=${compiler_payload}" "compiler/unit.list=${CJI_BUILD}/unit.list")
        list(APPEND BUNDLE_EXTRA_DEPS ${compiler_payload} ${CJI_BUILD}/unit.list)
        target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_DEVICE_COMPILER=1)
        if(PICOCALC_COMPILER_PROFILE)
            target_compile_definitions(${COMPONENT_LIB} PRIVATE CJI_PROFILE_GC=1)
        endif()
        target_link_libraries(${COMPONENT_LIB} PRIVATE idf::espressif__elf_loader idf::esp_app_format)
        target_sources(${COMPONENT_LIB} PRIVATE ${tool_dir}/install.c)
        target_include_directories(${COMPONENT_LIB} PRIVATE ${tool_dir})
    endif()
    set(cji_input_toplog ${CJI_ROOT}/tests/native/toplog.world.js)
    foreach(name IN LISTS CJI_WORLDS CJI_DIAGNOSTICS)
        set(module ${CMAKE_CURRENT_BINARY_DIR}/natives/${name}.elf)
        set(own ${CMAKE_CURRENT_BINARY_DIR}/${name}.own.slir)
        set(linked ${CMAKE_CURRENT_BINARY_DIR}/${name}.slir)
        add_custom_command(OUTPUT ${module}
            COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_CURRENT_BINARY_DIR}/natives
            COMMAND node ${CJI_ROOT}/cji.js ${cji_input_${name}} --world-unit --emit > ${own}
            COMMAND node ${CJI_ROOT}/tools/link-units.mjs ${CJI_BUILD}/prelude.slir ${own} > ${linked}
            COMMAND ${CJI_BUILD}/slas-rv32 -c ${module} --module --extern ${CJI_BUILD}/unit.list ${linked}
            DEPENDS cji_unit ${CJI_BUILD}/unit.list ${cji_input_${name}} ${CJI_ROOT}/cji.js
                    ${CJI_ROOT}/tools/link-units.mjs ${cji_frontend} VERBATIM)
        add_custom_command(OUTPUT ${module}.z
            COMMAND ${PYTHON} ${CMAKE_CURRENT_LIST_DIR}/pack_elf.py ${module} ${module}.z
            DEPENDS ${module} ${CMAKE_CURRENT_LIST_DIR}/pack_elf.py VERBATIM)
        list(APPEND BUNDLE_EXTRA "natives/${name}.elf=${module}.z")
        list(APPEND BUNDLE_EXTRA_DEPS ${module}.z)
    endforeach()
    foreach(m echo bench wimport dial)   # wimport links to a function no module is given (-Wno-attributes: its WebAssembly import attribute)
        set(out ${CMAKE_CURRENT_BINARY_DIR}/natives/${m}.elf)
        add_custom_command(
            OUTPUT ${out}
            COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_CURRENT_BINARY_DIR}/natives
            COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} -o ${out} ${OS}/natives/${m}.c ${OS}/sdk/nw_elf.c
            COMMAND ${ELF_STRIP} --strip-unneeded --remove-section=.comment --remove-section=.riscv.attributes ${out}
            DEPENDS ${OS}/natives/${m}.c ${OS}/sdk/nw_elf.c ${OS}/sdk/nw_elf.h ${OS}/sdk/nw.h ${OS}/sdk/nw_calls.inc ${OS}/sdk/nw_json.h
                    ${OS}/sdk/nw_ui.h
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

if(PICOCALC_TYPED_AGENDA)
    if(PICOCALC_RV32_AGENDA)
        set(agenda_reactor "${CMAKE_CURRENT_BINARY_DIR}/agenda-reactor.elf")
        set(agenda_sources "${OS}/worlds/agenda/wasm-world.c" "${OS}/worlds/agenda/rv32-slot.S")
        add_custom_command(OUTPUT "${agenda_reactor}"
            COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} -o "${agenda_reactor}" ${agenda_sources} ${OS}/sdk/nw_elf.c
            DEPENDS ${agenda_sources} ${OS}/sdk/nw_elf.c ${OS}/sdk/nw_elf.h ${OS}/sdk/nw.h
                    ${OS}/sdk/nw_calls.inc ${OS}/sdk/nw_wire.h ${OS}/sdk/nw_json.h ${OS}/sdk/nw_ui.h
            VERBATIM)
        target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_RV32_AGENDA=1)
        list(APPEND BUNDLE_EXTRA "agenda/typed-rv32.js=${OS}/compiler/typed-rv32.js")
        list(APPEND BUNDLE_EXTRA_DEPS "${OS}/compiler/typed-rv32.js")
        set(agenda_engine native)
    else()
        set(PICOCALC_AGENDA_REACTOR "${OS}/build/agenda-reactor.wasm" CACHE FILEPATH "Prebuilt Agenda SDK reactor")
        if(NOT EXISTS "${PICOCALC_AGENDA_REACTOR}")
            message(FATAL_ERROR "Build the Agenda reactor with make -C picocalc-os agenda-reactor")
        endif()
        set(agenda_reactor "${PICOCALC_AGENDA_REACTOR}")
        set(agenda_engine wasm)
    endif()
    if(PICOCALC_NATIVE_ELF)
        file(READ "${builtin_manifest}" agenda_manifest)
    else()
        file(READ "${OS}/js/system.json" agenda_manifest)
    endif()
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${OS}/js/system.json")
    string(JSON world_count LENGTH "${agenda_manifest}" worlds)
    math(EXPR last_world "${world_count} - 1")
    foreach(i RANGE ${last_world})
        string(JSON world_name GET "${agenda_manifest}" worlds ${i} name)
        if(world_name STREQUAL "agenda")
            string(JSON agenda_manifest SET "${agenda_manifest}" worlds ${i} file "\"agenda/compiled.bin\"")
            string(JSON agenda_manifest SET "${agenda_manifest}" worlds ${i} engine "\"${agenda_engine}\"")
            string(JSON agenda_manifest SET "${agenda_manifest}" worlds ${i} budget_ms 100)
            break()
        endif()
    endforeach()
    set(agenda_manifest_path "${CMAKE_CURRENT_BINARY_DIR}/system.typed-agenda.json")
    file(CONFIGURE OUTPUT "${agenda_manifest_path}" CONTENT "${agenda_manifest}" @ONLY)
    target_sources(${COMPONENT_LIB} PRIVATE agenda_p4.c)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_TYPED_AGENDA=1)
    list(APPEND BUNDLE_EXTRA
        "system.typed-agenda.json=${agenda_manifest_path}"
        "agenda/typed-wasm.js=${OS}/compiler/typed-wasm.js"
        "agenda/compile.js=${OS}/worlds/agenda/compile.js"
        "agenda/reminder.typed=${OS}/worlds/agenda/reminder.typed"
        "agenda/reactor.bin=${agenda_reactor}")
    list(APPEND BUNDLE_EXTRA_DEPS
        "${agenda_manifest_path}" "${agenda_reactor}"
        "${OS}/compiler/typed-wasm.js" "${OS}/worlds/agenda/compile.js" "${OS}/worlds/agenda/reminder.typed")
endif()

file(GLOB_RECURSE JS_FILES CONFIGURE_DEPENDS ${OS}/js/*.js ${OS}/js/*.json ${OS}/js/*.wasm)
set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)
add_custom_command(
    OUTPUT ${BUNDLE}
    COMMAND ${CMAKE_COMMAND} -DJS_ROOT=${OS}/js "-DEXTRA=${BUNDLE_EXTRA}" -DOUT=${BUNDLE} -P ${CMAKE_CURRENT_LIST_DIR}/bundle_js.cmake
    DEPENDS ${JS_FILES} ${BUNDLE_EXTRA_DEPS} ${CMAKE_CURRENT_LIST_DIR}/bundle_js.cmake
    VERBATIM)
target_sources(${COMPONENT_LIB} PRIVATE ${BUNDLE})
