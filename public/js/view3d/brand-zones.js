/* Brand sections in 3D (core/brands.js): for each Power Tools block with a brand and each Simpson Strong-Tie block,
 *   - the floor: the brand's 12" x 12" tiles (a checkerboard of its two tile colours, laid on the store's 1 ft grid),
 *     a semi-gloss tile just above the store floor, clipped to the block's outline;
 *   - the light: a soft pool of light in the brand's colour from above, and a slim LED cove line in the same colour
 *     around the section at 8' 9" (tinted, never saturated: the shelves still read in their own colours);
 *   - the sign: a neon sign hung at the back of the section, 8 ft wide at most, with the brand's logo on a backlit
 *     panel and its name in neon tubing (both faces, so it reads from either aisle).
 * Built only for blocks whose geometry or brand changed; shown and hidden with the department blocks. */
import {lin} from "./scene.js";
import {outline} from "../core/areas.js";
import {brandOf} from "../core/brands.js";

const SIGN_Y = 8.1, SIGN_H = 1.45, COVE_Y = 8.8; // ft: the sign's centre and height, the LED cove's height

const logos = new Map(); // logo url -> Promise<HTMLImageElement | null>
function loadLogo(url) {
  if (!logos.has(url)) logos.set(url, new Promise(res => { const im = new Image(); im.decoding = "async"; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; }));
  return logos.get(url);
}

/** The 2 x 2 tile texture (one repeat = 2 ft): the two tile colours with a thin grout line. */
function tileCanvas(brand) {
  const n = 128, c = document.createElement("canvas"); c.width = c.height = n * 2;
  const g = c.getContext("2d");
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = brand.tiles[(i + j) % 2]; g.fillRect(i * n, j * n, n, n); }
  g.strokeStyle = "rgba(20,20,20,0.55)"; g.lineWidth = 3;
  for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * n, 0); g.lineTo(k * n, 2 * n); g.moveTo(0, k * n); g.lineTo(2 * n, k * n); g.stroke(); }
  return c;
}

