/* The store layout model: item types, what counts as structure, brand palettes, and the master layout
 * (public/data/master.json) turned into a frozen, normalised layout. Pure: no DOM (Node imports it). */
import {inItem, toWorld, normDeg, corners, pointInPoly, distToPolyEdge} from "./geometry.js";

/* ---------- item types ---------- */
// label: what people call it · blocks: you can't walk through it · h: default height (ft) when the data has none
export const TYPES = Object.freeze({
  floor:    {label: "Floor area",     blocks: false, h: 0},
  zone:     {label: "Upper level",    blocks: false, h: 9.5},
  ceiling:  {label: "Ceiling",        blocks: false, h: 10},
  wall:     {label: "Wall",           blocks: true,  h: 14},
  door:     {label: "Door",           blocks: false, h: 8},
  opening:  {label: "Opening",        blocks: false, h: 8},
  arch:     {label: "Arch",           blocks: false, h: 10.5},
  column:   {label: "Column",         blocks: true,  h: 12},
  stairs:   {label: "Stairs",         blocks: true,  h: 10},
  ring:     {label: "Sales desk",     blocks: true,  h: 3.4},
  counter:  {label: "Counter",        blocks: true,  h: 3.6},
  gondola:  {label: "Shelving aisle", blocks: true,  h: 6},
  wallunit: {label: "Wall shelving",  blocks: true,  h: 7},
  rack:     {label: "Pallet rack",    blocks: true,  h: 12},
  pallet:   {label: "Pallet stack",   blocks: true,  h: 4},
  platform: {label: "Platform",       blocks: false, h: 0.35},
  tower:    {label: "Hardhat tower",  blocks: true,  h: 7},
  display:  {label: "Display",        blocks: true,  h: 6},
  table:    {label: "Table",          blocks: true,  h: 3},
  area:     {label: "Department",     blocks: false, h: 8},
});
export const ITEM_TYPES = Object.freeze(Object.keys(TYPES));

/** Structure (SPEC-v3-API): building parts, plus anything marked fixed (sales desks, Tom's desk, fixed platforms). */
export const STRUCTURE_TYPES = Object.freeze(["floor", "zone", "wall", "door", "opening", "arch", "column", "ceiling", "stairs"]);
const STRUCT_SET = new Set(STRUCTURE_TYPES);
export const isStructure = it => STRUCT_SET.has(it.type) || it.fixed === true;
/** Walls, doors, openings and arches: the things a plan draws as building lines. */
export const isWallLike = it => it.type === "wall" || it.type === "door" || it.type === "opening" || it.type === "arch";
export const isPassage = it => it.type === "door" || it.type === "opening" || it.type === "arch";

