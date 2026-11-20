#!/usr/bin/env bash
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
q=picocalc-os/third_party/quickjs
make -C picocalc-os build/eng/quickjs.o build/eng/libregexp.o build/eng/libunicode.o build/eng/dtoa.o build/eng/cutils.o >/dev/null
cc -O2 -I"$q" "$dir/14-host-heap.c" picocalc-os/build/eng/{quickjs,libregexp,libunicode,dtoa,cutils}.o -lm -lpthread -ldl -o /tmp/render-system-host-heap
node "$dir/12-board-capsule.cjs" /tmp/render-system-board.js >/dev/null
for arm in G M A; do /tmp/render-system-host-heap /tmp/render-system-board.js "$arm"; echo; done > "$dir/../various/quickjs-host-heap.ndjson"
node - "$dir" <<'JS'
const dir=process.argv[2];const fs=require('node:fs');
const {src,read}=require(dir+'/04-harness.cjs');const {manualSource}=require(dir+'/07-manual-study.cjs');
const {extract}=require(dir+'/08-extract.cjs');const x=extract(src('sysmon'));
for(const [name,s] of Object.entries({generic:src('sysmon'),manual:manualSource(),manualResident:read(dir+'/06-manual-receiver.js'),
autoResident:read(dir+'/09-auto-runtime.js')+'\nconst catalog='+JSON.stringify({version:x.version,entries:x.entries})+';'}))fs.writeFileSync('/tmp/render-system-size-'+name+'.js',s);
JS
for name in generic manual manualResident autoResident; do echo -n "{\"component\":\"$name\",\"size\":"; /tmp/render-system-host-heap "/tmp/render-system-size-$name.js" compile; echo '}'; done > "$dir/../various/quickjs-component-sizes.ndjson"
