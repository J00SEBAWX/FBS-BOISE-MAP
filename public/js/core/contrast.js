/* Text that stays readable on a department's colour (WCAG 1.4.3: 4.5:1 for normal text). The hanging signs in 3D
 * write a department name and its area on the department's own colour, which can be any hue (the 12 palette
 * colours in both themes, or a custom category's). Pure: no DOM. */

const INK = "#15212D"; // the app's --ink / dark --ink-inverse: the dark text colour
const WHITE = "#FFFFFF";
const FALLBACK = "#677A8B";

function parse(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].split("").map(c => c + c).join("") : m[1];
  const n = parseInt(s, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
const toHex = c => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const lum = c => {
  const [r, g, b] = c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);

/** The WCAG contrast ratio of two #rgb / #rrggbb colours (1 when either is not a hex colour). */
export function contrastRatio(a, b) { const x = parse(a), y = parse(b); return x && y ? ratio(x, y) : 1; }

/**
 * {bg, fg, ratio}: the colour for a sign's background and its text. The text is white or the dark ink, whichever
 * reads better on `hex`; when even that is under `min` (mid-tones like orange or rose), the background moves
 * towards black (white text) or white (dark text) by the smallest step that reaches `min`, so the sign still
 * looks like its department. A value that is not a hex colour falls back to the neutral slate.
 */
export function readableOn(hex, min = 4.5) {
  const base = parse(hex) || parse(FALLBACK);
  const w = parse(WHITE), k = parse(INK);
  const rw = ratio(base, w), rk = ratio(base, k);
  const useWhite = rw >= rk;
  const fg = useWhite ? w : k, toward = useWhite ? [0, 0, 0] : [255, 255, 255];
  let bg = base, r = useWhite ? rw : rk;
  for (let f = 0.02; r < min && f <= 1.0001; f += 0.02) { bg = mix(base, toward, f); r = ratio(bg, fg); }
  return {bg: toHex(bg), fg: toHex(fg), ratio: r};
}
