"""Add committed, SPI-verified camera frame capture to a privately staged panel-observer tree."""
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
tree = Path(sys.argv[1]).resolve()
root = next(p for p in here.parents if (p/'.git').exists())
if tree == root or root in tree.parents:
    raise ValueError("private build tree outside the repository required")
main = tree/'picocalc-os/port/esp32p4/main'
native = tree/'picocalc-os/nucleus/native.c'
bus = main/'bus_p4.c'
console = main/'main_p4.c'

# A repeat request is harmless only when the entire previous installation is present exactly once.
markers = ((native, 'camera_painted(W, id, b, arg, camera_begin);'),
           (native, 'camera_committed(W, id, b, count);'),
           (bus, 'static void camera_panel_end_window(void)'),
           (bus, '  camera_panel_end_window();'),
           (console, 'static void camera_console(const char *cmd)'),
           (console, 'else if (!strcmp(cmd, "camobs")) camera_console(rest);'))
counts = [path.read_text().count(marker) for path, marker in markers]
if all(count == 1 for count in counts):
    sys.exit(0)
if any(counts):
    raise ValueError(f"partial or duplicate private observer hooks: {counts}")

def replace(s, old, new):
    if s.count(old) != 1:
        raise ValueError(f"expected exactly one source anchor: {old}")
    return s.replace(old, new)

s = bus.read_text()
s = replace(s, 'static void panel_completed(', (here/'06-camera-panel.inc').read_text()+'\nstatic void panel_completed(')
s = replace(s, '  panel.bytes += bytes;', '  panel.bytes += bytes;\n  camera_panel_end_window();')
a = console.read_text()
a = replace(a, 'static void heap_report(void)', (here/'06-camera-frames.inc').read_text()+'\nstatic void heap_report(void)')
a = replace(a, '  else if (!strcmp(cmd, "panelobs")) {',
               '  else if (!strcmp(cmd, "camobs")) camera_console(rest);\n  else if (!strcmp(cmd, "panelobs")) {')
n = native.read_text()
anchor = '    if (!p4_painter_draw(b, arg, out, cap)) return fail(W, "no accepted painter output");'
n = replace(n, anchor, '    extern void camera_painted(world_t *, int, dmabuf_t *, int, vtime_t);\n'
            '    vtime_t camera_begin = port_clock();\n'+anchor+'\n    camera_painted(W, id, b, arg, camera_begin);')
anchor = '    int rs[64 * 4], count = gfx_commit(b, rs, 64);'
n = replace(n, anchor, anchor+'\n    extern void camera_committed(world_t *, int, dmabuf_t *, int);\n'
            '    camera_committed(W, id, b, count);')
for target, content in ((bus,s),(console,a),(native,n)): target.write_text(content)
