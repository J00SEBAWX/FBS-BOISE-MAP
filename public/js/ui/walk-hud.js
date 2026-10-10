/* The Walk view's heads-up display: where you are ("You are in FRONT ROOM, near the front door") and the
 * mini map (tap a spot to walk there). Screen readers hear zone changes and arrivals. */
import {inItem, toLocal} from "../core/geometry.js";
import {STRUCTURE_TYPES, displayName} from "../core/model.js";
import {drawPlan, drawWalker, readPlanTokens, s2w} from "../plan2d/plan.js";

const SKIP_NEAR = new Set(STRUCTURE_TYPES.filter(t => t !== "door" && t !== "arch" && t !== "opening"));

export function createWalkHud({layout, walk, getLayers, announce}) {
  // `layout` is swapped by setLayout when the open map changes (Phase 2)
  const mini = document.getElementById("mini"), mctx = mini.getContext("2d");
  const zoneEl = document.getElementById("locZone"), nearEl = document.getElementById("locNear");
  const {L, W} = layout.building;
  const MN = {cx: L / 2, cy: W / 2, s: 1, W: 0, H: 0, pr: 1, base: null, sig: ""};
  let tok = readPlanTokens(), lastZone = null, locT = 0;

  function locate() {
    const {x, y} = walk.ME;
    let zone = "The store";
    for (const it of layout.items) if (it.type === "floor" && inItem(it, x, y)) zone = it.name;
    let best = null, bd = 25;
    for (const it of layout.items) {
      if (SKIP_NEAR.has(it.type) || it.type === "area") continue;
      const [lx, ly] = toLocal(it, x, y), dd = Math.hypot(Math.max(0, Math.abs(lx) - it.w / 2), Math.max(0, Math.abs(ly) - it.d / 2));
      if (dd < bd) { bd = dd; best = it; }
    }
    return {zone: zone.replace(/\s+floor$/i, ""), near: best ? "near " + displayName(best) : ""};
  }
  function updateLocation(now = performance.now(), force) {
    if (!force && now - locT < 250) return;
    locT = now;
    const l = locate();
    if (zoneEl.textContent !== l.zone) zoneEl.textContent = l.zone;
    if (nearEl.textContent !== l.near) nearEl.textContent = l.near;
    if (l.zone !== lastZone) { if (lastZone !== null && !walk.ME.path.length) announce("You are in " + l.zone); lastZone = l.zone; }
  }
  function arrived() { const l = locate(); lastZone = l.zone; announce(`You are in ${l.zone}${l.near ? ", " + l.near : ""}.`); }

  function buildBase() {
    const r = mini.getBoundingClientRect(); if (!r.width || !r.height) return false;
    MN.pr = Math.min(window.devicePixelRatio || 1, 2); MN.W = r.width; MN.H = r.height;
    MN.s = Math.min((MN.W - 8) / (L + 2), (MN.H - 8) / (W + 2)); MN.cx = L / 2; MN.cy = W / 2;
    const pw = Math.round(r.width * MN.pr), ph = Math.round(r.height * MN.pr);
    if (mini.width !== pw || mini.height !== ph) { mini.width = pw; mini.height = ph; }
    const b = MN.base || document.createElement("canvas"); b.width = pw; b.height = ph;
    const c = b.getContext("2d"); c.setTransform(MN.pr, 0, 0, MN.pr, 0, 0);
    const layers = getLayers();
    drawPlan(c, MN, layout, tok, {mini: true, layers: {...layers, labels: false, scanLines: false}});
    MN.base = b; MN.sig = ""; return true;
  }
  function drawMini(force) {
    if (!MN.base && !buildBase()) return;
    const ME = walk.ME, sig = `${ME.x.toFixed(2)},${ME.y.toFixed(2)},${ME.yaw.toFixed(3)},${ME.path.length},${walk.CAM.halfH.toFixed(3)}`;
    if (!force && sig === MN.sig) return; MN.sig = sig;
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mini.width, mini.height); mctx.drawImage(MN.base, 0, 0);
    mctx.setTransform(MN.pr, 0, 0, MN.pr, 0, 0); drawWalker(mctx, MN, ME, walk.CAM.halfH, tok, true);
  }
  mini.addEventListener("pointerdown", e => {
    if (!MN.W) return; e.preventDefault();
    const r = mini.getBoundingClientRect();
    walk.walkTo(...s2w(MN, e.clientX - r.left, e.clientY - r.top));
  });
  return {
    frame(now) { updateLocation(now); drawMini(false); },
    refresh() { MN.base = null; tok = readPlanTokens(); drawMini(true); updateLocation(performance.now(), true); },
    invalidate() { MN.base = null; },
    setLayout(l) { layout = l; MN.base = null; lastZone = null; },
    arrived,
  };
}
