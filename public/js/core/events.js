/* A tiny event bus and observable state for the app's modules. Pure: no DOM. */

/** createEmitter() -> {on(type, fn) -> off, off(type, fn), emit(type, payload)} */
export function createEmitter() {
  const map = new Map();
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => this.off(type, fn);
    },
    off(type, fn) { const s = map.get(type); if (s) s.delete(fn); },
    emit(type, payload) {
      const s = map.get(type);
      if (s) for (const fn of [...s]) fn(payload);
    },
  };
}

/**
 * createStore(initial) -> {get(), set(patch), subscribe(fn) -> unsubscribe}
 * set() merges a patch and calls subscribers with (state, changedKeys) once, only if something changed.
 */
export function createStore(initial) {
  let state = Object.freeze({...initial});
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const changed = Object.keys(patch).filter(k => !Object.is(state[k], patch[k]));
      if (!changed.length) return;
      state = Object.freeze({...state, ...patch});
      for (const fn of [...subs]) fn(state, changed);
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
