"""Build a diagnostic runtime source copy from the pinned runtime, counting code paths and probes."""
from pathlib import Path
import sys
src, dest = map(Path, sys.argv[1:])
text = src.read_text()
def edit(old, new):
    global text
    if text.count(old) != 1:
        raise ValueError(old)
    text = text.replace(old, new)
labels = "extra_calls extra_empty extra_probes extra_hits field_calls field_cached field_probes index_array_numeric index_string_numeric index_other".split()
enum = ', '.join(labels)
fmt = ' '.join(f'{label}=%llu' for label in labels)
values = ', '.join(f'trace[{label}]' for label in labels)
edit('enum { FIELD_CACHE', f'enum {{ {enum}, total_counters }};\nstatic unsigned long long trace[total_counters];\n__attribute__((destructor)) static void trace_report(void) {{ fprintf(stderr, "PROBES {fmt}\\n", {values}); }}\nenum {{ FIELD_CACHE')
edit('uint64_t h = 0;\n\tif (cached)', 'trace[field_calls]++;\n\tuint64_t h = 0;\n\tif (cached)')
edit('return field_cache[h].k;', '{ trace[field_cached]++; return field_cache[h].k; }')
edit('if (str_equal(shape[k + 1], name))\n\t\t\tbreak;', 'if ((trace[field_probes]++, str_equal(shape[k + 1], name)))\n\t\t\tbreak;')
edit('if (!is_array(x)) return -1;', 'trace[extra_calls]++;\n\tif (!is_array(x)) { trace[extra_empty]++; return -1; }')
edit('if (str_equal(arr_elems(x)[k], name)) return k;', 'if ((trace[extra_probes]++, str_equal(arr_elems(x)[k], name))) { trace[extra_hits]++; return k; }')
edit('/* (CJI-3, lane 6: an array or a string first', 'if (is_array(o) && is_number(k)) trace[index_array_numeric]++;\n\telse if (is_string(o) && is_number(k)) trace[index_string_numeric]++;\n\telse trace[index_other]++;\n\t/* (CJI-3, lane 6: an array or a string first')
dest.write_text(text)
