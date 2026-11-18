// Chapter 10: Math's functions and constants. The parser turns Math.f(x) into the operator
// Math.f; the type checker gives it a type from the table; cast_insert turns it into the
// operator below for the operand types, each of which runtime.c (and every interpreter)
// implements under the same name.
//
//   int    the operator when every operand is an Int ('id': the operand itself), or absent
//          when an Int is first widened to a Number
//   num    the operator on Numbers (doubles)
//   int32  the operands are converted to 32-bit integers first, as the bitwise operators'
//   result the type of the result when it is not that of the operands
// chapter 23: a world's wall clock is virtual: Math.$clock(t) sets it, and Math.$now() reads it
// from then on (src/world.js sets it to a fixed boot time plus the world's virtual time)
let virtualClock = null;
export const hostNow = () => virtualClock ?? Date.now();
const setClock = (t) => { virtualClock = t; return t; };
// (CJI-3: these three are the interpreters' alone, HOST_MATH and MATH_OPS below; the compiler
// only names the operators, so a build of it, and cji compiling it, leaves them out)
const hostOffset = (t) => {   // the local time minus UTC at t, in ms, from JavaScript's own fields
  if (!Number.isFinite(t)) return NaN;
  const d = new Date(t), u = new Date(0);
  u.setUTCFullYear(d.getFullYear(), d.getMonth(), d.getDate());
  u.setUTCHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return u.getTime() - t;
};

export const MATH = Object.assign(Object.create(null), {
  floor: { arity: 1, int: 'id', num: 'math_floor' },
  ceil: { arity: 1, int: 'id', num: 'math_ceil' },
  round: { arity: 1, int: 'id', num: 'math_round' },
  trunc: { arity: 1, int: 'id', num: 'math_trunc' },
  abs: { arity: 1, int: 'int_abs', num: 'math_abs' },
  sign: { arity: 1, int: 'int_sign', num: 'math_sign' },
  sqrt: { arity: 1, num: 'math_sqrt' },
  cbrt: { arity: 1, num: 'math_cbrt' },
  exp: { arity: 1, num: 'math_exp' },
  log: { arity: 1, num: 'math_log' },
  log2: { arity: 1, num: 'math_log2' },
  log10: { arity: 1, num: 'math_log10' },
  sin: { arity: 1, num: 'math_sin' },
  cos: { arity: 1, num: 'math_cos' },
  tan: { arity: 1, num: 'math_tan' },
  atan: { arity: 1, num: 'math_atan' },
  asin: { arity: 1, num: 'math_asin' },
  acos: { arity: 1, num: 'math_acos' },
  atan2: { arity: 2, num: 'math_atan2' },
  hypot: { arity: 2, num: 'math_hypot' },
  // chapter 21: the host's clock and the local time zone, for the Date library (src/parse.js):
  // Math.$now(), the time in ms; Math.$tz(t), the local time minus UTC at the time t, in ms
  $now: { arity: 0, num: 'date_now' },
  $clock: { arity: 1, num: 'date_clock' },   // chapter 23
  $tz: { arity: 1, num: 'date_tz' },
  // chapter 21: the hyperbolic functions
  sinh: { arity: 1, num: 'math_sinh' }, cosh: { arity: 1, num: 'math_cosh' }, tanh: { arity: 1, num: 'math_tanh' },
  asinh: { arity: 1, num: 'math_asinh' }, acosh: { arity: 1, num: 'math_acosh' }, atanh: { arity: 1, num: 'math_atanh' },
  fround: { arity: 1, num: 'math_fround' },
  min: { arity: 'n', int: 'int_min', num: 'num_min' },
  max: { arity: 'n', int: 'int_max', num: 'num_max' },
  pow: { arity: 2 },                                   // the parser makes it **
  clz32: { arity: 1, int32: 'math_clz32', result: 'Int' },
  imul: { arity: 2, int32: 'math_imul', result: 'Int' },
});

// What the interpreters run for those three (the others are JavaScript's Math's own)
export const HOST_MATH = { $now: hostNow, $clock: setClock, $tz: hostOffset };

export const MATH_CONSTANTS = { PI: Math.PI, E: Math.E, LN2: Math.LN2, LN10: Math.LN10, SQRT2: Math.SQRT2 };

// JavaScript's Math.round: halves go up (towards +Infinity), and -0.4 rounds to -0.
const jsRound = (x) => Math.round(x);

// What each operator means, on the interpreters' values (JavaScript numbers).
export const MATH_OPS = {
  math_floor: Math.floor, math_ceil: Math.ceil, math_round: jsRound, math_trunc: Math.trunc,
  math_abs: Math.abs, math_sign: Math.sign, math_sqrt: Math.sqrt, math_cbrt: Math.cbrt,
  math_exp: Math.exp, math_log: Math.log, math_log2: Math.log2, math_log10: Math.log10,
  math_sin: Math.sin, math_cos: Math.cos, math_tan: Math.tan, math_atan: Math.atan, math_asin: Math.asin,
  math_acos: Math.acos, math_atan2: Math.atan2, math_hypot: Math.hypot, math_fround: Math.fround,
  num_min: Math.min, num_max: Math.max,
  int_abs: Math.abs, int_sign: (x) => (x > 0 ? 1 : x < 0 ? -1 : 0), int_min: Math.min, int_max: Math.max,
  math_clz32: Math.clz32, math_imul: Math.imul,
  date_now: hostNow, date_tz: hostOffset, date_clock: setClock,   // chapter 21 (chapter 23: date_clock)
  math_sinh: Math.sinh, math_cosh: Math.cosh, math_tanh: Math.tanh,   // chapter 21
  math_asinh: Math.asinh, math_acosh: Math.acosh, math_atanh: Math.atanh,
};

// The operators' names, in MATH_OPS's order: what the compiler needs (src/dynamic.js checks
// that the two agree).
export const MATH_OP_NAMES = ['math_floor', 'math_ceil', 'math_round', 'math_trunc',
  'math_abs', 'math_sign', 'math_sqrt', 'math_cbrt', 'math_exp', 'math_log', 'math_log2', 'math_log10',
  'math_sin', 'math_cos', 'math_tan', 'math_atan', 'math_asin', 'math_acos', 'math_atan2', 'math_hypot', 'math_fround',
  'num_min', 'num_max', 'int_abs', 'int_sign', 'int_min', 'int_max', 'math_clz32', 'math_imul',
  'date_now', 'date_tz', 'date_clock', 'math_sinh', 'math_cosh', 'math_tanh', 'math_asinh', 'math_acosh', 'math_atanh'];
export const MATH_OP_SET = new Set(MATH_OP_NAMES);

// The operators whose result is an Int, and those whose result is a Number.
export const MATH_INT_RESULT = new Set(['int_abs', 'int_sign', 'int_min', 'int_max', 'math_clz32', 'math_imul']);
export const MATH_NUMBER_RESULT = new Set(MATH_OP_NAMES.filter((k) => !MATH_INT_RESULT.has(k)));
export const MATH_SOURCE_OPS = Object.keys(MATH).filter((k) => k !== 'pow').map((k) => `Math.${k}`);
