// The 3D store: fixtures, structure, department blocks, overlays, Jerry and two cameras.
// Plan feet (x east, y north) map to Three.js as (x, up, -y). Item rotation (deg, CCW) maps to rotation.y.
import * as THREE from "/vendor/three.module.min.js";
import { corners, bbox, rad, rectDist, toWorld } from "./geometry.js";
import { createJerry } from "./jerry.js";
import { shortName } from "./plan2d.js";

const DISPLAY = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
const BODY = '"IBM Plex Sans", system-ui, sans-serif';
const BRAND = {
  milwaukee: "#c8102e", hammer: "#8d1b22", dewalt: "#f2b705", makita: "#00838f", kreg: "#1846a8", diablo: "#e35205",
  safety: "#59b52a", paint: "#7c5cc4", nails: "#7d858c", occidental: "#6b4f2a", simpson: "#2b2b2b", simpson_orn: "#2b2b2b",
  airguns: "#1f1f1f", decking: "#8c6a4f", mugs: "#8a5a34", straps: "#333333",
};
const PRODUCT_PALETTES = {
  milwaukee: ["#c8102e", "#9e0b24", "#2a2a2a", "#d9d9d9"],
  hammer: ["#8d1b22", "#f2b705", "#2a2a2a", "#5d6a73"],
  dewalt: ["#f2b705", "#1c1c1c", "#d4a106", "#3a3a3a"],
  makita: ["#00838f", "#1c1c1c", "#0aa3ad", "#cfd6d8"],
  diablo: ["#e35205", "#2a2a2a", "#c74405", "#6d6d6d"],
  safety: ["#c7e040", "#ff7a1a", "#2d74c4", "#eaeaea"],
  paint: ["#7c5cc4", "#e9e5dc", "#3a7bd5", "#d04848"],
  default: ["#2d74c4", "#e07a2e", "#6c7a83", "#e8e4da", "#3b8f5a", "#c23b3b"],
};

const tmpV = new THREE.Vector3();

// ---------- small helpers ----------

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...opts });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}

