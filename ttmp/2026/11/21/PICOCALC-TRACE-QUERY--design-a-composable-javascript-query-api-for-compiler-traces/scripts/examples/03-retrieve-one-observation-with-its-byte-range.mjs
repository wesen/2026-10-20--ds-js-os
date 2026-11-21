// Proposed API example 03. Retrieve one observation with its byte range
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  return run.events("middle").at(74)
    .select("ordinal", "header", "ref");
}
