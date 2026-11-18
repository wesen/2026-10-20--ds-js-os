function check(name, ok) {
  log("CATALOG " + name + " " + (ok ? "PASS" : "FAIL"));
}

service("catalog-probe").onStart(async () => {
  const missing = await ask("catalog-peer", "describe");
  const explicit = await ask("catalog-peer", "describe", null);
  const falsy = await ask("catalog-peer", "describe", [0, false, ""]);
  check("absent-null-falsy",
    missing.from === "catalog-probe" && missing.ask && missing.kind === "undefined"
    && explicit.kind === "object" && explicit.value === null
    && JSON.stringify(falsy.value) === '[0,false,""]');

  const data = await ask("catalog-peer", "describe", {
    none: null, skip: undefined, list: [undefined, NaN, Infinity, -0, 1700000000000], label: "café 🐍"
  });
  check("json-values", JSON.stringify(data.value)
    === '{"none":null,"list":[null,null,null,0,1700000000000],"label":"café 🐍"}');

  const late = await ask("catalog-peer", "later", { value: 9 });
  check("suspending-reply", late.value === 10 && late.later);
  try { await ask("catalog-peer", "no-handler"); check("missing-handler", false); }
  catch (e) { check("missing-handler", String(e).includes("no handler")); }

  const h = hw.fs("fs:/").at("probe.txt", "rw");
  await h.write("one");
  const passed = await ask("catalog-peer", "file", { first: h, again: h });
  check("nested-handle-and-file-io", passed.same && passed.text === "one" && await h.read() === "two");
  h.revoke();
  h.release();
  const revoked = await ask("catalog-peer", "old-file");
  check("revocation", revoked === true);

  const source = "globalThis.catalogN = 4; print('step', catalogN); catalogN * 3";
  const evaluated = await ask("sandbox", "eval", { code: source });
  const resumed = await ask("sandbox", "eval", { code: "Promise.resolve(catalogN + 1)" });
  const thrown = await ask("sandbox", "eval", { code: "throw new Error('sample')" });
  const rejected = await ask("sandbox", "eval", { code: "Promise.reject('rejected')" });
  check("sandbox-print-completion", evaluated.ok && evaluated.out === "12" && evaluated.printed[0] === "step 4");
  check("sandbox-global-async", resumed.ok && resumed.out === "5");
  check("sandbox-errors", !thrown.ok && thrown.out.includes("sample") && !rejected.ok && rejected.out === "rejected");
});