/** The sign's face: a dark backer, the logo on a backlit panel, the name in neon (brand-coloured glow, white-hot core). */
function drawSign(c, brand, logo) {
  const g = c.getContext("2d"), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const r = H * 0.14;
  g.fillStyle = "rgba(12,12,14,0.94)";
  g.beginPath(); g.moveTo(r, 0); g.arcTo(W, 0, W, H, r); g.arcTo(W, H, 0, H, r); g.arcTo(0, H, 0, 0, r); g.arcTo(0, 0, W, 0, r); g.closePath(); g.fill();
  // a thin neon outline around the backer
  g.save(); g.strokeStyle = brand.light; g.lineWidth = H * 0.025; g.shadowColor = brand.light; g.shadowBlur = H * 0.12; g.stroke(); g.restore();
  // the logo, backlit (a soft halo of white behind it)
  const pad = H * 0.16, lh = H - 2 * pad, lw = Math.min(W * 0.42, lh * brand.logoAspect);
  const lx = pad * 1.2, ly = (H - lw / brand.logoAspect) / 2;
  if (logo) {
    if (brand.logoOnLight) { // a lit white panel (a lightbox) behind a logo that has no box of its own
      const m = H * 0.06, x0 = lx - m, y0 = ly - m, pw = lw + 2 * m, ph = lw / brand.logoAspect + 2 * m, pr = H * 0.06;
      g.save(); g.fillStyle = "#fbfbf8"; g.shadowColor = "rgba(255,255,255,0.8)"; g.shadowBlur = H * 0.12;
      g.beginPath(); g.moveTo(x0 + pr, y0); g.arcTo(x0 + pw, y0, x0 + pw, y0 + ph, pr); g.arcTo(x0 + pw, y0 + ph, x0, y0 + ph, pr); g.arcTo(x0, y0 + ph, x0, y0, pr); g.arcTo(x0, y0, x0 + pw, y0, pr); g.closePath(); g.fill(); g.restore();
    }
    g.save(); g.shadowColor = "rgba(255,255,255,0.65)"; g.shadowBlur = brand.logoOnLight ? 0 : H * 0.1;
    g.drawImage(logo, lx, ly, lw, lw / brand.logoAspect); g.restore();
  }
  // the name in neon tubing
  const tx = logo ? lx + lw + (W - lx - lw) / 2 : W / 2, maxW = logo ? W - lx - lw - pad * 2 : W - pad * 2;
  let size = H * 0.42;
  g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const name = brand.name.toUpperCase();
  while (g.measureText(name).width > maxW && size > H * 0.18) { size -= 2; g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  if ("letterSpacing" in g) g.letterSpacing = `${(size * 0.06).toFixed(1)}px`;
  g.lineJoin = "round";
  for (const [blur, width, colour] of [[H * 0.22, size * 0.16, brand.light], [H * 0.1, size * 0.1, brand.light], [0, size * 0.04, "#ffffff"]]) {
    g.save(); g.shadowColor = brand.light; g.shadowBlur = blur; g.strokeStyle = colour; g.lineWidth = width; g.strokeText(name, tx, H / 2); g.restore();
  }
}

export function createBrandZones(R) {
  const THREE = R.THREE;
  const group = new THREE.Group(); group.name = "brand-zones";
  R.scene.add(group);
  const byId = new Map(); // id -> {sig, obj, dispose()}
  const tileTex = new Map(); // brand key -> texture

  function tilesFor(brand) {
    if (!tileTex.has(brand.key)) {
      const t = new THREE.CanvasTexture(tileCanvas(brand));
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5); // the shape's UVs are feet: one repeat = 2 tiles = 2 ft
      t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(8, R.renderer.capabilities.getMaxAnisotropy());
      tileTex.set(brand.key, t);
    }
    return tileTex.get(brand.key);
  }

  function build(it, brand) {
    const obj = new THREE.Group(), disposers = [];
    const pts = outline(it);
    // the floor tiles: the outline in plan coordinates, laid flat (x east, -y north in three.js)
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); // (x, y) -> (x, 0, -y); its UVs stay the plan feet
    const floorMat = new THREE.MeshStandardMaterial({map: tilesFor(brand), roughness: 0.32, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3});
    const floor = new THREE.Mesh(geo, floorMat); floor.position.y = 0.02; floor.receiveShadow = true; floor.renderOrder = 1;
    obj.add(floor); disposers.push(geo, floorMat);

    // the light: a soft pool in the brand's colour (no shadows), and the LED cove around the section
    const span = Math.max(it.w, it.d);
    const pool = new THREE.PointLight(lin(brand.light), 0.55, Math.max(14, span * 1.25), 2);
    pool.position.set(it.x, 8.6, -it.y);
    obj.add(pool);
    const coveMat = new THREE.MeshBasicMaterial({color: lin(brand.light), toneMapped: false, transparent: true, opacity: 0.85});
    disposers.push(coveMat);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.5) continue;
      const bar = new THREE.BoxGeometry(len, 0.06, 0.06); disposers.push(bar);
      const m = new THREE.Mesh(bar, coveMat);
      m.position.set((a[0] + b[0]) / 2, COVE_Y, -(a[1] + b[1]) / 2);
      m.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]); // along the edge (plan y is -z)
      obj.add(m);
    }

    // the neon sign: at the back of the section (its far side in its own frame), along its length, both faces
    const W = Math.min(8, Math.max(3, it.w * 0.7)), H = SIGN_H;
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = Math.round(1024 * H / W);
    drawSign(canvas, brand, null);
    const tex = new THREE.CanvasTexture(canvas); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const signMat = new THREE.MeshBasicMaterial({map: tex, transparent: true, toneMapped: false, side: THREE.FrontSide, depthWrite: false});
    const plane = new THREE.PlaneGeometry(W, H);
    disposers.push(tex, signMat, plane);
    const sign = new THREE.Group();
    for (const s of [0, Math.PI]) { const face = new THREE.Mesh(plane, signMat); face.rotation.y = s; face.position.z = s ? -0.03 : 0.03; face.renderOrder = 8; sign.add(face); }
    const rot = (it.rot || 0) * Math.PI / 180;
    // the back edge in the block's own frame is v = -d/2 (+1 ft inside): rotate into plan coordinates
    const back = it.shape === "poly" ? 0 : -it.d / 2 + 1;
    const px = it.x - Math.sin(rot) * back, py = it.y + Math.cos(rot) * back;
    sign.position.set(px, SIGN_Y, -py);
    sign.rotation.y = rot; // as structure.js turns an item: its length runs along the block's length
    obj.add(sign);
    let alive = true;
    loadLogo(brand.logo).then(img => { if (!alive || !img) return; drawSign(canvas, brand, img); tex.needsUpdate = true; R.requestRender(); });

    group.add(obj);
    return {obj, dispose() { alive = false; group.remove(obj); for (const d of disposers) d.dispose(); }};
  }

  const sigOf = (it, b) => [it.x, it.y, it.w, it.d, it.rot, it.shape, JSON.stringify(it.pts || null), b.key].join("|");

  /** Rebuilds the sections whose block or brand changed; removes the ones that are gone. */
  function update(layout) {
    const seen = new Set();
    for (const it of layout.items) {
      const b = brandOf(it);
      if (!b) continue;
      seen.add(it.id);
      const s = sigOf(it, b);
      let e = byId.get(it.id);
      if (e && e.sig !== s) { e.dispose(); e = null; }
      if (!e) { e = build(it, b); e.sig = s; byId.set(it.id, e); }
    }
    for (const [id, e] of byId) if (!seen.has(id)) { e.dispose(); byId.delete(id); }
    R.requestRender();
  }
  return {
    group, update,
    show(on) { group.visible = !!on; R.requestRender(); },
    dispose() { for (const e of byId.values()) e.dispose(); byId.clear(); for (const t of tileTex.values()) t.dispose(); tileTex.clear(); R.scene.remove(group); },
  };
}
