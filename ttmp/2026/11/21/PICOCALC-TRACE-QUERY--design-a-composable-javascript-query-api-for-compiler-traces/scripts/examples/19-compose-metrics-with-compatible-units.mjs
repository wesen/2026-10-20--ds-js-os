// Proposed API example 19. Compose metrics with compatible units
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const stock = profiles.arm("typed-stock").region("row")
    .workload("opening-160-rows");
  return q.add(stock.total("stackLoads"), stock.total("stackStores"))
    .label("direct stack accesses");
}
