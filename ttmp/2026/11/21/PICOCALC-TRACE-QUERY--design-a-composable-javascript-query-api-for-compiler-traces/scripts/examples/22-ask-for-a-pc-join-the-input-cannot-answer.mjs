// Proposed API example 22. Ask for a PC join the input cannot answer
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const summary = profiles.arm("checked-llvm");
  return q.joinPCs(summary, run.finalImage())
    .requireMatch("imageSHA", "addressSpace");
}
