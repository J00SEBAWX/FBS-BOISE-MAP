// Pointer, touch and keyboard controls.
// Double-tap (or double-click) a block or fixture to pick it up. Keep holding to drag it, or let go
// and it follows your pointer until the next tap. Drag empty floor to look around; tap floor to walk Jerry there.
const DOUBLE_MS = 380;
const MOVE_PX_MOUSE = 5;
const MOVE_PX_TOUCH = 10;

export function attachInput(app) {
  const canvas = app.canvas;
  const ui = app.ui;
  const scene = app.scene;
  const ed = app.editor;
  const pointers = new Map();
  let g = null; // current gesture
  let lastTap = { t: 0, x: 0, y: 0, id: null };
  let hoverAt = 0;
  const keys = new Set();

  const pickFilter = () => ({
    handles: ui.selection && (ui.mode === "areas" || ui.mode === "current"),
    areas: ui.mode !== "current",
    items: ui.mode === "current",
    structure: true,
  });

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function onDown(e) {
    if (e.button === 2 || e.button === 1) {
      // right/middle drag always looks around
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      g = { kind: scene.camMode === "map" ? "pan" : "orbit", last: { x: e.clientX, y: e.clientY } };
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    app.noteActivity();

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      if (ui.carry) {
        g = { kind: "twist", angle: Math.atan2(b.y - a.y, b.x - a.x), acc: 0 };
        return;
      }
      if (ui.handle) ed.endHandle();
      g = { kind: "pinch", d0: dist(a, b), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
      return;
    }
    if (pointers.size > 2) return;

    const pick = scene.pick(e.clientX, e.clientY, pickFilter());
    if (pick && pick.kind === "handle") {
      if (ed.startHandle(pick)) g = { kind: "handle" };
      return;
    }
    if (ui.carry) {
      // pointer down while carrying: this drag moves it, and letting go drops it
      g = { kind: "carry", start: { x: e.clientX, y: e.clientY }, moved: false, initiating: false };
      ed.moveCarry(scene.floorPoint(e.clientX, e.clientY), mods(e));
      return;
    }
    // use the event's own timestamp so a busy frame doesn't break a quick double-tap
    const now = e.timeStamp || performance.now();
    const isDouble = pick && lastTap.id === pick.id && now - lastTap.t < DOUBLE_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < (e.pointerType === "mouse" ? 12 : 30);
    if (isDouble) {
      lastTap = { t: 0, x: 0, y: 0, id: null };
      const pt = scene.floorPoint(e.clientX, e.clientY);
      if (ed.startCarry(pick, pt, "pointer")) {
        g = { kind: "carry", start: { x: e.clientX, y: e.clientY }, moved: false, initiating: true };
        return;
      }
    }
    g = { kind: "pending", pick, start: { x: e.clientX, y: e.clientY }, last: { x: e.clientX, y: e.clientY }, type: e.pointerType };
  }

  function mods(e) {
    return { free: e.altKey, fine: e.altKey, coarse: e.shiftKey, keepRatio: e.shiftKey };
  }

  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    if (!g) {
      // mouse hover: carried things follow the pointer; otherwise show what can be grabbed
      if (ui.carry && ui.carry.how === "pointer" && e.pointerType === "mouse") {
        ed.moveCarry(scene.floorPoint(e.clientX, e.clientY), mods(e));
      } else if (e.pointerType === "mouse" && performance.now() - hoverAt > 60) {
        hoverAt = performance.now();
        const pick = scene.pick(e.clientX, e.clientY, pickFilter());
        canvas.classList.toggle("can-grab", Boolean(pick && pick.kind !== "handle"));
        canvas.classList.toggle("on-handle", Boolean(pick && pick.kind === "handle"));
      }
      return;
    }
    switch (g.kind) {
      case "pending": {
        const thr = g.type === "mouse" ? MOVE_PX_MOUSE : MOVE_PX_TOUCH;
        if (Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > thr) {
          g = { kind: scene.camMode === "map" ? "pan" : "orbit", last: g.last };
          onMove(e);
        }
        break;
      }
      case "orbit":
        scene.orbitBy(e.clientX - g.last.x, e.clientY - g.last.y);
        g.last = { x: e.clientX, y: e.clientY };
        break;
      case "pan":
        scene.panBy(e.clientX - g.last.x, e.clientY - g.last.y);
        g.last = { x: e.clientX, y: e.clientY };
        break;
      case "carry":
        if (Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > 4) g.moved = true;
        ed.moveCarry(scene.floorPoint(e.clientX, e.clientY), mods(e));
        break;
      case "handle":
        ed.moveHandle(scene.floorPoint(e.clientX, e.clientY), mods(e));
        break;
      case "pinch": {
        if (pointers.size < 2) break;
        const [a, b] = [...pointers.values()];
        const d = dist(a, b);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (d > 10 && g.d0 > 10) scene.zoomBy(g.d0 / d, mid.x, mid.y);
        if (scene.camMode === "map") scene.panBy(mid.x - g.mid.x, mid.y - g.mid.y);
        else scene.orbitBy(((ang - g.angle) * 180) / Math.PI * -3, (mid.y - g.mid.y) * 0.8);
        g.d0 = d;
        g.mid = mid;
        g.angle = ang;
        break;
      }
      case "twist": {
        if (pointers.size < 2) break;
        const [a, b] = [...pointers.values()];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        let delta = ((ang - g.angle) * 180) / Math.PI;
        delta = ((delta + 540) % 360) - 180;
        g.acc += delta;
        g.angle = ang;
        while (Math.abs(g.acc) >= 15) {
          const step = g.acc > 0 ? -15 : 15; // screen clockwise = plan clockwise
          app.rotateCarried(step);
          g.acc += step;
        }
        break;
      }
    }
  }

  function onUp(e) {
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (!had || !g) return;
    const kind = g.kind;
    if (kind === "pinch" || kind === "twist") {
      if (pointers.size === 0) g = null;
      else if (kind === "twist") g = { kind: "carry", start: { x: e.clientX, y: e.clientY }, moved: true, initiating: false };
      else g = null;
      return;
    }
    if (kind === "pending") {
      const pick = g.pick;
      lastTap = { t: e.timeStamp || performance.now(), x: e.clientX, y: e.clientY, id: pick ? pick.id : null };
      if (pick) app.select({ kind: pick.kind, id: pick.id });
      else {
        app.select(null);
        const pt = scene.floorPoint(e.clientX, e.clientY);
        if (pt) app.walkTo(pt[0], pt[1], { marker: true });
      }
    } else if (kind === "carry") {
      if (g.initiating && !g.moved) {
        // double-click without dragging: keep carrying until the next tap
      } else ed.dropCarry();
    } else if (kind === "handle") {
      ed.endHandle();
    }
    g = null;
  }

  function onCancel(e) {
    pointers.delete(e.pointerId);
    if (g && g.kind === "handle") ed.endHandle();
    if (g && g.kind === "carry" && g.moved) ed.dropCarry();
    g = null;
  }

  function onWheel(e) {
    e.preventDefault();
    app.noteActivity();
    if (ui.carry && (e.shiftKey || e.altKey)) {
      app.rotateCarried(e.deltaY > 0 ? -15 : 15);
      return;
    }
    const f = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015))));
    scene.zoomBy(f, e.clientX, e.clientY);
  }

  const typing = (t) => t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

  function onKey(e) {
    if (typing(e.target) || document.querySelector("dialog[open]")) return;
    const k = e.key;
    // Space/Enter on a focused button should just press that button
    if ((k === " " || k === "Enter") && e.target.closest && e.target.closest("button, a, [role='tab'], summary")) return;
    const mod = e.ctrlKey || e.metaKey;
    app.noteActivity();
    if (mod && (k === "z" || k === "Z")) {
      e.preventDefault();
      if (e.shiftKey) app.redo();
      else app.undo();
      return;
    }
    if (mod && (k === "y" || k === "Y")) {
      e.preventDefault();
      app.redo();
      return;
    }
    if (mod && (k === "d" || k === "D")) {
      e.preventDefault();
      ed.duplicate();
      return;
    }
    if (mod) return;
    if (e.altKey && k.startsWith("Arrow") && ui.selection && !ui.carry) {
      e.preventDefault();
      const s = e.shiftKey ? 0.1 : 0.5;
      ed.nudge(k === "ArrowLeft" ? -s : k === "ArrowRight" ? s : 0, k === "ArrowUp" ? s : k === "ArrowDown" ? -s : 0);
      return;
    }
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(lower)) {
      keys.add(lower);
      if (k.startsWith("Arrow")) e.preventDefault();
      return;
    }
    switch (lower) {
      case "Shift":
        keys.add("shift");
        break;
      case "e":
      case "Enter":
        if (lower === "Enter" && !ui.carry) break;
        e.preventDefault();
        app.grabOrDrop();
        break;
      case "r":
        e.preventDefault();
        if (ui.carry) app.rotateCarried(e.shiftKey ? -15 : 15);
        else ed.rotate(e.shiftKey ? -15 : 15);
        break;
      case "Delete":
      case "Backspace":
        if (ui.carry) break;
        e.preventDefault();
        ed.remove();
        break;
      case "Escape":
        if (ui.carry) ed.cancelCarry();
        else if (app.hud.bubbleOpen()) app.hud.closeBubble();
        else app.select(null);
        break;
      case " ":
      case "v":
        e.preventDefault();
        app.toggleCamera();
        break;
      case "1":
      case "2":
      case "3":
      case "4":
        app.setMode(["current", "areas", "compare", "suggested"][Number(k) - 1]);
        break;
      case "j":
      case "?":
        app.askJerry();
        break;
      case "f":
        app.focusSelection();
        break;
    }
  }

  function onKeyUp(e) {
    const lower = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.delete(lower);
    if (e.key === "Shift") keys.delete("shift");
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("lostpointercapture", (e) => {
    if (pointers.has(e.pointerId)) onCancel(e);
  });
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("dblclick", (e) => e.preventDefault());
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => keys.clear());

  // ----- drag from a list onto the floor -----
  function paletteDrag(e, spec) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!app.state.build || !app.state.build.canEdit) {
      app.toast("This build is read-only.", "warn");
      return;
    }
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let over = false, pt = null, started = false;
    const sx = e.clientX, sy = e.clientY;
    const move = (ev) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      started = true;
      document.body.classList.add("dragging-palette");
      const r = canvas.getBoundingClientRect();
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      over = hit === canvas && ev.clientX >= r.left && ev.clientX <= r.right;
      pt = over ? scene.floorPoint(ev.clientX, ev.clientY) : null;
      app.paletteGhost(spec, pt);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("dragging-palette");
      app.paletteGhost(null, null);
      if (!started) {
        spec.onTap && spec.onTap();
        return;
      }
      if (over && pt) app.paletteDrop(spec, pt);
    };
    const cancel = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("dragging-palette");
      app.paletteGhost(null, null);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
  }

  return {
    keys,
    paletteDrag,
    /** Desired walking vector from the keyboard in camera terms: { fwd, right, run }. */
    keyVector() {
      let fwd = 0, right = 0;
      if (keys.has("w") || keys.has("ArrowUp")) fwd += 1;
      if (keys.has("s") || keys.has("ArrowDown")) fwd -= 1;
      if (keys.has("d") || keys.has("ArrowRight")) right += 1;
      if (keys.has("a") || keys.has("ArrowLeft")) right -= 1;
      return { fwd, right, run: keys.has("shift") };
    },
    get busy() {
      return Boolean(g);
    },
  };
}
