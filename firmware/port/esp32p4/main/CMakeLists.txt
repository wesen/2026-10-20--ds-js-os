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
        "main_p4.c" "raybench_p4.c" "${OS}/nucleus/raytrace_demo.c" "${OS}/nucleus/raytrace_demo_pie.S"
        "port_p4.c" "bus_p4.c" "agent_p4.c" "store_p4.c" "fs_p4.c" "perf_p4.c"
        "${OS}/nucleus/agent_transport.c" "${OS}/nucleus/kernel.c" "${OS}/nucleus/kernel_channels.c" "${OS}/nucleus/kernel_supervision.c" "${OS}/nucleus/kernel_reports.c" "${OS}/nucleus/vm.c" "${OS}/nucleus/vm_ops.c" "${OS}/nucleus/vm_sys.c" "${OS}/nucleus/hw.c" "${OS}/nucleus/gfx.c" "${OS}/nucleus/util.c" "${OS}/nucleus/fs.c" "${OS}/nucleus/native.c" "${OS}/nucleus/native_json.c" "${OS}/nucleus/native_device.c"
        "${OS}/nucleus/native_wasm.c"
        "${QJS}/quickjs.c" "${QJS}/libregexp.c" "${QJS}/libunicode.c" "${QJS}/cutils.c" "${QJS}/dtoa.c"
        ${WAMR_SRCS}
    INCLUDE_DIRS "." "${OS}/nucleus" "${QJS}"
    PRIV_INCLUDE_DIRS "${WAMR}/iwasm/include"
    PRIV_REQUIRES driver esp_driver_gpio esp_driver_i2c esp_driver_spi esp_driver_uart esp_psram esp_timer esp_mm heap fatfs wear_levelling vfs lwip pthread ${AGENT_REQUIRES}
)
target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_RAYTRACE=1)
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
    file(READ ${OS}/../apps/js/picocalc/system.json system_json)
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
            set(cji_input_${name} ${OS}/../apps/js/picocalc/${file})
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
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${OS}/../apps/js/picocalc/system.json)
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

# Typed apps override the same configured catalog, preserving the claims and
# any peripheral or test selections made above.
if(PICOCALC_TYPED_AGENDA OR PICOCALC_TYPED_FILES OR PICOCALC_TYPED_EDITOR OR PICOCALC_TYPED_CHESS)
    target_sources(${COMPONENT_LIB} PRIVATE typed_p4.c typed_lex_index.c)
    list(APPEND BUNDLE_EXTRA "typed/wasm.js=${OS}/../compiler/typed/typed-wasm.js")
    list(APPEND BUNDLE_EXTRA_DEPS "${OS}/../compiler/typed/typed-wasm.js")
    if(PICOCALC_RV32_AGENDA OR PICOCALC_RV32_FILES OR PICOCALC_RV32_EDITOR OR PICOCALC_RV32_CHESS)
        if(NOT PICOCALC_RV32_STREAM_FUNCTIONS)
            set_property(SOURCE typed_p4.c APPEND PROPERTY COMPILE_DEFINITIONS PICOCALC_RV32_BUFFER_FUNCTIONS=1)
        endif()
        list(APPEND BUNDLE_EXTRA "typed/rv32.js=${OS}/../compiler/typed/typed-rv32.js")
        list(APPEND BUNDLE_EXTRA_DEPS "${OS}/../compiler/typed/typed-rv32.js")
    endif()
    if(PICOCALC_NATIVE_ELF)
        set(typed_manifest "${system_json}")
    else()
        file(READ "${OS}/../apps/js/picocalc/system.json" typed_manifest)
    endif()
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${OS}/../apps/js/picocalc/system.json")
    string(JSON world_count LENGTH "${typed_manifest}" worlds)
    math(EXPR last_world "${world_count} - 1")
endif()