function box(w, h, d, material, x = 0, y = h / 2, z = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function rng(seedStr) {
  let s = 2166136261;
  for (const ch of String(seedStr)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Canvas text texture. lines: strings or { text, px, weight, font, color }. */
function textTexture(lines, o = {}) {
  const px = o.px || 56;
  const pad = o.pad ?? Math.round(px * 0.32);
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const specs = lines.filter(Boolean).map((l, i) =>
    typeof l === "string" ? { text: l, px: i ? Math.round(px * 0.6) : px, weight: i ? 600 : 700, font: i ? BODY : DISPLAY } : { px, weight: 700, font: DISPLAY, ...l }
  );
  let w = 0, h = 0;
  for (const s of specs) {
    g.font = `${s.weight} ${s.px}px ${s.font}`;
    w = Math.max(w, g.measureText(s.text).width);
    h += s.px * 1.12;
  }
  c.width = Math.max(8, Math.ceil(Math.min(2048, w + pad * 2)));
  c.height = Math.max(8, Math.ceil(h + pad * 2));
  if (o.bg) {
    g.fillStyle = o.bg;
    roundRect(g, 1, 1, c.width - 2, c.height - 2, o.radius ?? px * 0.22);
    g.fill();
  }
  if (o.border) {
    g.strokeStyle = o.border;
    g.lineWidth = o.borderW || 4;
    roundRect(g, 2, 2, c.width - 4, c.height - 4, o.radius ?? px * 0.22);
    g.stroke();
  }
  g.textBaseline = "top";
  g.textAlign = o.align === "left" ? "left" : "center";
  const x = o.align === "left" ? pad : c.width / 2;
  let y = pad;
  for (const s of specs) {
    g.font = `${s.weight} ${s.px}px ${s.font}`;
    g.fillStyle = s.color || o.fg || "#111111";
    g.fillText(s.text, x, y + s.px * 0.05, c.width - pad);
    y += s.px * 1.12;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, aspect: c.width / c.height };
}

/** A flat text label lying on the floor (or a top surface), sized to fit maxW x maxH feet. */
function flatLabel(lines, maxW, maxH, o = {}) {
  const { tex, aspect } = textTexture(lines, o);
  let w = maxW, h = maxW / aspect;
  if (h > maxH) {
    h = maxH;
    w = maxH * aspect;
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: o.opacity ?? 1, toneMapped: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = o.renderOrder ?? 5;
  m.userData.label = true;
  return m;
}

function sign(lines, height, o = {}) {
  const { tex, aspect } = textTexture(lines, o);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(height * aspect, height, 1);
  s.renderOrder = 7;
  return s;
}

function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (m.userData && m.userData.shared) continue;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

function shapeFrom(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

/** Shape geometry in plan local coords, laid flat (plan x,y -> three x,-z). */
function flatShape(shape, y = 0) {
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

/** Extruded plan polygon from y0 to y0+h. */
function extrude(pts, h, material, y0 = 0) {
  const geo = new THREE.ExtrudeGeometry(shapeFrom(pts), { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- fixture builders (local coords: x = width, three z = -plan local y) ----------

function addProducts(g, it, levels, sides, depth, palette) {
  const rand = rng(it.id);
  const pal = PRODUCT_PALETTES[palette] || PRODUCT_PALETTES.default;
  const boxes = [];
  for (let li = 0; li < levels.length - 1; li++) {
    const y0 = levels[li] + 0.06, gap = levels[li + 1] - levels[li] - 0.25;
    if (gap < 0.35) continue;
    for (const side of sides) {
      let x = -it.w / 2 + 0.25;
      while (x < it.w / 2 - 0.5) {
        const bw = 0.45 + rand() * 0.8;
        if (x + bw > it.w / 2 - 0.2) break;
        if (rand() > 0.12) {
          const bh = Math.min(gap, 0.4 + rand() * 0.75);
          const bd = depth * (0.6 + rand() * 0.35);
          boxes.push({ x: x + bw / 2, y: y0 + bh / 2, z: side * (0.16 + bd / 2), w: bw * 0.92, h: bh, d: bd, c: pal[Math.floor(rand() * pal.length)] });
        }
        x += bw;
      }
    }
  }
  if (!boxes.length) return;
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat("#ffffff", { roughness: 0.7 }), boxes.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  boxes.forEach((b, i) => {
    m4.makeScale(b.w, b.h, b.d);
    m4.setPosition(b.x, b.y, b.z);
    im.setMatrixAt(i, m4);
    im.setColorAt(i, col.set(b.c));
  });
  im.receiveShadow = true;
  g.add(im);
}

function shelfLevels(h) {
  const out = [0.35];
  for (let y = 1.55; y < h - 0.5; y += 1.25) out.push(y);
  out.push(h - 0.1);
  return out;
}

function buildGondola(g, it) {
  const h = it.h || 6, w = it.w, d = it.d;
  const metal = mat("#d5d8da", { roughness: 0.6 });
  g.add(box(w, 0.35, d, mat("#3f4447")));
  g.add(box(w, h - 0.35, 0.22, mat(it.color || "#c9ccce"), 0, 0.35 + (h - 0.35) / 2));
  const levels = shelfLevels(h);
  for (const y of levels.slice(1, -1)) g.add(box(w * 0.985, 0.07, d, metal, 0, y, 0, false));
  const capColor = BRAND[it.brand] || it.color || "#c9ccce";
  const cap2 = BRAND[it.brand2] || capColor;
  g.add(box(0.16, h, d, mat(capColor), -w / 2 + 0.08));
  g.add(box(0.16, h, d, mat(cap2), w / 2 - 0.08));
  addProducts(g, it, levels, [1, -1], d / 2 - 0.25, it.brand || "default");
}

function buildWallUnit(g, it) {
  const h = it.h || 7, w = it.w, d = it.d;
  const back = 0.2;
  g.add(box(w, h, back, mat(it.color || "#333333"), 0, h / 2, d / 2 - back / 2));
  const levels = shelfLevels(h);
  const metal = mat("#d5d8da", { roughness: 0.6 });
  for (const y of levels.slice(0, -1)) g.add(box(w * 0.99, 0.07, d - back, metal, 0, y, -back / 2, false));
  const sub = new THREE.Group();
  sub.position.z = d / 2 - back - 0.16;
  addProducts(sub, it, levels, [-1], d - back - 0.4, it.brand || "default");
  g.add(sub);
}

function buildRack(g, it) {
  const h = it.h || 14, w = it.w, d = it.d;
  const up = mat(it.color || "#1f5a47"), beam = mat("#e2762b"), load = ["#b88b5a", "#a27a4e", "#c49a68", "#8f6b44"];
  const bays = Math.max(1, Math.round(w / 8.5));
  const bayW = w / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + i * bayW;
    g.add(box(0.25, h, 0.25, up, x, h / 2, d / 2 - 0.12));
    g.add(box(0.25, h, 0.25, up, x, h / 2, -d / 2 + 0.12));
  }
  const rand = rng(it.id);
  for (const y of [0.4, 5, 9.6]) {
    if (y > h - 1) continue;
    g.add(box(w, 0.32, 0.16, beam, 0, y, d / 2 - 0.12, false));
    g.add(box(w, 0.32, 0.16, beam, 0, y, -d / 2 + 0.12, false));
    for (let i = 0; i < bays; i++) {
      if (rand() < 0.2) continue;
      const lh = 2.2 + rand() * 1.8;
      g.add(box(bayW * 0.82, lh, d * 0.86, mat(load[Math.floor(rand() * load.length)]), -w / 2 + bayW * (i + 0.5), y + 0.2 + lh / 2, 0));
    }
  }
}

const SIDE_EDGE = { E: 0, N: 2, W: 4, S: 6 };
function octagon(hw, hd, c) {
  c = Math.max(0, Math.min(c, hw - 0.05, hd - 0.05));
  return [[hw, -hd + c], [hw, hd - c], [hw - c, hd], [-hw + c, hd], [-hw, hd - c], [-hw, -hd + c], [-hw + c, -hd], [hw - c, -hd]];
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Ring desk as C-shaped pieces between its openings. */
function ringPieces(it) {
  const t = Math.min(it.t ?? 2.2, it.w / 2 - 0.3, it.d / 2 - 0.3);
  const c = it.shape === "rect" ? 0 : it.cham ?? 1.75;
  const O = octagon(it.w / 2, it.d / 2, c);
  const I = octagon(it.w / 2 - t, it.d / 2 - t, Math.max(0, c - t * 0.414));
  const opens = new Map(((it.open && it.open.sides) || []).map((s) => [SIDE_EDGE[s], ((it.open && it.open.w) || 3.5) / 2]));
  if (!opens.size) return { closed: true, O, I };
  const st = [];
  for (let e = 0; e < 8; e++) {
    const o0 = O[e], o1 = O[(e + 1) % 8], i0 = I[e], i1 = I[(e + 1) % 8];
    st.push({ o: o0, i: i0 });
    if (opens.has(e)) {
      const L = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]) || 1;
      const half = opens.get(e);
      const f0 = Math.max(0.02, 0.5 - half / L), f1 = Math.min(0.98, 0.5 + half / L);
      st.push({ o: lerp2(o0, o1, f0), i: lerp2(i0, i1, f0), cut: "start" });
      st.push({ o: lerp2(o0, o1, f1), i: lerp2(i0, i1, f1), cut: "end" });
    }
  }
  const k = st.findIndex((s) => s.cut === "end");
  const seq = [...st.slice(k), ...st.slice(0, k)];
  const pieces = [];
  let cur = [];
  for (const s of seq) {
    cur.push(s);
    if (s.cut === "start") {
      pieces.push(cur);
      cur = [];
    }
  }
  return { closed: false, pieces: pieces.map((p) => [...p.map((s) => s.o), ...p.map((s) => s.i).reverse()]) };
}

function buildRing(g, it) {
  const h = it.h || 3.4;
  const body = mat(it.color || "#f3f3f1"), top = mat(it.top || "#1a1a1c", { roughness: 0.4 });
  const r = ringPieces(it);
  const polys = r.closed ? null : r.pieces;
  if (r.closed) {
    const s = shapeFrom(r.O);
    s.holes.push(shapeFrom([...r.I].reverse()));
    for (const [mtl, y0, hh] of [[body, 0, h - 0.12], [top, h - 0.12, 0.12]]) {
      const geo = new THREE.ExtrudeGeometry(s, { depth: hh, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, y0, 0);
      const m = new THREE.Mesh(geo, mtl);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  } else {
    for (const p of polys) {
      g.add(extrude(p, h - 0.12, body, 0));
      g.add(extrude(p, 0.12, top, h - 0.12));
    }
  }
  if (it.led) {
    const pts = (r.closed ? r.O : polys.flatMap((p) => p.slice(0, p.length / 2))).map(([x, y]) => new THREE.Vector3(x * 1.002, 0.28, -y * 1.002));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#6fd3ff" }));
    g.add(line);
  }
}

function buildDisplay(g, it) {
  const h = it.h || 5, w = it.w, d = it.d;
  const c = mat(it.color || "#9a6a3c");
  if (it.style === "pergola") {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.5, h, 0.5, c, sx * (w / 2 - 0.5), h / 2, sz * (d / 2 - 0.5)));
    g.add(box(w, 0.8, 0.4, c, 0, h - 0.4, d / 2 - 0.5));
    g.add(box(w, 0.8, 0.4, c, 0, h - 0.4, -d / 2 + 0.5));
    for (let x = -w / 2 + 0.6; x <= w / 2 - 0.5; x += 1.4) g.add(box(0.22, 0.45, d, c, x, h + 0.2, 0, false));
  } else if (it.style === "coolers") {
    g.add(box(w, h, d, mat(it.color || "#202124")));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.8), new THREE.MeshStandardMaterial({ color: "#d9ecff", emissive: "#bcdcff", emissiveIntensity: 0.55, roughness: 0.2 }));
    glass.position.set(0, h * 0.52, -d / 2 - 0.01);
    glass.rotation.y = Math.PI;
    g.add(glass);
  } else if (it.style === "cubicles") {
    const t = 0.25;
    g.add(box(w, h, t, c, 0, h / 2, d / 2 - t / 2));
    g.add(box(w, h, t, c, 0, h / 2, -d / 2 + t / 2));
    g.add(box(t, h, d, c, -w / 2 + t / 2));
    g.add(box(t, h, d * 0.55, c, w / 2 - t / 2, h / 2, -d * 0.22));
    for (let z = -d / 2 + 8; z < d / 2 - 2; z += 8) g.add(box(w * 0.7, h * 0.9, t, c, -w * 0.15, (h * 0.9) / 2, z));
    g.add(box(t, h * 0.9, d * 0.8, c, w * 0.12, (h * 0.9) / 2, 0));
  } else if (it.style === "cage") {
    const y = mat(it.color || "#e3b21a", { metalness: 0.3, roughness: 0.5 });
    for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 6) {
      g.add(box(0.08, h, 0.08, y, x, h / 2, d / 2));
      g.add(box(0.08, h, 0.08, y, x, h / 2, -d / 2));
    }
    g.add(box(w, 0.1, d, y, 0, h));
    g.add(box(w, 0.1, d, y, 0, 0.05));
  } else {
    g.add(box(w, h, d, c));
  }
}

function buildTower(g, it) {
  const h = it.h || 7;
  const c = mat(it.color || "#59b52a");
  g.add(box(it.w, 0.3, it.d, mat("#333333")));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 8), mat("#9aa0a4"));
  pole.position.y = h / 2;
  g.add(pole);
  for (let y = 1.2; y < h; y += 1.2) {
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), c);
    hat.position.y = y;
    hat.castShadow = true;
    g.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), c);
    brim.position.y = y;
    g.add(brim);
  }
}

