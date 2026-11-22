// Machine-function properties in the backend stream, and when NoVRegs became true.
(() => {
  const backend = a.variant("checked").function("row").timeline("backend");
  const noVRegs = q.machine.property("NoVRegs");
  const firstTrue = q.run(backend.measure(noVRegs).changes().where(c => c.status === "known" && c.after === true).first());
  return {
    propertiesAt78: q.run(q.machine.properties().at(backend.at(78).after)),
    becameTrue: firstTrue,
  };
})()
