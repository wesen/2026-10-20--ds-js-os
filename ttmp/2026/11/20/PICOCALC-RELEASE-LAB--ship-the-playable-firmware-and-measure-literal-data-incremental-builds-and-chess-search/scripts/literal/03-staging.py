"""Add the literal bench to an isolated copy of the release build."""
from pathlib import Path
import shutil
import subprocess
import sys

here = Path(__file__).resolve().parent
tree, source_writer = map(Path, sys.argv[1:])
system = tree.resolve() / "picocalc-os"
root = next(parent for parent in here.parents if (parent / ".git").exists())
assert root not in system.parents
subprocess.run(["node", here / "01-stage.mjs", system / "compiler"], check=True)
main = system / "port/esp32p4/main"
subprocess.run(["node", here / "03-writer.mjs", source_writer, main], check=True)
shutil.copyfile(here / "board.c", main / "literal_bench.c")
shutil.copyfile(here / "board.S", main / "literal_bench.S")
linker = system / "compiler/typed-world.js"
linker.write_text(linker.read_text() + """
globalThis.compileLiteralHalf = (source, reactor, options) =>
    compileTypedWorldRv32(source, reactor, {...options, literalPool:true});
globalThis.compileLiteralWord = (source, reactor, options) =>
    compileTypedWorldRv32(source, reactor, {...options, literalPool:true, literalWordCopy:true});
""")

def replace(path, old, new):
    text = path.read_text()
    assert text.count(old) == 1
    path.write_text(text.replace(old, new))

replace(main / "CMakeLists.txt", "    target_include_directories(${COMPONENT_LIB} PRIVATE ${OS}/sdk/typed)",
        """    target_include_directories(${COMPONENT_LIB} PRIVATE ${OS}/sdk/typed)
    target_sources(${COMPONENT_LIB} PRIVATE literal_bench.c literal_bench.S)
    set_property(SOURCE literal_bench.S APPEND PROPERTY OBJECT_DEPENDS
        "${CMAKE_CURRENT_LIST_DIR}/literal-stock.bin;${CMAKE_CURRENT_LIST_DIR}/literal-half.bin;${CMAKE_CURRENT_LIST_DIR}/literal-word.bin")""")
replace(main / "main_p4.c", '  else if (!strcmp(cmd, "painter")) p4_painter_status();',
        '''  else if (!strcmp(cmd, "painter")) p4_painter_status();
  else if (!strcmp(cmd, "litbench")) { extern void literal_bench(void); literal_bench(); }''')
