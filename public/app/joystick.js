// On-screen thumbstick for phones and tablets. vector = { x: right, y: up }, each -1..1.
export function createJoystick(base, knob) {
  const v = { x: 0, y: 0 };
  let id = null;
  let cx = 0, cy = 0, R = 1;

  const set = (x, y) => {
    let dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = 0.12;
    const m = Math.hypot(dx, dy) / R;
    const k = m < dead ? 0 : (m - dead) / (1 - dead) / (m || 1);
    v.x = (dx / R) * k;
    v.y = (-dy / R) * k;
  };
  const reset = () => {
    id = null;
    v.x = v.y = 0;
    knob.style.transform = "translate(0px, 0px)";
    base.classList.remove("active");
  };

  base.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    id = e.pointerId;
    base.setPointerCapture(id);
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    R = r.width / 2 - knob.getBoundingClientRect().width / 4;
    base.classList.add("active");
    set(e.clientX, e.clientY);
  });
  base.addEventListener("pointermove", (e) => {
    if (e.pointerId === id) set(e.clientX, e.clientY);
  });
  base.addEventListener("pointerup", (e) => e.pointerId === id && reset());
  base.addEventListener("pointercancel", (e) => e.pointerId === id && reset());
  base.addEventListener("lostpointercapture", (e) => e.pointerId === id && reset());

  return {
    vector: v,
    get active() {
      return id !== null;
    },
  };
}