function buildStairs(g, it) {
  const h = it.h || 9.5, w = it.w, d = it.d;
  const n = Math.max(4, Math.round(h / 0.62));
  const run = w / n, rise = h / n;
  const c = mat(it.color || "#8a5a34"), tread = mat("#b98a5f");
  for (let k = 0; k < n; k++) {
    const x = -w / 2 + run * (k + 0.5);
    g.add(box(run, rise * (k + 1) - 0.06, d, c, x, (rise * (k + 1) - 0.06) / 2, 0));
    g.add(box(run, 0.06, d, tread, x, rise * (k + 1) - 0.03, 0, false));
  }
}

function buildTable(g, it) {
  const h = it.h || 3.1;
  const c = mat(it.color || "#d9b98a");
  g.add(box(it.w, 0.15, it.d, c, 0, h - 0.075));
  const leg = mat("#3a3a3a");
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.18, h - 0.15, 0.18, leg, sx * (it.w / 2 - 0.25), (h - 0.15) / 2, sz * (it.d / 2 - 0.2)));
}

function buildCounter(g, it) {
  const h = it.h || 3.5;
  g.add(box(it.w, h - 0.12, it.d, mat(it.color || "#8a5a34")));
  g.add(box(it.w + 0.1, 0.12, it.d + 0.1, mat(it.top || "#d8d2c4", { roughness: 0.45 }), 0, h - 0.06));
}

function wallTopFor(op, walls) {
  let top = 0;
  for (const w of walls) if (rectDist(op, w) < 0.8) top = Math.max(top, w.h || 0);
  return top || 16;
}

function buildOpening(g, it, walls) {
  const top = wallTopFor(it, walls);
  const h = it.h || 7;
  const wallColor = mat("#d8d2c4");
  if (top > h + 0.05) g.add(box(it.w, top - h, it.d, wallColor, 0, h + (top - h) / 2));
  const trim = mat(it.color || "#3b2616");
  if (it.type === "door") {
    if (it.solid) {
      g.add(box(it.w * 0.96, h, 0.15, mat(it.color || "#f2f2ee")));
    } else {
      g.add(box(0.2, h, it.d, trim, -it.w / 2 + 0.1));
      g.add(box(0.2, h, it.d, trim, it.w / 2 - 0.1));
      g.add(box(it.w, 0.25, it.d, trim, 0, h - 0.125));
      const glass = new THREE.Mesh(new THREE.BoxGeometry(it.w - 0.4, h - 0.3, 0.06), new THREE.MeshStandardMaterial({ color: "#a9cfdc", transparent: true, opacity: 0.35, roughness: 0.1 }));
      glass.position.y = (h - 0.3) / 2;
      g.add(glass);
    }
  } else {
    g.add(box(0.2, h, it.d + 0.1, trim, -it.w / 2 + 0.1));
    g.add(box(0.2, h, it.d + 0.1, trim, it.w / 2 - 0.1));
    g.add(box(it.w, 0.3, it.d + 0.1, trim, 0, h - 0.15));
  }
}

function floorGrid(it) {
  const [x0, y0, x1, y1] = bbox(it);
  const minor = [], major = [];
  for (let x = Math.ceil(x0); x <= Math.floor(x1); x++) (x % 10 === 0 ? major : minor).push(x, 0.012, -y0, x, 0.012, -y1);
  for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) (y % 10 === 0 ? major : minor).push(x0, 0.012, -y, x1, 0.012, -y);
  const mk = (arr, opacity) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#1b2a22", transparent: true, opacity, depthWrite: false }));
    l.renderOrder = 1;
    return l;
  };
  const g = new THREE.Group();
  const m1 = mk(minor, 0.06);
  m1.userData.minorGrid = true;
  g.add(m1, mk(major, 0.16));
  return g;
}

/** Builds one item. Floors and grids are in world coords; everything else is local to the item group. */
function buildItem(it, walls) {
  const g = new THREE.Group();
  g.userData = { kind: "item", id: it.id, type: it.type };
  const h = Math.max(0.05, it.h || 0);
  switch (it.type) {
    case "floor": {
      const f = box(it.w, 0.1, it.d, mat(it.color || "#c3c5c1", { roughness: 0.92 }), 0, -0.05, 0, false);
      g.add(f);
      break;
    }
    case "zone": {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.3, it.d), new THREE.MeshStandardMaterial({ color: it.color || "#8a5a34", transparent: true, opacity: 0.12, depthWrite: false }));
      slab.position.y = h;
      g.add(slab);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: it.color || "#8a5a34", transparent: true, opacity: 0.5 }));
      edges.position.y = h;
      g.add(edges);
      break;
    }
    case "wall": {
      const m = box(it.w, h, it.d, new THREE.MeshStandardMaterial({ color: it.color || "#b9ae9c", roughness: 0.9, transparent: true, opacity: 1 }));
      m.userData.wall = true;
      g.add(m);
      break;
    }
    case "door":
    case "opening":
    case "arch":
      buildOpening(g, it, walls);
      break;
    case "column":
      g.add(box(it.w, h, it.d, mat(it.color || "#f1f1ee")));
      break;
    case "gondola":
      buildGondola(g, it);
      break;
    case "wallunit":
      buildWallUnit(g, it);
      break;
    case "rack":
      buildRack(g, it);
      break;
    case "pallet":
      g.add(box(it.w, 0.45, it.d, mat("#b08a5b")));
      if (h > 0.6) g.add(box(it.w * 0.92, h - 0.45, it.d * 0.92, mat(it.color || "#c49a68"), 0, 0.45 + (h - 0.45) / 2));
      break;
    case "ring":
      buildRing(g, it);
      break;
    case "counter":
      buildCounter(g, it);
      break;
    case "table":
      buildTable(g, it);
      break;
    case "display":
      buildDisplay(g, it);
      break;
    case "tower":
      buildTower(g, it);
      break;
    case "platform":
      g.add(box(it.w, h, it.d, mat(it.color || "#1b2f7a")));
      break;
    case "stairs":
      buildStairs(g, it);
      break;
    default:
      g.add(box(it.w, Math.max(h, 1), it.d, mat(it.color || "#999999")));
  }
  g.position.set(it.x, 0, -it.y);
  g.rotation.y = rad(it.rot || 0);
  return g;
}

const LABELED = new Set(["gondola", "wallunit", "rack", "ring", "counter", "display", "platform", "table"]);

