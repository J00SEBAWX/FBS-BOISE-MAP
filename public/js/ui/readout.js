/* The Measure / place readout next to the cursor (x, y in feet and inches from the south-west corner,
 * distance to the nearest wall, what it snapped to, and the A-B length), and the status bar line. */
import {formatFtIn} from "../core/units.js";
import {describeSnap} from "../core/snap.js";

export function createReadout() {
  const el = document.getElementById("readout"), pos = document.getElementById("stPosText"), sel = document.getElementById("stSel"), hint = document.getElementById("stHint");
  const lines = {};
  for (const k of ["pos", "wall", "snap", "ab"]) { const s = document.createElement("span"); s.className = "ro-" + k; el.appendChild(s); lines[k] = s; }
  const xy = p => `x ${formatFtIn(p.x)}  y ${formatFtIn(p.y)}`;
  let parent = null;
  return {
    /** Shows the readout for a snapped point at screen position (sx, sy) inside `host`; null hides it. */
    show(host, snap, sx, sy, measure) {
      if (!snap) { el.hidden = true; return; }
      if (parent !== host) { host.appendChild(el); parent = host; }
      lines.pos.textContent = xy(snap);
      const d = snap.distances;
      lines.wall.textContent = d && d.nearestWall && Number.isFinite(d.toNearestWall)
        ? (d.toNearestWall < 0.05 ? `On ${clean(d.nearestWall.name)}` : `${formatFtIn(d.toNearestWall)} to ${clean(d.nearestWall.name)}`) : "";
      lines.snap.textContent = snap.snappedTo && snap.snappedTo.length ? "Snapped: " + describeSnap(snap.snappedTo) : "Not snapped";
      const dist = measure && measure.a ? measure.distance : null;
      lines.ab.textContent = dist !== null && dist !== undefined ? `A to ${measure.b ? "B" : "here"}: ${formatFtIn(dist)}` : "";
      lines.ab.hidden = !lines.ab.textContent;
      el.hidden = false;
      const r = host.getBoundingClientRect(), w = el.offsetWidth || 180, h = el.offsetHeight || 60;
      let x = sx + 18, y = sy + 18;
      if (x + w > r.width - 8) x = sx - w - 18;
      if (y + h > r.height - 8) y = sy - h - 18;
      el.style.setProperty("--x", Math.max(8, x).toFixed(0));
      el.style.setProperty("--y", Math.max(8, y).toFixed(0));
    },
    hide() { el.hidden = true; },
    /** Status bar: the floor point under the pointer. */
    pointer(p) { pos.textContent = p ? xy(p) : "–"; },
    selection(text) { sel.textContent = text || ""; },
    hint(text) { hint.textContent = text || ""; },
  };
}
const clean = n => String(n || "the wall").replace(/\s*\(.*?\)\s*/g, " ").trim();
