// Flat 2D plan drawing on a canvas: the minimap, AJ's review previews and printable reports.
import { corners, bbox } from "./geometry.js";

export const SHORT_NAMES = {
  power_tools: "Power Tools",
  bits_blades: "Bits & Blades",
  hand_tools: "Hand Tools",
  pneumatic_air: "Air Tools",
  safety_workwear: "Safety",
  access_jobsite: "Access & Jobsite",
  hardware_fasteners: "Hardware",
  paint_finishing: "Paint & Stain",
  decking_outdoor: "Decking & Outdoor",
  woodworking: "Woodworking",
};

/** Short label for tight spaces; respects a block the user renamed. */
export function shortName(block, catalogName) {
  if (block.name && catalogName && block.name !== catalogName) return block.name;
  return SHORT_NAMES[block.key] || block.name || catalogName || "Area";
}

export function layoutBounds(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    if (it.type !== "floor" && it.type !== "wall") continue;
    const b = bbox(it);
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[2]);
    y1 = Math.max(y1, b[3]);
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 169, 80];
}

/** Maps plan feet (y north) to canvas pixels (y down), fitted and centered. */
export function planTransform(bounds, width, height, pad = 6) {
  const [x0, y0, x1, y1] = bounds;
  const s = Math.min((width - pad * 2) / (x1 - x0), (height - pad * 2) / (y1 - y0));
  const ox = (width - (x1 - x0) * s) / 2 - x0 * s;
  const oy = (height + (y1 - y0) * s) / 2 + y0 * s;
  return { s, toPx: (x, y) => [ox + x * s, oy - y * s], toFt: (px, py) => [(px - ox) / s, (oy - py) / s] };
}

const LIGHT = {
  bg: "#e6eae6",
  showroom: "#fbfbf8",
  warehouse: "#e4e5df",
  office: "#ecebe5",
  wall: "#38403b",
  fixture: "#a5ada8",
  desk: "#6b6257",
  stairs: "#b49473",
  text: "#17201c",
  jerry: "#1f6f45",
  opening: "#f2c14e",
};
const DARK = {
  bg: "#0f1513",
  showroom: "#26302b",
  warehouse: "#1d2522",
  office: "#222a26",
  wall: "#c9d3cd",
  fixture: "#55625b",
  desk: "#8c8273",
  stairs: "#7a6247",
  text: "#e6ede9",
  jerry: "#3cc47c",
  opening: "#f2c14e",
};
export const PLAN_THEMES = { light: LIGHT, dark: DARK };

function poly(g, pts, tr) {
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const [px, py] = tr.toPx(x, y);
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  });
  g.closePath();
}

/**
 * Draws a layout. opts: items, areas, catalog (optional, for names), width, height (CSS px),
 * theme ("light" | "dark" | object), bounds, pad, labels, jerry {x, y, heading}, highlightId, ghosts (areas drawn dashed).
 * Returns the transform so callers can map clicks back to feet.
 */
export function drawPlan(g, opts) {
  const { items = [], areas = [], width, height, labels = true, pad = 6 } = opts;
  const T = typeof opts.theme === "object" ? { ...LIGHT, ...opts.theme } : opts.theme === "dark" ? DARK : LIGHT;
  const bounds = opts.bounds || layoutBounds(items);
  const tr = planTransform(bounds, width, height, pad);
  const names = Object.fromEntries(((opts.catalog && opts.catalog.areas) || []).map((a) => [a.key, a.name]));

  g.save();
  g.clearRect(0, 0, width, height);
  if (opts.background !== false) {
    g.fillStyle = T.bg;
    g.fillRect(0, 0, width, height);
  }
  for (const it of items) {
    if (it.type !== "floor") continue;
    g.fillStyle = T[it.kind] || T.showroom;
    poly(g, corners(it), tr);
    g.fill();
  }
  for (const it of items) {
    if (["floor", "zone", "wall", "door", "opening", "arch"].includes(it.type)) continue;
    g.fillStyle = it.type === "ring" || it.type === "counter" ? T.desk : it.type === "stairs" ? T.stairs : T.fixture;
    g.globalAlpha = it.type === "platform" ? 0.5 : 0.9;
    poly(g, corners(it), tr);
    g.fill();
  }
  g.globalAlpha = 1;

  const drawArea = (a, dashed) => {
    const color = a.color || "#888888";
    poly(g, corners(a), tr);
    if (!dashed) {
      g.globalAlpha = 0.55;
      g.fillStyle = color;
      g.fill();
      g.globalAlpha = 1;
    }
    g.lineWidth = dashed ? 1.5 : 1.25;
    g.strokeStyle = color;
    g.setLineDash(dashed ? [4, 3] : []);
    g.stroke();
    g.setLineDash([]);
  };
  for (const a of opts.ghosts || []) drawArea(a, true);
  for (const a of areas) drawArea(a, false);

  for (const it of items) {
    if (it.type !== "wall") continue;
    g.fillStyle = T.wall;
    poly(g, corners(it), tr);
    g.fill();
  }
  for (const it of items) {
    if (it.type !== "door" && it.type !== "opening" && it.type !== "arch") continue;
    g.fillStyle = T.opening;
    poly(g, corners({ ...it, d: Math.max(it.d, 0.7) }), tr);
    g.fill();
  }

  if (labels) {
    const fontPx = Math.max(9, Math.min(13, tr.s * 2.2));
    g.font = `600 ${fontPx}px "IBM Plex Sans", system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const a of areas) {
      const label = shortName(a, names[a.key]);
      const [bx0, by0, bx1, by1] = bbox(a);
      const wpx = (bx1 - bx0) * tr.s;
      const hpx = (by1 - by0) * tr.s;
      if (wpx < 24 || hpx < fontPx + 2) continue;
      let text = label;
      while (text.length > 3 && g.measureText(text).width > wpx - 4) text = text.slice(0, -2) + "…";
      if (g.measureText(text).width > wpx - 2) continue;
      const [px, py] = tr.toPx(a.x, a.y);
      g.fillStyle = T.text;
      g.fillText(text, px, py);
    }
  }

  if (opts.highlightId) {
    const h = areas.find((a) => a.id === opts.highlightId) || items.find((i) => i.id === opts.highlightId);
    if (h) {
      poly(g, corners(h), tr);
      g.lineWidth = 2.5;
      g.strokeStyle = "#f2c14e";
      g.stroke();
    }
  }

  if (opts.jerry) {
    const { x, y, heading = 0, fov } = opts.jerry;
    const [px, py] = tr.toPx(x, y);
    if (fov) {
      const r = 12 * tr.s;
      g.beginPath();
      g.moveTo(px, py);
      g.arc(px, py, r, -heading - fov / 2, -heading + fov / 2);
      g.closePath();
      g.fillStyle = T.jerry;
      g.globalAlpha = 0.18;
      g.fill();
      g.globalAlpha = 1;
    }
    g.beginPath();
    g.arc(px, py, Math.max(3.5, tr.s * 1.1), 0, Math.PI * 2);
    g.fillStyle = T.jerry;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = "#ffffff";
    g.stroke();
  }
  g.restore();
  return tr;
}