if(PICOCALC_TYPED_EDITOR OR PICOCALC_TYPED_CHESS)
    list(APPEND BUNDLE_EXTRA
        "typed/async.js=${OS}/../compiler/typed/typed-async.js"
        "typed/world.js=${OS}/../compiler/typed/typed-world.js")
    list(APPEND BUNDLE_EXTRA_DEPS "${OS}/../compiler/typed/typed-async.js" "${OS}/../compiler/typed/typed-world.js")
endif()

if(PICOCALC_RV32_EDITOR OR PICOCALC_RV32_CHESS)
    set(native_world_reactor "${CMAKE_CURRENT_BINARY_DIR}/typed-world-reactor.elf")
    set(world_runtime "${OS}/sdk/typed/world.c" "${OS}/sdk/typed/chess-psix.c" "${OS}/sdk/typed/rv32-slot.S" "${QJS}/libunicode.c")
    function(add_typed_world_reactor output)
        add_custom_command(OUTPUT "${output}"
            COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} ${ARGN} -o "${output}" ${world_runtime} ${OS}/sdk/nw_elf.c
            DEPENDS ${world_runtime} ${OS}/sdk/typed/chess-psix.h ${OS}/sdk/nw_elf.c ${OS}/sdk/nw_elf.h ${OS}/sdk/nw.h
                    ${OS}/sdk/nw_calls.inc ${OS}/sdk/nw_wire.h ${OS}/sdk/nw_json.h ${OS}/sdk/nw_utf16.h
                    ${QJS}/cutils.h ${QJS}/libunicode.h ${QJS}/libunicode-table.h
            VERBATIM)
    endfunction()
    add_typed_world_reactor("${native_world_reactor}")
    if(PICOCALC_RV32_CHESS AND PICOCALC_CHESS_3D)
        set(chess_3d_reactor "${CMAKE_CURRENT_BINARY_DIR}/typed-chess-3d-reactor.elf")
        # The game embeds the 3D painter as Typed literal writes.
        add_typed_world_reactor("${chess_3d_reactor}" "-DTYPED_WORLD_NATIVE_SLOT_BYTES=262144")
    endif()
endif()

