// Editing: picking things up, carrying, snapping, resizing, rotating, adding and deleting.
// Every change goes through state (one undo step per gesture) and is re-checked by the advisor.
import { bbox, corners, clip, polyArea, edgeSnap, toWorld, toLocal, rad, isAxisAligned } from "./geometry.js";
import { buildContext, fitToZone, snapLines, nice } from "./analysis.js";

export const STRUCT_TYPES = new Set(["wall", "door", "opening", "arch", "column", "stairs"]);

export const FIXTURE_TEMPLATES = [
  { type: "gondola", label: "Gondola", name: "New gondola 12'", w: 12, d: 3, h: 6, color: "#c9ccce" },
  { type: "wallunit", label: "Wall unit", name: "New wall unit 8'", w: 8, d: 1.8, h: 7, color: "#3a3f42" },
  { type: "rack", label: "Pallet rack", name: "New pallet rack", w: 16, d: 4, h: 14, color: "#1f5a47" },
  { type: "pallet", label: "Pallet", name: "Pallet", w: 4, d: 3.33, h: 3, color: "#c49a68" },
  { type: "table", label: "Table", name: "Demo table", w: 6, d: 2.5, h: 3.1, color: "#d9b98a" },
  { type: "counter", label: "Counter", name: "Counter", w: 8, d: 2.5, h: 3.5, color: "#8a5a34", top: "#d8d2c4" },
  { type: "display", label: "Display", name: "Display", w: 4, d: 4, h: 5, color: "#9a6a3c" },
  { type: "tower", label: "Tower", name: "Display tower", w: 1.5, d: 1.5, h: 7, color: "#59b52a" },
  { type: "platform", label: "Platform", name: "Display platform", w: 8, d: 6, h: 0.35, color: "#1b2f7a" },
];

export const STRUCTURE_TEMPLATES = [
  { type: "wall", label: "Wall", name: "New wall", w: 10, d: 0.5, h: 12, color: "#e2dccf", fixed: true },
  { type: "door", label: "Door", name: "Door", w: 3, d: 0.7, h: 7, color: "#f2f2ee", solid: true, fixed: true },
  { type: "opening", label: "Opening", name: "Opening", w: 6, d: 0.7, h: 8, color: "#3b2616", fixed: true },
  { type: "column", label: "Column", name: "Column", w: 1.2, d: 1.2, h: 12, color: "#f1f1ee", fixed: true },
  { type: "counter", label: "Desk", name: "New desk", w: 8, d: 3, h: 3.6, color: "#8a5a34", top: "#1a1a1c", fixed: true },
  { type: "stairs", label: "Stairs", name: "Stairs", w: 12, d: 4, h: 9.5, color: "#8a5a34", fixed: true },
];

const r2 = (v) => Math.round(v * 100) / 100;
const normRot = (v) => Math.round((((v % 360) + 360) % 360) * 100) / 100;

