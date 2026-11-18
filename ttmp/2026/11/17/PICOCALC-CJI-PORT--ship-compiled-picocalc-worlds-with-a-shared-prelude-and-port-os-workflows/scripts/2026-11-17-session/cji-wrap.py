from pathlib import Path
cm=Path('picocalc-os/port/esp32p4/main/CMakeLists.txt')
s=cm.read_text(); rows=[l for l in s.splitlines(True) if 'cji_paths' in l or l.strip()=='target_include_directories(${COMPONENT_LIB} PRIVATE ${CMAKE_CURRENT_BINARY_DIR})']; cm.write_text(''.join(l for l in s.splitlines(True) if l not in rows))
o=cm.parent.parent/'optional/native_elf/CMakeLists.txt'
s=o.read_text(); o.write_text(s.replace('# Build target', rows[0].strip()+'\nforeach(name IN LISTS CJI_WORLDS ITEMS toplog)\n    '+rows[1].strip()+'\nendforeach()\n'+'\n'.join(l.strip() for l in rows[2:])+'\n\n# Build target'))
c=next(Path('ttmp/2026/11/17').glob('PICOCALC-CJI--*/sources/cji'))
p=c/'src/world-native.js';s=p.read_text()
start=s.index('    const out /*: Any */ = { id: h');end=s.index('    return out;',start)+len('    return out;')
wrapper=s[start:end].replace("id: h, type: 'i2c', rights: 'rw',","id: h, type: type, rights: rights,")
s=s[:start]+"    return $handle(h, 'i2c', 'rwg');"+s[end:]
s=s.replace('const hw /*: Any */', '''function $handle(h /*: Any */, type /*: Any */, rights /*: Any */) /*: Any */ {
  if (type !== 'i2c') return { id: h, type: type, rights: rights, release: () => $call(${NW.RELEASE}, h, 0, undefined, undefined, undefined) };
'''+wrapper+'''
}
const hw /*: Any */''')
s=s.replace('const $json /*: Any */', '''// Translate only at message boundaries. Preserve the ordinary JSON representation of dates and collections.
function $wire(v /*: Any */, incoming /*: Bool */, depth /*: Int */) /*: Any */ {
  if (v === null || typeof v !== 'object') return v;
  if (depth > 64) throw new Error('message nesting exceeds 64');
  if (!incoming && typeof v.release === 'function' && typeof v.id === 'number') return { $h: v.id };
  if (incoming && typeof v.$h === 'number' && Object.keys(v).length === 1) {
    const info /*: Any */ = $call(1001, v.$h, 0, undefined, undefined, undefined);
    if (typeof info !== 'string') return $handle(v.$h, 'gone', '');
    const meta /*: Any */ = JSON.parse(info);
    return $handle(v.$h, meta.type, meta.rights);
  }
  if (!Array.isArray(v) && ('$date' in v || '$mk' in v || '$sv' in v)) return v;
  if (Array.isArray(v)) {
    const xs /*: Any[] */ = [];
    for (let i = 0; i < v.length; i++) xs.push($wire(v[i], incoming, depth + 1));
    return xs;
  }
  const out /*: Any */ = {}, keys = Object.keys(v);
  for (let i = 0; i < keys.length; i++) out[keys[i]] = $wire(v[keys[i]], incoming, depth + 1);
  return out;
}
function $decode(json /*: Any */) /*: Any */ {
  if (json === undefined || json === 'null') return undefined;
  const v /*: Any */ = JSON.parse(json);
  return json.indexOf('$h') >= 0 || json.indexOf('\\\\u') >= 0 ? $wire(v, true, 0) : v;
}
function $reply(v /*: Any */) {
  try { $check($call(${NW.REPLY}, 0, 0, $json(v), undefined, undefined)); }
  catch (e) { $call(${NW.REJECT}, 0, 0, errText(e), undefined, undefined); }
}
const $json /*: Any */''').replace('v === undefined ? undefined : JSON.stringify(v));','v === undefined ? undefined : JSON.stringify($wire(v, false, 0)));',1)
s=s.replace("json === undefined || json === 'null' ? undefined : JSON.parse(json)",'$decode(json)').replace('if (isAsk) $call(${NW.REPLY}, 0, 0, $json(v), undefined, undefined);','if (isAsk) $reply(v);').replace('if (isAsk) $call(${NW.REPLY}, 0, 0, $json(r), undefined, undefined);','if (isAsk) $reply(r);')
# Always inspect escaped incoming keys. The JS template inside JS would need additional escape levels.
s=s.replace(" || json.indexOf('\\\\u') >= 0"," || json.indexOf(String.fromCharCode(92)) >= 0")
p.write_text(s)
p=Path('picocalc-os/nucleus/native.c');s=p.read_text().replace('    case NW_CLOCK_WALL:', '''    // Firmware-private CJI operation, outside the public native wire ABI.
    case 1001: {
      if (!W->nat->cji_handles) return fail(W, "handle metadata requires a bundled CJI module");
      char err[160];
      handle_t *h = handle_use(W, c->i[0], -1, 0, err, sizeof err);
      if (!h) return fail(W, "%s", err);
      return snprintf(out, out_n, "{\\"type\\":\\"%s\\",\\"rights\\":\\"%s%s%s\\"}", handle_type_name(h->type),
                      h->rights & R_READ ? "r" : "", h->rights & R_WRITE ? "w" : "", h->rights & R_GRANT ? "g" : "");
    }
    case NW_CLOCK_WALL:''');p.write_text(s)
p=c/'tests/native/toplog.world.js';s=p.read_text().replace('.on("ping", (s) => "pong");','.on("ping", (s) => "pong")\n  .on("roundtrip", (s, payload) => payload);');p.write_text(s)
