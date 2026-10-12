/* Builds the 3D store from a layout: floors, structure (walls, doors, arches, columns, stairs, fixed desks),
 * fixtures with their stock (photo textures from the store, product packaging atlas) and the ceilings.
 * Ported from the v2 store renderer. Plan feet map to three.js as (x, height, -y).
 * Returns four groups so the Layers menu can hide each one: floors, structure, fixtures, ceiling. */
import {rad, toWorld, toLocal} from "../core/geometry.js";
import {PAL, BRAND_FLOOR, ATLAS, TYPES, isStructure, isFloorAt, ceilingAt, heightToCeiling, passageTop, baseOf} from "../core/model.js";
import {ringOf, bandPoly} from "../core/ring.js";
import {lin} from "./scene.js";

/* ---------- small helpers ---------- */
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  const h = v => (v | 0).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

/**
 * createStoreBuilder(R) -> {build(layout) -> {floors, structure, fixtures, ceiling}, dispose()}
 * R is the scene bundle from scene.js. Textures load in the background and ask for a redraw when ready.
 */
export function createStoreBuilder(R) {
  const THREE = R.THREE;
  const K = {
    boxG: new THREE.BoxGeometry(1, 1, 1), cylG: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
    rboxG: roundedUnit(THREE, 12, 6), rboxS: roundedUnit(THREE, 8, 4),
    mats: new Map(), tex: new Map(), extraGeo: [], extraTex: [],
  };

  /* ---------- materials ---------- */
  function mat(c, o = {}) {
    const key = c + JSON.stringify(o);
    if (!K.mats.has(key)) {
      const p = Object.assign({roughness: 0.78, metalness: 0}, o);
      if (p.emissive && p.emissive.isColor) p.emissive = p.emissive.clone().convertSRGBToLinear();
      if (p.transparent) { p.roughness = o.roughness ?? 0.08; p.depthWrite = false; }
      K.mats.set(key, new THREE.MeshStandardMaterial(Object.assign({color: lin(c)}, p)));
    }
    return K.mats.get(key);
  }
  function canvasTex(key, w, h, paint, repeat) {
    if (!K.tex.has(key)) {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h; paint(cv.getContext("2d"), w, h);
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      K.tex.set(key, t);
    }
    const t = K.tex.get(key).clone(); t.needsUpdate = true; if (repeat) t.repeat.set(repeat[0], repeat[1]); K.extraTex.push(t); return t;
  }
  // subtle polished-concrete texture with saw-cut joints (one tile = 12 ft)
  const concrete = (c, n) => {
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, n, n); const r = rng(7);
    for (let k = 0; k < 2600; k++) { const x = r() * n, y = r() * n, rd = 2 + r() * 26, a = r() * 0.05; c.fillStyle = `rgba(${r() < 0.5 ? "70,60,50" : "255,255,255"},${a})`; c.beginPath(); c.arc(x, y, rd, 0, Math.PI * 2); c.fill(); }
    for (let k = 0; k < 9000; k++) { c.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; c.fillRect(r() * n, r() * n, 1, 1); }
    c.fillStyle = "rgba(40,36,32,.28)"; c.fillRect(0, 0, n, 2); c.fillRect(0, 0, 2, n);
  };
  // an FBS bucket's side (wraps round the bucket): white plastic, the navy FBS label twice so it shows from anywhere
  const bucketLabel = (c, w, h) => {
    c.fillStyle = "#f3f3ef"; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(0,0,0,.08)"; c.fillRect(0, 0, w, 10); c.fillRect(0, 22, w, 3);
    for (const x of [18, 146]) {
      c.fillStyle = "#1d3f8f"; c.fillRect(x, 44, 92, 48);
      c.fillStyle = "#c8202a"; c.fillRect(x, 92, 92, 7);
      c.fillStyle = "#ffffff"; c.font = "bold 30px Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("FBS", x + 46, 69);
    }
  };
  function floorMat(col, w, d) {
    const key = "floor" + col + w.toFixed(1) + d.toFixed(1);
    if (!K.mats.has(key)) K.mats.set(key, new THREE.MeshStandardMaterial({color: lin(col), map: canvasTex("concrete", 512, 512, (c, n) => concrete(c, n), [w / 12, d / 12]), roughness: 0.42, metalness: 0, envMapIntensity: 0.9}));
    return K.mats.get(key);
  }
  // 2x4 lay-in tile grid
  const tileGrid = (x, w, h) => {
    x.fillStyle = "#efeee9"; x.fillRect(0, 0, w, h); const r = rng(3);
    for (let k = 0; k < 2500; k++) { x.fillStyle = `rgba(90,85,80,${0.05 + r() * 0.08})`; x.fillRect(r() * w, r() * h, 1, 1); }
    x.fillStyle = "#d6d5cf"; x.fillRect(0, 0, w, 3); x.fillRect(0, 0, 3, h);
  };
  // knotty pine boards (old-building ceiling, wainscot)
  const pine = (x, w, h) => {
    const r = rng(11); x.fillStyle = "#c9995f"; x.fillRect(0, 0, w, h);
    for (let b = 0; b < 8; b++) {
      const y0 = b * h / 8; x.fillStyle = `rgba(${120 + r() * 40},${80 + r() * 25},${40 + r() * 15},.35)`; x.fillRect(0, y0, w, h / 8);
      for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(90,55,25,${0.08 + r() * 0.12})`; x.fillRect(r() * w, y0 + r() * h / 8, 8 + r() * 30, 1); }
      for (let k = 0; k < 2; k++) { x.fillStyle = "rgba(80,45,20,.45)"; x.beginPath(); x.ellipse(r() * w, y0 + h / 16, 3 + r() * 3, 2, 0, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = "rgba(60,35,15,.6)"; x.fillRect(0, y0, w, 1.5);
    }
  };
  /* ---------- store photos (tex/*.jpg) ---------- */
  function loadTex(file, setup) {
    const t = new THREE.TextureLoader().load("tex/" + file, () => R.requestRender());
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; if (setup) setup(t); K.extraTex.push(t); return t;
  }
  function photoTex(file) { if (!K.tex.has("photo:" + file)) K.tex.set("photo:" + file, loadTex(file)); return K.tex.get("photo:" + file); }
  function photoMat(file, key, setup) {
    const k = "photo:" + file + (key || "");
    if (!K.mats.has(k)) { const t = setup ? loadTex(file, setup) : photoTex(file); K.mats.set(k, new THREE.MeshStandardMaterial({map: t, emissiveMap: t, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.32, roughness: 0.72, metalness: 0})); }
    return K.mats.get(k);
  }
  // product boxes: rounded edges + a real packaging patch (cut from the store photos) on the front and back faces
  let PROD = null;
  function prodMat() {
    if (PROD) return PROD;
    const m = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.55, metalness: 0, flatShading: true}); const atlas = photoTex("prod_atlas.jpg");
    m.onBeforeCompile = sh => {
      sh.uniforms.uRound = {value: 0.03}; sh.uniforms.uFrac = {value: 0.12}; sh.uniforms.uAtlas = {value: atlas};
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 corner; attribute vec3 rdir; attribute float aCell; uniform float uRound; uniform float uFrac; varying vec2 vPUv; varying float vPFront;")
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = rdir;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n{ vec3 sc=max(vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz)),vec3(1e-4)); float r=min(uRound,uFrac*min(sc.x,min(sc.y,sc.z))); transformed=corner*(0.5-r/sc)+rdir*(r/sc);\n  vec2 q=clamp(transformed.xy+0.5,0.0,1.0); float cx=mod(aCell,16.0), cy=floor(aCell/16.0); vPUv=(vec2(cx,15.0-cy)+0.04+q*0.92)/16.0; vPFront=step(max(abs(rdir.x),abs(rdir.y)),abs(rdir.z)); }");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D uAtlas; varying vec2 vPUv; varying float vPFront;")
        .replace("#include <color_fragment>", "#include <color_fragment>\nif(vPFront>0.5){ diffuseColor.rgb = sRGBToLinear(texture2D(uAtlas,vPUv)).rgb*1.05; }");
    };
    m.customProgramCacheKey = () => "prodAtlas";
    PROD = m; return m;
  }

  /* ---------- primitive boxes ---------- */
  function box(parent, w, h, d, x, y, z, color, o) {
    const m = new THREE.Mesh(K.boxG, typeof color === "string" ? mat(color, o) : color);
    m.scale.set(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)); m.position.set(x, y, z); parent.add(m); return m;
  }
  // plan-local (u along length, v toward front, z up) -> three local: (u, z, -v)
  function pbox(parent, u0, u1, v0, v1, z0, z1, color, o) { return box(parent, Math.abs(u1 - u0), Math.abs(z1 - z0), Math.abs(v1 - v0), (u0 + u1) / 2, (z0 + z1) / 2, -(v0 + v1) / 2, color, o); }
  // flat photo quad in plan-local coords: spans u0..u1 and z0..z1 at depth v; face = +1 looks toward +v, -1 toward -v; fx/fy crop the image
  function photoPlane(g, file, u0, u1, z0, z1, v, face, fx = [0, 1], fy = [0, 1]) {
    const geo = new THREE.PlaneGeometry(Math.abs(u1 - u0), z1 - z0); K.extraGeo.push(geo); const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, fx[0] + uv.getX(i) * (fx[1] - fx[0]), fy[0] + uv.getY(i) * (fy[1] - fy[0]));
    const m = new THREE.Mesh(geo, photoMat(file)); m.position.set((u0 + u1) / 2, (z0 + z1) / 2, -v); m.rotation.y = face > 0 ? Math.PI : 0; m.receiveShadow = true; g.add(m); return m;
  }
  // an upright prism over a polygon given in plan feet (world), built in the item's own frame
  function prism(g, it, poly, z0, z1, color) {
    const sh = new THREE.Shape(poly.map(p => { const [u, v] = toLocal(it, p[0], p[1]); return new THREE.Vector2(u, v); }));
    const geo = new THREE.ExtrudeGeometry(sh, {depth: Math.max(0.001, z1 - z0), bevelEnabled: false});
    geo.rotateX(-Math.PI / 2); geo.translate(0, z0, 0); K.extraGeo.push(geo); // (u, v, up) -> three local (u, up, -v)
    const m = new THREE.Mesh(geo, mat(color)); g.add(m); return m;
  }
  function plane(parent, w, d, x, y, z, material, up = true) {
    const geo = new THREE.PlaneGeometry(w, d); K.extraGeo.push(geo);
    const m = new THREE.Mesh(geo, material); m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; m.position.set(x, y, z); parent.add(m); return m;
  }

  /* ---------- one item ---------- */
  function buildItem(it, layout, g, P, pick, rnd) {
    const w = it.w, d = it.d, h = it.h || 0, col = it.color || "#999999";
    switch (it.type) {
      case "floor": pbox(g, -w / 2, w / 2, -d / 2, d / 2, -0.04, 0.0, floorMat(shade(col, -0.12), w, d)); break;
      case "zone": {
        if (h > 0) {
          pbox(g, -w / 2, w / 2, -d / 2, d / 2, h - 0.5, h, col);
          const n = Math.floor(w / 1.4); for (let k = 0; k <= n; k++) { const u = -w / 2 + k * w / n; pbox(g, u - 0.06, u + 0.06, -d / 2 - 0.1, -d / 2, h, h + 3.2, col); }
          pbox(g, -w / 2, w / 2, -d / 2 - 0.2, -d / 2, h + 3.2, h + 3.45, "#3b2616");
        }
        break;
      }
      case "wall": {
        const top = heightToCeiling(layout, it); // carried up to the ceiling over either side (no gaps)
        holeyBox(g, -w / 2, w / 2, -d / 2, d / 2, 0, top, col, undefined, itemHoles(layout, it)); // high windows cut it
        if (it.ledge > 0 && it.ledge < top - 0.5) buildLedge(g, it, layout);
        // wainscot (knotty pine panelling) only on the side(s) with a floor: never on the outside of the building
        if (it.wainscot) for (const s of [-1, 1]) { const [px, py] = toWorld(it, 0, s * (d / 2 + 0.6)); if (isFloorAt(layout, px, py)) pbox(g, -w / 2, w / 2, s * d / 2, s * (d / 2 + 0.04), 0, 3.6, "#b98a58", {roughness: 0.6}); }
        if (it.clerestory && top > 13) {
          for (let u = -w / 2 + 1.5; u + 4 <= w / 2 - 1; u += 5.5) for (const s of [-1, 1]) pbox(g, u, u + 4, s * d / 2, s * (d / 2 + 0.03), top - 5.2, top - 2.4, "#bcd6de", {emissive: new THREE.Color("#9fb8c8"), emissiveIntensity: 0.55, roughness: 0.1});
        }
        if (/grid C/i.test(it.name || "") && w > 20) { const u0 = 30.9 - it.y, u1 = 42 - it.y; if (u0 > -w / 2 && u1 < w / 2) photoPlane(g, "tom_board.jpg", u0, u1, 2.55, 7.3, -d / 2 - 0.01, -1); }
        break;
      }
      case "column": {
        const top = heightToCeiling(layout, it);
        pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, top, col); pbox(g, -w / 2 - 0.06, w / 2 + 0.06, -d / 2 - 0.06, d / 2 + 0.06, 0, 0.45, "#8a5a34");
        break;
      }
      case "door": case "opening": {
        const fh = h || 8, jt = it.type === "door" ? 0.3 : 0.45, fc = col;
        pbox(g, -w / 2, -w / 2 + jt, -d / 2 - 0.1, d / 2 + 0.1, 0, fh, fc); pbox(g, w / 2 - jt, w / 2, -d / 2 - 0.1, d / 2 + 0.1, 0, fh, fc); pbox(g, -w / 2, w / 2, -d / 2 - 0.1, d / 2 + 0.1, fh - jt, fh, fc);
        holeyBox(g, -w / 2, w / 2, -d / 2, d / 2, fh, Math.max(fh, passageTop(layout, it)), "#ddd5c4", undefined, itemHoles(layout, it));
        if (it.type === "door") {
          if (it.solid) { pbox(g, -w / 2 + jt, w / 2 - jt, -0.06, 0.06, 0, fh - jt, col); pbox(g, w / 2 - jt - 0.55, w / 2 - jt - 0.2, -0.3, 0.3, 3.3, 3.45, "#9aa0a4"); }
          else {
            pbox(g, -w / 2 + jt, w / 2 - jt, -0.04, 0.04, 0.35, fh - jt, "#bcd6de", {transparent: true, opacity: 0.28});
            if (w > 4.5) pbox(g, -0.12, 0.12, -0.1, 0.1, 0, fh - jt, fc);
            pbox(g, -w / 2 + jt, w / 2 - jt, -0.1, 0.1, 0, 0.35, fc); pbox(g, -w / 2 + 0.5, w / 2 - 0.5, -0.3, 0.3, 3.3, 3.42, "#b8bdc0");
          }
        }
        break;
      }
      case "arch": {
        const spring = Math.max(0.5, (h || 10.5) - w / 2), full = Math.max((h || 10.5) + 0.6, passageTop(layout, it)), r = w / 2, RR = r + 0.02;
        // a high opening over the arch: the arch's own piece stops at its sill, the wall above is cut around it
        const holes = itemHoles(layout, it), sills = holes.filter(q => q[1] > -RR && q[0] < RR).map(q => q[2]);
        const top = sills.length ? Math.min(full, Math.max((h || 10.5) + 0.6, Math.min(...sills))) : full;
        if (top < full) holeyBox(g, -RR, RR, -d / 2, d / 2, top, full, "#e6dcc6", undefined, holes);
        const sh = new THREE.Shape(); sh.moveTo(-RR, 0); sh.lineTo(-RR, top); sh.lineTo(RR, top); sh.lineTo(RR, 0); sh.lineTo(r, 0); sh.lineTo(r, spring); sh.absarc(0, spring, r, 0, Math.PI, false); sh.lineTo(-r, 0); sh.lineTo(-RR, 0);
        const geo = new THREE.ExtrudeGeometry(sh, {depth: d, bevelEnabled: false, curveSegments: 24}); K.extraGeo.push(geo);
        const m = new THREE.Mesh(geo, mat("#e6dcc6")); m.position.z = -d / 2; g.add(m);
        const tg = new THREE.TorusGeometry(r + 0.12, 0.16, 6, 32, Math.PI); K.extraGeo.push(tg);
        for (const s of [-1, 1]) { const rr = new THREE.Mesh(tg, mat(col)); rr.position.set(0, spring, s * (d / 2 + 0.05)); g.add(rr); }
        for (const s of [-1, 1]) for (const t of [-1, 1]) pbox(g, s * r - 0.14, s * r + 0.14, t * (d / 2 + 0.05) - 0.04, t * (d / 2 + 0.05) + 0.04, 0, spring, col);
        break;
      }
      case "gondola": {
        const hx = w / 2 - 1.3, bk = col;
        brandFloor(g, it);
        pbox(g, -hx, hx, -d / 2, d / 2, 0, 0.45, "#e9e9e6"); pbox(g, -hx, hx, -0.1, 0.1, 0.45, h, bk); pbox(g, -hx, hx, -0.15, 0.15, h, h + 0.35, it.style === "woodtop" ? "#b98a58" : bk);
        for (const e of [-1, 1]) {
          pbox(g, e * hx, e * (hx + 1.3), -d / 2, d / 2, 0, 0.45, "#e9e9e6"); pbox(g, e * hx, e * (hx + 0.1), -d / 2, d / 2, 0.45, h, bk); for (const z of [1.7, 2.9]) pbox(g, e * hx, e * (hx + 1.2), -d / 2, d / 2, z - 0.06, z, "#e9e9e6");
          for (const z of [0.45, 1.7, 2.9]) for (let v = -d / 2 + 0.15; v < d / 2 - 0.6; v += 0.8) { const bw = 0.9, bh = 0.3 + rnd() * 0.8; P(e * (hx + 0.65), z + bh / 2, v + 0.35, bw, bh, 0.65, pick(it.brand || it.brand2)); }
        }
        if (it.style === "woodtop") pbox(g, -w / 2, w / 2, -d / 2, d / 2, 3.55, 3.7, "#b98a58");
        for (const [s, br] of [[1, it.brand || it.brand2], [-1, it.brand2 || it.brand]]) {
          for (const z of [1.7, 2.9]) pbox(g, -hx, hx, s * 0.12, s * d / 2 * 0.92, z - 0.06, z, "#e9e9e6");
          pbox(g, -hx, hx, s * d / 2, s * (d / 2 - 0.03), 0.15, 0.42, "#d5d9db");
          const levels = [0.45, 1.7, 2.9];
          for (let i = 0; i < 3; i++) {
            const z = levels[i], zt = i < 2 ? levels[i + 1] - 0.1 : (it.style === "woodtop" ? 3.5 : 3.8); let u = -hx + 0.05;
            while (u < hx - 0.25) {
              const pw = 0.25 + rnd() * 0.6; if (u + pw > hx - 0.05) break; const ph = Math.min(zt - z - 0.05, 0.25 + rnd() * 0.75); const pd = 0.9 + rnd() * 0.8; const can = (br === "paint" && rnd() < 0.75) || rnd() < 0.1;
              if (can) P(u + pw / 2, z + ph / 2, s * (0.15 + pd / 2), pw, ph, Math.min(pw, pd), pick(br), true); else P(u + pw / 2, z + ph / 2, s * (0.15 + pd / 2), pw, ph, pd, pick(br));
              u += pw + 0.03 + rnd() * 0.06;
            }
          }
          for (const zr of (h > 5.8 ? [4.9, 5.9] : [4.9])) { let u = -hx + 0.1; while (u < hx - 0.3) { const pw = 0.22 + rnd() * 0.25, ph = 0.3 + rnd() * 0.3; P(u + pw / 2, zr - ph / 2, s * 0.22, pw, ph, 0.09, pick(br)); u += pw + 0.08 + rnd() * 0.12; } }
        }
        break;
      }
      case "wallunit": {
        brandFloor(g, it);
        if (it.brand === "decking") {
          const cz = 2.98, top = h;
          pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, cz, "#f2f1ec"); pbox(g, -w / 2, w / 2, -d / 2, d / 2 + 0.12, cz, cz + 0.14, "#6b6d70"); pbox(g, -w / 2, w / 2, -d / 2, -d / 2 + 0.05, cz + 0.14, top, "#f2f1ec");
          const fy = Math.min(1, (top - cz - 0.14) / 6.88); let u = w / 2, k = 0;
          while (u > -w / 2 + 0.05) {
            const tw = Math.min(8, u + w / 2), t = "AB"[k % 2], f = tw / 8;
            photoPlane(g, `decking_upper_${t}.jpg`, u - tw, u, cz + 0.14, top, -d / 2 + 0.06, 1, [0, f], [0, fy]);
            photoPlane(g, `decking_lower_${t}.jpg`, u - tw, u, 0, cz, d / 2 + 0.006, 1, [0, f]); u -= tw; k++;
          }
          break;
        }
        const band = it.brand === "milwaukee" && w >= 20 && h >= 7.5;
        if (band) for (let k = 0; k < 2; k++) photoPlane(g, "packout_band.jpg", -w / 2 + k * w / 2, -w / 2 + (k + 1) * w / 2, h - 2, h, -d / 2 + 0.21, 1);
        pbox(g, -w / 2, w / 2, -d / 2, -d / 2 + 0.2, 0, h, col); pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, 0.4, "#e9e9e6");
        const levels = it.brand === "mugs" ? [0.4, 1.4, 2.4, 3.4, 4.4, 5.4] : [0.4, 1.6, 2.8];
        for (let i = 0; i < levels.length; i++) {
          const z = levels[i]; if (i) pbox(g, -w / 2, w / 2, -d / 2 + 0.2, d / 2 * 0.95, z - 0.06, z, it.brand === "simpson" ? "#e8590d" : "#e9e9e6");
          const zt = i + 1 < levels.length ? levels[i + 1] - 0.1 : z + 1.1; let u = -w / 2 + 0.05;
          while (u < w / 2 - 0.25) { const pw = 0.25 + rnd() * 0.55; if (u + pw > w / 2 - 0.05) break; const ph = Math.min(zt - z - 0.05, 0.25 + rnd() * 0.7); const pd = (d - 0.3) * (0.6 + rnd() * 0.35); P(u + pw / 2, z + ph / 2, -d / 2 + 0.2 + pd / 2, pw, ph, pd, pick(it.brand), it.brand === "mugs" || rnd() < 0.08); u += pw + 0.03 + rnd() * 0.06; }
        }
        if (it.brand !== "mugs") for (const zr of (h >= 7 && !band ? [4.6, 5.6, 6.6] : [4.6, 5.6])) { let u = -w / 2 + 0.1; while (u < w / 2 - 0.3) { const pw = 0.22 + rnd() * 0.25, ph = 0.3 + rnd() * 0.3; P(u + pw / 2, zr - ph / 2, -d / 2 + 0.3, pw, ph, 0.09, pick(it.brand)); u += pw + 0.08 + rnd() * 0.12; } }
        if (it.brand === "simpson") for (const z of [3.9, 4.8, 5.7, 6.5]) pbox(g, -w / 2, w / 2, -d / 2 + 0.2, -d / 2 + 1.1, z, z + 0.08, "#e8590d");
        break;
      }
      case "rack": {
        const bays = Math.max(1, Math.round(w / 9)), bw = w / bays;
        for (let i = 0; i <= bays; i++) { const u = -w / 2 + i * bw; for (const v of [-d / 2, d / 2 - 0.25]) pbox(g, u - 0.12, u + 0.12, v, v + 0.25, 0, h, col); }
        for (const z of [0.3, 4.5, 8.5, 12.5]) {
          if (z > h - 0.5) continue;
          for (const v of [-d / 2, d / 2 - 0.3]) pbox(g, -w / 2, w / 2, v, v + 0.3, z, z + 0.4, "#e8640d"); pbox(g, -w / 2, w / 2, -d / 2, d / 2, z + 0.4, z + 0.45, "#9aa0a4");
          for (let b = 0; b < bays; b++) { let u = -w / 2 + b * bw + 0.4; while (u < -w / 2 + (b + 1) * bw - 1) { const pw = 1.2 + rnd() * 1.8, ph = Math.min(0.8 + rnd() * 2.4, h - z - 0.6); if (u + pw > -w / 2 + (b + 1) * bw - 0.3 || ph < 0.3) break; const pd = d - 0.4 - rnd() * 0.6; P(u + pw / 2, z + 0.45 + ph / 2, -d / 2 + 0.25 + pd / 2, pw, ph, pd, rnd() < 0.6 ? "#a07850" : pick("boxes")); u += pw + 0.15; } }
        }
        break;
      }
      case "pallet": { pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, 0.45, "#b39a73"); let z = 0.45; while (z < h) { const hh = 0.6 + rnd() * 0.5; for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) P(-w / 2 + 0.1 + a * w / 3 + w / 6 - 0.05, z + hh / 2, -d / 2 + 0.1 + b * d / 2 + d / 4 - 0.05, w / 3 - 0.1, hh, d / 2 - 0.1, pick(it.brand || "boxes")); z += hh + 0.02; } break; }
      case "ring": buildRing(g, it, h, col); break;
      case "counter": pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h - 0.15, col); pbox(g, -w / 2 - 0.1, w / 2 + 0.1, -d / 2 - 0.1, d / 2 + 0.1, h - 0.15, h, it.top || "#1a1a1c"); break;
      case "table": pbox(g, -w / 2, w / 2, -d / 2, d / 2, h - 0.15, h, col); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(g, a * (w / 2 - 0.25) - 0.07, a * (w / 2 - 0.25) + 0.07, b * (d / 2 - 0.2) - 0.07, b * (d / 2 - 0.2) + 0.07, 0, h - 0.15, "#2b2b2b"); break;
      case "platform": {
        if (it.poly) prism(g, it, it.poly, 0, h || 0.35, col); // its own outline (e.g. a chamfered corner)
        else pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h || 0.35, col);
        if (it.brand === "milwaukee") for (let k = 0; k < Math.max(1, Math.floor(w / 6)); k++) { const u = -w / 2 + 3 + k * 6; for (const [a, b] of [[-0.6, -0.4], [0.6, -0.4], [0, 0.7]]) pbox(g, u + a - 0.04, u + a + 0.04, b - 0.04, b + 0.04, h, 5, "#9aa0a4"); pbox(g, u - 0.45, u + 0.45, -0.35, 0.35, 5, 5.6, "#b3121f"); }
        break;
      }
      case "stairs": {
        const H = h || 10, n = Math.max(2, Math.round(H / 0.62));
        for (let k = 0; k < n; k++) { const u0 = -w / 2 + k * w / n; pbox(g, u0, u0 + w / n + 0.02, -d / 2, d / 2, 0, (k + 1) * H / n, col); }
        if (H > 3) pbox(g, -w / 2, w / 2, -d / 2 - 0.1, -d / 2, 0, H + 3, "#6d7275");
        break;
      }
      case "tower": { pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h, col); for (let k = 0; k < 7; k++) for (const s of [-1, 1]) P(s * (w / 2 + 0.3), 1.2 + k * 0.82 + 0.22, 0, 0.62, 0.44, 0.62, ["#f2d21a", "#f2f2f2", "#1f5fd1", "#e8431a", "#239a3a", "#ee7aa8"][Math.floor(rnd() * 6)], true); break; }
      case "window": buildWindow(g, it, layout); break;
      case "display": default: buildDisplay(g, it, rnd, P, pick); break;
    }
  }

  /* ---------- high windows and openings ("window" items) ---------- */
  // The holes [t0, t1, z0, z1] that high windows cut in an upright slab of thickness `thick` running from a to b (plan
  // feet), t measured along it from a. A window cuts every slab it lies along: walls, arches, door headers, a drop
  // ceiling's fascia and the band that closes a step between two ceilings.
  function holesAlong(layout, ax, ay, bx, by, thick) {
    const L = Math.hypot(bx - ax, by - ay), out = [];
    if (L < 0.01) return out;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    for (const wn of layout.items) {
      if (wn.type !== "window" || !(wn.h > (wn.sill || 0))) continue;
      const r = rad(wn.rot || 0);
      if (Math.abs(Math.cos(r) * uy - Math.sin(r) * ux) > 0.02) continue; // not along this slab
      if (Math.abs((wn.x - ax) * uy - (wn.y - ay) * ux) > thick / 2 + wn.d / 2 + 0.05) continue; // beside it, not in it
      const tc = (wn.x - ax) * ux + (wn.y - ay) * uy, t0 = Math.max(0, tc - wn.w / 2), t1 = Math.min(L, tc + wn.w / 2);
      if (t1 - t0 > 0.05) out.push([t0, t1, wn.sill || 0, wn.h]);
    }
    return out;
  }
  // an item's own holes, in its frame (u along its length, centred)
  const itemHoles = (layout, it) => holesAlong(layout, ...toWorld(it, -it.w / 2, 0), ...toWorld(it, it.w / 2, 0), it.d).map(q => [q[0] - it.w / 2, q[1] - it.w / 2, q[2], q[3]]);
  // pbox with rectangular holes [u0, u1, z0, z1]: the solid pieces around them
  function holeyBox(parent, u0, u1, v0, v1, z0, z1, color, o, holes) {
    const hs = (holes || []).filter(q => q[1] > u0 && q[0] < u1 && q[3] > z0 && q[2] < z1);
    if (!hs.length) { pbox(parent, u0, u1, v0, v1, z0, z1, color, o); return; }
    const cuts = [...new Set([u0, u1, ...hs.flatMap(q => [q[0], q[1]]).filter(u => u > u0 && u < u1)])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1], m = (a + b) / 2;
      let zs = [[z0, z1]];
      for (const q of hs) if (q[0] < m && q[1] > m) zs = zs.flatMap(([p, t]) => [[p, Math.min(t, q[2])], [Math.max(p, q[3]), t]]).filter(([p, t]) => t - p > 0.01);
      for (const [p, t] of zs) pbox(parent, a, b, v0, v1, p, t, color, o);
    }
  }
  // an upright slab from a to b (plan feet, world), cut by the windows along it
  function slab(layout, parent, ax, ay, bx, by, thick, z0, z1, color) {
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.01 || z1 - z0 < 0.01) return;
    const g = new THREE.Group(); g.position.set((ax + bx) / 2, 0, -(ay + by) / 2); g.rotation.y = Math.atan2(by - ay, bx - ax); parent.add(g);
    holeyBox(g, -L / 2, L / 2, -thick / 2, thick / 2, z0, z1, color, undefined, holesAlong(layout, ax, ay, bx, by, thick).map(q => [q[0] - L / 2, q[1] - L / 2, q[2], q[3]]));
  }
  // The window itself: a wood sill (open) or a wood frame with frosted glass, and, on the side whose ceiling is below
  // it (the offices over the front room, the space over a drop ceiling), a lit room to look into instead of the void.
  function buildWindow(g, it, layout) {
    const w = it.w, d = it.d, z0 = it.sill || 0, z1 = it.h || TYPES.window.h;
    if (!(z1 > z0)) return;
    if (it.glass) {
      const fc = "#c9a77a", t = 0.22, v = d / 2 + 0.06;
      pbox(g, -w / 2 - t, w / 2 + t, -v, v, z0 - t, z0, fc); pbox(g, -w / 2 - t, w / 2 + t, -v, v, z1, z1 + t, fc);
      pbox(g, -w / 2 - t, -w / 2, -v, v, z0, z1, fc); pbox(g, w / 2, w / 2 + t, -v, v, z0, z1, fc);
      pbox(g, -w / 2, w / 2, -0.03, 0.03, z0, z1, "#dfe9ee", {transparent: true, opacity: 0.5, emissive: new THREE.Color("#d6e4ec"), emissiveIntensity: 0.4});
    } else {
      pbox(g, -w / 2 - 0.12, w / 2 + 0.12, -d / 2 - 0.16, d / 2 + 0.16, z0 - 0.12, z0 + 0.02, "#8a5a34", {roughness: 0.6}); // the wood sill
    }
    // which side the room is on: where the ceiling is below the window (none when both sides are tall rooms)
    const lowSide = [-1, 1].map(s => { const [x, y] = toWorld(it, 0, s * (d / 2 + 2)); return {s, c: ceilingAt(layout, x, y)}; }).filter(q => q.c < z0).sort((a, b) => a.c - b.c)[0];
    if (!lowSide) return;
    // one room behind a run of openings along the same wall (gaps under 3 ft): built by the first of them
    const run = layout.items.filter(o => o.type === "window" && o.h > (o.sill || 0) && Math.abs(Math.sin(rad((o.rot || 0) - (it.rot || 0)))) < 0.02 && Math.abs(toLocal(it, o.x, o.y)[1]) < 0.5)
      .map(o => { const c = toLocal(it, o.x, o.y)[0]; return {o, u0: c - o.w / 2, u1: c + o.w / 2}; }).sort((a, b) => a.u0 - b.u0);
    let span = null;
    for (const r of run) {
      if (span && r.u0 - span.u1 < 3) { span.u1 = Math.max(span.u1, r.u1); span.top = Math.max(span.top, r.o.h); span.list.push(r.o); continue; }
      if (span && span.list.includes(it)) break;
      span = {u0: r.u0, u1: r.u1, top: r.o.h, first: r.o, list: [r.o]};
    }
    if (!span || span.first !== it) return;
    const s = lowSide.s, D = 9, floor = Math.max(lowSide.c + 0.6, z0 - 3.6), roof = span.top + 0.5, U0 = span.u0 - 0.6, U1 = span.u1 + 0.6;
    const BS = THREE.BackSide, wall = mat("#e6dfd2", {side: BS}), geo = new THREE.BoxGeometry(U1 - U0, roof - floor, D); K.extraGeo.push(geo);
    // BoxGeometry faces: +x, -x, +y (ceiling), -y (floor), +z, -z; seen from inside only, so the face at the opening never shows
    const room = new THREE.Mesh(geo, [wall, wall, mat("#efeeea", {side: BS}), mat("#76716a", {side: BS, roughness: 0.95}), wall, wall]);
    room.position.set((U0 + U1) / 2, (floor + roof) / 2, -s * (d / 2 + D / 2)); g.add(room);
    // office lights and a few desks against the back wall
    for (let u = U0 + 2; u < U1 - 1.5; u += 6) pbox(g, u - 1, u + 1, s * (d / 2 + 2.5), s * (d / 2 + 6.5), roof - 0.06, roof - 0.01, "#ffffff", {emissive: new THREE.Color("#fff4e2"), emissiveIntensity: 1});
    for (let u = U0 + 2.5; u < U1 - 2.5; u += 7) {
      pbox(g, u - 2, u + 2, s * (d / 2 + D - 2.6), s * (d / 2 + D - 0.2), floor + 2.35, floor + 2.5, "#9a7650");
      pbox(g, u - 0.7, u + 0.7, s * (d / 2 + D - 1.2), s * (d / 2 + D - 1.1), floor + 2.6, floor + 3.5, "#1d1f22");
    }
  }
  // A wall's ledge (the high shelf the FBS buckets stand on): on the side facing the taller room, a cap 1.4 ft deep at
  // the ledge height, and a row of white FBS buckets along it.
  function buildLedge(g, it, layout) {
    const w = it.w, d = it.d, L = it.ledge;
    const s = [-1, 1].map(q => { const [x, y] = toWorld(it, 0, q * (d / 2 + 2)); return {q, c: ceilingAt(layout, x, y)}; }).sort((a, b) => b.c - a.c)[0].q;
    const u0 = -w / 2 + 0.4, u1 = w / 2 - 0.4;
    pbox(g, u0, u1, s * d / 2, s * (d / 2 + 1.4), L - 0.4, L, it.color || "#ecebe6");
    pbox(g, u0, u1, s * (d / 2 + 1.35), s * (d / 2 + 1.45), L - 0.55, L + 0.04, "#d8d4ca"); // its front edge
    const n = Math.floor((u1 - u0 - 0.4) / 1.15);
    if (n < 1) return;
    const geo = new THREE.CylinderGeometry(0.5, 0.45, 1.2, 20); K.extraGeo.push(geo);
    if (!K.mats.has("fbsBucket")) K.mats.set("fbsBucket", new THREE.MeshStandardMaterial({color: 0xffffff, map: canvasTex("fbsBucket", 256, 128, bucketLabel), roughness: 0.5}));
    const m = new THREE.InstancedMesh(geo, K.mats.get("fbsBucket"), n);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < n; k++) {
      const u = u0 + 0.6 + k * (u1 - u0 - 1.2) / Math.max(1, n - 1);
      M.compose(new THREE.Vector3(n > 1 ? u : 0, L + 0.6, -s * (d / 2 + 0.7)), Q.setFromAxisAngle(up, (k * 2.4) % (Math.PI * 2)), S); m.setMatrixAt(k, M);
    }
    m.instanceMatrix.needsUpdate = true; g.add(m);
  }
  // the brand's floor tiles around its fixture ("brandfloor" in the survey)
  function brandFloor(g, it) {
    if (!it.brandfloor) return;
    const c = BRAND_FLOOR[it.brand] || (PAL[it.brand] || ["#555555"])[0];
    const m = mat(c, {roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    pbox(g, -it.w / 2 - 0.6, it.w / 2 + 0.6, -it.d / 2 - 2, it.d / 2 + 2, 0.004, 0.012, m);
  }
  function buildRing(g, it, h, col) {
    const RG = ringOf(it), hw = RG.h;
    const layer = (off, ext, z0, z1, c, o) => {
      for (const run of RG.runs) {
        const b = bandPoly(run, hw + off, ext); const sh = new THREE.Shape(b.outer.map(p => new THREE.Vector2(p[0], p[1])));
        if (b.hole) sh.holes.push(new THREE.Path(b.hole.map(p => new THREE.Vector2(p[0], p[1]))));
        const bv = Math.min(0.035, (z1 - z0) / 4);
        const geo = new THREE.ExtrudeGeometry(sh, {depth: Math.max(0.001, z1 - z0 - 2 * bv), bevelEnabled: true, bevelThickness: bv, bevelSize: bv * 0.8, bevelOffset: -bv * 0.8, bevelSegments: 3, curveSegments: 4});
        geo.rotateX(-Math.PI / 2); geo.translate(0, z0 + bv, 0); K.extraGeo.push(geo);
        g.add(new THREE.Mesh(geo, c && c.isMaterial ? c : mat(c, Object.assign({side: THREE.DoubleSide}, o || {}))));
      }
    };
    let body = col;
    if (it.led) {
      const D = h - 0.15 - 0.22, bv = Math.min(0.035, D / 4);
      body = photoMat("sdb_face.jpg", "ring" + D.toFixed(2), t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 3.3, -1 / D); t.offset.set(0, (1 + bv) / D); });
      body.side = THREE.DoubleSide; body.emissiveIntensity = 0.45;
    }
    layer(0, 0, 0, 0.22, "#e9e9e6"); layer(-0.06, -0.06, 0.22, h - 0.15, body); layer(0.15, 0.15, h - 0.15, h, it.top || "#1a1a1c");
    if (it.led) layer(0.01, 0.01, h - 0.3, h - 0.17, "#3a6bff", {emissive: new THREE.Color("#2248ff"), emissiveIntensity: 0.9});
    const w = it.w, d = it.d;
    for (const [u, v] of [[-w * 0.2, -d / 2 + hw], [w * 0.15, -d / 2 + hw], [-w * 0.2, d / 2 - hw], [w * 0.2, d / 2 - hw]]) pbox(g, u - 0.8, u + 0.8, v - 0.05, v + 0.05, h, h + 1.2, "#141414");
    pbox(g, -w / 2 + RG.t, w / 2 - RG.t, -d / 2 + RG.t, d / 2 - RG.t, 0, 0.03, "#1b1b1b");
  }
  function buildDisplay(g, it, rnd, P, pick) {
    const w = it.w, d = it.d, h = it.h || 6, col = it.color || "#6b6f73";
    switch (it.style) {
      case "pergola":
        for (const a of [-1, 1]) for (const b of [-1, 1]) pbox(g, a * (w / 2 - 0.3) - 0.22, a * (w / 2 - 0.3) + 0.22, b * (d / 2 - 0.3) - 0.22, b * (d / 2 - 0.3) + 0.22, 0, h - 0.8, col);
        pbox(g, -w / 2, w / 2, -d / 2 + 0.1, -d / 2 + 0.5, h - 0.8, h - 0.3, col); pbox(g, -w / 2, w / 2, d / 2 - 0.5, d / 2 - 0.1, h - 0.8, h - 0.3, col); for (let u = -w / 2 + 0.3; u < w / 2; u += 1.1) pbox(g, u, u + 0.3, -d / 2 - 0.3, d / 2 + 0.3, h - 0.3, h, col);
        pbox(g, -w / 2 + 0.6, w / 2 - 0.6, -0.8, 0.8, 0, 3.2, "#1c1c1c"); for (let k = 0; k < 30; k++) P(-w / 2 + 0.9 + rnd() * (w - 1.8), 0.5 + Math.floor(rnd() * 3) * 1.0 + 0.2, -0.9 - rnd() * 0.1, 0.35, 0.3, 0.2, pick("simpson_orn"));
        break;
      case "heater": { pbox(g, -0.55, 0.55, -0.55, 0.55, 0, 2.9, col); pbox(g, -0.08, 0.08, -0.08, 0.08, 2.9, 6.4, col); const cg = new THREE.CylinderGeometry(1.6, 0.3, 0.3, 24); K.extraGeo.push(cg); const m = new THREE.Mesh(cg, mat("#b8bdc0")); m.position.y = 7.2; g.add(m); break; }
      case "clothes": case "apparel":
        for (const [cx, cz] of [[-w / 2 + Math.min(2, w / 4), -d / 2 + Math.min(1, d / 4)], [w / 2 - Math.min(2, w / 4), d / 2 - Math.min(1, d / 4)]]) {
          const rw = Math.min(2, w / 4);
          pbox(g, cx - rw, cx + rw, cz - 0.05, cz + 0.05, 5.3, 5.4, "#9aa0a4"); for (const e of [-rw * 0.9, rw * 0.9]) pbox(g, cx + e - 0.05, cx + e + 0.05, cz - 1, cz + 1, 0, 5.3, "#9aa0a4");
          for (let k = 0; k < 12; k++) P(cx - rw * 0.85 + k * rw * 0.15, 3.9, cz, 0.2, 2.6, 1.7, ["#cde21a", "#f07e14", "#9a9a9a", "#3a3a3a", "#1f3a5a", "#7a5231"][Math.floor(rnd() * (it.style === "apparel" ? 6 : 4))]);
        }
        break;
      case "cubicles":
        if (d < 1.5) { pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h, col); for (let u = -w / 2; u <= w / 2 + 1e-6; u += Math.max(2, w / Math.round(w / 5))) pbox(g, u - 0.06, u + 0.06, -d / 2 - 0.02, d / 2 + 0.02, 0, h + 0.05, "#5e6266"); break; }
        for (const [a, b, c, e] of [[-w / 2, -d / 2, w / 2, -d / 2 + 0.3], [-w / 2, d / 2 - 0.3, w / 2, d / 2], [-w / 2, -d / 2, -w / 2 + 0.3, d / 2], [w / 2 - 0.3, -d / 2, w / 2, d / 2], [-0.15, -d / 2, 0.15, d / 2], [-w / 2, -0.15, w / 2, 0.15]]) pbox(g, a, c, b, e, 0, h, col);
        for (const [u, v] of [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4], [w / 4, d / 4]]) { pbox(g, u - 3, u + 3, v - 1.5, v + 0.5, 2.4, 2.55, "#8a5a34"); pbox(g, u - 0.8, u + 0.8, v - 0.2, v - 0.1, 2.55, 3.9, "#141414"); }
        break;
      case "spinner": { const m = new THREE.Mesh(K.cylG, mat("#3b3f43")); m.scale.set(Math.min(w, 1.6), 0.15, Math.min(d, 1.6)); m.position.y = 0.08; g.add(m); pbox(g, -0.05, 0.05, -0.05, 0.05, 0, h, "#9aa0a4"); for (let z = 1.2; z < h; z += 1) for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; P(Math.cos(a) * 0.7, z + 0.3, Math.sin(a) * 0.7, 0.4, 0.6, 0.1, pick("safety")); } break; }
      case "coolers": for (let k = 0; k < 2; k++) { const u = -w / 2 + k * w / 2; pbox(g, u + 0.05, u + w / 2 - 0.05, -d / 2, d / 2, 0, h, col); pbox(g, u + 0.25, u + w / 2 - 0.25, d / 2, d / 2 + 0.04, 0.5, h - 0.4, "#bcd6de", {transparent: true, opacity: 0.35}); for (let z = 1.1; z < h - 0.5; z += 1.2) for (let j = 0; j < 6; j++) P(u + 0.45 + j * 0.38, z + 0.35, d / 2 - 0.4, 0.22, 0.7, 0.22, pick("safety"), true); } break;
      case "cage": for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(g, a * w / 2 - 0.07, a * w / 2 + 0.07, b * d / 2 - 0.07, b * d / 2 + 0.07, 0, 5.5, "#2b2b2b"); pbox(g, -w / 2, w / 2, -d / 2, d / 2, 5.4, 5.55, "#2b2b2b"); pbox(g, -w / 2 + 0.3, w / 2 - 0.3, -d / 2 + 0.3, d / 2 - 0.3, 0.6, 2.0, col); pbox(g, -w / 2, w / 2, d / 2 - 0.1, d / 2, 5.6, Math.max(5.8, h), "#f2f2ee"); break;
      case "lightbox":
        pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, 0.5, "#2b2b2b"); pbox(g, -w / 2, w / 2, -d / 2, d / 2 - 0.08, 0.5, h, "#2b2b2b");
        pbox(g, -w / 2 + 0.15, w / 2 - 0.15, d / 2 - 0.08, d / 2, 0.8, h - 0.3, col, {emissive: new THREE.Color(col), emissiveIntensity: 0.75, roughness: 0.4});
        break;
      case "grill": {
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(g, a * (w / 2 - 0.25) - 0.05, a * (w / 2 - 0.25) + 0.05, b * (d / 2 - 0.4) - 0.05, b * (d / 2 - 0.4) + 0.05, 0, h * 0.55, "#2b2b2b");
        const bg = new THREE.CylinderGeometry(Math.min(d, 2.2) / 2.4, Math.min(d, 2.2) / 2.4, w * 0.8, 20); K.extraGeo.push(bg);
        const barrel = new THREE.Mesh(bg, mat(col, {roughness: 0.45, metalness: 0.3})); barrel.rotation.z = Math.PI / 2; barrel.position.y = h * 0.55 + Math.min(d, 2.2) / 2.4; g.add(barrel);
        pbox(g, w / 2 - 0.9, w / 2 - 0.1, -0.5, 0.5, h * 0.55, h, "#1a1a1a");
        break;
      }
      case "studwall":
        pbox(g, -w / 2, w / 2, -0.25, 0.25, 0, 0.15, col); pbox(g, -w / 2, w / 2, -0.25, 0.25, h - 0.15, h, col);
        for (let u = -w / 2 + 0.07; u <= w / 2 - 0.07 + 1e-6; u += Math.max(0.6, (w - 0.14) / Math.round((w - 0.14) / 1.333))) pbox(g, u - 0.07, u + 0.07, -0.25, 0.25, 0.15, h - 0.15, col);
        pbox(g, -w / 2, w / 2, -d / 2, -d / 2 + 0.3, 0, 0.3, "#8a8d90");
        break;
      default:
        if (it.round) { const m = new THREE.Mesh(K.cylG, mat(col)); m.scale.set(w, h, d); m.position.y = h / 2; g.add(m); }
        else pbox(g, -w / 2, w / 2, -d / 2, d / 2, 0, h, col);
    }
  }

  /* ---------- ceilings ---------- */
  function buildCeilings(layout, cg) {
    const lampM = new THREE.MeshBasicMaterial({color: new THREE.Color(1.6, 1.58, 1.5)}); K.mats.set("lampM", lampM);
    const skyM = new THREE.MeshBasicMaterial({color: new THREE.Color(1.5, 1.62, 1.75)}); K.mats.set("skyM", skyM);
    const ceilings = layout.items.filter(it => it.type === "ceiling");
    // older layouts carry the ceiling on the floor item instead
    const list = ceilings.length ? ceilings : layout.items.filter(it => it.type === "floor" && it.ceil).map(f => ({...f, type: "ceiling", h: f.ceil}));
    for (const c of list) {
      const g = new THREE.Group(); g.position.set(c.x, 0, -c.y); g.rotation.y = rad(c.rot || 0); cg.add(g);
      const w = c.w, d = c.d, h = c.h;
      const base = c.style === "deck" ? "#7b8086" : c.style === "wood" ? "#b88a57" : "#ecebe6";
      pbox(g, -w / 2, w / 2, -d / 2, d / 2, h, h + 0.2, base);
      const surf = c.style === "deck"
        ? new THREE.MeshStandardMaterial({color: lin("#8a8f95"), roughness: 0.6, metalness: 0.35})
        : c.style === "wood"
          ? new THREE.MeshStandardMaterial({color: 0xffffff, map: canvasTex("pine", 256, 256, pine, [w / 8, d / 8]), roughness: 0.75})
          : new THREE.MeshStandardMaterial({color: 0xffffff, map: canvasTex("tile", 128, 256, tileGrid, [w / 2, d / 4]), roughness: 0.9});
      K.mats.set("ceil:" + c.id, surf);
      plane(g, w, d, 0, h - 0.01, 0, surf, false);
      if (c.style === "deck") for (let u = -w / 2 + 2; u < w / 2; u += 4) pbox(g, u - 0.15, u + 0.15, -d / 2, d / 2, h - 1.3, h, "#5d6268", {metalness: 0.3, roughness: 0.6}); // joists
      // lights
      const lights = c.lights || (h < 14 ? "troffer" : "pendant");
      if (lights === "troffer") {
        for (let u = -w / 2 + 4; u < w / 2 - 2; u += 8) for (let v = -d / 2 + 4; v < d / 2 - 2; v += 8) { const m = new THREE.Mesh(K.boxG, lampM); m.scale.set(2, 0.05, 4); m.position.set(u, h - 0.03, -v); g.add(m); }
      } else if (lights === "strip") {
        for (let u = -w / 2 + 5; u < w / 2 - 2; u += 10) for (let v = -d / 2 + 6; v < d / 2 - 4; v += 12) { const m = new THREE.Mesh(K.boxG, lampM); m.scale.set(0.4, 0.12, 8); m.position.set(u, h - 1.6, -v); g.add(m); }
      } else if (lights === "pendant") {
        const dg = sphereCap(); const drop = Math.min(3.4, Math.max(1.2, (h - 9) * 0.4));
        for (let u = -w / 2 + 5; u < w / 2 - 2; u += 10) for (let v = -d / 2 + 5; v < d / 2 - 2; v += 10) {
          const z = h - drop;
          pbox(g, u - 0.02, u + 0.02, v - 0.02, v + 0.02, z, h, "#2b2b2b");
          const dome = new THREE.Mesh(dg, mat("#f4f4f2", {emissive: new THREE.Color("#fff6e8"), emissiveIntensity: 0.6, roughness: 0.3, side: THREE.DoubleSide})); dome.position.set(u, z - 0.05, -v); g.add(dome);
          const lens = new THREE.Mesh(K.boxG, lampM); lens.scale.set(1.1, 0.04, 1.1); lens.position.set(u, z - 0.6, -v); g.add(lens);
        }
      }
      // skylights and fans: spread evenly along the long axis (the survey gives how many, not where)
      const along = w >= d, L = along ? w : d;
      for (let k = 0; k < (c.sky | 0); k++) { const t = -L / 2 + L * (k + 0.5) / c.sky, [u, v] = along ? [t, d * 0.12] : [w * 0.12, t]; const m = new THREE.Mesh(K.boxG, skyM); m.scale.set(4, 0.05, 8); m.position.set(u, h + 0.02, -v); g.add(m); }
      for (let k = 0; k < (c.fans | 0); k++) { const t = -L / 2 + L * (k + 0.5) / c.fans, [u, v] = along ? [t, -d * 0.18] : [-w * 0.18, t]; fan(g, u, v, h); }
      // fascia: the vertical face from a drop ceiling up to the higher ceiling next to it
      if (c.fasciaTo > h) {
        const z0 = h, z1 = c.fasciaTo, col = "#e4e2dc", at = (u, v) => toWorld(c, u, v);
        if (c.fasciaN) slab(layout, cg, ...at(-w / 2, d / 2), ...at(w / 2, d / 2), 0.3, z0, z1, col);
        if (c.fasciaS) slab(layout, cg, ...at(-w / 2, -d / 2), ...at(w / 2, -d / 2), 0.3, z0, z1, col);
        if (c.fasciaE) slab(layout, cg, ...at(w / 2, -d / 2), ...at(w / 2, d / 2), 0.3, z0, z1, col);
        if (c.fasciaW) slab(layout, cg, ...at(-w / 2, -d / 2), ...at(-w / 2, d / 2), 0.3, z0, z1, col);
      }
    }
    closeCeilingSteps(layout, list, cg);
  }
  let CAP = null;
  function sphereCap() { if (!CAP) { CAP = new THREE.SphereGeometry(0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42); K.extraGeo.push(CAP); } return CAP; }
  function fan(g, u, v, h) {
    const z = h - 2.2;
    pbox(g, u - 0.04, u + 0.04, v - 0.04, v + 0.04, z, h, "#3a3a3a");
    pbox(g, u - 0.35, u + 0.35, v - 0.35, v + 0.35, z - 0.35, z, "#2b2b2b");
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5, bl = new THREE.Mesh(K.boxG, mat("#6b4a2c"));
      bl.scale.set(2.2, 0.05, 0.5); bl.position.set(u + Math.cos(a) * 1.35, z - 0.2, -v - Math.sin(a) * 1.35); bl.rotation.y = a; g.add(bl);
    }
  }
  // Where two ceilings of different heights meet and nothing else closes the step, drop a band from the
  // higher to the lower one; then put a roof over the whole building so no sky shows through any gap.
  function closeCeilingSteps(layout, list, cg) {
    const edges = f => ({x0: f.x - f.w / 2, x1: f.x + f.w / 2, y0: f.y - f.d / 2, y1: f.y + f.d / 2});
    const near = (a, b) => Math.abs(a - b) < 0.05;
    const flat = list.filter(f => !(f.rot % 180));
    for (const a of flat) {
      const A = edges(a), col = a.style === "deck" ? "#7b8086" : "#e4e2dc";
      for (const b of flat) {
        if (a.h <= b.h) continue; // a is the higher one
        const B = edges(b), lo = b.h, hi = a.h;
        if (near(A.x1, B.x0) || near(A.x0, B.x1)) { const ex = near(A.x1, B.x0) ? A.x1 : A.x0, y0 = Math.max(A.y0, B.y0), y1 = Math.min(A.y1, B.y1); if (y1 - y0 > 0.1) slab(layout, cg, ex, y0, ex, y1, 0.3, lo, hi, col); }
        if (near(A.y1, B.y0) || near(A.y0, B.y1)) { const ey = near(A.y1, B.y0) ? A.y1 : A.y0, x0 = Math.max(A.x0, B.x0), x1 = Math.min(A.x1, B.x1); if (x1 - x0 > 0.1) slab(layout, cg, x0, ey, x1, ey, 0.3, lo, hi, col); }
      }
    }
    const {L, W} = layout.building, top = Math.max(...list.map(f => f.h), 12);
    box(cg, L + 2, 0.3, W + 2, L / 2, top + 0.45, -W / 2, "#b9bcbc");
  }

  /* ---------- batching: hundreds of boxes -> a few dozen instanced draws ---------- */
  function batch(root, prods, cans) {
    root.updateMatrixWorld(true);
    const buckets = new Map(), loose = [];
    root.traverse(o => { if (o.isMesh && !o.isInstancedMesh) loose.push(o); });
    for (const o of loose) {
      if (o.geometry === K.boxG && !o.material.transparent && !o.material.map && o.material.type === "MeshStandardMaterial") {
        if (!buckets.has(o.material)) buckets.set(o.material, []);
        buckets.get(o.material).push(o.matrixWorld.clone()); o.parent.remove(o);
      } else { o.castShadow = !o.material.transparent && !o.material.map && o.material.type !== "MeshBasicMaterial"; o.receiveShadow = true; }
    }
    // small pieces get softly rounded edges; long ones (walls, shelf backs) stay plain boxes: at that size the
    // rounding can't be seen, and their long sliver triangles let specks of what's behind show through
    const sc = new THREE.Vector3();
    const roundedOf = m => {
      let r = K.mats.get("round:" + m.uuid);
      if (!r) { r = roundify(m.clone(), 0.07); K.mats.set("round:" + m.uuid, r); }
      return r;
    };
    const addInst = (geo, m, list) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((mx, i) => im.setMatrixAt(i, mx)); im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = true; root.add(im); };
    for (const [m, list] of buckets) {
      const big = [], small = []; for (const mx of list) (Math.max(...sc.setFromMatrixScale(mx).toArray()) > 10 ? big : small).push(mx);
      addInst(K.boxG, m, big);
      if (small.length) addInst(K.rboxG, roundedOf(m), small); // a rounded copy: the plain material stays plain for the big boxes
    }
    // instanced products (packaging reads slightly glossy)
    for (const [list, isBox] of [[prods, true], [cans, false]]) {
      if (!list.length) continue;
      let ig = K.cylG, pm;
      if (isBox) {
        ig = K.rboxS.clone(); K.extraGeo.push(ig);
        const cellA = new Float32Array(list.length);
        list.forEach((p, i) => { const cs = ATLAS.cells[p.br] || ATLAS.cells.boxes, e = p.m.elements; const hsh = Math.abs(Math.sin(e[12] * 12.9898 + e[13] * 4.1414 + e[14] * 78.233) * 43758.5453) % 1; const k = cs[Math.floor(hsh * cs.length)]; cellA[i] = k; p.c = ATLAS.avg[k]; });
        ig.setAttribute("aCell", new THREE.InstancedBufferAttribute(cellA, 1)); pm = prodMat();
      } else { pm = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.4, metalness: 0.25}); K.mats.set("cans:" + root.name, pm); }
      const im = new THREE.InstancedMesh(ig, pm, list.length), c = new THREE.Color();
      list.forEach((p, i) => { im.setMatrixAt(i, p.m); c.set(p.c).convertSRGBToLinear(); im.setColorAt(i, c); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; root.add(im);
    }
  }
  function roundify(m, rd, frac = 0.22) {
    if (m.userData.rounded) return m; m.userData.rounded = true; m.flatShading = true; m.needsUpdate = true;
    m.onBeforeCompile = sh => {
      sh.uniforms.uRound = {value: rd}; sh.uniforms.uFrac = {value: frac};
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\n#ifdef USE_INSTANCING\nattribute vec3 corner; attribute vec3 rdir; uniform float uRound; uniform float uFrac;\n#endif")
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n#ifdef USE_INSTANCING\nobjectNormal = rdir;\n#endif")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef USE_INSTANCING\n{ vec3 sc=max(vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz)),vec3(1e-4)); float r=min(uRound,uFrac*min(sc.x,min(sc.y,sc.z))); transformed=corner*(0.5-r/sc)+rdir*(r/sc); }\n#endif");
    };
    m.customProgramCacheKey = () => "round" + rd + "_" + frac; return m;
  }

  /* ---------- the whole store ---------- */
  function build(layout) {
    const groups = {floors: new THREE.Group(), structure: new THREE.Group(), fixtures: new THREE.Group(), ceiling: new THREE.Group()};
    for (const [k, g] of Object.entries(groups)) g.name = k;
    const stock = {structure: {prods: [], cans: []}, fixtures: {prods: [], cans: []}, floors: {prods: [], cans: []}};
    const q = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0);
    for (const it of layout.items) {
      if (it.type === "ceiling" || it.type === "area") continue;
      const key = it.type === "floor" ? "floors" : isStructure(it) ? "structure" : "fixtures";
      // on a raised floor (Tom's desk on the laser deck, the cedar desk on the 1-step floor) the item starts on top of it
      const g = new THREE.Group(); g.position.set(it.x, baseOf(layout, it), -it.y); g.rotation.y = rad(it.rot || 0); g.userData.itemId = it.id; groups[key].add(g);
      const rnd = rng(hashStr(it.id + (it.brand || "") + (it.brand2 || "") + it.w.toFixed(1)));
      const itemM = new THREE.Matrix4().compose(g.position, q.setFromAxisAngle(yAx, g.rotation.y), new THREE.Vector3(1, 1, 1));
      let lastBr = null;
      const P = (u, z, v, sx, sz, sv, color, can) => {
        const br = lastBr || (color === "#a07850" ? "cardboard" : "boxes"); lastBr = null;
        (can ? stock[key].cans : stock[key].prods).push({br, m: new THREE.Matrix4().multiplyMatrices(itemM, new THREE.Matrix4().compose(new THREE.Vector3(u, z, -v), new THREE.Quaternion(), new THREE.Vector3(sx, sz, sv))), c: color});
      };
      const pick = b => { lastBr = PAL[b] ? b : "boxes"; const p = PAL[b] || PAL.boxes; return p[Math.floor(rnd() * p.length)]; };
      buildItem(it, layout, g, P, pick, rnd);
    }
    for (const k of ["floors", "structure", "fixtures"]) batch(groups[k], stock[k].prods, stock[k].cans);
    buildCeilings(layout, groups.ceiling);
    groups.ceiling.updateMatrixWorld(true);
    groups.ceiling.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return groups;
  }
  return {
    build,
    dispose() {
      for (const m of K.mats.values()) m.dispose();
      for (const t of K.tex.values()) t.dispose();
      for (const t of K.extraTex) t.dispose();
      for (const g of K.extraGeo) g.dispose();
      for (const g of [K.boxG, K.cylG, K.rboxG, K.rboxS]) g.dispose();
      if (PROD) PROD.dispose();
      K.mats.clear(); K.tex.clear(); K.extraTex.length = 0; K.extraGeo.length = 0;
    },
  };
}

// unit box whose vertices carry a corner + direction, so the shader can round its edges
function roundedUnit(THREE, ws, hs) {
  const sp = new THREE.SphereGeometry(1, ws, hs), A = sp.attributes.position, n = A.count;
  const c = new Float32Array(n * 3), d = new Float32Array(n * 3), p = new Float32Array(n * 3), sg = v => Math.abs(v) < 1e-5 ? 0 : Math.sign(v);
  for (let i = 0; i < n; i++) { const x = A.getX(i), y = A.getY(i), z = A.getZ(i), cx = sg(x), cy = sg(y), cz = sg(z); c.set([cx, cy, cz], i * 3); d.set([x, y, z], i * 3); p.set([cx * 0.5, cy * 0.5, cz * 0.5], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("normal", new THREE.BufferAttribute(d, 3));
  g.setAttribute("corner", new THREE.BufferAttribute(c, 3)); g.setAttribute("rdir", new THREE.BufferAttribute(d, 3)); g.setIndex(sp.index); g.computeBoundingSphere();
  sp.dispose(); return g;
}