function itemLabels(it) {
  const out = { top: null, sign: null };
  if (!it.name) return out;
  const name = it.name.toUpperCase();
  if (it.type === "floor") {
    const m = flatLabel([{ text: name, px: 64, color: "#1b2a22" }], Math.min(it.w - 2, 22), 2.2, { opacity: 0.32, align: "left", renderOrder: 2 });
    const [x0, , , y1] = bbox(it);
    m.position.set(x0 + 1 + m.geometry.parameters.width / 2, 0.02, -(y1 - 1.6));
    out.top = m;
    return out;
  }
  if (it.type === "door" || it.type === "opening" || it.type === "arch") return out;
  if (!LABELED.has(it.type)) return out;
  const long = Math.max(it.w, it.d), short = Math.min(it.w, it.d);
  const top = flatLabel([{ text: name, px: 52, color: "#ffffff" }], Math.max(2, long * 0.92), Math.max(0.5, Math.min(short * 0.8, 1.4)), { bg: "rgba(20,26,23,0.72)", pad: 10 });
  top.position.y = (it.h || 1) + 0.08;
  if (it.d > it.w) top.rotation.z = Math.PI / 2;
  out.top = top;
  if (["gondola", "wallunit", "rack", "ring"].includes(it.type)) {
    const s = sign([{ text: name, px: 54, color: "#ffffff" }], 1.15, { bg: "rgba(23,115,74,0.94)", pad: 12 });
    s.position.y = (it.h || 6) + 1.6;
    out.sign = s;
  }
  return out;
}

function doorLabel(it, floors) {
  if (!it.name) return null;
  const m = flatLabel([{ text: it.name.toUpperCase(), px: 48, color: "#ffffff" }], Math.max(4, it.w + 2), 1.0, { bg: "rgba(176,72,32,0.85)", pad: 10 });
  // push the label 2.4 ft into whichever side is inside the building
  for (const side of [1, -1]) {
    const [px, py] = toWorld(it, 0, side * 2.6);
    if (floors.some((f) => {
      const [x0, y0, x1, y1] = bbox(f);
      return px > x0 && px < x1 && py > y0 && py < y1;
    })) {
      m.position.set(px, 0.03, -py);
      m.rotation.z = rad(it.rot || 0);
      return m;
    }
  }
  return null;
}

