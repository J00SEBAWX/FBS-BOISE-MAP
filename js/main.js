import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { generateModelFromText } from "./meshy-client.js";

const STORAGE_KEY = "fbs-boise-map:aisles";
const FLOOR_SIZE = 200; // feet
const DRAG_THRESHOLD_PX = 5;

const DEFAULT_AISLES = [
  { name: "Lumber", x: -60, z: -40, width: 20, depth: 60, height: 12, color: "#8a5a2b" },
  { name: "Paint", x: -20, z: -40, width: 20, depth: 30, height: 10, color: "#3a6ea5" },
  { name: "Plumbing", x: 10, z: -40, width: 20, depth: 30, height: 10, color: "#4a8a5a" },
  { name: "Electrical", x: 40, z: -40, width: 20, depth: 30, height: 10, color: "#c9a23a" },
];

const viewportEl = document.getElementById("viewport");
const addAisleBtn = document.getElementById("add-aisle-btn");
const panelEmpty = document.getElementById("panel-empty");
const panelForm = document.getElementById("panel-form");
const fName = document.getElementById("f-name");
const fWidth = document.getElementById("f-width");
const fDepth = document.getElementById("f-depth");
const fHeight = document.getElementById("f-height");
const fColor = document.getElementById("f-color");
const fPrompt = document.getElementById("f-prompt");
const deleteBtn = document.getElementById("delete-aisle-btn");
const generateBtn = document.getElementById("generate-btn");
const generateStatus = document.getElementById("generate-status");

let aisles = loadAisles();
let selectedId = null;

// --- Scene setup ---------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171a);

const camera = new THREE.PerspectiveCamera(
  50,
  viewportEl.clientWidth / viewportEl.clientHeight,
  0.1,
  2000
);
camera.position.set(80, 90, 120);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight);
viewportEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(100, 150, 80);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE * 1.5, FLOOR_SIZE * 1.5),
  new THREE.MeshStandardMaterial({ color: 0x2a2e33 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

scene.add(new THREE.GridHelper(FLOOR_SIZE * 1.5, 30, 0x555a60, 0x3a3f45));

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

// --- Aisle meshes ---------------------------------------------------------

const meshesById = new Map();
const loader = new GLTFLoader();

// Each aisle is a Group positioned at (aisle.x, 0, aisle.z); its contents
// (a placeholder box or a loaded GLTF model) are always placed in the
// group's LOCAL space. That lets drags just move the group — no geometry
// rebuild and no re-fetching the model — while edits to size/color rebuild
// the group's contents in place.

function buildPlaceholderMesh(aisle) {
  const geometry = new THREE.BoxGeometry(aisle.width, aisle.height, aisle.depth);
  const material = new THREE.MeshStandardMaterial({ color: aisle.color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, aisle.height / 2, 0);
  return mesh;
}

function addAisleToScene(aisle) {
  const group = new THREE.Group();
  group.userData.aisleId = aisle.id;
  group.position.set(aisle.x, 0, aisle.z);

  if (aisle.modelUrl) {
    loader.load(
      aisle.modelUrl,
      (gltf) => {
        const model = gltf.scene;
        fitModelToFootprint(model, aisle);
        group.add(model);
      },
      undefined,
      () => {
        // Model failed to (re)load (e.g. expired URL) — fall back to a box
        // so the aisle is still visible and editable.
        group.add(buildPlaceholderMesh(aisle));
      }
    );
  } else {
    group.add(buildPlaceholderMesh(aisle));
  }

  scene.add(group);
  meshesById.set(aisle.id, group);
}

function fitModelToFootprint(model, aisle) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = Math.min(aisle.width / (size.x || 1), aisle.depth / (size.z || 1));
  model.scale.setScalar(scale > 0 && isFinite(scale) ? scale : 1);

  // Center horizontally and rest on the floor, all in the group's local space.
  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  model.position.set(-center.x, -scaledBox.min.y, -center.z);
}

function removeAisleFromScene(id) {
  const group = meshesById.get(id);
  if (group) {
    scene.remove(group);
    meshesById.delete(id);
  }
}

// Rebuilds an aisle's visual contents (box/model, size, color). Use this
// after size/color/model changes — NOT on every drag frame.
function rebuildAisleMesh(aisle) {
  removeAisleFromScene(aisle.id);
  addAisleToScene(aisle);
}

// Cheap reposition used during drag — moves the group without touching
// its contents, so a loaded model is never re-fetched mid-drag.
function repositionAisleGroup(aisle) {
  const group = meshesById.get(aisle.id);
  if (group) group.position.set(aisle.x, 0, aisle.z);
}

function rebuildAll() {
  for (const id of [...meshesById.keys()]) removeAisleFromScene(id);
  for (const aisle of aisles) addAisleToScene(aisle);
}

// --- Persistence -----------------------------------------------------------

function loadAisles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore corrupt storage, fall through to defaults
  }
  return DEFAULT_AISLES.map((a) => ({ id: crypto.randomUUID(), modelUrl: null, ...a }));
}

