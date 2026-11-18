// A bounded syntactic decision for arithmetic whose typed operands are all Ints.
// Unknown operands may be any safe integer. A bitwise primitive has the stated
// fixed bounds regardless of the types or values of its inner operands.
function endpoint(e, upper) {
  if (e.kind === 'Int') return e.value;
  if (e.kind === 'Prim') {
    switch (e.op) {
      case '>>>': return upper ? 4294967295 : 0;
      case 'Math.clz32': return upper ? 32 : 0;
      case '~': case '&': case '|': case '^': case '<<': case '>>': case 'Math.imul':
        return upper ? 2147483647 : -2147483648;
    }
  }
  return upper ? 9007199254740991 : -9007199254740991;
}

// Integer endpoints may overflow a safe range but cannot produce fractions.
const safe = (x /*: Number */) => x >= -9007199254740991 && x <= 9007199254740991;

export function needsNumber(e) {
  switch (e.op) {
    case 'neg': return e.args[0].kind !== 'Int' || e.args[0].value === 0;
    case '+': case '-': case '*': case '%': break;
    default: return false;
  }
  const a = e.args[0], b = e.args[1];
  const lowA = endpoint(a, false), highA = endpoint(a, true);
  const lowB = endpoint(b, false), highB = endpoint(b, true);
  switch (e.op) {
    case '+':
      return !safe(lowA + lowB) || !safe(highA + highB);
    case '-':
      return !safe(lowA - highB) || !safe(highA - lowB);
    case '*':
      if ((lowA <= 0 && highA >= 0 && lowB < 0) || (lowB <= 0 && highB >= 0 && lowA < 0)) return true;
      return !safe(lowA * lowB) || !safe(lowA * highB) || !safe(highA * lowB) || !safe(highA * highB);
    case '%':
      if (lowB <= 0 && highB >= 0) return true;
      if (lowA >= 0) return false;
      return lowA !== highA || lowB !== highB || lowA % lowB === 0;
  }
  return true;
}