// ---------- the scene ----------

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dfe5e0");
  scene.add(new THREE.HemisphereLight("#ffffff", "#b4ad9f", 1.25));
  const sun = new THREE.DirectionalLight("#fff6e8", 1.55);
  sun.position.set(55, 150, 25);
  sun.target.position.set(85, 0, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -115, right: 115, top: 115, bottom: -115, near: 20, far: 420 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: "#dfe5e0" }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  scene.add(ground);

  const groups = {};
  for (const n of ["floors", "structure", "fixtures", "labelsTop", "labelsSign", "areas", "areaSigns", "overlay"]) {
    groups[n] = new THREE.Group();
    groups[n].name = n;
    scene.add(groups[n]);
  }
  const ov = {};
  for (const n of ["clear", "ghosts", "links", "anchors", "guides", "overlaps", "marker", "palette", "select", "handles"]) {
    ov[n] = new THREE.Group();
    ov[n].name = n;
    groups.overlay.add(ov[n]);
  }

  const jerry = createJerry();
  scene.add(jerry.root);

  const persp = new THREE.PerspectiveCamera(50, 1, 0.5, 1500);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  ortho.up.set(0, 0, -1);
  let camMode = "jerry";
  const orbit = { yaw: 0.25, pitch: 0.72, dist: 44, tx: 86, ty: 45.5, cx: 86, cy: 45.5 };
  const mapv = { cx: 84.5, cy: 40, span: 96, ccx: 84.5, ccy: 40, cspan: 96 };
  const insets = { left: 0, right: 0, top: 0, bottom: 0 };
  let width = 1, height = 1;
  let bounds = [0, 0, 169, 80];

  const itemObjs = new Map(); // id -> { group, hash, labels }
  const areaObjs = new Map(); // id -> { group, sign, hash, frame }
  const doorLabels = new Map();
  let walls = [];
  let opts = { mode: "current", layers: { areas: true, fixtures: true, structure: true, labels: true } };
  let selected = null; // { kind, id }
  let carriedId = null;
  let editable = false;
  const pulsers = new Set();
  let gridFine = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function camera() {
    return camMode === "map" ? ortho : persp;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    renderer.setSize(width, height, false);
    persp.aspect = width / height;
    persp.updateProjectionMatrix();
  }

  function ftPerPx() {
    if (camMode === "map") return mapv.cspan / height;
    const d = persp.position.distanceTo(tmpV.set(orbit.cx, 3, -orbit.cy));
    return (2 * d * Math.tan(rad(persp.fov / 2))) / height;
  }

  // ----- layout sync -----

  function itemGroupFor(it) {
    if (it.type === "floor") return groups.floors;
    if (it.fixed || ["wall", "door", "opening", "arch", "column", "stairs", "zone"].includes(it.type)) return groups.structure;
    return groups.fixtures;
  }

  function syncItems(items) {
    walls = items.filter((i) => i.type === "wall");
    const floors = items.filter((i) => i.type === "floor");
    const seen = new Set();
    for (const it of items) {
      seen.add(it.id);
      const hash = JSON.stringify(it);
      const cur = itemObjs.get(it.id);
      if (cur && cur.hash === hash) continue;
      if (cur) removeItem(it.id);
      const group = buildItem(it, walls);
      itemGroupFor(it).add(group);
      const labels = itemLabels(it);
      if (labels.top) {
        if (it.type === "floor") groups.labelsTop.add(labels.top);
        else {
          labels.top.userData.follow = it.id;
          group.add(labels.top);
        }
      }
      if (labels.sign) {
        labels.sign.userData.follow = it.id;
        const holder = new THREE.Group();
        holder.add(labels.sign);
        holder.position.copy(group.position);
        groups.labelsSign.add(holder);
        labels.signHolder = holder;
      }
      let grid = null;
      if (it.type === "floor" && !(it.rot % 360)) {
        grid = floorGrid(it);
        groups.floors.add(grid);
      }
      itemObjs.set(it.id, { group, hash, labels, grid, item: it });
      if (["door", "opening", "arch"].includes(it.type)) {
        const dl = doorLabel(it, floors);
        if (dl) {
          groups.labelsTop.add(dl);
          doorLabels.set(it.id, dl);
        }
      }
    }
    for (const id of [...itemObjs.keys()]) if (!seen.has(id)) removeItem(id);
    bounds = computeBounds(items);
    collectWalls();
  }

  function removeItem(id) {
    const cur = itemObjs.get(id);
    if (!cur) return;
    cur.group.parent && cur.group.parent.remove(cur.group);
    dispose(cur.group);
    if (cur.labels.top && cur.labels.top.parent === groups.labelsTop) {
      groups.labelsTop.remove(cur.labels.top);
      dispose(cur.labels.top);
    }
    if (cur.labels.signHolder) {
      groups.labelsSign.remove(cur.labels.signHolder);
      dispose(cur.labels.signHolder);
    }
    if (cur.grid) {
      groups.floors.remove(cur.grid);
      dispose(cur.grid);
    }
    const dl = doorLabels.get(id);
    if (dl) {
      groups.labelsTop.remove(dl);
      dispose(dl);
      doorLabels.delete(id);
    }
    itemObjs.delete(id);
  }

  function computeBounds(items) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of items) {
      if (it.type !== "floor") continue;
      const b = bbox(it);
      x0 = Math.min(x0, b[0]);
      y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[2]);
      y1 = Math.max(y1, b[3]);
    }
    return Number.isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 169, 80];
  }

  function buildArea(a, info) {
    const g = new THREE.Group();
    g.userData = { kind: "area", id: a.id };
    const color = new THREE.Color(info.color);
    const strong = opts.mode !== "current";
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: strong ? 0.42 : 0.14, depthWrite: false, toneMapped: false });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(a.w, a.d), fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.05;
    fill.renderOrder = 3;
    fill.userData.areaFill = true;
    g.add(fill);

    const inset = Math.min(0.4, a.w / 4, a.d / 4);
    const outer = [[-a.w / 2, -a.d / 2], [a.w / 2, -a.d / 2], [a.w / 2, a.d / 2], [-a.w / 2, a.d / 2]];
    const inner = [[-a.w / 2 + inset, -a.d / 2 + inset], [-a.w / 2 + inset, a.d / 2 - inset], [a.w / 2 - inset, a.d / 2 - inset], [a.w / 2 - inset, -a.d / 2 + inset]];
    const fs = shapeFrom(outer);
    fs.holes.push(shapeFrom(inner));
    const frameColor = info.state === "issues" ? "#e5484d" : color.clone().multiplyScalar(0.72);
    const frame = new THREE.Mesh(flatShape(fs, 0.07), new THREE.MeshBasicMaterial({ color: frameColor, transparent: true, opacity: strong ? 0.95 : 0.35, depthWrite: false, toneMapped: false }));
    frame.renderOrder = 4;
    g.add(frame);
    if (info.state === "issues" && strong) pulsers.add(frame);

    // Power Tools brand groups: split along the longer side
    const groupsList = Array.isArray(a.groups) ? a.groups.filter((x) => x && x.label) : [];
    const along = a.w >= a.d ? "x" : "y";
    const L = along === "x" ? a.w : a.d;
    if (groupsList.length > 1 && strong) {
      const total = groupsList.reduce((s, x) => s + (x.share || 0), 0) || 1;
      let pos = -L / 2;
      groupsList.forEach((grp, i) => {
        const len = (L * (grp.share || 0)) / total;
        const mid = pos + len / 2;
        if (i > 0) {
          const div = new THREE.Mesh(new THREE.PlaneGeometry(along === "x" ? 0.18 : a.w, along === "x" ? a.d : 0.18), new THREE.MeshBasicMaterial({ color: frameColor, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
          div.rotation.x = -Math.PI / 2;
          div.position.set(along === "x" ? pos : 0, 0.075, along === "x" ? 0 : -pos);
          div.renderOrder = 4;
          g.add(div);
        }
        const room = Math.max(1.5, len * 0.86);
        const lbl = flatLabel([{ text: grp.label.toUpperCase(), px: 46, color: "#ffffff" }, { text: `${Math.round(((grp.share || 0) / total) * 100)}%`, px: 34, weight: 600, font: BODY, color: "#ffffff" }], along === "x" ? room : Math.min(a.w * 0.8, 6), along === "x" ? Math.min(a.d * 0.22, 2.4) : Math.min(room, 2.4), { bg: "rgba(20,26,23,0.55)", pad: 8 });
        if (along === "x") lbl.position.set(mid, 0.09, a.d / 2 - Math.min(a.d * 0.22, 2.4) / 2 - 0.8);
        else lbl.position.set(0, 0.09, -(mid));
        g.add(lbl);
        pos += len;
      });
    }

    // floor label, kept upright-ish so it reads north-up on the map
    const [bx0, by0, bx1, by1] = bbox(a);
    const vertical = by1 - by0 > (bx1 - bx0) * 1.35;
    const availW = (vertical ? by1 - by0 : bx1 - bx0) * 0.86;
    const availH = Math.min((vertical ? bx1 - bx0 : by1 - by0) * (groupsList.length > 1 ? 0.34 : 0.5), 4.2);
    const lines = [{ text: info.name.toUpperCase(), px: 64, color: "#ffffff" }, { text: info.sub, px: 38, weight: 600, font: BODY, color: "#ffffff" }];
    const lbl = flatLabel(lines, Math.max(1.5, availW), Math.max(0.8, availH), { bg: "rgba(20,26,23,0.62)", pad: 12, opacity: strong ? 1 : 0 });
    lbl.rotation.z = rad((vertical ? 90 : 0) - (a.rot || 0));
    lbl.position.y = 0.1;
    if (groupsList.length > 1 && strong && along === "x") lbl.position.z = -Math.min(a.d * 0.12, 2);
    lbl.visible = strong;
    g.add(lbl);

    g.position.set(a.x, 0, -a.y);
    g.rotation.y = rad(a.rot || 0);
    g.traverse((o) => {
      if (o.isMesh) o.userData.pickRef = g;
    });

    const s = sign([{ text: info.name.toUpperCase(), px: 60, color: "#ffffff" }], 1.7, { bg: info.color, pad: 14, border: "rgba(0,0,0,0.25)", borderW: 6 });
    s.position.set(a.x, 10.5, -a.y);
    s.userData.pickRef = g;
    return { group: g, sign: s, frame };
  }

  function syncAreas(areas, info) {
    const seen = new Set();
    for (const a of areas) {
      seen.add(a.id);
      const inf = info(a);
      const hash = JSON.stringify(a) + "|" + inf.state + "|" + inf.name + "|" + inf.sub + "|" + opts.mode;
      const cur = areaObjs.get(a.id);
      if (cur && cur.hash === hash) continue;
      if (cur) removeArea(a.id);
      const built = buildArea(a, inf);
      groups.areas.add(built.group);
      groups.areaSigns.add(built.sign);
      areaObjs.set(a.id, { ...built, hash, area: a });
    }
    for (const id of [...areaObjs.keys()]) if (!seen.has(id)) removeArea(id);
    applyDepthMode();
  }

  function removeArea(id) {
    const cur = areaObjs.get(id);
    if (!cur) return;
    pulsers.delete(cur.frame);
    groups.areas.remove(cur.group);
    groups.areaSigns.remove(cur.sign);
    dispose(cur.group);
    dispose(cur.sign);
    areaObjs.delete(id);
  }

  /** On the map, department blocks draw over fixtures so you can see whole territories. */
  function applyDepthMode() {
    const onTop = camMode === "map" && opts.mode !== "current";
    groups.areas.traverse((o) => {
      if (o.material && !Array.isArray(o.material)) o.material.depthTest = !onTop;
    });
    for (const n of ["marker", "palette", "overlaps", "guides", "handles", "select", "ghosts", "links", "anchors"]) {
      ov[n].traverse((o) => {
        if (o.material && !Array.isArray(o.material)) o.material.depthTest = camMode !== "map";
      });
    }
  }

  function applyVisibility() {
    const L = opts.layers;
    const mapCam = camMode === "map";
    groups.fixtures.visible = L.fixtures;
    groups.structure.visible = L.structure;
    groups.areas.visible = L.areas;
    groups.areaSigns.visible = L.areas && !mapCam && opts.mode !== "current";
    groups.labelsTop.visible = L.labels && mapCam;
    groups.labelsSign.visible = L.labels && !mapCam;
    for (const { group } of itemObjs.values()) {
      group.traverse((o) => {
        if (o.userData.label) o.visible = L.labels && mapCam;
      });
    }
  }

  // ----- overlays -----

  function clearGroup(g) {
    for (const c of [...g.children]) {
      g.remove(c);
      dispose(c);
    }
  }

  function outlineRect(r, color, y = 0.12, dashed = false, opacity = 1) {
    const pts = corners(r).map(([x, yy]) => new THREE.Vector3(x, y, -yy));
    pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 1, gapSize: 0.6, transparent: true, opacity, depthWrite: false })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const l = new THREE.Line(geo, material);
    if (dashed) l.computeLineDistances();
    l.renderOrder = 8;
    return l;
  }

  function flatRect(r, color, opacity, y = 0.1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rad(r.rot || 0);
    m.position.set(r.x, y, -r.y);
    m.renderOrder = 6;
    return m;
  }

  let stripeTex = null;
  function stripes() {
    if (stripeTex) return stripeTex;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(240,120,40,0.18)";
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(220,90,20,0.55)";
    g.lineWidth = 10;
    for (let i = -64; i < 128; i += 32) {
      g.beginPath();
      g.moveTo(i, 64);
      g.lineTo(i + 64, 0);
      g.stroke();
    }
    stripeTex = new THREE.CanvasTexture(c);
    stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
    stripeTex.colorSpace = THREE.SRGBColorSpace;
    return stripeTex;
  }

  function setClearances(rects) {
    clearGroup(ov.clear);
    if (!rects) return;
    for (const r of rects) {
      const t = stripes().clone();
      t.needsUpdate = true;
      t.repeat.set(r.w / 2, r.d / 2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rad(r.rot || 0);
      m.position.set(r.x, 0.03, -r.y);
      m.renderOrder = 2;
      ov.clear.add(m);
    }
  }

  function setGuides(gd) {
    clearGroup(ov.guides);
    if (!gd) return;
    const [x0, y0, x1, y1] = bounds;
    const mk = (pts) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#f2c14e", depthTest: camMode !== "map", depthWrite: false }));
      l.renderOrder = 9;
      ov.guides.add(l);
    };
    if (gd.x !== null && gd.x !== undefined) mk([new THREE.Vector3(gd.x, 0.2, -(y0 - 3)), new THREE.Vector3(gd.x, 0.2, -(y1 + 3))]);
    if (gd.y !== null && gd.y !== undefined) mk([new THREE.Vector3(x0 - 3, 0.2, -gd.y), new THREE.Vector3(x1 + 3, 0.2, -gd.y)]);
  }

  function setOverlaps(polys) {
    clearGroup(ov.overlaps);
    for (const p of polys || []) {
      if (!p || p.length < 3) continue;
      const m = new THREE.Mesh(flatShape(shapeFrom(p), 0.16), new THREE.MeshBasicMaterial({ color: "#e5484d", transparent: true, opacity: 0.55, depthWrite: false, depthTest: camMode !== "map", toneMapped: false, side: THREE.DoubleSide }));
      m.renderOrder = 9;
      ov.overlaps.add(m);
    }
  }

  function setMarker(r, color = "#f2c14e") {
    clearGroup(ov.marker);
    if (!r) return;
    const fill = flatRect(r, color, 0.22, 0.13);
    ov.marker.add(fill);
    const line = outlineRect(r, color, 0.15, true);
    ov.marker.add(line);
    pulsers.add(fill);
    applyDepthMode();
  }

  function setPaletteGhost(r, color) {
    clearGroup(ov.palette);
    if (!r) return;
    ov.palette.add(flatRect(r, color || "#888888", 0.62, 0.14));
    ov.palette.add(outlineRect(r, "#17201c", 0.16));
    ov.palette.add(outlineRect({ ...r, w: r.w + 0.6, d: r.d + 0.6 }, "#f2c14e", 0.16));
    applyDepthMode();
  }

  /** Comparison: dashed outlines where the other version puts each department, with arrows to yours. */
  function setGhosts(list) {
    clearGroup(ov.ghosts);
    for (const gh of list || []) {
      if (gh.rect) {
        ov.ghosts.add(flatRect(gh.rect, gh.color, gh.fill ?? 0.12, 0.09));
        ov.ghosts.add(outlineRect(gh.rect, gh.color, 0.11, true));
      }
      if (gh.box) {
        const r = gh.box;
        const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, Math.max(0.5, r.h || 3), r.d), new THREE.MeshBasicMaterial({ color: gh.color, transparent: true, opacity: 0.22, depthWrite: false }));
        m.position.set(r.x, Math.max(0.5, r.h || 3) / 2, -r.y);
        m.rotation.y = rad(r.rot || 0);
        ov.ghosts.add(m);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: gh.color }));
        e.position.copy(m.position);
        e.rotation.copy(m.rotation);
        ov.ghosts.add(e);
      }
      if (gh.from && gh.to && Math.hypot(gh.to[0] - gh.from[0], gh.to[1] - gh.from[1]) > 1) {
        const a = new THREE.Vector3(gh.from[0], 0.4, -gh.from[1]), b = new THREE.Vector3(gh.to[0], 0.4, -gh.to[1]);
        ov.ghosts.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: gh.color || "#f2c14e" })));
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 12), new THREE.MeshBasicMaterial({ color: gh.color || "#f2c14e" }));
        cone.position.copy(b);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        ov.ghosts.add(cone);
      }
      if (gh.label) {
        const s = sign([{ text: gh.label, px: 44, color: "#ffffff" }], 1.2, { bg: "rgba(20,26,23,0.82)", pad: 10 });
        const p = gh.rect || gh.box;
        s.position.set(p.x, camMode === "map" ? 1 : 6, -p.y);
        ov.ghosts.add(s);
      }
    }
    applyDepthMode();
  }

  /** Selected block: lines to its neighbors and its entry point. */
  function setLinks(links, anchors) {
    clearGroup(ov.links);
    clearGroup(ov.anchors);
    for (const l of links || []) {
      const a = new THREE.Vector3(l.from[0], 0.3, -l.from[1]), b = new THREE.Vector3(l.to[0], 0.3, -l.to[1]);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineDashedMaterial({ color: l.ok ? "#2fbf71" : "#f5a524", dashSize: 1.2, gapSize: 0.7, depthWrite: false }));
      line.computeLineDistances();
      line.renderOrder = 8;
      ov.links.add(line);
      if (l.label) {
        const s = sign([{ text: l.label, px: 40, color: "#ffffff" }], 1, { bg: l.ok ? "rgba(31,140,82,0.92)" : "rgba(196,120,10,0.92)", pad: 8 });
        s.position.set((l.from[0] + l.to[0]) / 2, 1.2, -(l.from[1] + l.to[1]) / 2);
        ov.links.add(s);
      }
    }
    for (const an of anchors || []) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), new THREE.MeshBasicMaterial({ color: an.ok ? "#2fbf71" : "#f5a524" }));
      pin.position.set(an.x, 2, -an.y);
      ov.anchors.add(pin);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 32), new THREE.MeshBasicMaterial({ color: an.ok ? "#2fbf71" : "#f5a524", transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(an.x, 0.06, -an.y);
      ring.renderOrder = 8;
      ov.anchors.add(ring);
      pulsers.add(ring);
      const s = sign([{ text: an.label, px: 40, color: "#ffffff" }], 1, { bg: "rgba(20,26,23,0.85)", pad: 8 });
      s.position.set(an.x, 4.8, -an.y);
      ov.anchors.add(s);
    }
    applyDepthMode();
  }

  // ----- selection, handles -----

  const handleGeo = new THREE.BoxGeometry(1, 0.25, 1);
  const knobGeo = new THREE.SphereGeometry(0.6, 16, 12);

  function selectedObj() {
    if (!selected) return null;
    if (selected.kind === "area") return areaObjs.get(selected.id)?.area || null;
    return itemObjs.get(selected.id)?.item || null;
  }

  function rebuildSelection() {
    clearGroup(ov.select);
    clearGroup(ov.handles);
    const o = selectedObj();
    if (!o) return;
    const h = selected.kind === "item" ? Math.max(0.3, o.h || 1) : 0.3;
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(o.w + 0.3, h + 0.2, o.d + 0.3)),
      new THREE.LineBasicMaterial({ color: "#f2c14e", depthTest: false, transparent: true })
    );
    outline.position.set(o.x, h / 2, -o.y);
    outline.rotation.y = rad(o.rot || 0);
    outline.renderOrder = 10;
    outline.userData.selOutline = true;
    ov.select.add(outline);
    if (!editable) return;
    const mk = (geo, color, name, hx, hy) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.98 }));
      m.renderOrder = 11;
      m.userData = { kind: "handle", handle: name, hx, hy };
      ov.handles.add(m);
      return m;
    };
    for (const [name, hx, hy] of [["sw", -1, -1], ["s", 0, -1], ["se", 1, -1], ["e", 1, 0], ["ne", 1, 1], ["n", 0, 1], ["nw", -1, 1], ["w", -1, 0]]) mk(handleGeo, "#ffffff", name, hx, hy);
    mk(knobGeo, "#f2c14e", "rot", 0, 1);
    const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: "#f2c14e", depthTest: false }));
    stem.renderOrder = 11;
    stem.userData.stem = true;
    ov.handles.add(stem);
    placeHandles();
  }

  function placeHandles() {
    const o = selectedObj();
    if (!o) return;
    const s = ftPerPx();
    const hs = Math.max(0.5, 13 * s);
    const outline = ov.select.children[0];
    if (outline) {
      outline.position.set(o.x, outline.position.y, -o.y);
      outline.rotation.y = rad(o.rot || 0);
    }
    const knobOff = Math.max(2, 34 * s);
    for (const m of ov.handles.children) {
      const u = m.userData;
      if (u.stem) {
        const [ax, ay] = toWorld(o, 0, o.d / 2);
        const [bx, by] = toWorld(o, 0, o.d / 2 + knobOff);
        m.geometry.setFromPoints([new THREE.Vector3(ax, 0.3, -ay), new THREE.Vector3(bx, 0.3, -by)]);
        continue;
      }
      if (u.handle === "rot") {
        const [x, y] = toWorld(o, 0, o.d / 2 + knobOff);
        m.position.set(x, 0.3, -y);
        m.scale.setScalar(hs / 1.1);
      } else {
        const [x, y] = toWorld(o, (u.hx * o.w) / 2, (u.hy * o.d) / 2);
        m.position.set(x, 0.3, -y);
        m.rotation.y = rad(o.rot || 0);
        m.scale.set(hs, 1, hs);
      }
    }
  }

  // ----- cameras -----

  function fitMap(padFt = 6) {
    const [x0, y0, x1, y1] = bounds;
    const visW = Math.max(100, width - insets.left - insets.right);
    const visH = Math.max(100, height - insets.top - insets.bottom);
    const spanH = y1 - y0 + padFt * 2;
    const spanW = ((x1 - x0 + padFt * 2) * height) / visW;
    mapv.span = Math.max(spanH * (height / visH), spanW);
    const ftpx = mapv.span / height;
    mapv.cx = (x0 + x1) / 2 - ((insets.left - insets.right) / 2) * ftpx;
    mapv.cy = (y0 + y1) / 2 + ((insets.top - insets.bottom) / 2) * ftpx;
  }

  function updateCameras(dt) {
    const k = Math.min(1, dt * 8);
    const js = jerry.state;
    orbit.tx = js.x;
    orbit.ty = js.y;
    orbit.cx += (orbit.tx - orbit.cx) * Math.min(1, dt * 6);
    orbit.cy += (orbit.ty - orbit.cy) * Math.min(1, dt * 6);
    const cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
    persp.position.set(orbit.cx + Math.sin(orbit.yaw) * cp * orbit.dist, 4 + sp * orbit.dist, -orbit.cy + Math.cos(orbit.yaw) * cp * orbit.dist);
    persp.lookAt(orbit.cx, 4, -orbit.cy);

    mapv.ccx += (mapv.cx - mapv.ccx) * k;
    mapv.ccy += (mapv.cy - mapv.ccy) * k;
    mapv.cspan += (mapv.span - mapv.cspan) * k;
    const hh = mapv.cspan / 2, hw = (mapv.cspan * width) / height / 2;
    ortho.left = -hw;
    ortho.right = hw;
    ortho.top = hh;
    ortho.bottom = -hh;
    ortho.position.set(mapv.ccx, 300, -mapv.ccy);
    ortho.lookAt(mapv.ccx, 0, -mapv.ccy);
    ortho.updateProjectionMatrix();
  }

  // walls between the camera and Jerry fade out
  const fadeRay = new THREE.Raycaster();
  let wallMeshes = [];
  function collectWalls() {
    wallMeshes = [];
    for (const { group, item } of itemObjs.values()) if (item.type === "wall") group.traverse((o) => o.userData.wall && wallMeshes.push(o));
  }
  function fadeWalls() {
    for (const m of wallMeshes) if (m.material.opacity < 1) m.material.opacity = Math.min(1, m.material.opacity + (1 - m.material.opacity) * 0.25 + 0.001);
    if (camMode !== "jerry") return;
    const head = new THREE.Vector3(jerry.state.x, 4.5, -jerry.state.y);
    const dir = head.clone().sub(persp.position);
    const len = dir.length();
    fadeRay.set(persp.position, dir.normalize());
    fadeRay.far = len;
    for (const hit of fadeRay.intersectObjects(wallMeshes, false)) {
      hit.object.material.opacity = Math.max(0.14, hit.object.material.opacity - 0.2);
      hit.object.material.depthWrite = false;
    }
    for (const m of wallMeshes) if (m.material.opacity > 0.98) m.material.depthWrite = true;
  }

  // ----- public api -----

  const api = {
    renderer,
    jerry,
    get camMode() {
      return camMode;
    },
    get bounds() {
      return bounds;
    },
    get orbit() {
      return orbit;
    },
    get mapView() {
      return mapv;
    },
    resize,
    ftPerPx,
    setInsets(v) {
      Object.assign(insets, v);
    },
    setTheme(dark) {
      const bg = dark ? "#121916" : "#dfe5e0";
      scene.background.set(bg);
      ground.material.color.set(bg);
    },
    setQuality(low) {
      renderer.shadowMap.enabled = !low;
      renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      scene.traverse((o) => {
        if (o.material) o.material.needsUpdate = true;
      });
    },

    /** Compiles the shader programs the overlays use, so the first selection doesn't stall. */
    warmup() {
      const g = new THREE.Group();
      const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 0)]), new THREE.LineDashedMaterial({ color: "#ffffff", dashSize: 1, gapSize: 1 }));
      dashed.computeLineDistances();
      g.add(dashed);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false, transparent: true })));
      g.add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" })));
      g.add(sign([{ text: "warm", px: 20 }], 1));
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: "#ffffff", depthTest: false, transparent: true })));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: "#ffffff" })));
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, toneMapped: false, side: THREE.DoubleSide })));
      g.position.set(-500, -500, 0);
      scene.add(g);
      try {
        renderer.compile(scene, persp);
        renderer.compile(scene, ortho);
      } catch {
        /* optional */
      }
      // keep the materials alive (hidden): disposing them would release the compiled programs
      g.visible = false;
    },

    /** Reconciles the scene with a layout. info(area) -> { color, name, sub, state }. */
    setLayout(items, areas, o) {
      opts = { ...opts, ...o, layers: { ...opts.layers, ...(o.layers || {}) } };
      syncItems(items || []);
      syncAreas(areas || [], o.areaInfo || ((a) => ({ color: a.color || "#888888", name: a.name || a.key, sub: "", state: "ok" })));
      applyVisibility();
      if (selected && !selectedObj()) selected = null;
      rebuildSelection();
    },

    /** Fast path while dragging: moves an object without rebuilding it. */
    moveObject(kind, obj) {
      if (kind === "area") {
        const cur = areaObjs.get(obj.id);
        if (!cur) return;
        cur.group.position.set(obj.x, 0, -obj.y);
        cur.group.rotation.y = rad(obj.rot || 0);
        cur.sign.position.set(obj.x, 10.5, -obj.y);
        cur.area = obj;
      } else {
        const cur = itemObjs.get(obj.id);
        if (!cur) return;
        cur.group.position.set(obj.x, carriedId === obj.id ? 0.35 : 0, -obj.y);
        cur.group.rotation.y = rad(obj.rot || 0);
        if (cur.labels.signHolder) cur.labels.signHolder.position.set(obj.x, 0, -obj.y);
        cur.item = obj;
      }
    },

    setSelected(sel, canEdit) {
      selected = sel;
      editable = Boolean(canEdit);
      rebuildSelection();
    },
    refreshSelection() {
      rebuildSelection();
    },
    setCarried(id) {
      if (carriedId && itemObjs.get(carriedId)) itemObjs.get(carriedId).group.position.y = 0;
      carriedId = id;
      if (id && itemObjs.get(id)) itemObjs.get(id).group.position.y = 0.35;
    },
    setGuides,
    setOverlaps,
    setMarker,
    setPaletteGhost,
    setGhosts,
    setLinks,
    setClearances,

    setCameraMode(m) {
      camMode = m === "map" ? "map" : "jerry";
      applyVisibility();
      applyDepthMode();
      rebuildSelection();
    },
    fitMap() {
      fitMap();
      mapv.ccx = mapv.cx;
      mapv.ccy = mapv.cy;
      mapv.cspan = mapv.span;
    },
    orbitBy(dxPx, dyPx) {
      orbit.yaw -= dxPx * 0.006;
      orbit.pitch = Math.max(0.12, Math.min(1.45, orbit.pitch + dyPx * 0.005));
    },
    panBy(dxPx, dyPx) {
      if (camMode !== "map") return;
      const s = mapv.cspan / height;
      mapv.cx -= dxPx * s;
      mapv.cy += dyPx * s;
      mapv.ccx = mapv.cx;
      mapv.ccy = mapv.cy;
    },
    zoomBy(factor, clientX, clientY) {
      if (camMode === "map") {
        const before = clientX !== undefined ? api.floorPoint(clientX, clientY) : null;
        mapv.span = Math.max(12, Math.min(260, mapv.span * factor));
        if (before) {
          // keep the point under the cursor fixed
          const r = canvas.getBoundingClientRect();
          const s = mapv.span / height;
          const px = clientX - r.left - width / 2, py = clientY - r.top - height / 2;
          mapv.cx = before[0] - px * s;
          mapv.cy = before[1] + py * s;
        }
        mapv.cspan = mapv.span;
        mapv.ccx = mapv.cx;
        mapv.ccy = mapv.cy;
      } else {
        orbit.dist = Math.max(7, Math.min(90, orbit.dist * factor));
      }
    },
    focus(x, y, span) {
      if (camMode === "map") {
        const ftpx = (span || mapv.span) / height;
        mapv.cx = x - ((insets.left - insets.right) / 2) * ftpx;
        mapv.cy = y + ((insets.top - insets.bottom) / 2) * ftpx;
        if (span) mapv.span = span;
      }
    },
    /** Plan direction vectors for "forward" and "right" relative to the camera. */
    moveBasis() {
      if (camMode === "map") return { f: [0, 1], r: [1, 0] };
      return { f: [-Math.sin(orbit.yaw), Math.cos(orbit.yaw)], r: [Math.cos(orbit.yaw), Math.sin(orbit.yaw)] };
    },

    floorPoint(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera());
      const hit = raycaster.ray.intersectPlane(groundPlane, tmpV);
      return hit ? [hit.x, -hit.z] : null;
    },

    /** What's under the pointer. filter: { handles, areas, items, structure }. */
    pick(clientX, clientY, filter = {}) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      const cam = camera();
      raycaster.setFromCamera(ndc, cam);
      raycaster.camera = cam;
      if (filter.handles && ov.handles.children.length) {
        const hits = raycaster.intersectObjects(ov.handles.children.filter((m) => m.isMesh), false);
        if (hits.length) return { kind: "handle", handle: hits[0].object.userData.handle, hx: hits[0].object.userData.hx, hy: hits[0].object.userData.hy, target: selected };
      }
      const targets = [];
      if (filter.areas && groups.areas.visible) {
        groups.areas.traverse((o) => o.isMesh && o.userData.areaFill && targets.push(o));
        if (groups.areaSigns.visible) targets.push(...groups.areaSigns.children);
      }
      if (filter.items) {
        if (groups.fixtures.visible) groups.fixtures.traverse((o) => (o.isMesh || o.isInstancedMesh) && targets.push(o));
        if (filter.structure && groups.structure.visible) groups.structure.traverse((o) => o.isMesh && targets.push(o));
      }
      if (!targets.length) return null;
      const hits = raycaster.intersectObjects(targets, false);
      for (const hit of hits) {
        let o = hit.object;
        if (o.userData.pickRef) o = o.userData.pickRef;
        while (o && !o.userData.kind) o = o.parent;
        if (o && (o.userData.kind === "area" || o.userData.kind === "item")) {
          const p = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
          return { kind: o.userData.kind, id: o.userData.id, type: o.userData.type, point: p ? [p.x, -p.z] : null };
        }
      }
      return null;
    },

    project(x, y, h = 0) {
      const v = tmpV.set(x, h, -y).project(camera());
      return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: v.z > -1 && v.z < 1 };
    },

    render(dt, t) {
      updateCameras(dt);
      const fine = ftPerPx() < 0.12;
      if (fine !== gridFine) {
        gridFine = fine;
        groups.floors.traverse((o) => o.userData.minorGrid && (o.visible = fine));
      }
      if (selected) placeHandles();
      fadeWalls();
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      for (const m of pulsers) {
        if (!m.parent) {
          pulsers.delete(m);
          continue;
        }
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.material.opacity;
        else m.material.opacity = m.userData.baseOpacity * (0.45 + 0.55 * pulse);
      }
      renderer.render(scene, camera());
    },
  };
  return api;
}
