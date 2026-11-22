// The text of row() after middle-end event 74, and a search inside it.
(() => {
  const middle = a.variant("checked").function("row").timeline("middle");
  const after = middle.at(74).after;
  return {
    state: q.run(after),
    hits: q.run(after.excerpt({contains: "load i32, ptr %work", context: 1})),
  };
})()
