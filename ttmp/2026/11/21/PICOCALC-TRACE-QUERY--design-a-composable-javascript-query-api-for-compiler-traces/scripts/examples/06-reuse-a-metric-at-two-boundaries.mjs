// Proposed API example 06. Reuse a metric at two boundaries
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  return q.bundle({
    earlier: header.at(middle.at(73).after),
    later:   header.at(middle.at(74).after)
  });
}
