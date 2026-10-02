// Placeholder Jerry (6'3"): bald, glasses, green sweater, khakis. Built from simple shapes until
// the simplified, animated Jerry v3 model is ready. Plan feet: x east, y north. Three: (x, up, -y).
import * as THREE from "/vendor/three.module.min.js";

const WALK = 6.5; // ft per second
const RUN = 12;

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...extra });
}

function limb(rTop, rBot, len, material) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 14), material);
  m.position.y = -len / 2;
  m.castShadow = true;
  g.add(m);
  return g;
}

export function createJerry() {
  const skin = mat("#e2ad88");
  const sweater = mat("#2f6a47");
  const sweaterDark = mat("#24553a");
  const khaki = mat("#c8b38a");
  const shoe = mat("#3b2b1f");
  const black = mat("#151515", { roughness: 0.35 });
  const white = mat("#f3f2ee");
  const hair = mat("#8a7a66");

  const root = new THREE.Group();
  root.name = "jerry";
  const body = new THREE.Group();
  root.add(body);

  // legs (pivot at the hip)
  const hipY = 3.05;
  const legs = [-0.27, 0.27].map((x) => {
    const leg = limb(0.25, 0.2, 2.8, khaki);
    leg.position.set(x, hipY, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.66), shoe);
    foot.position.set(0, -2.86, 0.12);
    foot.castShadow = true;
    leg.add(foot);
    body.add(leg);
    return leg;
  });

  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.52, 0.55, 18), khaki);
  pelvis.position.y = 3.1;
  pelvis.scale.z = 0.72;
  pelvis.castShadow = true;
  body.add(pelvis);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.56, 1.2, 6, 18), sweater);
  torso.position.y = 4.25;
  torso.scale.set(1.06, 1, 0.74);
  torso.castShadow = true;
  body.add(torso);

  const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.16, 18), sweaterDark);
  hem.position.y = 3.42;
  hem.scale.z = 0.74;
  body.add(hem);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 18), white);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 5.1;
  body.add(collar);

  // name badge
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.03), white);
  badge.position.set(0.27, 4.78, 0.41);
  body.add(badge);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.035), mat("#17734a"));
  stripe.position.set(0.27, 4.84, 0.415);
  body.add(stripe);

  // arms (pivot at the shoulder)
  const arms = [-0.74, 0.74].map((x) => {
    const arm = limb(0.16, 0.13, 1.95, sweater);
    arm.position.set(x, 4.95, 0);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12), sweaterDark);
    cuff.position.y = -1.9;
    arm.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
    hand.position.y = -2.07;
    hand.castShadow = true;
    arm.add(hand);
    body.add(arm);
    return arm;
  });

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.32, 12), skin);
  neck.position.y = 5.22;
  body.add(neck);

  const head = new THREE.Group();
  head.position.y = 5.8;
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), skin);
  skull.scale.set(0.94, 1.08, 1);
  skull.castShadow = true;
  head.add(skull);
  for (const x of [-0.41, 0.41]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), skin);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(x, 0, -0.02);
    head.add(ear);
  }
  // fringe of short hair around the back (bald on top)
  const fringe = new THREE.Group();
  fringe.rotation.y = -0.85 * Math.PI;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.075, 8, 28, Math.PI * 1.3), hair);
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1, 1.15, 1.4);
  fringe.add(ring);
  fringe.position.y = -0.04;
  head.add(fringe);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin);
  nose.scale.z = 1.5;
  nose.position.set(0, -0.04, 0.42);
  head.add(nose);
  for (const x of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), black);
    eye.position.set(x, 0.07, 0.37);
    head.add(eye);
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 8, 22), black);
    lens.position.set(x, 0.07, 0.41);
    head.add(lens);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.42), black);
    temple.position.set(x > 0 ? 0.27 : -0.27, 0.08, 0.2);
    head.add(temple);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), black);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 0.08, 0.42);
  head.add(bridge);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 6, 14, Math.PI), mat("#8c4b3c"));
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.17, 0.38);
  head.add(smile);

  // soft "you are here" ring on the floor
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.25, 40),
    new THREE.MeshBasicMaterial({ color: "#3cc47c", transparent: true, opacity: 0.55, depthWrite: false })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.04;
  halo.renderOrder = 2;
  root.add(halo);

  const st = {
    x: 86,
    y: 45.5,
    heading: Math.PI / 2,
    speed: 0,
    phase: 0,
    carrying: false,
    path: null,
    onArrive: null,
    wave: 0,
  };

  function place() {
    root.position.set(st.x, 0, -st.y);
    root.rotation.y = Math.atan2(Math.cos(st.heading), -Math.sin(st.heading));
  }
  place();

  function turnToward(dx, dy, dt) {
    if (Math.abs(dx) + Math.abs(dy) < 1e-6) return;
    const target = Math.atan2(dy, dx);
    let d = target - st.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    st.heading += d * Math.min(1, dt * 12);
  }

  /** Steps Jerry by (dx, dy) feet, sliding along obstacles in the nav grid. */
  function step(dx, dy, nav) {
    if (!nav) {
      st.x += dx;
      st.y += dy;
      return true;
    }
    const stuck = nav.blocked(st.x, st.y);
    const ok = (x, y) => stuck || !nav.blocked(x, y);
    if (ok(st.x + dx, st.y + dy)) {
      st.x += dx;
      st.y += dy;
      return true;
    }
    if (dx && ok(st.x + dx, st.y)) {
      st.x += dx;
      return true;
    }
    if (dy && ok(st.x, st.y + dy)) {
      st.y += dy;
      return true;
    }
    return false;
  }

  /**
   * Per-frame update. input = { mx, my, run } is a desired walking direction in plan feet
   * (length 0..1); when idle, Jerry follows his path if he has one.
   */
  function update(dt, t, input, nav) {
    let moving = false;
    let speed = 0;
    if (input && (input.mx || input.my)) {
      st.path = null;
      st.onArrive = null;
      const len = Math.min(1, Math.hypot(input.mx, input.my));
      speed = (input.run ? RUN : WALK) * len;
      const nx = input.mx / (Math.hypot(input.mx, input.my) || 1), ny = input.my / (Math.hypot(input.mx, input.my) || 1);
      moving = step(nx * speed * dt, ny * speed * dt, nav);
      turnToward(nx, ny, dt);
    } else if (st.path && st.path.length) {
      const [tx, ty] = st.path[0];
      const dx = tx - st.x, dy = ty - st.y;
      const dist = Math.hypot(dx, dy);
      speed = st.path.length > 2 || dist > 20 ? RUN * 0.85 : WALK;
      const stepLen = speed * dt;
      if (dist <= stepLen) {
        st.x = tx;
        st.y = ty;
        st.path.shift();
        if (!st.path.length) {
          st.path = null;
          const cb = st.onArrive;
          st.onArrive = null;
          if (cb) cb();
        }
      } else {
        st.x += (dx / dist) * stepLen;
        st.y += (dy / dist) * stepLen;
      }
      turnToward(dx, dy, dt);
      moving = true;
    }
    st.speed += ((moving ? speed : 0) - st.speed) * Math.min(1, dt * 10);
    const s = st.speed;
    st.phase += dt * (2.2 + s * 0.55);
    const swing = Math.min(0.75, s / 9);
    const sw = Math.sin(st.phase * 2) * swing;
    legs[0].rotation.x = sw;
    legs[1].rotation.x = -sw;
    if (st.carrying) {
      arms[0].rotation.x = arms[1].rotation.x = -1.25 + Math.sin(t * 3) * 0.04;
      arms[0].rotation.z = 0.12;
      arms[1].rotation.z = -0.12;
    } else if (st.wave > 0) {
      st.wave -= dt;
      arms[1].rotation.x = -2.6;
      arms[1].rotation.z = -0.35 + Math.sin(t * 14) * 0.35;
      arms[0].rotation.x = 0;
      arms[0].rotation.z = 0.06;
    } else {
      arms[0].rotation.x = -sw * 0.8;
      arms[1].rotation.x = sw * 0.8;
      arms[0].rotation.z = 0.06;
      arms[1].rotation.z = -0.06;
    }
    body.position.y = Math.abs(Math.sin(st.phase * 2)) * 0.07 * Math.min(1, s / 4);
    torso.scale.y = 1 + Math.sin(t * 1.6) * 0.012;
    head.rotation.y = s < 0.5 ? Math.sin(t * 0.5) * 0.18 : 0;
    halo.material.opacity = 0.35 + Math.sin(t * 2.4) * 0.15;
    place();
  }

  return {
    root,
    state: st,
    update,
    setPose(x, y, heading = st.heading) {
      st.x = x;
      st.y = y;
      st.heading = heading;
      st.path = null;
      place();
    },
    walk(path, onArrive) {
      st.path = path && path.length ? path.map((p) => [p[0], p[1]]) : null;
      st.onArrive = st.path ? onArrive || null : null;
      if (!st.path && onArrive) onArrive();
    },
    stop() {
      st.path = null;
      st.onArrive = null;
    },
    setCarrying(on) {
      st.carrying = Boolean(on);
    },
    wave(seconds = 1.6) {
      st.wave = seconds;
    },
    face(x, y) {
      st.heading = Math.atan2(y - st.y, x - st.x);
      place();
    },
    /** World position above Jerry's head, for the thought bubble. */
    headTop(v = new THREE.Vector3()) {
      return v.set(st.x, 7.1, -st.y);
    },
    get walking() {
      return Boolean(st.path);
    },
  };
}