/* ---------- brands (shelf stock colours in 3D, fixture colours on the plan) ---------- */
export const PAL = Object.freeze({
  milwaukee: ["#b3121f", "#c41b1b", "#1d1d1d", "#e8e8e8", "#8f0d16"],
  hammer: ["#f2c200", "#1d1d1d", "#a3101a", "#7a5231"],
  safety: ["#cde21a", "#f07e14", "#333333", "#e9e9e4", "#d9a31a", "#657079"],
  dewalt: ["#f2b705", "#f2b705", "#141414", "#f7cc26"],
  makita: ["#008a95", "#00a2ad", "#161616", "#d9d9d9"],
  kreg: ["#1846a8", "#2c5fc9", "#e6e6e6", "#f0be1a"],
  paint: ["#ececec", "#a6a6ab", "#1d3e8f", "#8a5a2c", "#c7c2b8"],
  diablo: ["#b0101a", "#d11f24", "#ececec", "#151515"],
  nails: ["#ececea", "#d11f1f", "#304f99", "#9a9a9a"],
  occidental: ["#5a2e14", "#1a1a1a", "#7a4a24", "#9a7442"],
  simpson: ["#ececea", "#2a6a3a", "#e8590d", "#9a9a9a"],
  simpson_orn: ["#151515", "#4a4a4a", "#b09a74"],
  decking: ["#8a5a34", "#6a4c38", "#a3101a", "#f0c21a", "#4a4a4a"],
  airguns: ["#ececea", "#d11f1f", "#1a1a1a", "#1f7a44"],
  straps: ["#151515", "#f07e14", "#4dbd33", "#e9e9e9"],
  mugs: ["#e0337f", "#1a9a9a", "#f2f2f2", "#26262e", "#e59a1a"],
  millwork: ["#d8c4a2", "#b98a58", "#efefec", "#8a5a34"],
  boxes: ["#a07850", "#b08a60", "#e8e6e0", "#f2b705", "#9a1a1a", "#1a7a80"],
});
// floor colour under a brand's fixtures ("brandfloor": the brand's floor tiles in the photos)
export const BRAND_FLOOR = Object.freeze({milwaukee: "#8f0d16", dewalt: "#d9a20a", makita: "#007a84", simpson: "#2a6a3a", occidental: "#4a2a14"});
export const BRAND_NAMES = Object.freeze({
  milwaukee: "Milwaukee", hammer: "Hammers / hand tools", safety: "Safety & PPE", dewalt: "DeWalt", makita: "Makita",
  kreg: "Kreg", paint: "Paint", diablo: "Diablo blades & bits", nails: "Nails & screws", occidental: "Occidental Leather",
  simpson: "Simpson Strong-Tie", simpson_orn: "Simpson Outdoor Accents", decking: "Decking", airguns: "Air tools",
  straps: "Straps & tie-downs", mugs: "FBS mugs", millwork: "Millwork", boxes: "Boxed stock",
});

