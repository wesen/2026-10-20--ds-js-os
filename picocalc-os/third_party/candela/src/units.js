// units.js — physical quantities as values with a dimension. Radiometry and photometry are typed:
// lumen (flux) is not candela (intensity) is not lux (illuminance) is not nit (luminance).
import { CandelaError } from './diag.js';

export const fmtNum = x => {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return x.toExponential(3).replace(/\.?0+e/, 'e');
  return String(+x.toPrecision(5));
};

export class Quantity {
  constructor(v, dim, unit, shown) { this.v = v; this.dim = dim; this.unit = unit; this.shown = shown == null ? v : shown; Object.freeze(this); }
  get value() { return this.v; }
  get deg() { return this.dim === 'angle' ? this.v * 180 / Math.PI : undefined; }
  get rad() { return this.dim === 'angle' ? this.v : undefined; }
  toString() { return `${fmtNum(this.shown)} ${this.unit}`; }
  toJSON() { return this.toString(); }
  valueOf() { return this.v; }
}
export const isQ = x => x instanceof Quantity;

const DIM_NAMES = {
  flux: 'luminous flux [lm]', intensity: 'luminous intensity [cd = lm/sr]', illuminance: 'illuminance [lx = lm/m²]', luminance: 'luminance [nit = cd/m²]',
  temperature: 'temperature [K]', length: 'length [m]', angle: 'angle', time: 'time [s]', power: 'radiant power [W]', ev: 'exposure value [EV100]', ratio: 'ratio',
};
export const dimName = d => DIM_NAMES[d] || d;

const mk = (dim, unit, scale = 1) => {
  const f = x => {
    if (Array.isArray(x)) return x.map(v => f(v));
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new CandelaError('E121', `u.${unit}(…) expects a finite number, got ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`);
    return new Quantity(x * scale, dim, unit, x);
  };
  return f;
};
export const u = {
  lm: mk('flux', 'lm'), W: mk('power', 'W'), cd: mk('intensity', 'cd'), lux: mk('illuminance', 'lx'), lx: mk('illuminance', 'lx'), nit: mk('luminance', 'nit'),
  K: mk('temperature', 'K'), m: mk('length', 'm'), cm: mk('length', 'cm', 0.01), mm: mk('length', 'mm', 1e-3), um: mk('length', 'µm', 1e-6), nm: mk('length', 'nm', 1e-9),
  deg: mk('angle', '°', Math.PI / 180), rad: mk('angle', 'rad'), s: mk('time', 's'), ms: mk('time', 'ms', 1e-3), ev: mk('ev', 'EV'),
};

// '1200 lm', '35 deg', '5600 K', 'f/4' — for strings typed by people and agents
const PARSE = { lm: 'lm', lumen: 'lm', lumens: 'lm', w: 'W', cd: 'cd', candela: 'cd', lx: 'lux', lux: 'lux', nit: 'nit', nits: 'nit', 'cd/m2': 'nit', 'cd/m²': 'nit', k: 'K', m: 'm', cm: 'cm', mm: 'mm', um: 'um', 'µm': 'um', nm: 'nm', deg: 'deg', '°': 'deg', degrees: 'deg', rad: 'rad', s: 's', ms: 'ms', ev: 'ev' };
export function parseQuantity(s) {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  const f = t.match(/^f\/?\s*([\d.]+)$/i); if (f) return +f[1];
  const m = t.match(/^(-?[\d.]+(?:e[-+]?\d+)?)\s*([a-zA-Z°µ/²]+)$/);
  if (!m) { if (/^-?[\d.]+(e[-+]?\d+)?$/i.test(t)) return +t; return s; }
  const k = PARSE[m[2].toLowerCase()] || PARSE[m[2]];
  if (!k) throw new CandelaError('E120', `unknown unit '${m[2]}' in '${s}'`, { hint: 'units: lm, cd, lx, nit, K, m, cm, mm, nm, deg, s' });
  return u[k](+m[1]);
}

// a value for a slot that wants dimension `dim`. Bare numbers mean the slot's canonical unit.
export function expectDim(x, dim, what, o = {}) {
  x = parseQuantity(x);
  if (typeof x === 'number') return o.scale ? x * o.scale : x;
  if (isQ(x)) {
    if (x.dim === dim) return x.v;
    const hints = o.hints && o.hints[x.dim];
    throw new CandelaError('E120', `${what} expects ${dimName(dim)}; got ${dimName(x.dim)} (${x})`, { hint: hints });
  }
  return x;   // fields, params: checked elsewhere
}
