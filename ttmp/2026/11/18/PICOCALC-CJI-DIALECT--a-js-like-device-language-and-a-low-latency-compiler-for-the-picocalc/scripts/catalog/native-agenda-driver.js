const exact = "- [ ] dentist @2026-11-03 14:30 !15m";
const parsed = agParse(exact);
const invalid = agParse("- [x] invalid @2026-02-29 14:30");
console.log(JSON.stringify({ parsed, invalidDate: invalid.date, invalidDone: invalid.done }));