function saveAisles() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aisles));
  } catch {
    // storage unavailable (private browsing, quota) — layout just won't persist
  }
}

// --- Selection & panel -----------------------------------------------------

function getAisle(id) {
  return aisles.find((a) => a.id === id);
}

function selectAisle(id) {
  selectedId = id;
  const aisle = getAisle(id);
  if (!aisle) {
    panelEmpty.hidden = false;
    panelForm.hidden = true;
    return;
  }
  panelEmpty.hidden = true;
  panelForm.hidden = false;
  fName.value = aisle.name;
  fWidth.value = aisle.width;
  fDepth.value = aisle.depth;
  fHeight.value = aisle.height;
  fColor.value = aisle.color;
  fPrompt.value = "";
  generateStatus.textContent = "";
  generateBtn.disabled = false;
}

function updateSelectedAisle(patch) {
  const aisle = getAisle(selectedId);
  if (!aisle) return;
  Object.assign(aisle, patch);
  rebuildAisleMesh(aisle);
  saveAisles();
}

[fName, fWidth, fDepth, fHeight, fColor].forEach((input) => {
  input.addEventListener("input", () => {
    updateSelectedAisle({
      name: fName.value.trim() || "Untitled aisle",
      width: clampNumber(fWidth.value, 1, 200),
      depth: clampNumber(fDepth.value, 1, 200),
      height: clampNumber(fHeight.value, 1, 40),
      color: fColor.value,
    });
  });
});

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

addAisleBtn.addEventListener("click", () => {
  const aisle = {
    id: crypto.randomUUID(),
    name: "New Aisle",
    x: 0,
    z: 0,
    width: 20,
    depth: 20,
    height: 10,
    color: "#7d7d7d",
    modelUrl: null,
  };
  aisles.push(aisle);
  addAisleToScene(aisle);
  saveAisles();
  selectAisle(aisle.id);
});

deleteBtn.addEventListener("click", () => {
  if (!selectedId) return;
  removeAisleFromScene(selectedId);
  aisles = aisles.filter((a) => a.id !== selectedId);
  saveAisles();
  selectAisle(null);
});

generateBtn.addEventListener("click", async () => {
  const aisle = getAisle(selectedId);
  const prompt = fPrompt.value.trim();
  if (!aisle || !prompt) {
    generateStatus.textContent = "Enter a description first.";
    return;
  }

  generateBtn.disabled = true;
  generateStatus.textContent = "Submitting to Meshy…";

  try {
    const modelUrl = await generateModelFromText(prompt, {
      onProgress: (status) => {
        generateStatus.textContent = `Generating… ${status.progress ?? 0}%`;
      },
    });
    updateSelectedAisle({ modelUrl });
    generateStatus.textContent = "Model generated and applied.";
  } catch (err) {
    generateStatus.textContent = `Failed: ${err.message}`;
  } finally {
    generateBtn.disabled = false;
  }
});

// --- Pointer interaction: select + drag -------------------------------------

let dragging = null; // { aisle, group }
let pointerDownPos = null;

renderer.domElement.addEventListener("pointerdown", (event) => {
  pointerDownPos = { x: event.clientX, y: event.clientY };
  const hit = pickAisleGroup(event);
  if (hit) {
    dragging = hit;
    controls.enabled = false;
  }
});

window.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const point = intersectGround(event);
  if (!point) return;
  const aisle = getAisle(dragging.group.userData.aisleId);
  if (!aisle) return;
  const half = FLOOR_SIZE * 0.75;
  aisle.x = THREE.MathUtils.clamp(point.x, -half, half);
  aisle.z = THREE.MathUtils.clamp(point.z, -half, half);
  repositionAisleGroup(aisle);
});

window.addEventListener("pointerup", (event) => {
  if (dragging) {
    saveAisles();
    dragging = null;
    controls.enabled = true;
  }

  if (pointerDownPos) {
    const dx = event.clientX - pointerDownPos.x;
    const dy = event.clientY - pointerDownPos.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
      const hit = pickAisleGroup(event);
      selectAisle(hit ? hit.group.userData.aisleId : null);
    }
  }
  pointerDownPos = null;
});

function pickAisleGroup(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  const groups = [...meshesById.values()];
  const intersects = raycaster.intersectObjects(groups, true);
  if (intersects.length === 0) return null;

  let obj = intersects[0].object;
  while (obj && !obj.userData.aisleId) obj = obj.parent;
  if (!obj) return null;
  return { group: obj };
}

function intersectGround(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, point) ? point : null;
}

// --- Resize & render loop ---------------------------------------------------

window.addEventListener("resize", () => {
  camera.aspect = viewportEl.clientWidth / viewportEl.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

rebuildAll();
selectAisle(null);
animate();
