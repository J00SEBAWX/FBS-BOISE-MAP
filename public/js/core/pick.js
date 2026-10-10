/* What a pointer ray hits in the 3D views, as plain geometry against the layout (no three.js), so the
 * instanced, batched store meshes don't need to know their items and Node can test it.
 * Each item is a box (or its polygon, extruded) from its base to the height it is drawn at:
 *  - walls and columns up to the ceiling over either side (as drawn);
 *  - a door from the floor to the top of the wall it sits in (the leaf and the header above it);
 *  - an opening or arch only above the opening (you can click through the hole), up to the wall's top;
 *  - an upper level (mezzanine, loft) as its deck: it blocks what is behind it but is not selectable;
 *  - anything standing on a raised floor starts on top of it.
 * The scan model is never picked. */
import {rayItemBox, rayPrism, rayPlaneZ, inItem} from "./geometry.js";
import {heightToCeiling, isStructure, passageTop, baseOf} from "./model.js";

const NEVER = new Set(["floor", "ceiling", "area"]);

/** The boxes to test: [{it, z0, z1, structure, selectable, kind: "item" | "deck"}]. */
export function buildPickBoxes(layout) {
  const out = [];
  for (const it of layout.items) {
    if (NEVER.has(it.type)) continue;
    const structure = isStructure(it);
    let z0 = 0, z1, selectable = true, kind = "item";
    if (it.type === "zone") {
      if (!(it.h > 0)) continue;
      z0 = Math.max(0, it.h - 0.5); z1 = it.h; selectable = false; kind = "deck";
    } else if (it.type === "wall" || it.type === "column") {
      z1 = heightToCeiling(layout, it);
    } else if (it.type === "door") {
      z1 = Math.max(it.h || 8, passageTop(layout, it));
    } else if (it.type === "opening" || it.type === "arch") {
      z0 = it.h || 8;
      z1 = Math.max(it.type === "arch" ? z0 + 0.6 : z0, passageTop(layout, it));
    } else {
      z0 = baseOf(layout, it);
      z1 = z0 + Math.max(it.h || 0, 0.1);
    }
    if (z1 > z0) out.push({it, z0, z1, structure, selectable, kind});
  }
  return out;
}

/**
 * The first thing along a ray (plan coordinates, z up). opts: {structure, fixtures, ceiling} = which layers
 * show (hidden ones aren't hit). Returns {floor: {x, y} | null, hit: "floor" | "item" | "deck" | "ceiling" | null,
 * item (selectable item or null), point {x, y, z} | null, t}.
 */
export function pickRay(boxes, ceilings, o, d, opts = {}) {
  const fl = rayPlaneZ(o, d, 0);
  let best = fl ? fl.t : Infinity, hit = fl ? "floor" : null, item = null;
  for (const b of boxes) {
    if (b.structure ? opts.structure === false : opts.fixtures === false) continue;
    const t = b.it.poly ? rayPrism(o, d, b.it.poly, b.z0, b.z1) : rayItemBox(o, d, b.it, b.z0, b.z1);
    if (t !== null && t < best) { best = t; hit = b.kind; item = b.selectable ? b.it : null; }
  }
  if (opts.ceiling) for (const c of ceilings) {
    const h = rayPlaneZ(o, d, c.h);
    if (h && h.t < best && inItem(c, h.x, h.y)) { best = h.t; hit = "ceiling"; item = null; }
  }
  const point = Number.isFinite(best) ? {x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best} : null;
  return {floor: fl ? {x: fl.x, y: fl.y} : null, hit, item, point, t: best};
}