// Layout of tex/prod_atlas.jpg: a 16x16 grid of packaging photos, 14 cells per brand in this order,
// plus the average colour of every cell.
const ATLAS_ORDER = ["milwaukee", "hammer", "safety", "dewalt", "makita", "kreg", "paint", "diablo", "nails", "occidental", "simpson", "simpson_orn", "airguns", "straps", "mugs", "decking", "boxes", "cardboard"];
const ATLAS_AVG = [
  "#af504f", "#673d3c", "#614e4e", "#6a575e", "#746c7a", "#666167", "#53545b", "#8d525e", "#b7595a", "#904340", "#74595e", "#75322e", "#825152", "#5b3b44",
  "#56565b", "#8d7b87", "#434346", "#777678", "#444142", "#ab6a6e", "#3f4149", "#7d7d85", "#817c80", "#737983", "#241e1f", "#b9a892", "#8c8886", "#535662",
  "#76612d", "#797579", "#a9aba7", "#73655f", "#895f4c", "#996243", "#6d582a", "#a4a19a", "#7b7272", "#534241", "#75685f", "#636537", "#8a7254", "#6e6865",
  "#54462a", "#7b653b", "#6d6759", "#8e7e5e", "#3a3429", "#463c2a", "#7a726c", "#302c25", "#65635b", "#79663f", "#6b6762", "#7a6640", "#4c483d", "#554f41",
  "#203d4a", "#264969", "#2d5667", "#3e5d6a", "#2d4b5a", "#294b68", "#35454e", "#274757", "#8b939b", "#26495a", "#4f7786", "#687069", "#30424d", "#1e4160",
  "#4f5c78", "#5b6167", "#72a3e2", "#59637a", "#5c687f", "#617faf", "#505b72", "#5f5f63", "#5f656c", "#4a5674", "#515a6b", "#4e596d", "#485674", "#78ace2",
  "#58524f", "#6b6066", "#6e6c6a", "#68574e", "#634333", "#7f7072", "#878e8b", "#3e3b4a", "#69564e", "#776f67", "#6b4f49", "#7b4627", "#66575a", "#764c33",
  "#694040", "#6d4644", "#795b5a", "#8d7270", "#605b56", "#8d4d4e", "#7d736f", "#7c4140", "#7e5857", "#855856", "#88625b", "#797370", "#8e726a", "#8c6764",
  "#797472", "#75757b", "#99a6a9", "#b1b3ac", "#7e7569", "#767172", "#606265", "#4f4849", "#6a5d54", "#6f675d", "#b0b5b0", "#827d74", "#897e7d", "#3b352f",
  "#5b5b5e", "#606661", "#37383d", "#676d72", "#9a998a", "#918f86", "#716b69", "#333638", "#5f5f65", "#252429", "#525863", "#22252c", "#675f59", "#7c7977",
  "#773d33", "#846668", "#846e6f", "#714638", "#4a4646", "#7d4135", "#796b71", "#7d514b", "#584346", "#925e56", "#847a7f", "#8f6a6b", "#8c7475", "#6d3a32",
  "#3f3a30", "#23262a", "#5e6673", "#5d4e40", "#575f64", "#303030", "#807769", "#3e4347", "#191c1f", "#656057", "#444646", "#65727d", "#4b5157", "#6a5943",
  "#a19d7c", "#ad9fab", "#75747a", "#9c9499", "#7c776b", "#456596", "#9e7a5f", "#957560", "#9a7f64", "#84807c", "#7d94b6", "#93a8b9", "#706c6b", "#878a86",
  "#818285", "#7a6f66", "#64272a", "#693033", "#5c3f37", "#63272a", "#3f1c1b", "#a5aeb2", "#3a362c", "#5b4b4b", "#452121", "#8a847c", "#847667", "#6f2f35",
  "#756b78", "#7d6351", "#969996", "#575252", "#695e55", "#785e45", "#666865", "#7b7d7b", "#696764", "#745c4c", "#918c84", "#76787e", "#8d6c46", "#524d4b",
  "#adaaac", "#7e7670", "#928e85", "#706a63", "#8c7d6d", "#6a625b", "#beb8b2", "#777062", "#9c8e80", "#79604f", "#7f6f69", "#67605c", "#98938b", "#c4beb7",
  "#587182", "#726e68", "#879089", "#617549", "#574a49", "#6d6768", "#938d8f", "#23343f", "#7c807d", "#938584", "#4d4140", "#31373f", "#50504c", "#314955",
  "#667074", "#717975", "#475669", "#5a6770", "#4d585c", "#727b79", "#586878", "#516172", "#778277", "#768078", "#5e7488", "#6b7d87", "#878775", "#525e6b",
];
export const ATLAS = (() => {
  const cells = {};
  ATLAS_ORDER.forEach((b, i) => { cells[b] = Array.from({length: 14}, (_, k) => i * 14 + k); });
  return Object.freeze({grid: 16, cells: Object.freeze(cells), avg: Object.freeze(ATLAS_AVG)});
})();

/* ---------- the layout ---------- */
const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** One item, normalised: finite numbers, a height, rotation in [0, 360), colours checked. Unknown types are dropped. */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== "object" || !TYPES[raw.type]) return null;
  const it = {...raw};
  it.id = String(raw.id ?? "");
  it.name = typeof raw.name === "string" ? raw.name : "";
  it.x = num(raw.x, 0); it.y = num(raw.y, 0);
  it.w = Math.max(0.05, num(raw.w, 1)); it.d = Math.max(0.05, num(raw.d, 1));
  it.h = num(raw.h, TYPES[raw.type].h);
  it.rot = normDeg(num(raw.rot, 0));
  if (it.color !== undefined && !HEX.test(it.color)) delete it.color;
  if (it.top !== undefined && !HEX.test(it.top)) delete it.top;
  if (it.ceil !== undefined) it.ceil = num(it.ceil, undefined);
  // an exact outline (plan feet) for shapes that aren't rectangles, e.g. a chamfered raised floor
  if (raw.poly !== undefined) {
    const ok = Array.isArray(raw.poly) && raw.poly.length >= 3 && raw.poly.every(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]));
    if (ok) it.poly = Object.freeze(raw.poly.map(q => Object.freeze([q[0], q[1]]))); else delete it.poly;
  }
  return Object.freeze(it);
}

