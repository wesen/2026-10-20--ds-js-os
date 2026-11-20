Independent Editor experiment. The original scoped hypotheses are G3/G4 in PICOCALC-NATIVE-NEXT. Use explicit clock boundaries; do not invent any interactions.

Arms: pre-G complete typed Editor at 1357545 uses hand-written continuations and E1–E7, including exhaustive Find phases. Final compiled-await Editor is 2e4fee1. Same full typed app source emitted under final compiler and first combined port 7b321a9 gives byte-identical linked artifacts. The new app uses 57 declared state words and 13 generated (total 70), vs 71 pre-G. The title length is stored in an existing spare buffer cell. G3 alone uses 71. G3 added 264 native words to its E6 control (21,922 to 22,186); G4 adds 106 further (22,292). All 24 frozen host replays pass on all key revisions. The 13 Editor workflows compare the app with its JS reference. Five additional fixtures exercise timer and input order on real Wasm and emulated RV32 reactors. The controlled delivery was necessary where normal kernel routing serializes requests. Do not label injected events physical keypresses.

Both engines run on the actual PicoCalc P4. The standard test covers typing, file save/readback, simple Find, Markdown preview, discard and cleanup, with three trials per engine per arm. Device firmware is separately built for the two engines. Wall time sent to the app is fixed to show the identical clock in each raw screenshot, but all timers and timeout decisions still use the actual monotonic clock. Test directory name differs between emulation engines by design, so only compare screenshots within an engine. The code to reproduce is in PICOCALC-EG-QUAL/scripts. 03-board-qualification.py replays the historical serial workflow; 05-find-observer.inc and 07-time-find.py measure Find from delivering Enter in an exact query prompt to producing a retained frame with the expected result. This elapsed clock includes scheduling; the separate Editor CPU clock includes the sum of Editor segments; engine time includes reactor and SDK execution. No logic analyzer, hardware key-to-pixel time or source compiler instruction profile measured here.

rv32 us: manual [2653065, 2645557, 2627345] vs await [3816925, 3834497, 3785138]; medians 2645557 → 3816925; +44.28%. The us field is the compiler interval, not entire boot.

rv32 peak_js_bytes: manual [1493644, 1493880, 1493532] vs await [2256772, 2256776, 2256812]; medians 1493644 → 2256776; +51.09%. The us field is the compiler interval, not entire boot.

rv32 module_bytes: manual [240452, 240452, 240452] vs await [240452, 240452, 240452]; medians 240452 → 240452; +0.00%. The us field is the compiler interval, not entire boot.

rv32 workflow_cpu_ms: manual [33.72, 35.03, 35.46] vs await [34.68, 34.8, 35.23]; medians 35.03 → 34.8; -0.66%. The us field is the compiler interval, not entire boot.

rv32: number of distinct raw search/preview screenshot hashes across all six runs: {'shot-1.png': 1, 'shot-2.png': 1}

wasm us: manual [2025205, 2036252, 2028286] vs await [3121173, 3121485, 3122149]; medians 2028286 → 3121485; +53.90%. The us field is the compiler interval, not entire boot.

wasm peak_js_bytes: manual [1545880, 1545892, 1546084] vs await [2263468, 2263468, 2263464]; medians 1545892 → 2263468; +46.42%. The us field is the compiler interval, not entire boot.

wasm module_bytes: manual [88302, 88302, 88302] vs await [88969, 88969, 88969]; medians 88302 → 88969; +0.76%. The us field is the compiler interval, not entire boot.

wasm workflow_cpu_ms: manual [144.53, 144.35, 142.84] vs await [144.3, 145.38, 143.69]; medians 144.35 → 144.3; -0.03%. The us field is the compiler interval, not entire boot.

wasm: number of distinct raw search/preview screenshot hashes across all six runs: {'shot-1.png': 1, 'shot-2.png': 1}

Prespecified gates computed from physical data: {'rv32_exact_frames': True, 'wasm_exact_frames': True, 'native_cpu_within_10pct': True, 'native_compile_within_10pct': False, 'e5_native_within_5pct': True}

The separately timed query fixture has exactly 65,536 bytes, 851 CR LF lines of repeated text plus a last nine bytes 'needlezzz'. Early query ext → column 2, line 1. Dense miss text text z exhausts its candidate positions; unique late needle → line 852, column 1. Line number alone does not predict search cost; the SDK can skip a line in one seek. Search outcomes verified on BOTH physical engines before timings accepted. One complete physical measurement per query/engine/arm unless repeated trial numbers appear below. No confidence intervals or workload-wide speed claims from such an exploratory sample.

engine=rv32 trial=1 query=early elapsed 4516→4086 μs (-9.52%), Editor CPU 4497→4055 μs (-9.83%), Editor segments 1→1, delivered settlements 0→0.

engine=rv32 trial=1 query=late elapsed 54230→55810 μs (+2.91%), Editor CPU 39537→39596 μs (+0.15%), Editor segments 27→27, delivered settlements 26→26.

engine=rv32 trial=1 query=miss elapsed 183880→171667 μs (-6.64%), Editor CPU 116277→113120 μs (-2.72%), Editor segments 297→297, delivered settlements 296→296.

engine=wasm trial=1 query=early elapsed 41515→41608 μs (+0.22%), Editor CPU 41492→41573 μs (+0.20%), Editor segments 1→1, delivered settlements 0→0.

engine=wasm trial=1 query=late elapsed 732409→738086 μs (+0.78%), Editor CPU 604109→603375 μs (-0.12%), Editor segments 27→27, delivered settlements 26→26.

engine=wasm trial=1 query=miss elapsed 1762060→1656603 μs (-5.98%), Editor CPU 1370970→1277165 μs (-6.84%), Editor segments 297→297, delivered settlements 296→296.
