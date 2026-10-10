/* Feet-and-inches formatting and parsing. Pure: no DOM.
 * The map stores every length in decimal feet; people read and type feet and inches. */

const FT_PER_M = 3.280839895;

/**
 * 25.5 -> 25' 6"   ·   0.5 -> 0' 6"   ·   -3.25 -> -3' 3"
 * Rounds to the nearest inch (or to 1/2, 1/4 ... inch with opts.fraction = 2, 4 ...).
 * opts.compact drops a zero inch part (12 -> 12') and puts no space between the parts.
 */
export function formatFtIn(feet, opts = {}) {
  if (!Number.isFinite(feet)) return "–";
  const frac = opts.fraction > 1 ? Math.round(opts.fraction) : 1;
  const neg = feet < 0;
  let inches = Math.round(Math.abs(feet) * 12 * frac) / frac;
  let ft = Math.floor(inches / 12 + 1e-9);
  inches = Math.round((inches - ft * 12) * frac) / frac;
  if (inches >= 12) { ft += 1; inches -= 12; }
  if (ft === 0 && inches === 0) return opts.compact ? "0'" : "0' 0\"";
  const sign = neg ? "-" : "";
  const inStr = inchString(inches, frac);
  if (opts.compact) return sign + ft + "'" + (inches ? inStr + '"' : "");
  return `${sign}${ft}' ${inStr}"`;
}
function inchString(inches, frac) {
  const whole = Math.floor(inches + 1e-9), rest = inches - whole;
  if (frac === 1 || rest < 1e-9) return String(whole);
  // reduce the fraction (2/4 -> 1/2)
  let num = Math.round(rest * frac), den = frac;
  while (num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
  return whole + " " + num + "/" + den;
}

/** 25.5 -> "25.5 ft" (for screen readers and logs). */
export const formatFeet = (feet, digits = 1) => `${Number(feet.toFixed(digits))} ft`;

/** Square feet with a thousands separator: 612.4 -> "612 sq ft". */
export const formatSqft = sq => `${Math.round(sq).toLocaleString("en-US")} sq ft`;

/**
 * Reads a length the way people type it, in feet. Returns null when it can't be read.
 * Accepts: 25.5 · 25' · 25'6 · 25' 6" · 25'6.5" · 25' 6 1/2" · 306" · 6 1/2" · 25 ft 6 in · 25ft · 7.77m · 300cm · -2'
 */
export function parseLength(input) {
  if (typeof input !== "string" && typeof input !== "number") return null;
  let s = String(input).trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/''/g, '"');
  if (!s) return null;
  let sign = 1;
  if (s[0] === "-") { sign = -1; s = s.slice(1).trim(); } else if (s[0] === "+") s = s.slice(1).trim();
  const NUM = "(\\d+(?:\\.\\d*)?|\\.\\d+)";
  const FRAC = "(?:\\s+(\\d+)\\s*/\\s*(\\d+)|\\s*(\\d+)\\s*/\\s*(\\d+))";
  let m;
  // metric
  if ((m = new RegExp(`^${NUM}\\s*(m|cm|mm)$`).exec(s))) {
    const v = parseFloat(m[1]) / {m: 1, cm: 100, mm: 1000}[m[2]];
    return sign * v * FT_PER_M;
  }
  // plain number = feet
  if ((m = new RegExp(`^${NUM}$`).exec(s))) return sign * parseFloat(m[1]);
  // inches only: 306"  ·  6 1/2"  ·  1/2"  ·  6 in
  if ((m = new RegExp(`^(?:${NUM}${FRAC}?|(\\d+)\\s*/\\s*(\\d+))\\s*(?:"|in|inch|inches)$`).exec(s))) {
    const inch = inchesFrom(m);
    return Number.isFinite(inch) ? sign * inch / 12 : null;
  }
  // feet and optional inches: 25' · 25'6 · 25' 6" · 25 ft 6 in · 25' 6 1/2"
  const FT = `${NUM}\\s*(?:'|ft|feet|foot)`;
  if ((m = new RegExp(`^${FT}(?:\\s*,?\\s*(?:${NUM}${FRAC}?|(\\d+)\\s*/\\s*(\\d+))\\s*(?:"|in|inch|inches)?)?$`).exec(s))) {
    const ft = parseFloat(m[1]);
    const inch = m[2] !== undefined || m[7] !== undefined ? inchesFrom(m, 1) : 0;
    if (!Number.isFinite(inch)) return null;
    if (inch >= 12 + 1e-9 && m[2] !== undefined && !s.includes('"') && !/in/.test(s)) return null; // 25'14 is a typo
    return sign * (ft + inch / 12);
  }
  return null;
}
// m holds (whole, fracNumA, fracDenA, fracNumB, fracDenB, onlyNum, onlyDen) starting at index off+1
function inchesFrom(m, off = 0) {
  const g = i => m[i + off];
  if (g(1) !== undefined) {
    let v = parseFloat(g(1));
    const num = g(2) ?? g(4), den = g(3) ?? g(5);
    if (num !== undefined && den !== undefined) v = +den > 0 ? v + +num / +den : NaN;
    return v;
  }
  if (g(6) !== undefined) return +g(7) > 0 ? +g(6) / +g(7) : NaN;
  return 0;
}