/* ---------- outlines (rectangles, or the item's own polygon) ---------- */
/** The item's outline in plan feet: its polygon when it has one, else its four corners. */
export const outlineOf = it => it.poly || corners(it);
/** Is the point inside the item's outline (grown by tol feet; a negative tol shrinks it)? */
export function inOutline(it, px, py, tol = 0) {
  if (!it.poly) return inItem(it, px, py, tol);
  if (pointInPoly(px, py, it.poly)) return tol >= 0 || distToPolyEdge(px, py, it.poly) >= -tol;
  return tol > 0 && distToPolyEdge(px, py, it.poly) <= tol;
}

/**
 * The master layout file -> {version, building: {L, W}, items, byId}. Items keep their file order.
 * Throws when the file has no items (so a broken download shows an error instead of an empty store).
 */
export function normalizeLayout(raw) {
  if (!raw || !Array.isArray(raw.items) || !raw.items.length) throw new Error("The store layout is empty or unreadable.");
  const items = raw.items.map(normalizeItem).filter(Boolean);
  const byId = new Map(items.map(it => [it.id, it]));
  const b = raw.building || {};
  return Object.freeze({
    version: String(raw.version || ""),
    building: Object.freeze({L: num(b.length, 169), W: num(b.width, 80)}),
    items: Object.freeze(items),
    byId,
  });
}

/* ---------- questions about a layout ---------- */
export const floorsOf = layout => layout.items.filter(it => it.type === "floor");
export const isFloorAt = (layout, x, y, tol = 0) => layout.items.some(it => it.type === "floor" && inItem(it, x, y, tol));
/** The floor area (room) at a point, or null. */
export const roomAt = (layout, x, y) => layout.items.find(it => it.type === "floor" && inItem(it, x, y)) || null;

/**
 * Height of what is overhead at (x, y): the lowest ceiling item covering it, or the underside of an upper
 * level (zone) above it; falls back to the floor area's ceil field. Infinity when nothing covers it.
 */
export function ceilingAt(layout, x, y) {
  let h = Infinity;
  for (const it of layout.items) {
    if (it.type === "ceiling" && inItem(it, x, y)) h = Math.min(h, it.h);
    else if (it.type === "zone" && it.h > 0 && inItem(it, x, y)) h = Math.min(h, it.h - 0.5);
  }
  if (h === Infinity) for (const it of layout.items) if (it.type === "floor" && it.ceil && inItem(it, x, y)) h = Math.min(h, it.ceil);
  return h;
}

/**
 * How tall a wall or column has to be drawn so it meets the ceiling over either side of it
 * (VERIFY.md: 18 ft walls under 19.3-20.3 ft ceilings must not leave a gap). Columns only grow when
 * the gap is small (a short post standing in a tall room stays a post).
 */
export function heightToCeiling(layout, it) {
  if (it.type !== "wall" && it.type !== "column") return it.h;
  let need = 0;
  const along = Math.max(it.w, 0.1), off = it.d / 2 + 0.45;
  const n = Math.max(2, Math.ceil(along / 4));
  for (let k = 0; k <= n; k++) {
    const u = -along / 2 + 0.3 + (along - 0.6) * k / n;
    for (const s of [-1, 1]) {
      const [x, y] = toWorld(it, u, s * off);
      const c = ceilingAt(layout, x, y);
      if (Number.isFinite(c) && c > need) need = c;
    }
  }
  if (!(need > it.h)) return it.h;
  if (it.type === "column" && need - it.h > 3.5) return it.h;
  return need;
}

/**
 * The top of the wall a door, opening or arch sits in, as drawn (the header above the passage fills the wall up
 * to there). Falls back to 16 ft when no wall is found beside it.
 */
