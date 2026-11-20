"""Bundle the locked selector in disposable three-lane PicoCalc firmware."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import runpy
import subprocess

HERE = Path(__file__).resolve().parent
LAB, = HERE.parent.parent.glob("PICOCALC-COMPILER-LAB--*/scripts")
FROZEN_LOCK = "70c85541957a32e0f0764ab5e40f88608c62b5711827fa92332da269457eb7e1"
POLICIES = {"base": "source", "literal": "literal", "density": "density"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def replace(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"expected one staging anchor {old!r}")
    return source.replace(old, new)


def runtime_profile(source):
    enum, methods = (HERE / "10-p4-phases.c.inc").read_text().split("\n\n", 1)
    source = replace(source, "typedef struct {", enum + "\n\ntypedef struct {\n"
                     "  vtime_t since, spent[SELECT_PHASES];\n"
                     "  size_t start[SELECT_PHASES], top[SELECT_PHASES], operations[SELECT_PHASES];\n"
                     "  unsigned phase, cells, comparisons, retained, proof_visits;")
    source = replace(source, "static void account(", methods.rstrip() + "\n\nstatic void account(")
    source = replace(source, "  if (heap->live > heap->peak)", """  if (current) heap->operations[heap->phase]++;
  if (heap->live > heap->top[heap->phase]) heap->top[heap->phase] = heap->live;
  if (heap->live > heap->peak)""")
    source = replace(source, "  compile_heap heap = {", "  compile_heap heap = {\n    .since = started,")
    source = replace(source, "  if (!ctx) goto done;", """  if (!ctx) goto done;
  JS_SetContextOpaque(ctx, &heap);
  JSValue callbacks = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, callbacks, "selectorPhase", JS_NewCFunction(ctx, p4_selector_phase, "selectorPhase", 1));
  JS_SetPropertyStr(ctx, callbacks, "selectorSummary", JS_NewCFunction(ctx, p4_selector_summary, "selectorSummary", 4));
  JS_FreeValue(ctx, callbacks);""")
    source = replace(source, "  if (ready) result = JS_Call", """  select_enter(&heap, SELECT_DISPATCH);
  if (ready) result = JS_Call""")
    source = replace(source, '  printf("%s compile source=', '''  vtime_t finished = port_clock();
  heap.spent[heap.phase] += finished - heap.since;
  for (unsigned i = 0; i < SELECT_PHASES; i++) {
    printf("SELSTAT %s %u %lld %zu %zu %zu\\n", app, i,
           (long long)heap.spent[i], heap.start[i], heap.top[i], heap.operations[i]);
  }
  printf("SELWORK %s %u %u %u %u\\n", app, heap.cells, heap.comparisons, heap.retained, heap.proof_visits);
  printf("%s compile source=''')
    return replace(source, "(long long)(port_clock() - started)", "(long long)(finished - started)")


def stage_backend(backend, policy_source, policy):
    start = "    const code = [];\n    let remainingFacts = options?.budget ?? FACT_MODULE_BUDGET;"
    planning = {
        "source": "    const featureCells = 0, rankingComparisons = 0, retained = 0;\n",
        "ranked": f"""    let featureCells = 0, rankingComparisons = 0;
    const summaries = [];
    const policy = {json.dumps(policy)};
    let overflow = false;
    globalThis.selectorPhase?.(2);
    typedWasm.compileFunctions(source, imported.length, imported, maxSourceLength, true, fn => {{
        if (summaries.length < metadataCap) {{
            const data = metadata(fn, NumericCursor, policy);
            featureCells += data.visits;
            summaries.push(data);
        }} else {{
            overflow = true;
        }}
        fn.code = null;
    }});
    globalThis.selectorPhase?.(3);
    if (!overflow) {{
        const plan = choose(summaries, policy, options?.budget ?? FACT_MODULE_BUDGET);
        rankingComparisons = plan.compares;
        options = {{...options, mode: "ranked", selected: plan.names}};
    }}
    const retained = summaries.length;
