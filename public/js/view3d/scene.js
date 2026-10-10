/* The WebGL renderer, the scene and its lighting, and drawing on demand.
 * three.js r128 is a classic script (vendor/three.min.js) that sets window.THREE; GLTFLoader and
 * OrbitControls (vendor/) add themselves to it. Everything here renders only when something changed. */

export const three = () => window.THREE;

/** Can this browser draw WebGL with three.js loaded? */
export function webglAvailable() {
  if (typeof window.THREE === "undefined" || !window.WebGLRenderingContext) return false;
  try {
    const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
    return true;
  } catch { return false; }
}

/** sRGB hex -> linear colour (the renderer works in linear light). */
export const lin = c => new (three().Color)(c).convertSRGBToLinear();

/**
 * Creates the renderer in `host` and a lit scene sized for a building of L x W feet.
 * Returns {THREE, renderer, scene, host, dirty, requestRender(), render(camera), size(), dispose()}.
 */
export function createScene(host, {L, W}) {
  const THREE = three();
  const touch = matchMedia("(pointer:coarse)").matches;
  const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: "high-performance"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.6 : 2)); // capped: 2 at most, less on phones
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the store and the light never move: shadows are drawn when the store changes
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = lin("#d9dee0");
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 140, 420);

  /* ---------- light: soft sky fill + an overhead key light with gentle shadows ---------- */
  scene.add(new THREE.HemisphereLight(lin("#fbfbf8"), lin("#8c8274"), 0.55));
  const key = new THREE.DirectionalLight(lin("#fff6ea"), 1.15);
  key.position.set(L / 2 - 22, 110, -W / 2 + 18);
  key.target.position.set(L / 2, 0, -W / 2);
  scene.add(key, key.target);
  key.castShadow = true;
  const sc = key.shadow.camera;
  sc.left = -L / 2 - 16; sc.right = L / 2 + 16; sc.top = W / 2 + 16; sc.bottom = -W / 2 - 16; sc.near = 20; sc.far = 260;
  key.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.04; key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight(lin("#e8eef5"), 0.3);
  fill.position.set(L / 2 + 70, 50, -W / 2 - 80);
  scene.add(fill);

  /* ---------- image-based light: an evenly lit room, so surfaces get soft reflections ---------- */
  let envTex = null;
  try {
    const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
    const geos = [];
    const box = (w, h, d, m) => { const g = new THREE.BoxGeometry(w, h, d); geos.push(g); return new THREE.Mesh(g, m); };
    const mats = [new THREE.MeshBasicMaterial({color: lin("#8f8a84"), side: THREE.BackSide}), new THREE.MeshBasicMaterial({color: new THREE.Color(3.2, 3.1, 2.9)}), new THREE.MeshBasicMaterial({color: lin("#b9b2a8")})];
    env.add(box(60, 20, 60, mats[0]));
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { const m = box(6, 0.2, 2.4, mats[1]); m.position.set(i * 11, 9.7, j * 14); env.add(m); }
    const fl = box(60, 0.2, 60, mats[2]); fl.position.y = -9.8; env.add(fl);
    envTex = pm.fromScene(env, 0.03).texture;
    scene.environment = envTex;
    pm.dispose(); geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
  } catch { /* plain lighting still works */ }

  // the ground around the building
  const groundGeo = new THREE.PlaneGeometry(1200, 1200), groundMat = new THREE.MeshStandardMaterial({color: lin("#8e918d"), roughness: 0.9});
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(L / 2, -0.06, -W / 2); ground.receiveShadow = true;
  scene.add(ground);

  const R = {
    THREE, renderer, scene, host, touch, ground, dirty: true, w: 1, h: 1, frames: 0,
    requestRender() { R.dirty = true; },
    /** Haze in the distance: only at eye level (Walk); from above it would wash out the whole store. */
    setHaze(on) { scene.fog.near = on ? 140 : 4000; scene.fog.far = on ? 420 : 8000; R.dirty = true; },
    /** The sky behind the store: light, or a dusk blue in the dark theme. */
    setSky(dark) {
      const c = lin(dark ? "#1f2a36" : "#d9dee0");
      scene.background = c; scene.fog.color.copy(c); R.dirty = true;
    },
    /** Draws if something changed since the last frame. */
    render(camera, force) {
      if (!R.dirty && !force) return false;
      renderer.render(scene, camera);
      R.dirty = false; R.frames++;
      return true;
    },
    /** Matches the canvas to the host's size. Returns true when it changed. */
    size() {
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      if (Math.abs(r.width - R.w) < 0.5 && Math.abs(r.height - R.h) < 0.5) return false;
      R.w = r.width; R.h = r.height;
      renderer.setSize(r.width, r.height, false);
      R.dirty = true;
      return true;
    },
    dispose() {
      disposeTree(scene);
      groundGeo.dispose(); groundMat.dispose();
      if (envTex) envTex.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* already lost */ }
      renderer.domElement.remove();
    },
  };
  return R;
}

/** Frees the GPU copies of everything under `root` (geometry, materials, textures). */
export function disposeTree(root) {
  const seen = new Set();
  root.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k of ["map", "emissiveMap", "alphaMap", "normalMap", "roughnessMap"]) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture && !seen.has(u.value)) { seen.add(u.value); u.value.dispose(); }
      m.dispose();
    }
  });
}