export function passageTop(layout, it) {
  for (const s of [1, -1]) {
    const [px, py] = toWorld(it, s * (it.w / 2 + 0.4), 0);
    for (const w of layout.items) if (w.type === "wall" && inItem(w, px, py, 0.2)) return heightToCeiling(layout, w);
  }
  return 16;
}

/* ---------- raised floors ---------- */
/** The highest platform (raised floor, deck, landing) top at a point, or 0 on the floor itself. */
export function platformTopAt(layout, x, y, except) {
  let top = 0;
  for (const it of layout.items) if (it.type === "platform" && it !== except && it.h > top && inOutline(it, x, y)) top = it.h;
  return top;
}
// these stand on the floor (or on a raised floor); the rest are building parts that start at the slab
const STANDS = new Set(["ring", "counter", "gondola", "wallunit", "rack", "pallet", "tower", "display", "table"]);
const BASES = new WeakMap();
/**
 * How high an item's base is: the top of the highest raised floor under its footprint (Tom's desk on the laser
 * deck, the cedar desk on the 1-step floor), else 0. Its height h is measured from there. The footprint is
 * sampled at the centre and the four corners, so a desk that only partly overlaps a deck still stands on it.
 */
export function baseOf(layout, it) {
  if (!STANDS.has(it.type)) return 0;
  let m = BASES.get(layout);
  if (!m) { m = new Map(); BASES.set(layout, m); }
  if (!m.has(it)) {
    let top = platformTopAt(layout, it.x, it.y, it);
    for (const [x, y] of corners(it)) top = Math.max(top, platformTopAt(layout, x, y, it));
    m.set(it, top);
  }
  return m.get(it);
}

/**
 * The foundation grid of the building drawings, calibrated to store feet (BLUEPRINT-RECON.verified.md):
 * columns A-H west to east, rows 1-5 north to south (row 1 = the north wall, row 5 = the south wall and pier line).
 */
export const FOUNDATION_GRID = Object.freeze({
  columns: Object.freeze({A: -0.35, B: 24.83, C: 50.0, D: 76.5, E: 103.0, F: 125.12, G: 147.23, H: 169.35}),
  rows: Object.freeze({1: 80.35, 2: 60.18, 3: 40.0, 4: 19.83, 5: -0.35}),
});

/** The front door: the door named "front door", else the first door in the south half. */
export function frontDoor(layout) {
  const doors = layout.items.filter(it => it.type === "door");
  return doors.find(it => /front\s*door/i.test(it.name)) || doors.find(it => it.y < layout.building.W / 2) || doors[0] || null;
}

/**
 * Where the Walk view starts: a little inside the front door, facing into the store.
 * Inside = the side of the door that has a floor. Returns {x, y, yaw} (yaw 0 = facing north, +y).
 */
export function startPose(layout, inset = 4.35) {
  const door = frontDoor(layout);
  if (!door) return {x: layout.building.L / 2, y: layout.building.W / 2, yaw: 0};
  const reach = door.d / 2 + inset;
  let side = 1;
  const [fx, fy] = toWorld(door, 0, reach), [bx, by] = toWorld(door, 0, -reach);
  if (!isFloorAt(layout, fx, fy) && isFloorAt(layout, bx, by)) side = -1;
  const [x, y] = toWorld(door, 0, side * reach);
  const nx = x - door.x, ny = y - door.y;
  return {x, y, yaw: Math.atan2(-nx, ny), door};
}

/* ---------- names ---------- */
// "SAFETY ISLE 32'6"" -> "SAFETY ISLE" (the size is shown separately)
export function displayName(it) {
  const n = it.name || (TYPES[it.type] || {}).label || it.type;
  return n.replace(/\s+\d+'(?:\d+")?(?=\s|$)/g, "").trim() || n;
}
export function categoryOf(it) {
  const names = [it.brand, it.brand2].filter((b, i, a) => b && a.indexOf(b) === i && BRAND_NAMES[b]).map(b => BRAND_NAMES[b]);
  return names.length ? names.join(" · ") : ((TYPES[it.type] || {}).label || "Fixture");
}