""",
    }
    instrumentation = planning["source" if policy == "source" else "ranked"]
    instrumentation += "    globalThis.selectorPhase?.(4);\n    const code = [];\n"
    instrumentation += "    const initialBudget = options?.budget ?? FACT_MODULE_BUDGET;\n"
    instrumentation += "    let remainingFacts = initialBudget;"
    backend = replace(backend, start, instrumentation)
    backend = replace(backend, "    return {image, entries, records: layouts,",
                      """    globalThis.selectorSummary?.(featureCells, rankingComparisons, retained, initialBudget - remainingFacts);
    return {image, entries, records: layouts,""")
    if policy != "source":
        backend = replace(backend, "class FunctionCode {", policy_source + "\nclass FunctionCode {")
    return backend


def stage(work, synthetic):
    freeze = (HERE.parent / "various/frozen-policy.json").read_bytes()
    if sha(freeze) != FROZEN_LOCK:
        raise ValueError("physical trial requires the preregistered selector freeze")
    frozen = json.loads(freeze)
    for file, digest in frozen["paths"].items():
        if sha((HERE / file).read_bytes()) != digest:
            raise ValueError(f"changed locked source: {file}")
    overlays = work / "overlays"
    runpy.run_path(str(HERE / "01-stage.py"))["stage"](overlays)
    for file, digest in frozen["staged"].items():
        if sha((overlays / file).read_bytes()) != digest:
            raise ValueError(f"overlay does not match the freeze: {file}")
    backend = (overlays / "rv32.js").read_text()
    policy_src = (HERE / "02-policy.mjs").read_text().replace("export const ", "const ").replace(
        "export function ", "function ")
    treatments = {}
    for lane, policy in POLICIES.items():
        destination = work / "treatments" / lane / "typed"
        destination.mkdir(parents=True)
        (destination / "wasm.js").write_bytes((overlays / "wasm.js").read_bytes())
        (destination / "rv32.js").write_text(stage_backend(backend, policy_src, policy))
        treatments[lane] = destination.parent
    lab = runpy.run_path(str(LAB / "01-stage.py"))
    # The generic stager requires its first lane to be the frozen production
    # pair. Replace that bundle after staging because this study's comparison
    # arm is the frozen source-order proof policy.
    lab["stage"](work, {**treatments, "base": None})
    names = json.loads((work / "lanes.json").read_text())
    for kind in ("wasm", "rv32"):
        content = (treatments["base"] / f"typed/{kind}.js").read_bytes()
        (work / "lanes" / "base" / f"typed/{kind}.js").write_bytes(content)
        names["base"][kind] = sha(content)
    (work / "lanes.json").write_text(json.dumps(names, indent=2) + "\n")
    main = work / "tree/picocalc-os/port/esp32p4/main"
    runtime = main / "typed_p4.c"
    runtime.write_text(runtime_profile(runtime.read_text()))
    oracle = json.loads(gzip.decompress((HERE.parent / "various/held-out.json.gz").read_bytes()))
    if oracle["freeze"] != FROZEN_LOCK:
        raise ValueError("heldout output is not from the preregistered selector freeze")
    expected = {"editor": next(m for m in oracle["modules"] if m["name"] == "editor")}
    if synthetic:
        program = work / "synthetic.typed"
        gen = (HERE / "03-generate.mjs").as_uri()
        script = ("import {generated, source} from " + json.dumps(gen)
                  + "; process.stdout.write(source(generated('distributed',501).functions));")
        program.write_bytes(subprocess.check_output(["node", "--input-type=module", "-e", script]))
        expected["synthetic"] = next(m for m in oracle["modules"] if m["name"] == "distributed-501")
        if sha(program.read_bytes()) != expected["synthetic"]["sourceSha256"]:
            raise ValueError("physical synthetic source does not match the frozen order")
        linker = work / "synthetic.js"
        linker.write_text("""globalThis.compileSelectorSynthetic = function(source, reactor, options) {
    return typedRv32.compile(source, undefined, undefined, options).image;
};
""")
        cmake = main / "CMakeLists.txt"
        marker = "set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)"
        cmake.write_text(replace(cmake.read_text(), marker,
            f'list(APPEND BUNDLE_EXTRA "selector/source={program}" "selector/link={linker}")\n'
            f'list(APPEND BUNDLE_EXTRA_DEPS "{program}" "{linker}")\n' + marker))
        trials = main / "lab_trials.c"
        trials.write_text(replace(trials.read_text(), "static bool compile_one(",
            (HERE / "09-synthetic.c.inc").read_text().rstrip() + "\n\nstatic bool compile_one("))
        trials.write_text(replace(trials.read_text(), '!compile_one(b,p,lane,"editor",lab_editor_compile))',
            '!compile_one(b,p,lane,"editor",lab_editor_compile) ||\n'
            '                    !compile_one(b,p,lane,"synthetic",compile_synthetic))'))
    for name, module in expected.items():
        expected[name] = {key: module[key] for key in ("sourceSha256", "compiledChecks")}
        if "reactorSha256" in module:
            expected[name]["reactorSha256"] = module["reactorSha256"]
    (work / "transfer-inputs.json").write_text(json.dumps(expected, indent=2) + "\n")
    subprocess.run(["node", LAB / "03-oracle.mjs", work, "--guest"], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--no-synthetic", action="store_true")
    args = parser.parse_args()
    stage(args.work.resolve(), not args.no_synthetic)
