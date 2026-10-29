// Exercises the persistent store: puts and shows values, puts and then throws, puts past its quota (store_kb 1
// in test/store.json), and removes. Each handler logs what the record holds afterwards.
function show(what) { log(what + ": " + JSON.stringify(store.all())); }
service("keep")
  .onStart(function () { show("start"); })
  .on("put", function (s, m) { store.set(m.k, m.v); show("put " + m.k); })
  .on("many", function (s, m) { for (var i = 0; i < m.n; i++) store.set("n", i); show("many"); })
  .on("put-throw", function (s, m) { store.set(m.k, m.v); throw new Error("thrown after store.set"); })
  .on("big", function (s, m) {
    try { store.set("big", repeat("x", m.n)); show("big"); } catch (e) { log("big: " + e.message); show("after big"); }
  })
  .on("remove", function (s, m) { store.remove(m.k); show("remove " + m.k); })
  .on("show", function () { show("show"); })
  .on("rude", function () { try { sys.powerOff(); } catch (e) { log("rude: " + e.message); } })
  .on("mutate", function (s) { var v = store.get("a"); v.x = 99; show("mutated a copy"); });
