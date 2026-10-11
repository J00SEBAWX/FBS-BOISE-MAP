/* Editing gestures on the plan (docs/DESIGN.md 4.1, 4.3, 4.4): select (click / tap, Shift-click or "Select several"
 * to add, drag a marquee), drag to move with edge / wall / grid snapping, the 8 resize handles, the rotate
 * handle (15 degree steps, Shift = free), Edit shape for department blocks (drag corners, "+" on an edge adds a
 * corner), keyboard nudges, and the live readouts. Every change goes through core/doc.js and core/areas.js via
 * the session; a whole gesture is one undo step. Touch: a drag on a selected item moves it, anywhere else pans. */
import {snapRect, snapPoint, GRID} from "../core/snap.js";
import {clamp} from "../core/geometry.js";
import * as D from "../core/doc.js";
import * as A from "../core/areas.js";
import {readoutsFor} from "../core/readouts.js";
import {handleAt, drawHandles, polyHandleAt, drawPolyHandles, drawReadouts, drawGuides, drawMarquee, drawPlaceRect} from "./edit-draw.js";
import {formatFtIn, formatSqft} from "../core/units.js";

const GUIDE_MS = 600;
const CURSORS = {n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize", rotate: "grab"};

/**
 * createPlanEditor({plan, session, snapOn(), touch(), canEdit(), multiMode(), dimensionsOn(), toast(msg), onDblClick(item),
 *                   onGesture(kind | null),
 *                   placing() -> {key, name, colour} | null, onPlaced(key, {x, y, w?, d?})})
 * placing(): the department the person has picked to place (docs/DESIGN.md 5): while it is set, a press on the floor
 * draws the block (drag = its size, both with the mouse and a finger; a plain tap = its usual size at that spot) and
 * onPlaced gets the rectangle in store feet. Nothing is edited until the finger lifts, so there is no undo step to cancel.
 */
export function createPlanEditor(o) {
  const {plan, session} = o;
  let drag = null, shapeEdit = false, cornerSel = -1, readouts = null, guides = {list: [], t: 0}, guideTimer = 0, warned = false;
  const canEdit = () => !o.canEdit || o.canEdit();
  const movable = it => !!it && canEdit() && !session.isLocked(it);
  const tolFt = () => clamp(10 / plan.V.s, 0.2, 2);
  const grid = () => (o.snapOn() ? GRID : 0);

  /** Snap targets without the items being moved (so a block doesn't snap to itself). */
  function targetsWithout(ids) {
    const T = session.snapTargets, skip = new Set(ids);
    return {faces: T.faces.filter(f => !skip.has(f.id)), corners: T.corners.filter(c => !skip.has(c.id)), walls: T.walls};
  }
  function showGuides(list) {
    guides = {list: list || [], t: performance.now()};
    clearTimeout(guideTimer);
    if (guides.list.length) guideTimer = setTimeout(() => plan.draw(), GUIDE_MS + 20);
  }
  function fail(r) {
    if (r && r.error && !warned) { warned = true; if (o.toast) o.toast(r.error); }
    return !!(r && r.error);
  }
  const primary = () => (drag && drag.ids ? session.layout.byId.get(drag.ids[0]) : null);
  function setReadouts(it, extra) { readouts = it ? readoutsFor(it, session.snapTargets, extra) : null; }

  /* ---------- gestures ---------- */
  function startGesture(kind, label, extra) {
    warned = false;
    session.begin(label);
    drag = {kind, label, ...extra};
    if (o.onGesture) o.onGesture(kind);
  }
  function endGesture() {
    const d = drag; drag = null; readouts = null;
    session.end();
    if (o.onGesture) o.onGesture(null);
    plan.draw();
    return d;
  }

  /** The point a drawn corner lands on: the 6-inch grid while Snap is on (Alt = free). */
  function drawPoint(wx, wy, e) {
    const g = e && e.altKey ? 0 : grid();
    return g ? {x: Math.round(wx / g) * g, y: Math.round(wy / g) * g} : {x: wx, y: wy};
  }
  /** The rectangle being drawn, in store feet: {x, y (centre), w, d}. */
  function drawnRect(d) {
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    return {x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2, w, d: h};
  }

  function down({e, wx, wy, sx, sy, touch}) {
    // placing a department: the press starts the block, finger or mouse alike (two fingers still pinch, see cancelGesture)
    const P = o.placing ? o.placing() : null;
    if (P && canEdit()) {
      const p = drawPoint(wx, wy, e);
      drag = {kind: "draw", key: P.key, colour: P.colour, name: P.name, x0: p.x, y0: p.y, x1: p.x, y1: p.y, moved: false};
      if (o.onGesture) o.onGesture("draw");
      plan.draw();
      return true;
    }
    const single = session.single;
    // Edit shape: corners and edge midpoints of the one selected polygon block
    if (shapeEdit && single && single.type === "area" && movable(single)) {
      const ph = polyHandleAt(plan.V, single, sx, sy, touch);
      if (ph) {
        if (ph.mid !== undefined) {
          const r = session.apply(A.insertPolyPoint(session.doc, single.id, ph.mid, wx, wy), {label: "Add corner"});
          if (fail(r)) return true;
          cornerSel = r.index;
        } else cornerSel = ph.corner;
        startGesture("corner", "Move corner", {id: single.id, index: cornerSel, ids: [single.id]});
        plan.draw();
        return true;
      }
    }
    // resize / rotate handles of the one selected item
    if (single && movable(single) && !shapeEdit) {
      const h = handleAt(plan.V, single, sx, sy, touch);
      if (h === "rotate") { startGesture("rotate", "Rotate", {id: single.id, ids: [single.id]}); setReadouts(single, {rotating: true}); plan.draw(); return true; }
      if (h) { startGesture("resize", "Resize", {id: single.id, h, ids: [single.id]}); setReadouts(single); plan.draw(); return true; }
    }
    const top = plan.hitItem(wx, wy);
    const multi = (e && e.shiftKey) || (o.multiMode && o.multiMode());
    if (top && multi) { session.select(top.id, {toggle: true}); return true; } // a click, never a drag
    // Something that is already selected and can move wins the press over what lies on top of it: a department block under a
    // fixture is grabbed by pressing it, not the fixture above. A plain click (no drag) still picks the topmost item (see up()).
    const grabbed = canEdit() ? session.selected().find(x => !session.isLocked(x) && plan.contains(x, wx, wy)) || null : null;
    const it = grabbed || top;
    if (it) {
      if (touch && !session.isSelected(it.id)) return false; // touch: a tap selects, a drag on something unselected pans
      if (!session.isSelected(it.id)) session.select(it.id);
      if (!canEdit()) return false;
      const ids = session.selected().filter(x => !session.isLocked(x)).map(x => x.id);
      if (!ids.length) return false; // locked: selected, but a drag pans
      if (shapeEdit && !(single && it.id === single.id)) setShapeEdit(false);
      const starts = new Map(ids.map(id => { const s = session.item(id); return [id, {x: s.x, y: s.y}]; }));
      startGesture("move", ids.length > 1 ? "Move items" : "Move", {ids, wx0: wx, wy0: wy, starts, clicked: (top || it).id});
      return true;
    }
    if (touch) return false; // empty floor on touch: pan (a tap clears the selection in click())
    drag = {kind: "marquee", sx, sy, x1: sx, y1: sy, add: !!(e && e.shiftKey)};
    return true;
  }

  function move({e, wx, wy, sx, sy}) {
    if (!drag) return;
    const alt = !!(e && e.altKey), shift = !!(e && e.shiftKey);
    if (drag.kind === "marquee") { drag.x1 = sx; drag.y1 = sy; drag.moved = true; plan.draw(); return; }
    if (drag.kind === "draw") { const p = drawPoint(wx, wy, e); drag.x1 = p.x; drag.y1 = p.y; drag.moved = true; plan.draw(); return; }
    if (drag.kind === "move") {
      let dx = wx - drag.wx0, dy = wy - drag.wy0;
      const first = session.item(drag.ids[0]);
      if (first && o.snapOn() && !alt) {
        const s0 = drag.starts.get(first.id);
        const rect = {id: first.id, x: s0.x + dx, y: s0.y + dy, w: first.w, d: first.d, rot: first.rot || 0};
        const r = snapRect(rect, targetsWithout(drag.ids), {grid: GRID, tol: tolFt()});
        dx += r.x - rect.x; dy += r.y - rect.y;
        showGuides(r.guides);
      } else showGuides([]);
      const places = drag.ids.map(id => { const s = drag.starts.get(id); return {id, x: s.x + dx, y: s.y + dy}; });
      if (fail(session.apply(D.placeItems(session.doc, places, session.editOpts)))) return;
      setReadouts(primary());
      return;
    }
    if (drag.kind === "resize" || drag.kind === "corner") {
      let p = {x: wx, y: wy};
      if (o.snapOn() && !alt) { const s = snapPoint(p, targetsWithout(drag.ids), {tol: tolFt(), grid: GRID}); p = {x: s.x, y: s.y}; showGuides(s.guides); } else showGuides([]);
      const it = session.item(drag.id);
      if (!it) return;
      let r;
      if (drag.kind === "corner") r = A.movePolyPoint(session.doc, drag.id, drag.index, p.x, p.y);
      else if (it.type === "area") r = A.resizeBlock(session.doc, drag.id, drag.h, p.x, p.y, {...session.editOpts, min: 0.5});
      else r = D.resizeItem(session.doc, drag.id, drag.h, p.x, p.y, {...session.editOpts, min: 0.25, keepAspect: shift && drag.h.length === 2});
      if (r.error) { if (drag.kind !== "corner") fail(r); return; } // a crossing corner is just not accepted
      session.apply(r);
      setReadouts(primary());
      return;
    }
    if (drag.kind === "rotate") {
      const r = D.rotateToPoint(session.doc, drag.id, wx, wy, {...session.editOpts, free: shift});
      if (r.error) return;
      session.apply(r);
      setReadouts(primary(), {rotating: true});
    }
  }

  function up({e, wx, wy, moved, cancelled}) {
    if (!drag) return;
    if (drag.kind === "draw") {
      const d = drag; drag = null;
      if (o.onGesture) o.onGesture(null);
      plan.draw();
      if (cancelled) return;
      const r = drawnRect(d);
      // a real rectangle keeps the drawn size; a tap (or a scribble smaller than the minimum) drops the usual size at the press
      if (d.moved && r.w >= A.MIN_DRAWN && r.d >= A.MIN_DRAWN) o.onPlaced(d.key, r);
      else o.onPlaced(d.key, {x: d.x0, y: d.y0});
      return;
    }
    if (drag.kind === "marquee") {
      const d = drag; drag = null;
      if (cancelled) { plan.draw(); return; }
      if (d.moved) {
        const [x0, y0] = plan.toWorld(d.sx, d.sy), [x1, y1] = plan.toWorld(d.x1, d.y1);
        session.select(plan.itemsIn(x0, y0, x1, y1).map(it => it.id), {add: d.add});
      } else if (!d.add) session.clearSelection();
      plan.draw();
      return;
    }
    if (cancelled) { cancelGesture(); return; }
    const d = endGesture();
    // a plain click (no drag) picks the topmost item under it: one inside a group, or the fixture on top of a selected block
    if (d.kind === "move" && !moved && e && !e.shiftKey && !(session.selection.length === 1 && session.selection[0] === d.clicked)) session.select(d.clicked);
    showGuides([]);
  }

  /** Esc or a second finger: undo the gesture in progress. */
  function cancelGesture() {
    if (!drag) return;
    if (drag.kind !== "marquee" && drag.kind !== "draw") session.cancel();
    drag = null; readouts = null; showGuides([]);
    if (o.onGesture) o.onGesture(null);
    plan.draw();
  }

  /** A tap or plain click that was not a drag (touch always lands here; the mouse when the pan didn't move). */
  function click({e, item, touch}) {
    const multi = (e && e.shiftKey) || (o.multiMode && o.multiMode());
    if (item) { if (multi) session.select(item.id, {toggle: true}); else session.select(item.id); }
    else if (!multi || !touch) session.clearSelection();
  }
  function dblclick({item}) { if (item) { session.select(item.id); if (o.onDblClick) o.onDblClick(item); } }

  /* ---------- keyboard edits ---------- */
  function nudge(dx, dy) {
    const ids = session.selected().filter(it => movable(it)).map(it => it.id);
    if (!ids.length) return false;
    const r = session.apply(D.moveItems(session.doc, ids, dx, dy, session.editOpts), {label: "Nudge", mergeKey: "nudge:" + ids.join(",")});
    return !fail(r);
  }
  function rotateBy(deg) {
    const ids = session.selected().filter(it => movable(it)).map(it => it.id);
    if (!ids.length) return false;
    return !fail(session.apply(D.rotateItemsBy(session.doc, ids, deg, session.editOpts), {label: "Rotate"}));
  }
  function setShapeEdit(on) {
    const single = session.single;
    if (on && (!single || single.type !== "area" || !movable(single))) on = false;
    if (on && single.shape !== "poly") { if (fail(session.apply(A.toPolygon(session.doc, single.id), {label: "Edit shape"}))) on = false; }
    shapeEdit = !!on; cornerSel = -1;
    plan.draw();
    return shapeEdit;
  }
  function removeCorner() {
    const single = session.single;
    if (!shapeEdit || !single || cornerSel < 0) return false;
    const ok = !fail(session.apply(A.removePolyPoint(session.doc, single.id, cornerSel), {label: "Remove corner"}));
    cornerSel = -1; plan.draw();
    return ok;
  }

  /* ---------- drawing ---------- */
  function draw(ctx, V, tok) {
    const t = !!(o.touch && o.touch()), single = session.single;
    if (drag && drag.kind === "marquee") drawMarquee(ctx, {x0: drag.sx, y0: drag.sy, x1: drag.x1, y1: drag.y1}, tok);
    if (drag && drag.kind === "draw" && drag.moved) {
      const r = drawnRect(drag);
      const text = r.w >= A.MIN_DRAWN && r.d >= A.MIN_DRAWN ? `${formatFtIn(r.w)} × ${formatFtIn(r.d)} · ${formatSqft(r.w * r.d)}` : "Keep dragging";
      drawPlaceRect(ctx, V, {x0: drag.x0, y0: drag.y0, x1: drag.x1, y1: drag.y1}, drag.colour, text, tok);
    }
    if (single && movable(single)) {
      if (shapeEdit && single.type === "area" && single.shape === "poly") drawPolyHandles(ctx, V, single, tok, t, cornerSel);
      else if (!shapeEdit) drawHandles(ctx, V, single, tok, t);
    }
    const live = drag && drag.kind !== "marquee" ? primary() : null;
    if (live && readouts) drawReadouts(ctx, V, live, readouts, tok, t);
    else if (single && o.dimensionsOn && o.dimensionsOn()) drawReadouts(ctx, V, single, readoutsFor(single, session.snapTargets), tok, t);
    if (guides.list.length && performance.now() - guides.t < GUIDE_MS) drawGuides(ctx, V, guides.list, tok);
  }
  /** The mouse cursor to show over a screen point ("" = whatever the plan decides). */
  function cursorAt(sx, sy) {
    if (o.placing && o.placing() && canEdit()) return "crosshair";
    const single = session.single;
    if (!single || !movable(single)) return "";
    if (shapeEdit && single.type === "area") return polyHandleAt(plan.V, single, sx, sy, false) ? "pointer" : "";
    const h = handleAt(plan.V, single, sx, sy, false);
    return h ? CURSORS[h] : "";
  }

  return {
    down, move, up, click, dblclick, draw, cursorAt, cancelGesture,
    nudge, rotateBy, setShapeEdit, removeCorner,
    get shapeEdit() { return shapeEdit; },
    get cornerSel() { return cornerSel; },
    get dragging() { return !!drag && drag.kind !== "marquee"; },
    get drawing() { return !!drag && drag.kind === "draw"; },
  };
}
