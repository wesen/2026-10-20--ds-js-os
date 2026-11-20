# Native producer from resident cJSON

Compile and run all eight host arms, the exact-byte and boundary qualifications, and the allocation census.

```sh
bash ttmp/2026/11/20/PICOCALC-RENDER-BINARY--*/scripts/producer/reproduce.sh
```

The default source library is /home/manuel/esp/esp-idf-5.4.2/components/json/cJSON. Supply another directory as the first parameter, then an optional output directory. The principal’s scripts/native/binary_native_fixtures.h supplies the frozen input and expected outputs. The script writes the raw timings, allocation census, verification log and host summary into /tmp/pico-binary-native-producer by default. The original measurements are in results.

For the director’s board runner, include binary_producer.inc immediately after binary_native.inc. Use bp_trial("sysmon-B",8) to run eight publications. Substitute sysmon/chess/snake/editor and G/B for every treatment. A run checks the exact frozen binary bytes, the JSON tree’s structural equality, the weighted whole-tree and late-leaf witnesses and outputs FNV-1a over the publication. The host qualification additionally checks the bytes of all native JSON publications against the frozen JSON inputs.

Every timing is in microseconds summed over the repetitions, except bytes and witnesses, which describe one message. routeUs adds encodeUs, admitUs, lookupUs and releaseUs. The input cJSON tree is already resident. The encoder includes each dictionary insertion, size pass, allocation, write and scratch release. The receiver copies and validates the B wire or parses and validates the G wire, following the group's existing native receiver. Each reads the late leaf once, checks witnesses outside the clocks, then releases the newly allocated storage. This experiment ends before compositing and display.
