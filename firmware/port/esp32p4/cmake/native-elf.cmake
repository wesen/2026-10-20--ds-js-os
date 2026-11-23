# Machine-code native worlds (optional/native_elf, PICOCALC_NATIVE_ELF): the CJI-compiled worlds of the manifest,
# the C natives, the device compiler, and the CJI test fixtures. Writes system.cji.json and leaves the manifest
# text in system_json for the Typed apps (typed-apps.cmake). The C natives are built from natives/ with sdk/nw_elf.c
# as position-independent shared objects, then bundled with js/ under the names the manifest uses.
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
        set(tool_dir ${PORT}/compiler)
        set(tool_output ${CJI_BUILD}/tool/compiler.elf)
        file(GLOB_RECURSE tool_inputs CONFIGURE_DEPENDS ${tool_dir}/*.h ${CJI_ROOT}/runtime/*.h
             ${CJI_ROOT}/runtime/*.c ${CJI_ROOT}/tools/rv32/fw/include/*.h)
        add_custom_command(OUTPUT ${tool_output}.z
            COMMAND sh ${tool_dir}/build-tool.sh ${CJI_ROOT} ${CJI_BUILD}/tool $<IF:$<BOOL:${PICOCALC_COMPILER_PROFILE}>,ON,OFF>
            COMMAND ${PYTHON} ${MAIN}/pack_elf.py ${tool_output} ${tool_output}.z
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
            COMMAND ${PYTHON} ${MAIN}/pack_elf.py ${module} ${module}.z
            DEPENDS ${module} ${MAIN}/pack_elf.py VERBATIM)
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