if(PICOCALC_CHESS_3D AND PICOCALC_RV32_CHESS)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_CANDELA=1)
    target_sources(${COMPONENT_LIB} PRIVATE candela_p4.c ${OS}/nucleus/candela_scene.c)
    target_link_libraries(${COMPONENT_LIB} PRIVATE idf::espressif__elf_loader)
    set(candela_dir ${OS}/../apps/typed/candela)
    set(candela_slot ${CMAKE_CURRENT_BINARY_DIR}/candela-slot.elf)
    set(candela_link ${OS}/../apps/typed/candela/link.js)
    set(candela_stub ${CMAKE_CURRENT_LIST_DIR}/candela_slot.c ${CMAKE_CURRENT_LIST_DIR}/candela_slot.S)
    add_custom_command(OUTPUT ${candela_slot}
        COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} -o ${candela_slot} ${candela_stub}
        DEPENDS ${candela_stub} VERBATIM)
    list(APPEND BUNDLE_EXTRA "candela/slot.elf=${candela_slot}" "candela/link.js=${candela_link}")
    list(APPEND BUNDLE_EXTRA_DEPS ${candela_slot} ${candela_link})
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_TYPED_RAY=1)
    target_sources(${COMPONENT_LIB} PRIVATE typed_ray_p4.c typed_ray_material_bench.c)
    set(ray_source ${OS}/../apps/typed/raytrace/raytrace.typed)
    set(ray_linker ${OS}/../apps/typed/raytrace/link.js)
    list(APPEND BUNDLE_EXTRA "typed-ray/main.typed=${ray_source}" "typed-ray/link.js=${ray_linker}")
    list(APPEND BUNDLE_EXTRA_DEPS ${ray_source} ${ray_linker})
    set(ray_material ${CMAKE_CURRENT_BINARY_DIR}/typed-ray-material.typed)
    set(ray_material_link ${OS}/../apps/typed/raytrace/link-material.js)
    add_custom_command(OUTPUT ${ray_material}
        COMMAND ${PYTHON} ${OS}/../apps/typed/raytrace/assemble-material.py ${ray_material}
        DEPENDS ${OS}/../apps/typed/raytrace/assemble-material.py ${OS}/../apps/typed/raytrace/raytrace.typed
            ${OS}/../apps/typed/raytrace/material-frame.typed ${OS}/../apps/typed/raytrace/material-phases.typed
            ${candela_dir}/builders.typed
            ${candela_dir}/materials.typed ${candela_dir}/hand.typed VERBATIM)
    list(APPEND BUNDLE_EXTRA "typedmat/main.typed=${ray_material}" "typedmat/link.js=${ray_material_link}")
    list(APPEND BUNDLE_EXTRA_DEPS ${ray_material} ${ray_material_link})
    foreach(variant DIV SPAN PACKED INFERRED SHADOW MATCHED CHECK_STACK HOIST_STACK CHECK_REG HOIST_REG SKIP_REG SHADOW_HOIST)
        if(PICOCALC_TYPED_RAY_${variant})
            list(APPEND BUNDLE_EXTRA "typed-ray/${variant}=${PICOCALC_TYPED_RAY_${variant}}")
            list(APPEND BUNDLE_EXTRA_DEPS ${PICOCALC_TYPED_RAY_${variant}})
        endif()
    endforeach()
    file(GLOB candela_inputs CONFIGURE_DEPENDS ${candela_dir}/*.typed)
    foreach(stage hand fluent callback)
        set(output ${CMAKE_CURRENT_BINARY_DIR}/candela-${stage}.typed)
        add_custom_command(OUTPUT ${output}
            COMMAND ${PYTHON} ${candela_dir}/assemble.py ${output} --stage ${stage}
            DEPENDS ${candela_dir}/assemble.py ${candela_inputs} VERBATIM)
        list(APPEND BUNDLE_EXTRA "candela/${stage}.typed=${output}")
        list(APPEND BUNDLE_EXTRA_DEPS ${output})
    endforeach()
endif()

if(PICOCALC_MOBILE_PAINTER)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_MOBILE_PAINTER=1)
    target_sources(${COMPONENT_LIB} PRIVATE mobile_painter_p4.c painter_service.c ${OS}/nucleus/painter_commands.c ${OS}/sdk/typed/chess-psix.c)
    target_include_directories(${COMPONENT_LIB} PRIVATE ${OS}/sdk/typed)
    target_link_libraries(${COMPONENT_LIB} PRIVATE idf::espressif__elf_loader)
    set(painter_slot "${CMAKE_CURRENT_BINARY_DIR}/mobile-painter-slot.elf")
    set(painter_sources "${CMAKE_CURRENT_LIST_DIR}/mobile_painter_slot.c" "${CMAKE_CURRENT_LIST_DIR}/mobile_painter_slot.S")
    set(painter_link "${OS}/../apps/typed/chess/link-painter.js")
    set(painter_slot_flags)
    if(PICOCALC_CHESS_3D)
        target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_CHESS_3D=1)
        set(painter_source "${OS}/../apps/typed/chess/painter-3d.typed")
        # Size the native slot separately from the transport source limit.
        set(painter_slot_flags "-DMOBILE_PAINTER_NATIVE_SLOT_BYTES=32768")
    else()
        set(painter_source "${OS}/../apps/typed/chess/painter.typed")
    endif()
    add_custom_command(OUTPUT "${painter_slot}"
        COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} ${painter_slot_flags} -o "${painter_slot}" ${painter_sources}
        DEPENDS ${painter_sources} VERBATIM)
    list(APPEND BUNDLE_EXTRA "painter/slot.elf=${painter_slot}" "painter/link.js=${painter_link}" "chess/painter.typed=${painter_source}")
    list(APPEND BUNDLE_EXTRA_DEPS "${painter_slot}" "${painter_link}" "${painter_source}")
endif()

if(PICOCALC_TYPED_CHESS)
    if(PICOCALC_RV32_CHESS)
        if(PICOCALC_CHESS_3D)
            set(chess_reactor "${chess_3d_reactor}")
        else()
            set(chess_reactor "${native_world_reactor}")
        endif()
        set(chess_engine native)
        target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_RV32_CHESS=1)
    else()
        set(chess_reactor "${OS}/build/typed-world-reactor.wasm")
        if(NOT EXISTS "${chess_reactor}")
            message(FATAL_ERROR "Build the shared typed reactor with make -C picocalc-os typed-world-reactor")
        endif()
        set(chess_engine wasm)
    endif()
    set(chess_dir "${OS}/../apps/typed/chess")
    file(STRINGS "${chess_dir}/source.list" chess_parts)
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${chess_dir}/source.list")
    set(chess_source "${CMAKE_CURRENT_BINARY_DIR}/chess.typed")
    set(chess_source_text "")
    foreach(part IN LISTS chess_parts)
        file(READ "${chess_dir}/${part}" source_part)
        if(PICOCALC_MOBILE_PAINTER AND part STREQUAL "view.typed")
            string(REPLACE "function chessRender(" "function chessRenderTree(" source_part "${source_part}")
        endif()
        string(APPEND chess_source_text "${source_part}\n")
        set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${chess_dir}/${part}")
    endforeach()
    if(PICOCALC_MOBILE_PAINTER)
        set(embed_tool "${OS}/tools/embed-chess-painter.py")
        set(embedded_painter "${CMAKE_CURRENT_BINARY_DIR}/chess-painter-source.typed")
        set(mobile_view "${chess_dir}/mobile-view.typed")
        set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${painter_source}" "${embed_tool}" "${mobile_view}")
        execute_process(COMMAND ${PYTHON} "${embed_tool}" "${painter_source}" "${embedded_painter}"
            COMMAND_ERROR_IS_FATAL ANY)
        file(READ "${embedded_painter}" painter_function)
        file(READ "${mobile_view}" view_source)
        string(APPEND chess_source_text "\n${painter_function}\n${view_source}\n")
    endif()
    file(CONFIGURE OUTPUT "${chess_source}" CONTENT "${chess_source_text}" @ONLY)
    string(JSON typed_manifest SET "${typed_manifest}" worlds ${world_count}
        "{\"name\":\"chess\",\"file\":\"chess/compiled.bin\",\"engine\":\"${chess_engine}\",\"budget_ms\":200,\"mem_kb\":768}")
    set(chess_manifest_path "${CMAKE_CURRENT_BINARY_DIR}/system.typed-chess.json")
    file(CONFIGURE OUTPUT "${chess_manifest_path}" CONTENT "${typed_manifest}" @ONLY)
    target_sources(${COMPONENT_LIB} PRIVATE chess_p4.c)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_TYPED_CHESS=1)
    list(APPEND BUNDLE_EXTRA
        "system.typed-chess.json=${chess_manifest_path}"
        "chess/chess.typed=${chess_source}"
        "chess/reactor.bin=${chess_reactor}")
    list(APPEND BUNDLE_EXTRA_DEPS "${chess_manifest_path}" "${chess_source}" "${chess_reactor}")
endif()

# Candela's front end as a QuickJS world (PICOCALC-CANDELA-WORLD). The repository's tools/gen/candela/candela-bc.c,
# built here for the build machine from the same third_party/quickjs, compiles Candela's modules (third_party/candela)
# and the world's (worlds/candela-world) to QuickJS bytecode; the bundle and the world's script go into js_bundle.c,
# and the world's manifest entry (worlds/candela-world/manifest.json) is appended to the typed manifests written below.
if(PICOCALC_CANDELA_WORLD)
    if(NOT PICOCALC_TYPED_CHESS)
        message(FATAL_ERROR "PICOCALC_CANDELA_WORLD rides on the typed Chess firmware (profiles/playable.env)")
    endif()
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_CANDELA_WORLD=1)
    target_sources(${COMPONENT_LIB} PRIVATE ${OS}/nucleus/candela_world.c ${OS}/nucleus/candela_render_stub.c)
    find_program(CANDELA_HOST_CC NAMES cc gcc clang REQUIRED)
    get_filename_component(candela_gen "${OS}/../tools/gen/candela" ABSOLUTE)
    set(candela_bc ${CMAKE_CURRENT_BINARY_DIR}/candela-bc)
    set(candela_qjs ${QJS}/quickjs.c ${QJS}/libregexp.c ${QJS}/libunicode.c ${QJS}/cutils.c ${QJS}/dtoa.c)
    add_custom_command(OUTPUT ${candela_bc}
        COMMAND ${CANDELA_HOST_CC} -O2 -w -std=gnu11 -D_GNU_SOURCE -fwrapv -fno-strict-aliasing -I${QJS}
                "-DCONFIG_VERSION=\"${QJS_VERSION}\"" -o ${candela_bc} ${candela_gen}/candela-bc.c ${candela_qjs} -lm -lpthread
        DEPENDS ${candela_gen}/candela-bc.c ${candela_qjs} ${QJS}/quickjs.h VERBATIM)
    set(candela_front ${CMAKE_CURRENT_BINARY_DIR}/candela-front.qbc)
    set(candela_list ${OS}/../apps/js/worlds/candela-world/bundle.list)
    file(GLOB candela_world_inputs CONFIGURE_DEPENDS ${OS}/third_party/candela/src/*.js ${OS}/third_party/candela/presets/*.js
         ${OS}/../apps/js/worlds/candela-world/*.js ${OS}/../apps/js/worlds/candela-world/scenes/*.js)
    add_custom_command(OUTPUT ${candela_front}
        COMMAND ${candela_bc} ${candela_front} --list ${candela_list} ${OS}
        DEPENDS ${candela_bc} ${candela_list} ${candela_world_inputs} ${OS}/third_party/candela/PIN.json VERBATIM)
    list(APPEND BUNDLE_EXTRA "candela/front.qbc=${candela_front}" "candela/world.js=${OS}/../apps/js/worlds/candela-world/main.js")
    list(APPEND BUNDLE_EXTRA_DEPS ${candela_front} ${OS}/../apps/js/worlds/candela-world/main.js)
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${OS}/../apps/js/worlds/candela-world/manifest.json)
    file(READ ${OS}/../apps/js/worlds/candela-world/manifest.json candela_world_entry)
    string(JSON candela_world_index LENGTH "${typed_manifest}" worlds)
    string(JSON typed_manifest SET "${typed_manifest}" worlds ${candela_world_index} "${candela_world_entry}")
endif()

# The Candela gallery (PICOCALC-CANDELA-GALLERY): Candela's presets path-traced by the firmware on core 1 and shown
# on the screen. Two instances of the generated kernel (third_party/candela/kernel) with every CPU substitution:
# cg (RGB) and cgs (CDL_SPECTRAL). Each is compiled from a one-line wrapper, because a source file carries one set
# of definitions; nucleus/candela_gallery_instance.cpp binds each instance's dispatch functions to the section
# interpreter (third_party/candela/vm). The floating-point policy: -ffp-contract=off on the kernel, the interpreter
# and the renderer core, so device frames equal the reference build's (design Section 6). The scenes are
# third_party/candela/gallery/candela_gallery_scenes.c. The generated files under third_party/candela are tracked and
# regenerated by the repository's tools/gen/candela/regenerate.mjs (its VENDOR.json lists them); the build does not
# run Node for them. The world is worlds/candela-gallery, appended to the typed manifests written below; the
# compositor draws its frames (js/system/compositor.js drawGallery) only when this world exists.
if(PICOCALC_CANDELA_GALLERY)
    if(NOT PICOCALC_TYPED_CHESS OR NOT PICOCALC_NATIVE_ELF)
        message(FATAL_ERROR "PICOCALC_CANDELA_GALLERY rides on the typed Chess firmware (profiles/playable.env)")
    endif()
    set(cdl ${OS}/third_party/candela)
    set(cdl_fp -ffp-contract=off -fno-math-errno -fwrapv)
    set(cdl_switches CDL_SKY_N=64 CDL_LAZY_SELECT=1 CDL_NO_ZERO_INIT=1 CDL_FAST_FLOOR=1 CDL_FAST_TRIG=1
        CDL_FAST_EXP=1 CDL_INT_HASH=1 CDL_SKY_TABLE=1 CDL_POW32=1)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_CANDELA_GALLERY=1)
    target_include_directories(${COMPONENT_LIB} PRIVATE ${cdl}/kernel ${cdl}/vm)
    set(gallery_sources)
    foreach(inst cg cgs)
        foreach(part cdl_kernel cdl_post candela_gallery_instance)
            if(part STREQUAL "candela_gallery_instance")
                set(src ${OS}/nucleus/${part}.cpp)
            else()
                set(src ${cdl}/kernel/${part}.cpp)
            endif()
            set(wrapper ${CMAKE_CURRENT_BINARY_DIR}/gallery-${inst}-${part}.cpp)
            file(CONFIGURE OUTPUT ${wrapper} CONTENT "#include \"${src}\"\n")
            set(defs CDL_NS=${inst} ${cdl_switches})
            if(inst STREQUAL "cgs")
                list(APPEND defs CDL_SPECTRAL=1)
                if(part STREQUAL "candela_gallery_instance")
                    list(APPEND defs CDL_VM_NO_MATH_EXPORTS=1)
                endif()
            endif()
            set_source_files_properties(${wrapper} PROPERTIES COMPILE_DEFINITIONS "${defs}" COMPILE_OPTIONS "${cdl_fp};-w")
            list(APPEND gallery_sources ${wrapper})
            set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${src})
        endforeach()
    endforeach()
    set_source_files_properties(${cdl}/vm/cdl_vm.c PROPERTIES COMPILE_OPTIONS "-include;${cdl}/vm/cdl_vm_ck_math.h;${cdl_fp};-w")
    set_source_files_properties(${OS}/nucleus/candela_gallery.c PROPERTIES COMPILE_OPTIONS "${cdl_fp}")
    target_sources(${COMPONENT_LIB} PRIVATE candela_gallery_p4.c ${OS}/nucleus/candela_gallery.c ${cdl}/vm/cdl_vm.c
        ${cdl}/gallery/candela_gallery_scenes.c ${cdl}/kernel/cdl_fixed_kernel.c ${gallery_sources})
    list(APPEND BUNDLE_EXTRA "candela-gallery/gallery.js=${OS}/../apps/js/worlds/candela-gallery/gallery.js")
    list(APPEND BUNDLE_EXTRA_DEPS ${OS}/../apps/js/worlds/candela-gallery/gallery.js)
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${OS}/../apps/js/worlds/candela-gallery/manifest.json)
    file(READ ${OS}/../apps/js/worlds/candela-gallery/manifest.json gallery_entry)
    string(JSON gallery_index LENGTH "${typed_manifest}" worlds)
    string(JSON typed_manifest SET "${typed_manifest}" worlds ${gallery_index} "${gallery_entry}")
endif()

if(PICOCALC_TYPED_EDITOR)
    if(PICOCALC_RV32_EDITOR)
        set(editor_reactor "${native_world_reactor}")
        target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_RV32_EDITOR=1)
        set(editor_engine native)
    else()
        set(PICOCALC_EDITOR_REACTOR "${OS}/build/typed-world-reactor.wasm" CACHE FILEPATH "Prebuilt shared typed-world reactor")
        if(NOT EXISTS "${PICOCALC_EDITOR_REACTOR}")
            message(FATAL_ERROR "Build the shared typed reactor with make -C picocalc-os typed-world-reactor")
        endif()
        set(editor_reactor "${PICOCALC_EDITOR_REACTOR}")
        set(editor_engine wasm)
    endif()
    set(editor_dir "${OS}/../apps/typed/editor")
    set(editor_list "${editor_dir}/source.list")
    file(STRINGS "${editor_list}" editor_parts)
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${editor_list}")
    set(editor_source "${CMAKE_CURRENT_BINARY_DIR}/editor.typed")
    set(editor_source_text "")
    foreach(part IN LISTS editor_parts)
        file(READ "${editor_dir}/${part}" source_part)
        string(APPEND editor_source_text "${source_part}\n")
        set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${editor_dir}/${part}")
    endforeach()
    file(CONFIGURE OUTPUT "${editor_source}" CONTENT "${editor_source_text}" @ONLY)
    foreach(i RANGE ${last_world})
        string(JSON world_name GET "${typed_manifest}" worlds ${i} name)
        if(world_name STREQUAL "editor")
            string(JSON typed_manifest SET "${typed_manifest}" worlds ${i} file "\"editor/compiled.bin\"")
            string(JSON typed_manifest SET "${typed_manifest}" worlds ${i} engine "\"${editor_engine}\"")
            string(JSON typed_manifest SET "${typed_manifest}" worlds ${i} budget_ms 200)
            string(JSON typed_manifest SET "${typed_manifest}" worlds ${i} mem_kb 768)
            break()
        endif()
    endforeach()
    set(editor_manifest_path "${CMAKE_CURRENT_BINARY_DIR}/system.typed-editor.json")
    file(CONFIGURE OUTPUT "${editor_manifest_path}" CONTENT "${typed_manifest}" @ONLY)
    target_sources(${COMPONENT_LIB} PRIVATE editor_p4.c)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_TYPED_EDITOR=1)
    list(APPEND BUNDLE_EXTRA
        "system.typed-editor.json=${editor_manifest_path}"
        "editor/editor.typed=${editor_source}"
        "editor/reactor.bin=${editor_reactor}")
    list(APPEND BUNDLE_EXTRA_DEPS
        "${editor_manifest_path}" "${editor_reactor}" "${editor_source}")
endif()

if(PICOCALC_TYPED_FILES)
    if(PICOCALC_RV32_FILES)
        set(files_reactor "${CMAKE_CURRENT_BINARY_DIR}/files-reactor.elf")
        set(files_sources "${OS}/../apps/typed/files/world.c" "${OS}/../apps/typed/files/rv32-slot.S")
        add_custom_command(OUTPUT "${files_reactor}"
            COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} -o "${files_reactor}" ${files_sources} ${OS}/sdk/nw_elf.c
            DEPENDS ${files_sources} ${OS}/../apps/typed/files/slots.h
                    ${OS}/sdk/nw_elf.c ${OS}/sdk/nw_elf.h ${OS}/sdk/nw.h ${OS}/sdk/nw_calls.inc
                    ${OS}/sdk/nw_wire.h ${OS}/sdk/nw_json.h ${OS}/sdk/nw_ui.h ${OS}/sdk/nw_utf16.h
            VERBATIM)
        target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_RV32_FILES=1)
        set(files_engine native)
    else()
        set(PICOCALC_FILES_REACTOR "${OS}/build/files-reactor.wasm" CACHE FILEPATH "Prebuilt Files SDK reactor")
        if(NOT EXISTS "${PICOCALC_FILES_REACTOR}")
            message(FATAL_ERROR "Build the Files reactor with make -C picocalc-os files-reactor")
        endif()
        set(files_reactor "${PICOCALC_FILES_REACTOR}")
        set(files_engine wasm)
    endif()
    foreach(i RANGE ${last_world})
        string(JSON world_name GET "${typed_manifest}" worlds ${i} name)
        if(world_name STREQUAL "files")
            string(JSON typed_manifest SET "${typed_manifest}" worlds ${i} file "\"files/compiled.bin\"")
            string(JSON typed_manifest SET "${typed_manifest}" worlds ${i} engine "\"${files_engine}\"")
            break()
        endif()
    endforeach()
    set(files_manifest_path "${CMAKE_CURRENT_BINARY_DIR}/system.typed-files.json")
    file(CONFIGURE OUTPUT "${files_manifest_path}" CONTENT "${typed_manifest}" @ONLY)
    target_sources(${COMPONENT_LIB} PRIVATE files_p4.c)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_TYPED_FILES=1)
    list(APPEND BUNDLE_EXTRA
        "system.typed-files.json=${files_manifest_path}"
        "files/compile.js=${OS}/../apps/typed/files/compile.js"
        "files/files.typed=${OS}/../apps/typed/files/files.typed"
        "files/reactor.bin=${files_reactor}")
    list(APPEND BUNDLE_EXTRA_DEPS
        "${files_manifest_path}" "${files_reactor}" "${OS}/../apps/typed/files/compile.js" "${OS}/../apps/typed/files/files.typed")
endif()

if(PICOCALC_TYPED_AGENDA)
    if(PICOCALC_AGENDA_EARLY_BOOT)
        target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_AGENDA_EARLY_BOOT=1)
    endif()
    if(PICOCALC_RV32_AGENDA)
        set(agenda_reactor "${CMAKE_CURRENT_BINARY_DIR}/agenda-reactor.elf")
        set(agenda_sources "${OS}/../apps/typed/agenda/wasm-world.c" "${OS}/../apps/typed/agenda/rv32-slot.S")
        add_custom_command(OUTPUT "${agenda_reactor}"
            COMMAND ${CMAKE_C_COMPILER} ${ELF_FLAGS} -o "${agenda_reactor}" ${agenda_sources} ${OS}/sdk/nw_elf.c
            DEPENDS ${agenda_sources} ${OS}/sdk/nw_elf.c ${OS}/sdk/nw_elf.h ${OS}/sdk/nw.h
                    ${OS}/sdk/nw_calls.inc ${OS}/sdk/nw_wire.h ${OS}/sdk/nw_json.h ${OS}/sdk/nw_ui.h ${OS}/sdk/nw_utf16.h
            VERBATIM)
        target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_RV32_AGENDA=1)
        set(agenda_engine native)
    else()
        set(PICOCALC_AGENDA_REACTOR "${OS}/build/agenda-reactor.wasm" CACHE FILEPATH "Prebuilt Agenda SDK reactor")
        if(NOT EXISTS "${PICOCALC_AGENDA_REACTOR}")
            message(FATAL_ERROR "Build the Agenda reactor with make -C picocalc-os agenda-reactor")
        endif()
        set(agenda_reactor "${PICOCALC_AGENDA_REACTOR}")
        set(agenda_engine wasm)
    endif()
    set(agenda_manifest "${typed_manifest}")
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
        "agenda/compile.js=${OS}/../apps/typed/agenda/compile.js"
        "agenda/reminder.typed=${OS}/../apps/typed/agenda/reminder.typed"
        "agenda/entry.typed=${OS}/../apps/typed/agenda/entry.typed"
        "agenda/reactor.bin=${agenda_reactor}")
    list(APPEND BUNDLE_EXTRA_DEPS
        "${agenda_manifest_path}" "${agenda_reactor}"
        "${OS}/../apps/typed/agenda/compile.js" "${OS}/../apps/typed/agenda/reminder.typed"
        "${OS}/../apps/typed/agenda/entry.typed")
endif()

file(GLOB_RECURSE JS_FILES CONFIGURE_DEPENDS ${OS}/../apps/js/picocalc/*.js ${OS}/../apps/js/picocalc/*.json ${OS}/../apps/js/picocalc/*.wasm)
set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)
add_custom_command(
    OUTPUT ${BUNDLE}
    COMMAND ${CMAKE_COMMAND} -DJS_ROOT=${OS}/../apps/js/picocalc "-DEXTRA=${BUNDLE_EXTRA}" -DOUT=${BUNDLE} -P ${CMAKE_CURRENT_LIST_DIR}/bundle_js.cmake
    DEPENDS ${JS_FILES} ${BUNDLE_EXTRA_DEPS} ${CMAKE_CURRENT_LIST_DIR}/bundle_js.cmake
    VERBATIM)
target_sources(${COMPONENT_LIB} PRIVATE ${BUNDLE})
