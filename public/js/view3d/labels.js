/* Room names (and the front door) floating over the 3D view, as plain DOM text (textContent only),
 * placed by projecting their 3D point each time the view is drawn. Shown in the 3D (orbit) view when the
 * Labels layer is on. */
import {frontDoor} from "../core/model.js";

export function createLabels3D(R, host, layout) {
  const THREE = R.THREE, v = new THREE.Vector3();
  const list = [];
  const add = (text, x, y, z, cls) => {
    const el = document.createElement("span"); el.className = "lbl3d" + (cls ? " " + cls : ""); el.textContent = text;
    host.appendChild(el); list.push({el, p: new THREE.Vector3(x, z, -y)});
  };
  function build(l) {
    for (const x of list) x.el.remove();
    list.length = 0;
    const door = frontDoor(l);
    if (door) add("FRONT DOOR", door.x, door.y, (door.h || 7) + 1.5, "door");
    // bigger rooms first: when two names would overlap, the bigger room keeps its name
    const floors = l.items.filter(f => f.type === "floor").sort((a, b) => b.w * b.d - a.w * a.d);
    for (const f of floors) add((f.name || "").replace(/\s+floor$/i, "").toUpperCase(), f.x, f.y, 1.5);
  }
  build(layout);
  let shown = true;
  return {
    /** Re-place every label for this camera (call after each render). */
    update(camera, w, h) {
      host.hidden = !shown;
      if (!shown) return;
      const placed = [];
      for (const l of list) {
        v.copy(l.p).project(camera);
        let vis = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
        const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
        if (vis) {
          // keep labels apart: a label that would overlap one already placed waits until there is room
          if (!l.w) { l.el.hidden = false; l.w = l.el.offsetWidth || 80; l.h = l.el.offsetHeight || 20; }
          const box = {x0: x - l.w / 2 - 4, x1: x + l.w / 2 + 4, y0: y - l.h / 2 - 2, y1: y + l.h / 2 + 2};
          if (box.x0 < 0 || box.y0 < 0 || box.x1 > w || box.y1 > h) vis = false; // never cut off at the edge
          else if (placed.some(b => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) vis = false;
          else placed.push(box);
        }
        l.el.hidden = !vis;
        if (!vis) continue;
        l.el.style.setProperty("--x", x.toFixed(1));
        l.el.style.setProperty("--y", y.toFixed(1));
      }
    },
    show(on) { shown = on; host.hidden = !on; },
    /** The open map changed: new room names. */
    setLayout(l) { build(l); },
    dispose() { for (const l of list) l.el.remove(); list.length = 0; },
  };
}