export function newId(prefix) {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return prefix + Date.now().toString(36) + [...b].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

export function isStructure(it) {
  return Boolean(it && (it.fixed || STRUCT_TYPES.has(it.type)));
}

export function areaFromCatalog(c, x, y, w, d, rot = 0, groups) {
  return {
    id: newId("a"),
    key: c.key,
    name: c.name,
    x: r2(x),
    y: r2(y),
    w,
    d,
    rot,
    color: c.color,
    status: "proposed",
    confidence: c.confidence,
    source: c.source,
    note: c.note || "",
    entry: c.entry,
    placement: c.placement,
    adjacency: [...c.adjacency],
    subcats: [...c.subcats],
    groups: (groups || c.groups || []).map((g) => ({ label: g.label, share: g.share })),
  };
}

/** Grid snap that keeps the block's edges on a half-foot grid. */
function gridSnap(v, size, step) {
  return Math.round((v - size / 2) / step) * step + size / 2;
}

export function createEditor(app) {
  const ui = app.ui;
  let followTimer = 0;

  const data = () => app.state.data;
  const objOf = (kind, id) => (kind === "area" ? data().areas.find((a) => a.id === id) : data().items.find((i) => i.id === id));
  const catName = (a) => (app.catalog.byKey[a.key] || {}).name || a.key;
  const nameOf = (kind, o) => (kind === "area" ? o.name || catName(o) : nice(o.name) || o.type);

  /** Can this object be moved right now? Returns a reason when not. */
  function canMove(kind, o) {
    if (!o) return { ok: false, reason: "" };
    if (!app.state.build || !app.state.build.canEdit) return { ok: false, reason: "This build is read-only." };
    if (kind === "area") {
      if (ui.mode !== "areas") return { ok: false, reason: "Switch to Area planning to move department blocks." };
      return { ok: true };
    }
    if (ui.mode !== "current") return { ok: false, reason: "Switch to Current layout to move fixtures and walls." };
    if (o.type === "floor" || o.type === "zone") return { ok: false, reason: "Floors stay put." };
    if (isStructure(o) && !ui.structureUnlocked) return { ok: false, reason: "Walls, doors and desks are locked. Unlock structure in the Structure tab first." };
    if (o.locked) return { ok: false, reason: `${nice(o.name) || "This"} is locked in place. Unlock it in the details panel.` };
    return { ok: true };
  }

  function snapThreshold() {
    return Math.max(0.4, Math.min(2.2, 12 * app.scene.ftPerPx()));
  }

  function linesFor(kind, id) {
    if (kind === "area") return snapLines(buildContext(data().items), data().areas, id);
    const xs = [], ys = [];
    for (const it of data().items) {
      if (it.id === id || it.type === "zone") continue;
      const b = bbox(it);
      xs.push(b[0], b[2]);
      ys.push(b[1], b[3]);
    }
    return { xs, ys };
  }

  /** Red overlap patches for a block being dragged: walls, desks, door clearances, stairs, other blocks. */
  function overlapsFor(block, ctx) {
    const polys = [];
    const pa = corners(block);
    const bb = bbox(block);
    const test = (r, min) => {
      const ob = bbox(r);
      if (bb[2] <= ob[0] || ob[2] <= bb[0] || bb[3] <= ob[1] || ob[3] <= bb[1]) return;
      const p = clip(pa, corners(r));
      if (p.length >= 3 && Math.abs(polyArea(p)) > min) polys.push(p);
    };
    for (const e of ctx.walls) test(e.it, 0.05);
    for (const e of ctx.desks) test(e.it, 0.5);
    for (const e of ctx.clear) test(e.it, 0.5);
    for (const e of ctx.stairs) test(e.it, 0.5);
    for (const a of data().areas) if (a.id !== block.id) test(a, 1);
    return polys;
  }

  function followWith(o, kind) {
    const now = performance.now();
    if (now - followTimer < 450) return;
    followTimer = now;
    const j = app.scene.jerry.state;
    let tx = o.x, ty = o.y;
    if (kind === "item") {
      const dx = j.x - o.x, dy = j.y - o.y, len = Math.hypot(dx, dy) || 1;
      const off = Math.max(o.w, o.d) / 2 + 2;
      tx = o.x + (dx / len) * off;
      ty = o.y + (dy / len) * off;
    }
    app.walkTo(tx, ty, { quiet: true });
  }

  function startCarry(pick, pt, how = "pointer") {
    const o = objOf(pick.kind, pick.id);
    const ok = canMove(pick.kind, o);
    if (!ok.ok) {
      if (ok.reason) app.toast(ok.reason, "warn");
      app.select({ kind: pick.kind, id: pick.id });
      return false;
    }
    if (!app.state.begin()) return false;
    const base = how === "jerry" ? [app.scene.jerry.state.x, app.scene.jerry.state.y] : pt || [o.x, o.y];
    ui.carry = {
      kind: pick.kind,
      id: pick.id,
      how,
      off: [o.x - base[0], o.y - base[1]],
      lines: linesFor(pick.kind, pick.id),
      ctx: pick.kind === "area" ? buildContext(data().items) : null,
      moved: false,
    };
    app.select({ kind: pick.kind, id: pick.id }, { keepCarry: true });
    app.scene.setCarried(pick.kind === "item" ? pick.id : null);
    app.scene.jerry.setCarrying(true);
    if (how === "jerry" && pick.kind === "item") app.rebuildNav(pick.id);
    if (how !== "jerry") followWith(o, pick.kind);
    app.hud.carryHint(true, how);
    return true;
  }

  function moveCarry(pt, mods = {}) {
    const c = ui.carry;
    if (!c || !pt) return;
    const o = objOf(c.kind, c.id);
    if (!o) return;
    let x = pt[0] + c.off[0], y = pt[1] + c.off[1];
    let guides = { x: null, y: null };
    if (!mods.free) {
      const s = edgeSnap({ ...o, x, y }, c.lines, snapThreshold());
      guides = s.guides;
      const step = c.kind === "area" ? 0.5 : 0.25;
      const [bx0, by0, bx1, by1] = bbox({ ...o, x: 0, y: 0 });
      x = s.guides.x !== null ? s.x : isAxisAligned(o) ? gridSnap(x, bx1 - bx0, step) : Math.round(x / step) * step;
      y = s.guides.y !== null ? s.y : isAxisAligned(o) ? gridSnap(y, by1 - by0, step) : Math.round(y / step) * step;
    }
    c.moved = true;
    app.state.live(() => {
      o.x = r2(x);
      o.y = r2(y);
    });
    app.scene.moveObject(c.kind, o);
    app.scene.setGuides(guides);
    if (c.kind === "area") app.scene.setOverlaps(overlapsFor(o, c.ctx));
    if (c.how !== "jerry") followWith(o, c.kind);
    app.onLiveMove(c.kind, o);
  }

  function finishCarry() {
    ui.carry = null;
    app.scene.setCarried(null);
    app.scene.setGuides(null);
    app.scene.setOverlaps(null);
    app.scene.jerry.setCarrying(false);
    app.hud.carryHint(false);
  }

  function dropCarry() {
    const c = ui.carry;
    if (!c) return;
    const o = objOf(c.kind, c.id);
    if (o && c.kind === "area") {
      const fit = fitToZone(o, c.ctx);
      if (fit.x !== o.x || fit.y !== o.y)
        app.state.live(() => {
          o.x = r2(fit.x);
          o.y = r2(fit.y);
        });
    }
    finishCarry();
    const changed = app.state.end(o ? `Move ${nameOf(c.kind, o)}` : "Move");
    if (c.how === "jerry" && c.kind === "item") app.rebuildNav();
    if (changed && o) app.afterPlace(c.kind, o);
  }

  function cancelCarry() {
    if (!ui.carry) return;
    const c = ui.carry;
    finishCarry();
    app.state.cancel();
    if (c.how === "jerry" && c.kind === "item") app.rebuildNav();
  }

  // ----- handles -----

  function startHandle(pick) {
    const sel = ui.selection;
    if (!sel) return false;
    const o = objOf(sel.kind, sel.id);
    const ok = canMove(sel.kind, o);
    if (!ok.ok) {
      if (ok.reason) app.toast(ok.reason, "warn");
      return false;
    }
    if (!app.state.begin()) return false;
    const anchor = toWorld(o, (-pick.hx * o.w) / 2, (-pick.hy * o.d) / 2);
    ui.handle = { kind: sel.kind, id: sel.id, handle: pick.handle, hx: pick.hx, hy: pick.hy, anchor, rot: o.rot || 0, w: o.w, d: o.d };
    return true;
  }

  function moveHandle(pt, mods = {}) {
    const hd = ui.handle;
    if (!hd || !pt) return;
    const o = objOf(hd.kind, hd.id);
    if (!o) return;
    if (hd.handle === "rot") {
      let deg = (Math.atan2(pt[1] - o.y, pt[0] - o.x) * 180) / Math.PI - 90;
      const step = mods.fine ? 1 : mods.coarse ? 15 : 5;
      deg = Math.round(deg / step) * step;
      for (const q of [0, 90, 180, 270, 360]) if (Math.abs(normRot(deg) - q) < 3 && step < 15) deg = q;
      app.state.live(() => {
        o.rot = normRot(deg);
      });
    } else {
      const min = hd.kind === "area" ? 2 : 0.25;
      const step = mods.fine ? 0.1 : hd.kind === "area" ? 0.5 : 0.25;
      const r = rad(hd.rot);
      const vx = pt[0] - hd.anchor[0], vy = pt[1] - hd.anchor[1];
      const lx = vx * Math.cos(-r) - vy * Math.sin(-r), ly = vx * Math.sin(-r) + vy * Math.cos(-r);
      let w = hd.hx ? Math.max(min, Math.round((hd.hx * lx) / step) * step) : hd.w;
      let d = hd.hy ? Math.max(min, Math.round((hd.hy * ly) / step) * step) : hd.d;
      if (mods.keepRatio && hd.hx && hd.hy) {
        const f = Math.max(w / hd.w, d / hd.d);
        w = Math.round((hd.w * f) / step) * step;
        d = Math.round((hd.d * f) / step) * step;
      }
      const cx = (hd.hx * w) / 2, cy = (hd.hy * d) / 2;
      const [x, y] = [hd.anchor[0] + cx * Math.cos(r) - cy * Math.sin(r), hd.anchor[1] + cx * Math.sin(r) + cy * Math.cos(r)];
      app.state.live(() => {
        o.w = r2(w);
        o.d = r2(d);
        o.x = r2(x);
        o.y = r2(y);
      });
    }
    app.scene.moveObject(hd.kind, o);
    app.onLiveMove(hd.kind, o, true);
  }

  function endHandle() {
    const hd = ui.handle;
    if (!hd) return;
    ui.handle = null;
    const o = objOf(hd.kind, hd.id);
    const changed = app.state.end(o ? `${hd.handle === "rot" ? "Rotate" : "Resize"} ${nameOf(hd.kind, o)}` : "Resize");
    if (changed && o) app.afterPlace(hd.kind, o);
  }

  // ----- one-shot edits -----

  function withSelected(fn, verb) {
    const sel = ui.selection;
    if (!sel) return false;
    const o = objOf(sel.kind, sel.id);
    const ok = canMove(sel.kind, o);
    if (!ok.ok) {
      if (ok.reason) app.toast(ok.reason, "warn");
      return false;
    }
    return app.state.change(`${verb} ${nameOf(sel.kind, o)}`, () => fn(o, sel.kind));
  }

  const editor = {
    canMove,
    objOf,
    nameOf,
    startCarry,
    moveCarry,
    dropCarry,
    cancelCarry,
    startHandle,
    moveHandle,
    endHandle,

    rotate(deg) {
      return withSelected((o) => (o.rot = normRot((o.rot || 0) + deg)), "Rotate");
    },
    nudge(dx, dy) {
      return withSelected((o) => {
        o.x = r2(o.x + dx);
        o.y = r2(o.y + dy);
      }, "Nudge");
    },
    remove() {
      const sel = ui.selection;
      if (!sel) return false;
      const o = objOf(sel.kind, sel.id);
      const ok = canMove(sel.kind, o);
      if (!ok.ok) {
        if (ok.reason) app.toast(ok.reason, "warn");
        return false;
      }
      const name = nameOf(sel.kind, o);
      const done = app.state.change(`Delete ${name}`, (d) => {
        if (sel.kind === "area") d.areas = d.areas.filter((a) => a.id !== sel.id);
        else d.items = d.items.filter((i) => i.id !== sel.id);
      });
      if (done) {
        app.select(null);
        app.toast(`Deleted ${name}. Undo with Ctrl+Z.`);
      }
      return done;
    },
    duplicate() {
      const sel = ui.selection;
      if (!sel) return false;
      const o = objOf(sel.kind, sel.id);
      const ok = canMove(sel.kind, o);
      if (!ok.ok) {
        if (ok.reason) app.toast(ok.reason, "warn");
        return false;
      }
      const copy = JSON.parse(JSON.stringify(o));
      copy.id = newId(sel.kind === "area" ? "a" : "n");
      const [x0, y0, x1, y1] = bbox(o);
      copy.x = r2(o.x + (x1 - x0) + 1);
      if (sel.kind === "item") copy.name = `${o.name || "Fixture"} (copy)`.slice(0, 80);
      const ok2 = app.state.change(`Duplicate ${nameOf(sel.kind, o)}`, (d) => (sel.kind === "area" ? d.areas.push(copy) : d.items.push(copy)));
      if (ok2) app.select({ kind: sel.kind, id: copy.id });
      return ok2;
    },
    /** Set fields on the selected object from the inspector. */
    set(kind, id, patch, label) {
      const o = objOf(kind, id);
      if (!o) return false;
      return app.state.change(label || `Edit ${nameOf(kind, o)}`, () => {
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) delete o[k];
          else o[k] = v;
        }
      });
    },
    placeArea(key, x, y, opts = {}) {
      const c = app.catalog.byKey[key];
      if (!c) return null;
      if (!app.state.build.canEdit) {
        app.toast("This build is read-only.", "warn");
        return null;
      }
      const w = opts.w || c.size[0], d = opts.d || c.size[1];
      let block = areaFromCatalog(c, x, y, w, d, opts.rot || 0, opts.groups);
      if (opts.snap !== false) {
        const ctx = buildContext(data().items);
        const fit = fitToZone(block, ctx);
        block.x = r2(fit.x);
        block.y = r2(fit.y);
      }
      const ok = app.state.change(`Place ${c.name}`, (dd) => dd.areas.push(block));
      if (!ok) return null;
      app.select({ kind: "area", id: block.id });
      app.afterPlace("area", block, { placed: true });
      return block;
    },
    addItem(tpl, x, y) {
      if (!app.state.build.canEdit) {
        app.toast("This build is read-only.", "warn");
        return null;
      }
      const { label, ...base } = tpl;
      const it = { ...base, id: newId("n"), x: r2(x), y: r2(y), rot: 0 };
      const ok = app.state.change(`Add ${label.toLowerCase()}`, (d) => d.items.push(it));
      if (!ok) return null;
      app.select({ kind: "item", id: it.id });
      return it;
    },
  };
  return editor;
}

/** Plan point -> local coords of a block (exported for the inspector's numeric fields). */
export { toLocal };
