# The console benchmarks (PICOCALC_BENCH, profiles/bench.env): bench/board/firmware, built into a study image and
# never into the playable one. They compile and time Typed programs against the C yardsticks on the device:
#   raybench N                 the C ray tracer, scalar against PIE (raybench.c)
#   cachestat ...              the P4's cache counters around a benchmark or a window (cachestat.c)
#   typedray load|bench|status the Typed ray tracer's study programs and alternative backends (typed_ray_bench.c)
#   typedmat ...               the Typed material frame against the mixed renderer (typed_ray_material_bench.c)
#   candela bench ...          the Candela scene's update and row timings (candela_bench.c)
# Needs the raytrace and candela apps. A study's alternative RV32 backends and ray programs are bundled with
# -D PICOCALC_TYPED_RAY_<NAME>=FILE (typed_ray_bench.c lists the names).
if(NOT "raytrace" IN_LIST PICOCALC_APPS OR NOT "candela" IN_LIST PICOCALC_APPS)
    message(FATAL_ERROR "PICOCALC_BENCH needs the raytrace and candela apps (profiles/bench.env)")
endif()
set(bench_dir ${REPO}/bench/board/firmware)
target_sources(${COMPONENT_LIB} PRIVATE ${bench_dir}/bench_console.c ${bench_dir}/raybench.c ${bench_dir}/cachestat.c
    ${bench_dir}/typed_ray_bench.c ${bench_dir}/typed_ray_material_bench.c ${bench_dir}/candela_bench.c)
target_include_directories(${COMPONENT_LIB} PRIVATE ${bench_dir})
target_compile_definitions(${COMPONENT_LIB} PRIVATE PICOCALC_BENCH=1)

# The Typed material frame: the ray tracer's frame with Candela's builders and materials (assemble-material.py).
set(candela_dir ${REPO}/apps/typed/candela)
set(ray_material ${CMAKE_CURRENT_BINARY_DIR}/typed-ray-material.typed)
add_custom_command(OUTPUT ${ray_material}
    COMMAND ${PYTHON} ${REPO}/apps/typed/raytrace/assemble-material.py ${ray_material}
    DEPENDS ${REPO}/apps/typed/raytrace/assemble-material.py ${REPO}/apps/typed/raytrace/raytrace.typed
        ${REPO}/apps/typed/raytrace/material-frame.typed ${REPO}/apps/typed/raytrace/material-phases.typed
        ${candela_dir}/builders.typed ${candela_dir}/materials.typed ${candela_dir}/hand.typed VERBATIM)
list(APPEND BUNDLE_EXTRA "typedmat/main.typed=${ray_material}" "typedmat/link.js=${REPO}/apps/typed/raytrace/link-material.js")
list(APPEND BUNDLE_EXTRA_DEPS ${ray_material} ${REPO}/apps/typed/raytrace/link-material.js)
foreach(variant DIV SPAN PACKED INFERRED SHADOW MATCHED CHECK_STACK HOIST_STACK CHECK_REG HOIST_REG SKIP_REG SHADOW_HOIST)
    if(PICOCALC_TYPED_RAY_${variant})
        list(APPEND BUNDLE_EXTRA "typed-ray/${variant}=${PICOCALC_TYPED_RAY_${variant}}")
        list(APPEND BUNDLE_EXTRA_DEPS ${PICOCALC_TYPED_RAY_${variant}})
    endif()
endforeach()
