/* Pointer -> what is under it in the 3D views. three.js only turns the pointer into a ray; the hit tests are
 * plain geometry against the layout (core/pick.js), so the instanced, batched store meshes don't need to know
 * their items. The scan model is never picked. */
import {buildPickBoxes, pickRay} from "../core/pick.js";
import {rayPlaneZ} from "../core/geometry.js";

/** createPicker(R, layout) -> {ray(clientX, clientY, camera), pick(clientX, clientY, camera, opts), floorAt(...)} */
export function createPicker(R, layout) {
  const THREE = R.THREE;
  const caster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const boxes = buildPickBoxes(layout);
  const ceilings = layout.items.filter(it => it.type === "ceiling");

  /** The pointer's ray in plan coordinates (x east, y north, z up). */
  function ray(clientX, clientY, camera) {
    const r = R.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    caster.setFromCamera(ndc, camera);
    const O = caster.ray.origin, D = caster.ray.direction;
    return {o: {x: O.x, y: -O.z, z: O.y}, d: {x: D.x, y: -D.z, z: D.y}};
  }

  /**
   * opts: {structure, fixtures, ceiling} = which layers are showing (hidden ones aren't hit).
   * Returns {floor, hit, item, point, t} (see core/pick.js pickRay).
   */
  function pick(clientX, clientY, camera, opts = {}) {
    const {o, d} = ray(clientX, clientY, camera);
    return pickRay(boxes, ceilings, o, d, opts);
  }

  /** Just the floor plane under the pointer, or null above the horizon. */
  function floorAt(clientX, clientY, camera) {
    const {o, d} = ray(clientX, clientY, camera);
    const fl = rayPlaneZ(o, d, 0);
    return fl ? {x: fl.x, y: fl.y} : null;
  }

  return {ray, pick, floorAt};
}
