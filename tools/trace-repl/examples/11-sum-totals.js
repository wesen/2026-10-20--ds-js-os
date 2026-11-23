// Direct stack accesses of the stock Typed compile: two disjoint totals summed with a label.
(() => {
  const stock = profiles.arm("typed-stock").region("row").workload("opening-160-rows");
  return q.run(q.add(stock.total("stackLoads"), stock.total("stackStores")).label("direct stack accesses"));
})()
